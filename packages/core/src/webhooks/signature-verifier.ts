import { createHmac, createVerify, timingSafeEqual } from 'crypto';
import type { Logger } from 'n8n-workflow';
import { ApplicationError } from 'n8n-workflow';

/**
 * Signature Algorithm Types
 */
export type SignatureAlgorithm = 'hmac-sha256' | 'hmac-sha512' | 'rsa-sha256' | 'jwt';

/**
 * Signature Verification Configuration
 */
export interface ISignatureVerificationConfig {
	algorithm: SignatureAlgorithm;
	secret?: string;
	publicKey?: string;
	headerName: string;
	timestampHeaderName?: string;
	timestampToleranceSeconds?: number;
	prefix?: string;
}

/**
 * Signature Verification Result
 */
export interface ISignatureVerificationResult {
	valid: boolean;
	error?: string;
	timestamp?: Date;
	details?: Record<string, unknown>;
}

/**
 * JWT Payload Interface
 */
interface IJwtPayload {
	iss?: string;
	sub?: string;
	aud?: string;
	exp?: number;
	nbf?: number;
	iat?: number;
	jti?: string;
	[key: string]: unknown;
}

/**
 * Signature Verifier
 * Verifies webhook signatures using various algorithms (HMAC, RSA, JWT)
 */
export class SignatureVerifier {
	private readonly config: ISignatureVerificationConfig;
	private readonly logger: Logger;

	constructor(config: ISignatureVerificationConfig, logger: Logger) {
		this.config = config;
		this.logger = logger;

		this.validateConfig();

		this.logger.info('SignatureVerifier initialized', {
			function: 'constructor',
			algorithm: this.config.algorithm,
			headerName: this.config.headerName,
		});
	}

	/**
	 * Validate configuration
	 */
	private validateConfig(): void {
		const startTime = Date.now();
		this.logger.debug('Validating configuration', { function: 'validateConfig' });

		if (
			(this.config.algorithm === 'hmac-sha256' || this.config.algorithm === 'hmac-sha512') &&
			!this.config.secret
		) {
			throw new ApplicationError('Secret is required for HMAC algorithms');
		}

		if (this.config.algorithm === 'rsa-sha256' && !this.config.publicKey) {
			throw new ApplicationError('Public key is required for RSA algorithms');
		}

		if (this.config.algorithm === 'jwt' && !this.config.secret && !this.config.publicKey) {
			throw new ApplicationError('Secret or public key is required for JWT verification');
		}

		this.logger.debug('Configuration validated', {
			function: 'validateConfig',
			duration: Date.now() - startTime,
		});
	}

	/**
	 * Verify webhook signature
	 */
	async verify(
		payload: string | Buffer,
		headers: Record<string, string | string[]>,
	): Promise<ISignatureVerificationResult> {
		const startTime = Date.now();
		this.logger.info('Function started', {
			function: 'verify',
			algorithm: this.config.algorithm,
		});

		try {
			// Extract signature from headers
			const signature = this.extractSignature(headers);
			if (!signature) {
				return {
					valid: false,
					error: `Signature header '${this.config.headerName}' not found`,
				};
			}

			// Verify timestamp if configured
			if (this.config.timestampHeaderName && this.config.timestampToleranceSeconds) {
				const timestampResult = this.verifyTimestamp(headers);
				if (!timestampResult.valid) {
					return timestampResult;
				}
			}

			// Verify signature based on algorithm
			let result: ISignatureVerificationResult;
			switch (this.config.algorithm) {
				case 'hmac-sha256':
					result = await this.verifyHmac(payload, signature, 'sha256');
					break;
				case 'hmac-sha512':
					result = await this.verifyHmac(payload, signature, 'sha512');
					break;
				case 'rsa-sha256':
					result = await this.verifyRsa(payload, signature);
					break;
				case 'jwt':
					result = await this.verifyJwt(signature);
					break;
				default:
					result = {
						valid: false,
						error: `Unsupported algorithm: ${String(this.config.algorithm)}`,
					};
			}

			this.logger.info('Function completed', {
				function: 'verify',
				algorithm: this.config.algorithm,
				valid: result.valid,
				duration: Date.now() - startTime,
			});

			return result;
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'verify',
				algorithm: this.config.algorithm,
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});

			return {
				valid: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Extract signature from headers
	 */
	private extractSignature(headers: Record<string, string | string[]>): string | null {
		// Case-insensitive header lookup
		const headerKey = Object.keys(headers).find(
			(key) => key.toLowerCase() === this.config.headerName.toLowerCase(),
		);

		if (!headerKey) {
			return null;
		}

		let signature = headers[headerKey];
		if (Array.isArray(signature)) {
			signature = signature[0];
		}

		// Remove prefix if configured
		if (this.config.prefix && signature.startsWith(this.config.prefix)) {
			signature = signature.substring(this.config.prefix.length);
		}

		return signature;
	}

	/**
	 * Verify timestamp to prevent replay attacks
	 */
	private verifyTimestamp(
		headers: Record<string, string | string[]>,
	): ISignatureVerificationResult {
		const startTime = Date.now();
		this.logger.debug('Verifying timestamp', { function: 'verifyTimestamp' });

		try {
			if (!this.config.timestampHeaderName) {
				return { valid: true };
			}

			const headerKey = Object.keys(headers).find(
				(key) => key.toLowerCase() === this.config.timestampHeaderName!.toLowerCase(),
			);

			if (!headerKey) {
				return {
					valid: false,
					error: `Timestamp header '${this.config.timestampHeaderName}' not found`,
				};
			}

			let timestampValue = headers[headerKey];
			if (Array.isArray(timestampValue)) {
				timestampValue = timestampValue[0];
			}

			const timestamp = parseInt(timestampValue, 10);
			if (isNaN(timestamp)) {
				return {
					valid: false,
					error: 'Invalid timestamp format',
				};
			}

			const now = Math.floor(Date.now() / 1000);
			const diff = Math.abs(now - timestamp);

			if (diff > this.config.timestampToleranceSeconds!) {
				return {
					valid: false,
					error: `Timestamp outside tolerance window (${diff}s > ${this.config.timestampToleranceSeconds}s)`,
				};
			}

			this.logger.debug('Timestamp verified', {
				function: 'verifyTimestamp',
				timestamp: new Date(timestamp * 1000),
				duration: Date.now() - startTime,
			});

			return {
				valid: true,
				timestamp: new Date(timestamp * 1000),
			};
		} catch (error) {
			this.logger.error('Timestamp verification failed', {
				function: 'verifyTimestamp',
				error: error instanceof Error ? error.message : String(error),
			});

			return {
				valid: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Verify HMAC signature
	 */
	private async verifyHmac(
		payload: string | Buffer,
		signature: string,
		algorithm: 'sha256' | 'sha512',
	): Promise<ISignatureVerificationResult> {
		const startTime = Date.now();
		this.logger.debug('Verifying HMAC signature', {
			function: 'verifyHmac',
			algorithm,
		});

		try {
			const hmac = createHmac(algorithm, this.config.secret!);
			hmac.update(payload);
			const expectedSignature = hmac.digest('hex');

			// Use timing-safe comparison to prevent timing attacks
			const signatureBuffer = Buffer.from(signature, 'hex');
			const expectedBuffer = Buffer.from(expectedSignature, 'hex');

			if (signatureBuffer.length !== expectedBuffer.length) {
				return {
					valid: false,
					error: 'Signature length mismatch',
				};
			}

			const valid = timingSafeEqual(signatureBuffer, expectedBuffer);

			this.logger.debug('HMAC verification completed', {
				function: 'verifyHmac',
				valid,
				duration: Date.now() - startTime,
			});

			return {
				valid,
				error: valid ? undefined : 'HMAC signature verification failed',
			};
		} catch (error) {
			this.logger.error('HMAC verification failed', {
				function: 'verifyHmac',
				error: error instanceof Error ? error.message : String(error),
			});

			return {
				valid: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Verify RSA signature
	 */
	private async verifyRsa(
		payload: string | Buffer,
		signature: string,
	): Promise<ISignatureVerificationResult> {
		const startTime = Date.now();
		this.logger.debug('Verifying RSA signature', { function: 'verifyRsa' });

		try {
			const verify = createVerify('RSA-SHA256');
			verify.update(payload);
			verify.end();

			const signatureBuffer = Buffer.from(signature, 'base64');
			const valid = verify.verify(this.config.publicKey!, signatureBuffer);

			this.logger.debug('RSA verification completed', {
				function: 'verifyRsa',
				valid,
				duration: Date.now() - startTime,
			});

			return {
				valid,
				error: valid ? undefined : 'RSA signature verification failed',
			};
		} catch (error) {
			this.logger.error('RSA verification failed', {
				function: 'verifyRsa',
				error: error instanceof Error ? error.message : String(error),
			});

			return {
				valid: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Verify JWT token
	 */
	private async verifyJwt(token: string): Promise<ISignatureVerificationResult> {
		const startTime = Date.now();
		this.logger.debug('Verifying JWT token', { function: 'verifyJwt' });

		try {
			// Split JWT into parts
			const parts = token.split('.');
			if (parts.length !== 3) {
				return {
					valid: false,
					error: 'Invalid JWT format',
				};
			}

			const [headerB64, payloadB64, signatureB64] = parts;

			// Decode header and payload
			const header = JSON.parse(Buffer.from(headerB64, 'base64').toString('utf8')) as {
				alg: string;
			};
			const payload: IJwtPayload = JSON.parse(
				Buffer.from(payloadB64, 'base64').toString('utf8'),
			) as IJwtPayload;

			// Verify expiration
			if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
				return {
					valid: false,
					error: 'JWT token has expired',
				};
			}

			// Verify not before
			if (payload.nbf && payload.nbf > Math.floor(Date.now() / 1000)) {
				return {
					valid: false,
					error: 'JWT token not yet valid',
				};
			}

			// Verify signature based on algorithm
			const signatureInput = `${headerB64}.${payloadB64}`;
			let signatureResult: ISignatureVerificationResult;

			if (header.alg === 'HS256') {
				signatureResult = await this.verifyHmac(
					signatureInput,
					Buffer.from(signatureB64, 'base64').toString('hex'),
					'sha256',
				);
			} else if (header.alg === 'RS256') {
				signatureResult = await this.verifyRsa(signatureInput, signatureB64);
			} else {
				return {
					valid: false,
					error: `Unsupported JWT algorithm: ${header.alg}`,
				};
			}

			this.logger.debug('JWT verification completed', {
				function: 'verifyJwt',
				valid: signatureResult.valid,
				duration: Date.now() - startTime,
			});

			return {
				...signatureResult,
				details: {
					header,
					payload,
				},
			};
		} catch (error) {
			this.logger.error('JWT verification failed', {
				function: 'verifyJwt',
				error: error instanceof Error ? error.message : String(error),
			});

			return {
				valid: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Generate a signature for testing purposes
	 */
	async generateSignature(payload: string | Buffer): Promise<string> {
		const startTime = Date.now();
		this.logger.info('Function started', {
			function: 'generateSignature',
			algorithm: this.config.algorithm,
		});

		try {
			let signature: string;

			switch (this.config.algorithm) {
				case 'hmac-sha256':
					signature = this.generateHmacSignature(payload, 'sha256');
					break;
				case 'hmac-sha512':
					signature = this.generateHmacSignature(payload, 'sha512');
					break;
				default:
					throw new ApplicationError(
						`Signature generation not supported for algorithm: ${this.config.algorithm}`,
					);
			}

			this.logger.info('Function completed', {
				function: 'generateSignature',
				algorithm: this.config.algorithm,
				duration: Date.now() - startTime,
			});

			return this.config.prefix ? `${this.config.prefix}${signature}` : signature;
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'generateSignature',
				algorithm: this.config.algorithm,
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw error;
		}
	}

	/**
	 * Generate HMAC signature
	 */
	private generateHmacSignature(payload: string | Buffer, algorithm: 'sha256' | 'sha512'): string {
		const hmac = createHmac(algorithm, this.config.secret!);
		hmac.update(payload);
		return hmac.digest('hex');
	}
}

/**
 * Signature Verifier Factory
 * Creates signature verifiers for common webhook providers
 */
export class SignatureVerifierFactory {
	private readonly logger: Logger;

	constructor(logger: Logger) {
		this.logger = logger;
	}

	/**
	 * Create a GitHub webhook signature verifier
	 */
	createGitHubVerifier(secret: string): SignatureVerifier {
		return new SignatureVerifier(
			{
				algorithm: 'hmac-sha256',
				secret,
				headerName: 'X-Hub-Signature-256',
				prefix: 'sha256=',
			},
			this.logger,
		);
	}

	/**
	 * Create a Stripe webhook signature verifier
	 */
	createStripeVerifier(secret: string): SignatureVerifier {
		return new SignatureVerifier(
			{
				algorithm: 'hmac-sha256',
				secret,
				headerName: 'Stripe-Signature',
				timestampHeaderName: 'Stripe-Signature',
				timestampToleranceSeconds: 300,
			},
			this.logger,
		);
	}

	/**
	 * Create a Slack webhook signature verifier
	 */
	createSlackVerifier(secret: string): SignatureVerifier {
		return new SignatureVerifier(
			{
				algorithm: 'hmac-sha256',
				secret,
				headerName: 'X-Slack-Signature',
				timestampHeaderName: 'X-Slack-Request-Timestamp',
				timestampToleranceSeconds: 300,
			},
			this.logger,
		);
	}

	/**
	 * Create a custom HMAC-SHA256 verifier
	 */
	createHmacSha256Verifier(
		secret: string,
		headerName: string,
		options?: {
			prefix?: string;
			timestampHeaderName?: string;
			timestampToleranceSeconds?: number;
		},
	): SignatureVerifier {
		return new SignatureVerifier(
			{
				algorithm: 'hmac-sha256',
				secret,
				headerName,
				prefix: options?.prefix,
				timestampHeaderName: options?.timestampHeaderName,
				timestampToleranceSeconds: options?.timestampToleranceSeconds,
			},
			this.logger,
		);
	}

	/**
	 * Create a custom RSA verifier
	 */
	createRsaVerifier(
		publicKey: string,
		headerName: string,
		options?: {
			timestampHeaderName?: string;
			timestampToleranceSeconds?: number;
		},
	): SignatureVerifier {
		return new SignatureVerifier(
			{
				algorithm: 'rsa-sha256',
				publicKey,
				headerName,
				timestampHeaderName: options?.timestampHeaderName,
				timestampToleranceSeconds: options?.timestampToleranceSeconds,
			},
			this.logger,
		);
	}
}
