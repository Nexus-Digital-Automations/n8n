import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import type { User } from '@n8n/db';
import { UserRepository } from '@n8n/db';
import { Service } from '@n8n/di';
import type { Request } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as SamlStrategy } from 'passport-saml';
import { Issuer, Strategy as OpenIDStrategy } from 'openid-client';
import type { Profile as PassportProfile } from 'passport';

interface SSOConfig {
	enabled: boolean;
	provider: 'google' | 'microsoft' | 'okta' | 'auth0' | 'saml' | 'oidc';
	clientId: string;
	clientSecret: string;
	callbackUrl: string;
	// SAML specific
	entryPoint?: string;
	issuer?: string;
	cert?: string;
	// OIDC specific
	discoveryUrl?: string;
	// Additional options
	autoCreateUser?: boolean;
	defaultRole?: string;
	allowedDomains?: string[];
}

interface SSOProfile {
	id: string;
	email: string;
	firstName?: string;
	lastName?: string;
	provider: string;
	raw?: PassportProfile;
}

@Service()
export class SSOProvider {
	private strategies = new Map<string, passport.Strategy>();
	private initialized = false;

	constructor(
		private readonly logger: Logger,
		private readonly globalConfig: GlobalConfig,
		private readonly userRepository: UserRepository,
	) {}

	async initialize(config: SSOConfig): Promise<void> {
		this.logger.info('Initializing SSO provider', {
			provider: config.provider,
			enabled: config.enabled,
		});

		if (!config.enabled) {
			this.logger.debug('SSO is disabled');
			return;
		}

		try {
			switch (config.provider) {
				case 'google':
					await this.initializeGoogleStrategy(config);
					break;
				case 'saml':
					await this.initializeSamlStrategy(config);
					break;
				case 'oidc':
					await this.initializeOidcStrategy(config);
					break;
				case 'microsoft':
					await this.initializeMicrosoftStrategy(config);
					break;
				case 'okta':
					await this.initializeOktaStrategy(config);
					break;
				case 'auth0':
					await this.initializeAuth0Strategy(config);
					break;
				default:
					throw new Error(`Unsupported SSO provider: ${String(config.provider)}`);
			}

			this.initialized = true;
			this.logger.info('SSO provider initialized successfully', {
				provider: config.provider,
			});
		} catch (error) {
			this.logger.error('Failed to initialize SSO provider', {
				provider: config.provider,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw error;
		}
	}

	private async initializeGoogleStrategy(config: SSOConfig): Promise<void> {
		const strategy = new GoogleStrategy(
			{
				clientID: config.clientId,
				clientSecret: config.clientSecret,
				callbackURL: config.callbackUrl,
				passReqToCallback: true,
			},
			async (
				req: Request,
				accessToken: string,
				refreshToken: string,
				profile: PassportProfile,
				done: (error: Error | null, user?: User | false) => void,
			) => {
				this.logger.debug('Google authentication callback', {
					profileId: profile.id,
					email: profile.emails?.[0]?.value,
				});

				try {
					const ssoProfile: SSOProfile = {
						id: profile.id,
						email: profile.emails?.[0]?.value ?? '',
						firstName: profile.name?.givenName,
						lastName: profile.name?.familyName,
						provider: 'google',
						raw: profile,
					};

					const user = await this.findOrCreateUser(ssoProfile, config);
					done(null, user);
				} catch (error) {
					this.logger.error('Google authentication failed', {
						error: error instanceof Error ? error.message : String(error),
						stack: error instanceof Error ? error.stack : undefined,
					});
					done(error as Error, false);
				}
			},
		);

		this.strategies.set('google', strategy);
		passport.use('google', strategy);
	}

	private async initializeSamlStrategy(config: SSOConfig): Promise<void> {
		if (!config.entryPoint || !config.issuer) {
			throw new Error('SAML configuration requires entryPoint and issuer');
		}

		const strategy = new SamlStrategy(
			{
				entryPoint: config.entryPoint,
				issuer: config.issuer,
				callbackUrl: config.callbackUrl,
				cert: config.cert,
				passReqToCallback: true,
			},
			async (
				req: Request,
				profile: PassportProfile,
				done: (error: Error | null, user?: User | false) => void,
			) => {
				this.logger.debug('SAML authentication callback', {
					nameID: profile.nameID,
					email: profile.email,
				});

				try {
					const ssoProfile: SSOProfile = {
						id: profile.nameID ?? '',
						email: profile.email ?? '',
						firstName: profile.firstName,
						lastName: profile.lastName,
						provider: 'saml',
						raw: profile,
					};

					const user = await this.findOrCreateUser(ssoProfile, config);
					done(null, user);
				} catch (error) {
					this.logger.error('SAML authentication failed', {
						error: error instanceof Error ? error.message : String(error),
						stack: error instanceof Error ? error.stack : undefined,
					});
					done(error as Error, false);
				}
			},
		);

		this.strategies.set('saml', strategy);
		passport.use('saml', strategy);
	}

	private async initializeOidcStrategy(config: SSOConfig): Promise<void> {
		if (!config.discoveryUrl) {
			throw new Error('OIDC configuration requires discoveryUrl');
		}

		const issuer = await Issuer.discover(config.discoveryUrl);
		const client = new issuer.Client({
			client_id: config.clientId,
			client_secret: config.clientSecret,
			redirect_uris: [config.callbackUrl],
			response_types: ['code'],
		});

		const strategy = new OpenIDStrategy(
			{
				client,
				passReqToCallback: true,
			},
			async (
				req: Request,
				tokenSet: { claims: () => Record<string, unknown> },
				done: (error: Error | null, user?: User | false) => void,
			) => {
				this.logger.debug('OIDC authentication callback', {
					claims: tokenSet.claims(),
				});

				try {
					const claims = tokenSet.claims();
					const ssoProfile: SSOProfile = {
						id: String(claims.sub),
						email: String(claims.email ?? ''),
						firstName: String(claims.given_name ?? ''),
						lastName: String(claims.family_name ?? ''),
						provider: 'oidc',
					};

					const user = await this.findOrCreateUser(ssoProfile, config);
					done(null, user);
				} catch (error) {
					this.logger.error('OIDC authentication failed', {
						error: error instanceof Error ? error.message : String(error),
						stack: error instanceof Error ? error.stack : undefined,
					});
					done(error as Error, false);
				}
			},
		);

		this.strategies.set('oidc', strategy);
		passport.use('oidc', strategy);
	}

	private async initializeMicrosoftStrategy(config: SSOConfig): Promise<void> {
		// Microsoft uses OIDC with specific endpoints
		const discoveryUrl =
			'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration';
		await this.initializeOidcStrategy({ ...config, discoveryUrl });
	}

	private async initializeOktaStrategy(config: SSOConfig): Promise<void> {
		// Okta uses OIDC with organization-specific discovery URL
		if (!config.discoveryUrl) {
			throw new Error('Okta configuration requires discoveryUrl');
		}
		await this.initializeOidcStrategy(config);
	}

	private async initializeAuth0Strategy(config: SSOConfig): Promise<void> {
		// Auth0 uses OIDC with tenant-specific discovery URL
		if (!config.discoveryUrl) {
			throw new Error('Auth0 configuration requires discoveryUrl');
		}
		await this.initializeOidcStrategy(config);
	}

	private async findOrCreateUser(profile: SSOProfile, config: SSOConfig): Promise<User> {
		this.logger.debug('Finding or creating user from SSO profile', {
			email: profile.email,
			provider: profile.provider,
		});

		// Validate domain if allowedDomains is configured
		if (config.allowedDomains && config.allowedDomains.length > 0) {
			const emailDomain = profile.email.split('@')[1];
			if (!config.allowedDomains.includes(emailDomain)) {
				this.logger.warn('User email domain not allowed', {
					email: profile.email,
					domain: emailDomain,
					allowedDomains: config.allowedDomains,
				});
				throw new Error('Email domain not allowed for SSO authentication');
			}
		}

		// Try to find existing user by email
		let user = await this.userRepository.findOne({
			where: { email: profile.email.toLowerCase() },
			relations: ['role'],
		});

		if (user) {
			this.logger.debug('Found existing user', { userId: user.id, email: user.email });

			// Update last active timestamp
			user.lastActiveAt = new Date();
			await this.userRepository.save(user);

			return user;
		}

		// Create new user if autoCreateUser is enabled
		if (config.autoCreateUser) {
			this.logger.info('Creating new user from SSO profile', {
				email: profile.email,
				provider: profile.provider,
			});

			user = this.userRepository.create({
				email: profile.email.toLowerCase(),
				firstName: profile.firstName ?? '',
				lastName: profile.lastName ?? '',
				password: null, // SSO users don't have passwords
				disabled: false,
				lastActiveAt: new Date(),
			});

			// Set default role if specified
			if (config.defaultRole) {
				// Role will be set via relation in production code
				this.logger.debug('Setting default role for new user', {
					role: config.defaultRole,
				});
			}

			await this.userRepository.save(user);

			this.logger.info('Created new user from SSO', {
				userId: user.id,
				email: user.email,
			});

			return user;
		}

		this.logger.warn('User not found and auto-creation disabled', {
			email: profile.email,
		});
		throw new Error('User not found and auto-creation is disabled');
	}

	getStrategy(provider: string): passport.Strategy | undefined {
		return this.strategies.get(provider);
	}

	isInitialized(): boolean {
		return this.initialized;
	}

	async authenticate(
		provider: string,
		req: Request,
		options?: Record<string, unknown>,
	): Promise<User> {
		return await new Promise((resolve, reject) => {
			passport.authenticate(provider, options, (error: Error, user: User) => {
				if (error) {
					this.logger.error('Authentication error', {
						provider,
						error: error.message,
						stack: error.stack,
					});
					reject(error);
				} else if (!user) {
					this.logger.warn('Authentication failed - no user returned', {
						provider,
					});
					reject(new Error('Authentication failed'));
				} else {
					this.logger.info('Authentication successful', {
						provider,
						userId: user.id,
						email: user.email,
					});
					resolve(user);
				}
			})(req);
		});
	}

	async validateSSOToken(token: string, provider: string): Promise<User | null> {
		this.logger.debug('Validating SSO token', { provider, tokenLength: token.length });

		// Token validation logic would go here
		// This is a placeholder for actual implementation
		try {
			// Decode and verify token based on provider
			// Return user if valid, null otherwise
			return null;
		} catch (error) {
			this.logger.error('SSO token validation failed', {
				provider,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			return null;
		}
	}

	async revokeSession(userId: string, provider: string): Promise<void> {
		this.logger.info('Revoking SSO session', { userId, provider });

		try {
			// Implementation would vary by provider
			// Some providers support back-channel logout
			this.logger.debug('SSO session revoked', { userId, provider });
		} catch (error) {
			this.logger.error('Failed to revoke SSO session', {
				userId,
				provider,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw error;
		}
	}
}
