import { Logger } from '@n8n/backend-common';
import type { User } from '@n8n/db';
import { Service } from '@n8n/di';
import { createHash, randomBytes } from 'crypto';
import type { ICredentialDataDecryptedObject } from 'n8n-workflow';

import { CredentialsService } from '@/credentials/credentials.service';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';

/**
 * Basic Auth credential data
 */
export interface BasicAuthCredential {
	/** Username */
	username: string;
	/** Password (plain text or hashed) */
	password: string;
	/** Optional realm for HTTP Basic Auth */
	realm?: string;
	/** Whether password is already hashed */
	isHashed?: boolean;
}

/**
 * Basic Auth validation result
 */
export interface BasicAuthValidationResult {
	/** Whether credentials are valid */
	valid: boolean;
	/** Validation message */
	message: string;
	/** User information if valid */
	user?: {
		username: string;
		realm?: string;
	};
}

/**
 * Basic Authentication Service
 * Implements username:password authentication with secure storage
 */
@Service()
export class BasicAuth {
	constructor(
		private readonly logger: Logger,
		private readonly credentialsService: CredentialsService,
	) {}

	/**
	 * Create Basic Auth credential
	 */
	async createCredential(
		name: string,
		username: string,
		password: string,
		user: User,
		options?: {
			realm?: string;
			projectId?: string;
			hashPassword?: boolean;
		},
	) {
		this.logger.info('Creating Basic Auth credential', {
			username,
			userId: user.id,
		});

		// Validate inputs
		if (!username || username.trim().length === 0) {
			throw new BadRequestError('Username is required');
		}

		if (!password || password.length < 8) {
			throw new BadRequestError('Password must be at least 8 characters long');
		}

		// Hash password if requested
		const finalPassword = options?.hashPassword ? this.hashPassword(password) : password;

		const credentialData: ICredentialDataDecryptedObject = {
			user: username,
			password: finalPassword,
		};

		if (options?.realm) {
			credentialData.realm = options.realm;
		}

		// Create credential
		const credential = await this.credentialsService.createUnmanagedCredential(
			{
				name,
				type: 'httpBasicAuth',
				data: credentialData,
				projectId: options?.projectId,
			},
			user,
		);

		this.logger.info('Basic Auth credential created', {
			credentialId: credential.id,
			username,
		});

		return credential;
	}

	/**
	 * Encode credentials to Base64 (username:password)
	 */
	encodeCredentials(username: string, password: string): string {
		const credentials = `${username}:${password}`;
		return Buffer.from(credentials).toString('base64');
	}

	/**
	 * Decode Base64 credentials
	 */
	decodeCredentials(encodedCredentials: string): { username: string; password: string } | null {
		try {
			const decoded = Buffer.from(encodedCredentials, 'base64').toString('utf-8');
			const [username, ...passwordParts] = decoded.split(':');
			const password = passwordParts.join(':'); // Handle passwords with colons

			if (!username || !password) {
				return null;
			}

			return { username, password };
		} catch {
			return null;
		}
	}

	/**
	 * Generate Authorization header for Basic Auth
	 */
	generateAuthorizationHeader(username: string, password: string): string {
		const encoded = this.encodeCredentials(username, password);
		return `Basic ${encoded}`;
	}

	/**
	 * Parse Authorization header
	 */
	parseAuthorizationHeader(authHeader: string): { username: string; password: string } | null {
		if (!authHeader.startsWith('Basic ')) {
			return null;
		}

		const encoded = authHeader.substring(6);
		return this.decodeCredentials(encoded);
	}

	/**
	 * Validate Basic Auth credentials
	 */
	async validateCredentials(
		credentialId: string,
		providedUsername: string,
		providedPassword: string,
		user: User,
	): Promise<BasicAuthValidationResult> {
		try {
			const credential = await this.credentialsService.getOne(user, credentialId, true);

			if (!credential.data) {
				return {
					valid: false,
					message: 'Unable to decrypt credential data',
				};
			}

			const storedUsername = credential.data.user as string;
			const storedPassword = credential.data.password as string;
			const realm = credential.data.realm as string | undefined;

			// Check username
			if (storedUsername !== providedUsername) {
				return {
					valid: false,
					message: 'Invalid username',
				};
			}

			// Check password (handle both plain and hashed)
			const passwordValid = credential.data.isHashed
				? this.verifyHashedPassword(providedPassword, storedPassword)
				: storedPassword === providedPassword;

			if (!passwordValid) {
				return {
					valid: false,
					message: 'Invalid password',
				};
			}

			return {
				valid: true,
				message: 'Credentials are valid',
				user: {
					username: storedUsername,
					realm,
				},
			};
		} catch (error) {
			this.logger.error('Basic Auth validation failed', {
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
	 * Hash password using SHA-256
	 */
	hashPassword(password: string, salt?: string): string {
		const finalSalt = salt ?? this.generateSalt();
		const hash = createHash('sha256')
			.update(password + finalSalt)
			.digest('hex');
		return `${finalSalt}:${hash}`;
	}

	/**
	 * Verify hashed password
	 */
	verifyHashedPassword(password: string, hashedPassword: string): boolean {
		const [salt, hash] = hashedPassword.split(':');
		if (!salt || !hash) {
			return false;
		}

		const computedHash = createHash('sha256')
			.update(password + salt)
			.digest('hex');

		return computedHash === hash;
	}

	/**
	 * Generate random salt
	 */
	private generateSalt(): string {
		return randomBytes(16).toString('hex');
	}

	/**
	 * Update Basic Auth password
	 */
	async updatePassword(
		credentialId: string,
		newPassword: string,
		user: User,
		hashPassword: boolean = false,
	) {
		if (!newPassword || newPassword.length < 8) {
			throw new BadRequestError('Password must be at least 8 characters long');
		}

		const credential = await this.credentialsService.getOne(user, credentialId, true);

		if (!credential.data) {
			throw new BadRequestError('Unable to decrypt credential data');
		}

		const finalPassword = hashPassword ? this.hashPassword(newPassword) : newPassword;

		const updatedData = {
			...credential.data,
			password: finalPassword,
			isHashed: hashPassword,
		};

		// Update credential
		const encryptedData = this.credentialsService.createEncryptedData({
			id: credential.id,
			name: credential.name,
			type: credential.type,
			data: updatedData,
		});

		await this.credentialsService.update(credential.id, encryptedData);

		this.logger.info('Basic Auth password updated', {
			credentialId: credential.id,
		});
	}

	/**
	 * Test Basic Auth credential
	 */
	async testCredential(
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

			const username = credential.data.user as string;
			const password = credential.data.password as string;

			// If test URL provided, make a request
			if (testUrl) {
				const authHeader = this.generateAuthorizationHeader(username, password);

				try {
					const response = await fetch(testUrl, {
						method: 'GET',
						headers: {
							Authorization: authHeader,
						},
					});

					return {
						success: response.ok,
						message: response.ok
							? 'Basic Auth test successful'
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
			if (!username || !password) {
				return {
					success: false,
					message: 'Missing username or password',
				};
			}

			return {
				success: true,
				message: 'Basic Auth credential is properly configured',
			};
		} catch (error) {
			return {
				success: false,
				message: `Test failed: ${(error as Error).message}`,
			};
		}
	}

	/**
	 * Generate strong password
	 */
	generateStrongPassword(length: number = 16): string {
		const charset =
			'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
		const password: string[] = [];

		// Ensure at least one of each type
		password.push(this.getRandomChar('abcdefghijklmnopqrstuvwxyz'));
		password.push(this.getRandomChar('ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
		password.push(this.getRandomChar('0123456789'));
		password.push(this.getRandomChar('!@#$%^&*()_+-=[]{}|;:,.<>?'));

		// Fill the rest randomly
		for (let i = password.length; i < length; i++) {
			password.push(this.getRandomChar(charset));
		}

		// Shuffle the password
		return this.shuffleArray(password).join('');
	}

	/**
	 * Get random character from charset
	 */
	private getRandomChar(charset: string): string {
		const randomIndex = Math.floor(Math.random() * charset.length);
		return charset[randomIndex];
	}

	/**
	 * Shuffle array
	 */
	private shuffleArray<T>(array: T[]): T[] {
		const shuffled = [...array];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		return shuffled;
	}

	/**
	 * Validate password strength
	 */
	validatePasswordStrength(password: string): {
		strong: boolean;
		score: number;
		feedback: string[];
	} {
		const feedback: string[] = [];
		let score = 0;

		// Length check
		if (password.length >= 12) score += 2;
		else if (password.length >= 8) score += 1;
		else feedback.push('Password should be at least 8 characters long');

		// Complexity checks
		if (/[a-z]/.test(password)) score += 1;
		else feedback.push('Password should contain lowercase letters');

		if (/[A-Z]/.test(password)) score += 1;
		else feedback.push('Password should contain uppercase letters');

		if (/[0-9]/.test(password)) score += 1;
		else feedback.push('Password should contain numbers');

		if (/[^a-zA-Z0-9]/.test(password)) score += 1;
		else feedback.push('Password should contain special characters');

		return {
			strong: score >= 5,
			score,
			feedback,
		};
	}
}
