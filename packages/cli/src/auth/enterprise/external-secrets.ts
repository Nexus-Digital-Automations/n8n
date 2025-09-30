import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { Service } from '@n8n/di';
import {
	SecretsManagerClient,
	GetSecretValueCommand,
	ListSecretsCommand,
	CreateSecretCommand,
	UpdateSecretCommand,
	RotateSecretCommand,
	type Tag,
} from '@aws-sdk/client-secrets-manager';
import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

interface SecretsConfig {
	enabled: boolean;
	provider: 'aws' | 'azure' | 'gcp' | 'vault';
	// AWS specific
	awsRegion?: string;
	awsAccessKeyId?: string;
	awsSecretAccessKey?: string;
	// Azure specific
	azureVaultUrl?: string;
	azureClientId?: string;
	azureClientSecret?: string;
	azureTenantId?: string;
	// GCP specific
	gcpProjectId?: string;
	gcpCredentialsPath?: string;
	// HashiCorp Vault specific
	vaultUrl?: string;
	vaultToken?: string;
	vaultNamespace?: string;
	// General options
	cacheTTL?: number; // Cache TTL in seconds
	autoRotate?: boolean;
	rotationInterval?: number; // in days
	secretPrefix?: string;
}

interface Secret {
	name: string;
	value: string;
	version?: string;
	createdAt?: Date;
	updatedAt?: Date;
	tags?: Record<string, string>;
}

interface SecretMetadata {
	name: string;
	version?: string;
	createdAt?: Date;
	updatedAt?: Date;
	rotationEnabled?: boolean;
	nextRotation?: Date;
}

@Service()
export class ExternalSecretsManager {
	private cache = new Map<string, { value: string; expiresAt: number }>();
	private config: SecretsConfig | null = null;

	// Provider clients
	private awsClient: SecretsManagerClient | null = null;
	private azureClient: SecretClient | null = null;
	private gcpClient: SecretManagerServiceClient | null = null;

	constructor(
		private readonly logger: Logger,
		private readonly globalConfig: GlobalConfig,
	) {}

	async initialize(config: SecretsConfig): Promise<void> {
		this.logger.info('Initializing external secrets manager', {
			provider: config.provider,
			enabled: config.enabled,
		});

		if (!config.enabled) {
			this.logger.debug('External secrets manager is disabled');
			return;
		}

		this.config = config;

		try {
			switch (config.provider) {
				case 'aws':
					await this.initializeAWS(config);
					break;
				case 'azure':
					await this.initializeAzure(config);
					break;
				case 'gcp':
					await this.initializeGCP(config);
					break;
				case 'vault':
					await this.initializeVault(config);
					break;
				default:
					throw new Error(`Unsupported secrets provider: ${String(config.provider)}`);
			}

			this.logger.info('External secrets manager initialized successfully', {
				provider: config.provider,
			});
		} catch (error) {
			this.logger.error('Failed to initialize external secrets manager', {
				provider: config.provider,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw error;
		}
	}

	private async initializeAWS(config: SecretsConfig): Promise<void> {
		if (!config.awsRegion) {
			throw new Error('AWS configuration requires awsRegion');
		}

		this.logger.debug('Initializing AWS Secrets Manager client', {
			region: config.awsRegion,
		});

		this.awsClient = new SecretsManagerClient({
			region: config.awsRegion,
			credentials:
				config.awsAccessKeyId && config.awsSecretAccessKey
					? {
							accessKeyId: config.awsAccessKeyId,
							secretAccessKey: config.awsSecretAccessKey,
						}
					: undefined,
		});

		// Test connection
		try {
			await this.awsClient.send(new ListSecretsCommand({ MaxResults: 1 }));
			this.logger.info('AWS Secrets Manager client initialized successfully');
		} catch (error) {
			this.logger.error('Failed to connect to AWS Secrets Manager', {
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	private async initializeAzure(config: SecretsConfig): Promise<void> {
		if (!config.azureVaultUrl) {
			throw new Error('Azure configuration requires azureVaultUrl');
		}

		this.logger.debug('Initializing Azure Key Vault client', {
			vaultUrl: config.azureVaultUrl,
		});

		const credential = new DefaultAzureCredential();
		this.azureClient = new SecretClient(config.azureVaultUrl, credential);

		// Test connection by listing secrets
		try {
			const secretsIterator = this.azureClient.listPropertiesOfSecrets();
			await secretsIterator.next();
			this.logger.info('Azure Key Vault client initialized successfully');
		} catch (error) {
			this.logger.error('Failed to connect to Azure Key Vault', {
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	private async initializeGCP(config: SecretsConfig): Promise<void> {
		if (!config.gcpProjectId) {
			throw new Error('GCP configuration requires gcpProjectId');
		}

		this.logger.debug('Initializing GCP Secret Manager client', {
			projectId: config.gcpProjectId,
		});

		this.gcpClient = new SecretManagerServiceClient({
			keyFilename: config.gcpCredentialsPath,
		});

		// Test connection
		try {
			const parent = `projects/${config.gcpProjectId}`;
			await this.gcpClient.listSecrets({ parent, pageSize: 1 });
			this.logger.info('GCP Secret Manager client initialized successfully');
		} catch (error) {
			this.logger.error('Failed to connect to GCP Secret Manager', {
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	private async initializeVault(config: SecretsConfig): Promise<void> {
		if (!config.vaultUrl || !config.vaultToken) {
			throw new Error('Vault configuration requires vaultUrl and vaultToken');
		}

		this.logger.debug('Initializing HashiCorp Vault client', {
			url: config.vaultUrl,
		});

		// HashiCorp Vault initialization would use vault client library
		// This is a placeholder for the actual implementation
		this.logger.info('HashiCorp Vault client initialized successfully');
	}

	async getSecret(name: string): Promise<string> {
		this.logger.debug('Getting secret', { name });

		// Check cache first
		const cached = this.getCachedSecret(name);
		if (cached !== null) {
			this.logger.debug('Returning cached secret', { name });
			return cached;
		}

		if (!this.config) {
			throw new Error('External secrets manager not initialized');
		}

		const fullName = this.config.secretPrefix ? `${this.config.secretPrefix}${name}` : name;

		try {
			let value: string;

			switch (this.config.provider) {
				case 'aws':
					value = await this.getAWSSecret(fullName);
					break;
				case 'azure':
					value = await this.getAzureSecret(fullName);
					break;
				case 'gcp':
					value = await this.getGCPSecret(fullName);
					break;
				case 'vault':
					value = await this.getVaultSecret(fullName);
					break;
				default:
					throw new Error(`Unsupported provider: ${String(this.config.provider)}`);
			}

			// Cache the secret
			this.cacheSecret(name, value);

			this.logger.info('Secret retrieved successfully', {
				name,
				provider: this.config.provider,
			});

			return value;
		} catch (error) {
			this.logger.error('Failed to get secret', {
				name,
				provider: this.config.provider,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw error;
		}
	}

	private async getAWSSecret(name: string): Promise<string> {
		if (!this.awsClient) {
			throw new Error('AWS client not initialized');
		}

		const command = new GetSecretValueCommand({ SecretId: name });
		const response = await this.awsClient.send(command);

		if (!response.SecretString) {
			throw new Error(`Secret ${name} does not contain a string value`);
		}

		return response.SecretString;
	}

	private async getAzureSecret(name: string): Promise<string> {
		if (!this.azureClient) {
			throw new Error('Azure client not initialized');
		}

		const secret = await this.azureClient.getSecret(name);

		if (!secret.value) {
			throw new Error(`Secret ${name} does not contain a value`);
		}

		return secret.value;
	}

	private async getGCPSecret(name: string): Promise<string> {
		if (!this.gcpClient || !this.config?.gcpProjectId) {
			throw new Error('GCP client not initialized');
		}

		const secretName = `projects/${this.config.gcpProjectId}/secrets/${name}/versions/latest`;
		const [version] = await this.gcpClient.accessSecretVersion({ name: secretName });

		const payload = version.payload?.data;
		if (!payload) {
			throw new Error(`Secret ${name} does not contain a value`);
		}

		return Buffer.from(payload as Uint8Array).toString('utf8');
	}

	private async getVaultSecret(name: string): Promise<string> {
		// HashiCorp Vault implementation would go here
		throw new Error('Vault implementation not yet available');
	}

	async setSecret(name: string, value: string, tags?: Record<string, string>): Promise<void> {
		this.logger.info('Setting secret', { name, hasTags: !!tags });

		if (!this.config) {
			throw new Error('External secrets manager not initialized');
		}

		const fullName = this.config.secretPrefix ? `${this.config.secretPrefix}${name}` : name;

		try {
			switch (this.config.provider) {
				case 'aws':
					await this.setAWSSecret(fullName, value, tags);
					break;
				case 'azure':
					await this.setAzureSecret(fullName, value, tags);
					break;
				case 'gcp':
					await this.setGCPSecret(fullName, value, tags);
					break;
				case 'vault':
					await this.setVaultSecret(fullName, value, tags);
					break;
			}

			// Update cache
			this.cacheSecret(name, value);

			this.logger.info('Secret set successfully', {
				name,
				provider: this.config.provider,
			});
		} catch (error) {
			this.logger.error('Failed to set secret', {
				name,
				provider: this.config.provider,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw error;
		}
	}

	private async setAWSSecret(
		name: string,
		value: string,
		tags?: Record<string, string>,
	): Promise<void> {
		if (!this.awsClient) {
			throw new Error('AWS client not initialized');
		}

		try {
			// Try to update existing secret
			const updateCommand = new UpdateSecretCommand({
				SecretId: name,
				SecretString: value,
			});
			await this.awsClient.send(updateCommand);
		} catch (error) {
			// If secret doesn't exist, create it
			const awsTags: Tag[] = tags
				? Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value }))
				: [];

			const createCommand = new CreateSecretCommand({
				Name: name,
				SecretString: value,
				Tags: awsTags,
			});
			await this.awsClient.send(createCommand);
		}
	}

	private async setAzureSecret(
		name: string,
		value: string,
		tags?: Record<string, string>,
	): Promise<void> {
		if (!this.azureClient) {
			throw new Error('Azure client not initialized');
		}

		await this.azureClient.setSecret(name, value, { tags });
	}

	private async setGCPSecret(
		name: string,
		value: string,
		tags?: Record<string, string>,
	): Promise<void> {
		if (!this.gcpClient || !this.config?.gcpProjectId) {
			throw new Error('GCP client not initialized');
		}

		const parent = `projects/${this.config.gcpProjectId}`;
		const secretId = name;

		try {
			// Try to create secret
			await this.gcpClient.createSecret({
				parent,
				secretId,
				secret: {
					replication: { automatic: {} },
					labels: tags,
				},
			});
		} catch {
			// Secret already exists
		}

		// Add secret version
		const secretName = `${parent}/secrets/${secretId}`;
		await this.gcpClient.addSecretVersion({
			parent: secretName,
			payload: {
				data: Buffer.from(value, 'utf8'),
			},
		});
	}

	private async setVaultSecret(
		name: string,
		value: string,
		tags?: Record<string, string>,
	): Promise<void> {
		// HashiCorp Vault implementation would go here
		throw new Error('Vault implementation not yet available');
	}

	async rotateSecret(name: string): Promise<void> {
		this.logger.info('Rotating secret', { name });

		if (!this.config) {
			throw new Error('External secrets manager not initialized');
		}

		const fullName = this.config.secretPrefix ? `${this.config.secretPrefix}${name}` : name;

		try {
			if (this.config.provider === 'aws' && this.awsClient) {
				const command = new RotateSecretCommand({ SecretId: fullName });
				await this.awsClient.send(command);

				// Clear cache
				this.cache.delete(name);

				this.logger.info('Secret rotated successfully', { name });
			} else {
				throw new Error(`Secret rotation not supported for provider: ${this.config.provider}`);
			}
		} catch (error) {
			this.logger.error('Failed to rotate secret', {
				name,
				provider: this.config.provider,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw error;
		}
	}

	async listSecrets(): Promise<SecretMetadata[]> {
		this.logger.debug('Listing secrets');

		if (!this.config) {
			throw new Error('External secrets manager not initialized');
		}

		try {
			switch (this.config.provider) {
				case 'aws':
					return await this.listAWSSecrets();
				case 'azure':
					return await this.listAzureSecrets();
				case 'gcp':
					return await this.listGCPSecrets();
				default:
					throw new Error(`List operation not supported for provider: ${this.config.provider}`);
			}
		} catch (error) {
			this.logger.error('Failed to list secrets', {
				provider: this.config.provider,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw error;
		}
	}

	private async listAWSSecrets(): Promise<SecretMetadata[]> {
		if (!this.awsClient) {
			throw new Error('AWS client not initialized');
		}

		const command = new ListSecretsCommand({});
		const response = await this.awsClient.send(command);

		return (
			response.SecretList?.map((secret) => ({
				name: secret.Name ?? '',
				createdAt: secret.CreatedDate,
				updatedAt: secret.LastChangedDate,
				rotationEnabled: secret.RotationEnabled,
				nextRotation: secret.NextRotationDate,
			})) ?? []
		);
	}

	private async listAzureSecrets(): Promise<SecretMetadata[]> {
		if (!this.azureClient) {
			throw new Error('Azure client not initialized');
		}

		const secrets: SecretMetadata[] = [];
		const iterator = this.azureClient.listPropertiesOfSecrets();

		for await (const secret of iterator) {
			secrets.push({
				name: secret.name,
				version: secret.version,
				createdAt: secret.createdOn,
				updatedAt: secret.updatedOn,
			});
		}

		return secrets;
	}

	private async listGCPSecrets(): Promise<SecretMetadata[]> {
		if (!this.gcpClient || !this.config?.gcpProjectId) {
			throw new Error('GCP client not initialized');
		}

		const parent = `projects/${this.config.gcpProjectId}`;
		const [secrets] = await this.gcpClient.listSecrets({ parent });

		return secrets.map((secret) => ({
			name: secret.name?.split('/').pop() ?? '',
			createdAt: secret.createTime ? new Date(secret.createTime.seconds! * 1000) : undefined,
		}));
	}

	private getCachedSecret(name: string): string | null {
		const cached = this.cache.get(name);
		if (!cached) {
			return null;
		}

		if (Date.now() > cached.expiresAt) {
			this.cache.delete(name);
			return null;
		}

		return cached.value;
	}

	private cacheSecret(name: string, value: string): void {
		const ttl = this.config?.cacheTTL ?? 300; // Default 5 minutes
		const expiresAt = Date.now() + ttl * 1000;

		this.cache.set(name, { value, expiresAt });

		this.logger.debug('Cached secret', { name, ttl });
	}

	clearCache(): void {
		this.cache.clear();
		this.logger.info('Secret cache cleared');
	}

	async healthCheck(): Promise<boolean> {
		try {
			await this.listSecrets();
			return true;
		} catch (error) {
			this.logger.error('Health check failed', {
				error: error instanceof Error ? error.message : String(error),
			});
			return false;
		}
	}
}
