import { Logger } from '@n8n/backend-common';
import type { User } from '@n8n/db';
import { Service } from '@n8n/di';
import { randomBytes, createHash } from 'crypto';
import type { ICredentialDataDecryptedObject } from 'n8n-workflow';

import { CredentialsService } from '@/credentials/credentials.service';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';

/**
 * API key format
 */
export type ApiKeyFormat = 'uuid' | 'base64' | 'hex' | 'alphanumeric';

/**
 * API key location
 */
export type ApiKeyLocation = 'header' | 'query' | 'body';

/**
 * API key configuration
 */
export interface ApiKeyConfig {
	/** API key value */
	key: string;
	/** Key location in request */
	location?: ApiKeyLocation;
	/** Parameter/header name */
	name?: string;
	/** Optional prefix (e.g., 'Bearer', 'Token') */
	prefix?: string;
	/** Description/label */
	description?: string;
}

/**
 * API key metadata
 */
export interface ApiKeyMetadata {
	/** API key ID (credential ID) */
	id: string;
	/** Key name */
	name: string;
	/** Key prefix (first 8 chars) */
	prefix: string;
	/** Created timestamp */
	createdAt: Date;
	/** Last used timestamp */
	lastUsedAt?: Date;
	/** Expiration timestamp */
	expiresAt?: Date;
	/** Whether key is active */
	active: boolean;
	/** Usage count */
	usageCount?: number;
}

/**
 * API key validation result
 */
export interface ApiKeyValidationResult {
	/** Whether key is valid */
	valid: boolean;
	/** Validation message */
	message: string;
	/** Key metadata if valid */
	metadata?: ApiKeyMetadata;
}

/**
 * API Key Manager Service
 * Manages API key lifecycle including generation, rotation, and validation
 */
@Service()
export class ApiKeyManager {
	constructor(
		private readonly logger: Logger,
		private readonly credentialsService: CredentialsService,
	) {}

	/**
	 * Generate API key
	 */
	generateApiKey(format: ApiKeyFormat = 'base64', length: number = 32): string {
		const bytes = randomBytes(length);

		switch (format) {
			case 'uuid':
				// Generate UUID v4 format
				return this.generateUuid();

			case 'base64':
				return bytes.toString('base64').replace(/[+/=]/g, '');

			case 'hex':
				return bytes.toString('hex');

			case 'alphanumeric':
				return this.generateAlphanumeric(length);

			default:
				return bytes.toString('base64').replace(/[+/=]/g, '');
		}
	}

	/**
	 * Create API key credential
	 */
	async createApiKeyCredential(name: string, config: ApiKeyConfig, user: User, projectId?: string) {
		this.logger.info('Creating API key credential', {
			userId: user.id,
			location: config.location ?? 'header',
		});

		if (!config.key || config.key.length < 16) {
			throw new BadRequestError('API key must be at least 16 characters long');
		}

		const credentialData: ICredentialDataDecryptedObject = {
			apiKey: config.key,
			apiKeyLocation: config.location ?? 'header',
			apiKeyName: config.name ?? 'X-API-Key',
		};

		if (config.prefix) {
			credentialData.prefix = config.prefix;
		}

		if (config.description) {
			credentialData.description = config.description;
		}

		// Store metadata
		credentialData.createdAt = new Date().toISOString();
		credentialData.active = true;
		credentialData.keyPrefix = config.key.substring(0, 8);

		// Create credential
		const credential = await this.credentialsService.createUnmanagedCredential(
			{
				name,
				type: 'apiKey',
				data: credentialData,
				projectId,
			},
			user,
		);

		this.logger.info('API key credential created', {
			credentialId: credential.id,
			keyPrefix: credentialData.keyPrefix,
		});

		return credential;
	}

	/**
	 * Rotate API key
	 */
	async rotateApiKey(
		credentialId: string,
		user: User,
		newKeyFormat?: ApiKeyFormat,
	): Promise<{ credential: { id: string; name: string }; oldKeyPrefix: string; newKey: string }> {
		const credential = await this.credentialsService.getOne(user, credentialId, true);

		if (!credential.data) {
			throw new BadRequestError('Unable to decrypt credential data');
		}

		const oldKey = credential.data.apiKey as string;
		const oldKeyPrefix = oldKey.substring(0, 8);

		// Generate new key
		const newKey = this.generateApiKey(newKeyFormat ?? 'base64', 32);

		// Update credential data
		const updatedData = {
			...credential.data,
			apiKey: newKey,
			keyPrefix: newKey.substring(0, 8),
			rotatedAt: new Date().toISOString(),
			previousKeyPrefix: oldKeyPrefix,
		};

		// Update credential
		const encryptedData = this.credentialsService.createEncryptedData({
			id: credential.id,
			name: credential.name,
			type: credential.type,
			data: updatedData,
		});

		await this.credentialsService.update(credential.id, encryptedData);

		this.logger.info('API key rotated', {
			credentialId: credential.id,
			oldKeyPrefix,
			newKeyPrefix: newKey.substring(0, 8),
		});

		return {
			credential: {
				id: credential.id,
				name: credential.name,
			},
			oldKeyPrefix,
			newKey,
		};
	}

	/**
	 * Revoke API key
	 */
	async revokeApiKey(credentialId: string, user: User): Promise<void> {
		const credential = await this.credentialsService.getOne(user, credentialId, true);

		if (!credential.data) {
			throw new BadRequestError('Unable to decrypt credential data');
		}

		// Mark as inactive
		const updatedData = {
			...credential.data,
			active: false,
			revokedAt: new Date().toISOString(),
		};

		// Update credential
		const encryptedData = this.credentialsService.createEncryptedData({
			id: credential.id,
			name: credential.name,
			type: credential.type,
			data: updatedData,
		});

		await this.credentialsService.update(credential.id, encryptedData);

		this.logger.info('API key revoked', {
			credentialId: credential.id,
		});
	}

	/**
	 * Validate API key
	 */
	async validateApiKey(
		credentialId: string,
		providedKey: string,
		user: User,
	): Promise<ApiKeyValidationResult> {
		try {
			const credential = await this.credentialsService.getOne(user, credentialId, true);

			if (!credential.data) {
				return {
					valid: false,
					message: 'Unable to decrypt credential data',
				};
			}

			const storedKey = credential.data.apiKey as string;
			const active = credential.data.active !== false;

			// Check if key is active
			if (!active) {
				return {
					valid: false,
					message: 'API key has been revoked',
				};
			}

			// Check expiration
			if (credential.data.expiresAt) {
				const expiresAt = new Date(credential.data.expiresAt as string);
				if (Date.now() > expiresAt.getTime()) {
					return {
						valid: false,
						message: 'API key has expired',
					};
				}
			}

			// Compare keys
			if (storedKey !== providedKey) {
				return {
					valid: false,
					message: 'Invalid API key',
				};
			}

			// Update usage metadata
			await this.updateUsageMetadata(credential.id, user);

			return {
				valid: true,
				message: 'API key is valid',
				metadata: {
					id: credential.id,
					name: credential.name,
					prefix: storedKey.substring(0, 8),
					createdAt: new Date(credential.data.createdAt as string),
					lastUsedAt: new Date(),
					active: true,
				},
			};
		} catch (error) {
			this.logger.error('API key validation failed', {
				credentialId,
				error: (error as Error).message,
			});

			return {
				valid: false,
				message: 'Validation error',
			};
		}
	}

	/**
	 * Update usage metadata
	 */
	private async updateUsageMetadata(credentialId: string, user: User): Promise<void> {
		try {
			const credential = await this.credentialsService.getOne(user, credentialId, true);

			if (!credential.data) return;

			const usageCount = ((credential.data.usageCount as number) ?? 0) + 1;

			const updatedData = {
				...credential.data,
				lastUsedAt: new Date().toISOString(),
				usageCount,
			};

			const encryptedData = this.credentialsService.createEncryptedData({
				id: credential.id,
				name: credential.name,
				type: credential.type,
				data: updatedData,
			});

			await this.credentialsService.update(credential.id, encryptedData);
		} catch (error) {
			// Don't throw, just log
			this.logger.debug('Failed to update API key usage metadata', {
				credentialId,
				error: (error as Error).message,
			});
		}
	}

	/**
	 * Set API key expiration
	 */
	async setExpiration(credentialId: string, expiresIn: string | number, user: User): Promise<Date> {
		const credential = await this.credentialsService.getOne(user, credentialId, true);

		if (!credential.data) {
			throw new BadRequestError('Unable to decrypt credential data');
		}

		let expiresAt: Date;

		if (typeof expiresIn === 'number') {
			expiresAt = new Date(Date.now() + expiresIn);
		} else {
			expiresAt = this.parseExpiration(expiresIn);
		}

		const updatedData = {
			...credential.data,
			expiresAt: expiresAt.toISOString(),
		};

		const encryptedData = this.credentialsService.createEncryptedData({
			id: credential.id,
			name: credential.name,
			type: credential.type,
			data: updatedData,
		});

		await this.credentialsService.update(credential.id, encryptedData);

		this.logger.info('API key expiration set', {
			credentialId: credential.id,
			expiresAt,
		});

		return expiresAt;
	}

	/**
	 * Get API key metadata
	 */
	async getApiKeyMetadata(credentialId: string, user: User): Promise<ApiKeyMetadata | null> {
		try {
			const credential = await this.credentialsService.getOne(user, credentialId, false);

			if (!credential) return null;

			// Get decrypted data to access metadata
			const credentialWithData = await this.credentialsService.getOne(user, credentialId, true);

			if (!credentialWithData.data) return null;

			const apiKey = credentialWithData.data.apiKey as string;

			return {
				id: credential.id,
				name: credential.name,
				prefix: apiKey.substring(0, 8),
				createdAt: new Date((credentialWithData.data.createdAt as string) ?? credential.createdAt),
				lastUsedAt: credentialWithData.data.lastUsedAt
					? new Date(credentialWithData.data.lastUsedAt as string)
					: undefined,
				expiresAt: credentialWithData.data.expiresAt
					? new Date(credentialWithData.data.expiresAt as string)
					: undefined,
				active: credentialWithData.data.active !== false,
				usageCount: (credentialWithData.data.usageCount as number) ?? 0,
			};
		} catch (error) {
			this.logger.error('Failed to get API key metadata', {
				credentialId,
				error: (error as Error).message,
			});

			return null;
		}
	}

	/**
	 * Test API key
	 */
	async testApiKey(
		credentialId: string,
		user: User,
		testUrl?: string,
	): Promise<{
		success: boolean;
		message: string;
		statusCode?: number;
	}> {
		try {
			const credential = await this.credentialsService.getOne(user, credentialId, true);

			if (!credential.data) {
				return {
					success: false,
					message: 'Unable to decrypt credential data',
				};
			}

			const apiKey = credential.data.apiKey as string;
			const location = (credential.data.apiKeyLocation as ApiKeyLocation) ?? 'header';
			const name = (credential.data.apiKeyName as string) ?? 'X-API-Key';
			const prefix = credential.data.prefix as string | undefined;

			// If test URL provided, make a request
			if (testUrl) {
				const headers: Record<string, string> = {};
				let url = testUrl;

				const fullKey = prefix ? `${prefix} ${apiKey}` : apiKey;

				if (location === 'header') {
					headers[name] = fullKey;
				} else if (location === 'query') {
					const separator = testUrl.includes('?') ? '&' : '?';
					url = `${testUrl}${separator}${name}=${encodeURIComponent(fullKey)}`;
				}

				try {
					const response = await fetch(url, {
						method: 'GET',
						headers,
					});

					return {
						success: response.ok,
						message: response.ok
							? 'API key test successful'
							: `HTTP ${response.status}: ${response.statusText}`,
						statusCode: response.status,
					};
				} catch (error) {
					return {
						success: false,
						message: `Request failed: ${(error as Error).message}`,
					};
				}
			}

			// Basic validation if no test URL
			if (!apiKey || apiKey.length < 16) {
				return {
					success: false,
					message: 'API key is too short',
				};
			}

			return {
				success: true,
				message: 'API key is properly configured',
			};
		} catch (error) {
			return {
				success: false,
				message: `Test failed: ${(error as Error).message}`,
			};
		}
	}

	/**
	 * Generate UUID v4
	 */
	private generateUuid(): string {
		const bytes = randomBytes(16);
		bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
		bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant

		const hex = bytes.toString('hex');
		return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
	}

	/**
	 * Generate alphanumeric string
	 */
	private generateAlphanumeric(length: number): string {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		let result = '';

		const bytes = randomBytes(length);
		for (let i = 0; i < length; i++) {
			result += chars[bytes[i] % chars.length];
		}

		return result;
	}

	/**
	 * Parse expiration string
	 */
	private parseExpiration(expiresIn: string): Date {
		const units: Record<string, number> = {
			s: 1000,
			m: 60000,
			h: 3600000,
			d: 86400000,
			w: 604800000,
			M: 2592000000, // 30 days
			y: 31536000000, // 365 days
		};

		const match = /^(\d+)([smhdwMy])$/.exec(expiresIn);

		if (!match) {
			throw new BadRequestError('Invalid expiration format. Use format like "1h", "30d", "1y"');
		}

		const value = parseInt(match[1], 10);
		const unit = match[2];

		return new Date(Date.now() + value * (units[unit] ?? 1000));
	}

	/**
	 * Hash API key for comparison
	 */
	hashApiKey(apiKey: string): string {
		return createHash('sha256').update(apiKey).digest('hex');
	}

	/**
	 * Get supported formats
	 */
	getSupportedFormats(): ApiKeyFormat[] {
		return ['uuid', 'base64', 'hex', 'alphanumeric'];
	}

	/**
	 * Get supported locations
	 */
	getSupportedLocations(): ApiKeyLocation[] {
		return ['header', 'query', 'body'];
	}
}
