import { Logger } from '@n8n/backend-common';
import type { User } from '@n8n/db';
import { Service } from '@n8n/di';
import { randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import type { ICredentialDataDecryptedObject } from 'n8n-workflow';
import { jsonParse } from 'n8n-workflow';

import { CredentialsService } from '@/credentials/credentials.service';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { JwtService } from '@/services/jwt.service';

/**
 * JWT token payload
 */
export interface JwtTokenPayload {
	/** Subject (user ID) */
	sub?: string;
	/** Issuer */
	iss?: string;
	/** Audience */
	aud?: string;
	/** Expiration time */
	exp?: number;
	/** Issued at */
	iat?: number;
	/** Not before */
	nbf?: number;
	/** JWT ID */
	jti?: string;
	/** Custom claims */
	[key: string]: unknown;
}

/**
 * JWT configuration
 */
export interface JwtConfig {
	/** Secret key for signing */
	secret: string;
	/** Algorithm */
	algorithm?: jwt.Algorithm;
	/** Token expiration */
	expiresIn?: string | number;
	/** Token issuer */
	issuer?: string;
	/** Token audience */
	audience?: string;
	/** Custom claims */
	claims?: Record<string, unknown>;
}

/**
 * JWT validation result
 */
export interface JwtValidationResult {
	/** Whether token is valid */
	valid: boolean;
	/** Validation message */
	message: string;
	/** Decoded payload if valid */
	payload?: JwtTokenPayload;
	/** Error details if invalid */
	error?: string;
}

/**
 * JWT Authentication Service
 * Implements JWT token generation and validation
 */
@Service()
export class JwtAuth {
	constructor(
		private readonly logger: Logger,
		private readonly credentialsService: CredentialsService,
		private readonly jwtService: JwtService,
	) {}

	/**
	 * Create JWT credential
	 */
	async createCredential(name: string, config: JwtConfig, user: User, projectId?: string) {
		this.logger.info('Creating JWT credential', {
			userId: user.id,
		});

		// Validate secret
		if (!config.secret || config.secret.length < 32) {
			throw new BadRequestError('JWT secret must be at least 32 characters long');
		}

		const credentialData: ICredentialDataDecryptedObject = {
			secret: config.secret,
			algorithm: config.algorithm ?? 'HS256',
			expiresIn: config.expiresIn ?? '1h',
		};

		if (config.issuer) {
			credentialData.issuer = config.issuer;
		}

		if (config.audience) {
			credentialData.audience = config.audience;
		}

		if (config.claims) {
			credentialData.claims = JSON.stringify(config.claims);
		}

		// Create credential
		const credential = await this.credentialsService.createUnmanagedCredential(
			{
				name,
				type: 'jwtAuth',
				data: credentialData,
			},
			user,
		);

		this.logger.info('JWT credential created', {
			credentialId: credential.id,
		});

		return credential;
	}

	/**
	 * Generate JWT token
	 */
	generateToken(config: JwtConfig, payload: JwtTokenPayload = {}): string {
		const finalPayload = {
			...payload,
			...config.claims,
		};

		const options: jwt.SignOptions = {
			algorithm: config.algorithm ?? 'HS256',
		};

		if (config.expiresIn) {
			options.expiresIn = config.expiresIn;
		}

		if (config.issuer) {
			options.issuer = config.issuer;
		}

		if (config.audience) {
			options.audience = config.audience;
		}

		return jwt.sign(finalPayload, config.secret, options);
	}

	/**
	 * Verify JWT token
	 */
	verifyToken(token: string, config: JwtConfig): JwtValidationResult {
		try {
			const options: jwt.VerifyOptions = {
				algorithms: [config.algorithm ?? 'HS256'],
			};

			if (config.issuer) {
				options.issuer = config.issuer;
			}

			if (config.audience) {
				options.audience = config.audience;
			}

			const payload = jwt.verify(token, config.secret, options) as JwtTokenPayload;

			return {
				valid: true,
				message: 'Token is valid',
				payload,
			};
		} catch (error) {
			const jwtError = error as Error;

			let message = 'Invalid token';
			if (jwtError.name === 'TokenExpiredError') {
				message = 'Token has expired';
			} else if (jwtError.name === 'JsonWebTokenError') {
				message = 'Invalid token format';
			} else if (jwtError.name === 'NotBeforeError') {
				message = 'Token not yet valid';
			}

			return {
				valid: false,
				message,
				error: jwtError.message,
			};
		}
	}

	/**
	 * Decode JWT token (without verification)
	 */
	decodeToken(token: string): JwtTokenPayload | null {
		try {
			const decoded = jwt.decode(token);
			return decoded as JwtTokenPayload;
		} catch {
			return null;
		}
	}

	/**
	 * Generate JWT secret
	 */
	generateSecret(length: number = 64): string {
		return randomBytes(length).toString('hex');
	}

	/**
	 * Validate JWT credential
	 */
	async validateCredential(
		credentialId: string,
		testToken: string,
		user: User,
	): Promise<JwtValidationResult> {
		try {
			const credential = await this.credentialsService.getOne(user, credentialId, true);

			if (!credential.data) {
				return {
					valid: false,
					message: 'Unable to decrypt credential data',
				};
			}

			const config: JwtConfig = {
				secret: credential.data.secret as string,
				algorithm: (credential.data.algorithm as jwt.Algorithm) ?? 'HS256',
				issuer: credential.data.issuer as string | undefined,
				audience: credential.data.audience as string | undefined,
			};

			return this.verifyToken(testToken, config);
		} catch (error) {
			this.logger.error('JWT validation failed', {
				credentialId,
				error: (error as Error).message,
			});

			return {
				valid: false,
				message: 'Validation error',
				error: (error as Error).message,
			};
		}
	}

	/**
	 * Generate token from credential
	 */
	async generateTokenFromCredential(
		credentialId: string,
		payload: JwtTokenPayload,
		user: User,
	): Promise<string> {
		const credential = await this.credentialsService.getOne(user, credentialId, true);

		if (!credential.data) {
			throw new BadRequestError('Unable to decrypt credential data');
		}

		const config: JwtConfig = {
			secret: credential.data.secret as string,
			algorithm: (credential.data.algorithm as jwt.Algorithm) ?? 'HS256',
			expiresIn: credential.data.expiresIn as string | undefined,
			issuer: credential.data.issuer as string | undefined,
			audience: credential.data.audience as string | undefined,
		};

		// Merge custom claims from credential
		if (credential.data.claims) {
			const customClaims = jsonParse<Record<string, unknown>>(credential.data.claims as string);
			config.claims = customClaims;
		}

		return this.generateToken(config, payload);
	}

	/**
	 * Refresh JWT token
	 */
	async refreshToken(
		credentialId: string,
		oldToken: string,
		user: User,
	): Promise<{ token: string; expiresAt: number }> {
		const credential = await this.credentialsService.getOne(user, credentialId, true);

		if (!credential.data) {
			throw new BadRequestError('Unable to decrypt credential data');
		}

		// Decode old token to get payload
		const decoded = this.decodeToken(oldToken);

		if (!decoded) {
			throw new BadRequestError('Invalid token format');
		}

		// Remove standard claims
		const { exp, iat, nbf, ...payload } = decoded;

		// Generate new token
		const newToken = await this.generateTokenFromCredential(credentialId, payload, user);

		// Calculate expiration
		const expiresIn = credential.data.expiresIn as string | number;
		let expiresAt = Date.now();

		if (typeof expiresIn === 'number') {
			expiresAt += expiresIn * 1000;
		} else if (typeof expiresIn === 'string') {
			// Parse expiration string (e.g., '1h', '30m', '7d')
			expiresAt += this.parseExpiresIn(expiresIn);
		}

		return {
			token: newToken,
			expiresAt,
		};
	}

	/**
	 * Parse expiration string to milliseconds
	 */
	private parseExpiresIn(expiresIn: string): number {
		const units: Record<string, number> = {
			s: 1000,
			m: 60000,
			h: 3600000,
			d: 86400000,
			w: 604800000,
		};

		const match = /^(\d+)([smhdw])$/.exec(expiresIn);

		if (!match) {
			return 3600000; // Default to 1 hour
		}

		const value = parseInt(match[1], 10);
		const unit = match[2];

		return value * (units[unit] ?? 1000);
	}

	/**
	 * Test JWT credential
	 */
	async testCredential(
		credentialId: string,
		user: User,
	): Promise<{
		success: boolean;
		message: string;
		token?: string;
		payload?: JwtTokenPayload;
	}> {
		try {
			const credential = await this.credentialsService.getOne(user, credentialId, true);

			if (!credential.data) {
				return {
					success: false,
					message: 'Unable to decrypt credential data',
				};
			}

			// Generate test token
			const testPayload: JwtTokenPayload = {
				sub: 'test-user',
				iat: Math.floor(Date.now() / 1000),
			};

			const token = await this.generateTokenFromCredential(credentialId, testPayload, user);

			// Verify the token
			const validation = await this.validateCredential(credentialId, token, user);

			if (!validation.valid) {
				return {
					success: false,
					message: validation.message,
				};
			}

			return {
				success: true,
				message: 'JWT credential is working correctly',
				token,
				payload: validation.payload,
			};
		} catch (error) {
			return {
				success: false,
				message: `Test failed: ${(error as Error).message}`,
			};
		}
	}

	/**
	 * Get token information
	 */
	getTokenInfo(token: string): {
		header: Record<string, unknown>;
		payload: JwtTokenPayload | null;
		expiresAt?: Date;
		isExpired?: boolean;
	} {
		const decoded = jwt.decode(token, { complete: true });

		if (!decoded) {
			return {
				header: {},
				payload: null,
			};
		}

		const info = {
			header: decoded.header,
			payload: decoded.payload as JwtTokenPayload,
			expiresAt: undefined as Date | undefined,
			isExpired: undefined as boolean | undefined,
		};

		if (info.payload?.exp) {
			info.expiresAt = new Date(info.payload.exp * 1000);
			info.isExpired = Date.now() > info.payload.exp * 1000;
		}

		return info;
	}

	/**
	 * Validate JWT configuration
	 */
	validateConfig(config: JwtConfig): {
		valid: boolean;
		errors: string[];
	} {
		const errors: string[] = [];

		if (!config.secret || config.secret.length < 32) {
			errors.push('JWT secret must be at least 32 characters long');
		}

		const supportedAlgorithms = [
			'HS256',
			'HS384',
			'HS512',
			'RS256',
			'RS384',
			'RS512',
			'ES256',
			'ES384',
			'ES512',
		];

		if (config.algorithm && !supportedAlgorithms.includes(config.algorithm)) {
			errors.push(`Algorithm '${config.algorithm}' is not supported`);
		}

		if (config.expiresIn) {
			if (typeof config.expiresIn === 'string' && !/^\d+[smhdw]$/.test(config.expiresIn)) {
				errors.push('Invalid expiration format. Use format like "1h", "30m", "7d"');
			}
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	/**
	 * Get supported algorithms
	 */
	getSupportedAlgorithms(): jwt.Algorithm[] {
		return ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'];
	}
}
