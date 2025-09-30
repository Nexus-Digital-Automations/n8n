import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import * as crypto from 'crypto';

import type { EnvironmentVariable } from './types';
import { EnvironmentVariableRepository } from './repositories/environment-variable.repository';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { NotFoundError } from '@/errors/response-errors/not-found.error';

/**
 * Environment variable management service.
 *
 * Features:
 * - Store and retrieve environment-specific variables
 * - Encrypt sensitive variable values
 * - Support for variable overrides and inheritance
 * - Variable validation and type checking
 * - Bulk variable operations
 * - Variable history and auditing
 */
@Service()
export class EnvironmentVariablesService {
	private readonly encryptionAlgorithm = 'aes-256-cbc';
	private readonly encryptionKey: Buffer;

	constructor(
		private readonly logger: Logger,
		private readonly variableRepository: EnvironmentVariableRepository,
	) {
		this.logger.info('EnvironmentVariablesService initialized');

		// Initialize encryption key (in production, this should come from secure config)
		this.encryptionKey = crypto.scryptSync(
			process.env.ENCRYPTION_KEY || 'default-key-change-in-production',
			'salt',
			32,
		);
	}

	/**
	 * Set a variable in an environment.
	 *
	 * @param environmentId - Environment ID
	 * @param key - Variable key
	 * @param value - Variable value
	 * @param userId - User setting the variable
	 * @param options - Additional options
	 * @returns Created/updated environment variable
	 */
	async setVariable(
		environmentId: string,
		key: string,
		value: string,
		userId: string,
		options: { encrypted?: boolean; description?: string; metadata?: Record<string, any> } = {},
	): Promise<EnvironmentVariable> {
		this.logger.debug('Setting environment variable', { environmentId, key });

		// Validate key
		this.validateVariableKey(key);

		// Check if variable already exists
		const existing = await this.variableRepository.findByKey(environmentId, key);

		const encrypted = options.encrypted || this.shouldEncrypt(key);
		const finalValue = encrypted ? this.encryptValue(value) : value;

		if (existing) {
			// Update existing variable
			const updated = await this.variableRepository.update(existing.id, {
				value: finalValue,
				encrypted,
				description: options.description,
				metadata: options.metadata,
			});

			this.logger.debug('Environment variable updated', { environmentId, key });
			return updated;
		} else {
			// Create new variable
			const created = await this.variableRepository.create({
				environmentId,
				key,
				value: finalValue,
				encrypted,
				description: options.description,
				metadata: options.metadata || {},
				createdBy: userId,
			});

			this.logger.debug('Environment variable created', { environmentId, key });
			return created;
		}
	}

	/**
	 * Set multiple variables in an environment.
	 *
	 * @param environmentId - Environment ID
	 * @param variables - Key-value pairs of variables
	 * @param userId - User setting the variables
	 * @returns Number of variables set
	 */
	async setVariables(
		environmentId: string,
		variables: Record<string, string>,
		userId: string,
	): Promise<number> {
		this.logger.info('Setting multiple environment variables', {
			environmentId,
			count: Object.keys(variables).length,
		});

		let count = 0;

		for (const [key, value] of Object.entries(variables)) {
			try {
				await this.setVariable(environmentId, key, value, userId);
				count++;
			} catch (error) {
				this.logger.error('Failed to set variable', {
					key,
					error: error.message,
				});
			}
		}

		this.logger.info('Environment variables set', { environmentId, count });

		return count;
	}

	/**
	 * Get a variable from an environment.
	 *
	 * @param environmentId - Environment ID
	 * @param key - Variable key
	 * @param decrypt - Whether to decrypt the value if encrypted
	 * @returns Variable value
	 */
	async getVariable(
		environmentId: string,
		key: string,
		decrypt: boolean = true,
	): Promise<string | undefined> {
		this.logger.debug('Getting environment variable', { environmentId, key });

		const variable = await this.variableRepository.findByKey(environmentId, key);

		if (!variable) {
			return undefined;
		}

		if (variable.encrypted && decrypt) {
			return this.decryptValue(variable.value);
		}

		return variable.value;
	}

	/**
	 * Get all variables for an environment.
	 *
	 * @param environmentId - Environment ID
	 * @param decrypt - Whether to decrypt encrypted values
	 * @returns Key-value pairs of all variables
	 */
	async getAllVariables(
		environmentId: string,
		decrypt: boolean = true,
	): Promise<Record<string, string>> {
		this.logger.debug('Getting all environment variables', { environmentId });

		const variables = await this.variableRepository.findByEnvironment(environmentId);

		const result: Record<string, string> = {};

		for (const variable of variables) {
			if (variable.encrypted && decrypt) {
				result[variable.key] = this.decryptValue(variable.value);
			} else {
				result[variable.key] = variable.value;
			}
		}

		return result;
	}

	/**
	 * List all variables for an environment with metadata.
	 *
	 * @param environmentId - Environment ID
	 * @param includeValues - Whether to include variable values
	 * @returns List of environment variables
	 */
	async listVariables(
		environmentId: string,
		includeValues: boolean = false,
	): Promise<EnvironmentVariable[]> {
		this.logger.debug('Listing environment variables', { environmentId });

		const variables = await this.variableRepository.findByEnvironment(environmentId);

		if (!includeValues) {
			// Remove values from response
			return variables.map((v) => ({
				...v,
				value: v.encrypted ? '***ENCRYPTED***' : '***HIDDEN***',
			}));
		}

		// Decrypt encrypted values
		return variables.map((v) => ({
			...v,
			value: v.encrypted ? this.decryptValue(v.value) : v.value,
		}));
	}

	/**
	 * Delete a variable from an environment.
	 *
	 * @param environmentId - Environment ID
	 * @param key - Variable key
	 */
	async deleteVariable(environmentId: string, key: string): Promise<void> {
		this.logger.info('Deleting environment variable', { environmentId, key });

		const variable = await this.variableRepository.findByKey(environmentId, key);

		if (!variable) {
			throw new NotFoundError(`Variable '${key}' not found in environment '${environmentId}'`);
		}

		await this.variableRepository.delete(variable.id);

		this.logger.info('Environment variable deleted', { environmentId, key });
	}

	/**
	 * Delete all variables for an environment.
	 *
	 * @param environmentId - Environment ID
	 */
	async deleteAllVariables(environmentId: string): Promise<void> {
		this.logger.info('Deleting all environment variables', { environmentId });

		await this.variableRepository.deleteByEnvironment(environmentId);

		this.logger.info('All environment variables deleted', { environmentId });
	}

	/**
	 * Check if a variable exists in an environment.
	 *
	 * @param environmentId - Environment ID
	 * @param key - Variable key
	 * @returns True if variable exists
	 */
	async hasVariable(environmentId: string, key: string): Promise<boolean> {
		const variable = await this.variableRepository.findByKey(environmentId, key);
		return variable !== null;
	}

	/**
	 * Clone variables from one environment to another.
	 *
	 * @param sourceEnvironmentId - Source environment ID
	 * @param targetEnvironmentId - Target environment ID
	 * @param userId - User performing the clone
	 * @param options - Clone options
	 * @returns Number of variables cloned
	 */
	async cloneVariables(
		sourceEnvironmentId: string,
		targetEnvironmentId: string,
		userId: string,
		options: { keys?: string[]; overwrite?: boolean } = {},
	): Promise<number> {
		this.logger.info('Cloning environment variables', {
			sourceEnvironmentId,
			targetEnvironmentId,
		});

		const sourceVariables = await this.variableRepository.findByEnvironment(sourceEnvironmentId);

		let variablesToClone = sourceVariables;

		// Filter by specific keys if provided
		if (options.keys && options.keys.length > 0) {
			variablesToClone = sourceVariables.filter((v) => options.keys!.includes(v.key));
		}

		let clonedCount = 0;

		for (const sourceVar of variablesToClone) {
			try {
				const existing = await this.variableRepository.findByKey(
					targetEnvironmentId,
					sourceVar.key,
				);

				if (existing && !options.overwrite) {
					this.logger.debug('Skipping variable clone - already exists', {
						key: sourceVar.key,
						targetEnvironmentId,
					});
					continue;
				}

				if (existing && options.overwrite) {
					// Update existing
					await this.variableRepository.update(existing.id, {
						value: sourceVar.value,
						encrypted: sourceVar.encrypted,
						description: sourceVar.description,
						metadata: sourceVar.metadata,
					});
				} else {
					// Create new
					await this.variableRepository.create({
						environmentId: targetEnvironmentId,
						key: sourceVar.key,
						value: sourceVar.value,
						encrypted: sourceVar.encrypted,
						description: sourceVar.description,
						metadata: {
							...sourceVar.metadata,
							clonedFrom: sourceEnvironmentId,
							clonedAt: new Date().toISOString(),
						},
						createdBy: userId,
					});
				}

				clonedCount++;
			} catch (error) {
				this.logger.error('Failed to clone variable', {
					key: sourceVar.key,
					error: error.message,
				});
			}
		}

		this.logger.info('Environment variables cloned', {
			sourceEnvironmentId,
			targetEnvironmentId,
			count: clonedCount,
		});

		return clonedCount;
	}

	/**
	 * Export variables for backup or transfer.
	 *
	 * @param environmentId - Environment ID
	 * @param includeEncrypted - Whether to include encrypted variables
	 * @returns Serialized variables
	 */
	async exportVariables(environmentId: string, includeEncrypted: boolean = false): Promise<string> {
		this.logger.info('Exporting environment variables', { environmentId });

		const variables = await this.getAllVariables(environmentId, true);

		const filtered = includeEncrypted
			? variables
			: Object.fromEntries(Object.entries(variables).filter(([key]) => !this.shouldEncrypt(key)));

		return JSON.stringify(filtered, null, 2);
	}

	/**
	 * Import variables from backup or transfer.
	 *
	 * @param environmentId - Environment ID
	 * @param variablesJson - Serialized variables
	 * @param userId - User performing the import
	 * @returns Number of variables imported
	 */
	async importVariables(
		environmentId: string,
		variablesJson: string,
		userId: string,
	): Promise<number> {
		this.logger.info('Importing environment variables', { environmentId });

		let variables: Record<string, string>;

		try {
			variables = JSON.parse(variablesJson);
		} catch (error) {
			throw new BadRequestError('Invalid variables JSON');
		}

		return await this.setVariables(environmentId, variables, userId);
	}

	// ===== Private helper methods =====

	private validateVariableKey(key: string): void {
		// Variable keys must follow naming conventions
		const validKeyPattern = /^[A-Z][A-Z0-9_]*$/;

		if (!validKeyPattern.test(key)) {
			throw new BadRequestError(
				'Variable key must start with uppercase letter and contain only uppercase letters, numbers, and underscores',
			);
		}

		// Reserved keys
		const reservedKeys = ['PATH', 'HOME', 'USER', 'SHELL'];
		if (reservedKeys.includes(key)) {
			throw new BadRequestError(`Variable key '${key}' is reserved`);
		}
	}

	private shouldEncrypt(key: string): boolean {
		// Auto-encrypt variables with sensitive keywords in their names
		const sensitiveKeywords = [
			'PASSWORD',
			'SECRET',
			'KEY',
			'TOKEN',
			'API_KEY',
			'PRIVATE',
			'CREDENTIAL',
		];

		return sensitiveKeywords.some((keyword) => key.includes(keyword));
	}

	private encryptValue(value: string): string {
		try {
			const iv = crypto.randomBytes(16);
			const cipher = crypto.createCipheriv(this.encryptionAlgorithm, this.encryptionKey, iv);

			let encrypted = cipher.update(value, 'utf8', 'hex');
			encrypted += cipher.final('hex');

			// Prepend IV to encrypted value
			return iv.toString('hex') + ':' + encrypted;
		} catch (error) {
			this.logger.error('Failed to encrypt value', { error: error.message });
			throw new BadRequestError('Failed to encrypt value');
		}
	}

	private decryptValue(encryptedValue: string): string {
		try {
			// Extract IV and encrypted value
			const parts = encryptedValue.split(':');
			if (parts.length !== 2) {
				throw new Error('Invalid encrypted value format');
			}

			const iv = Buffer.from(parts[0], 'hex');
			const encrypted = parts[1];

			const decipher = crypto.createDecipheriv(this.encryptionAlgorithm, this.encryptionKey, iv);

			let decrypted = decipher.update(encrypted, 'hex', 'utf8');
			decrypted += decipher.final('utf8');

			return decrypted;
		} catch (error) {
			this.logger.error('Failed to decrypt value', { error: error.message });
			throw new BadRequestError('Failed to decrypt value');
		}
	}
}
