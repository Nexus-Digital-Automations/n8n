import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import { License } from '@/license';

export const enum AuthenticationTier {
	COMMUNITY = 'community',
	STARTER = 'starter',
	PRO = 'pro',
	ENTERPRISE = 'enterprise',
}

export interface TierCapabilities {
	tier: AuthenticationTier;
	features: {
		basicAuth: boolean;
		sso: {
			enabled: boolean;
			providers: number; // Number of SSO providers allowed
			supportedProviders: SSOProvider[];
		};
		ldap: {
			enabled: boolean;
			maxConnections: number;
		};
		mfa: {
			enabled: boolean;
			enforced: boolean;
		};
		customRoles: boolean;
		advancedPermissions: boolean;
		sessionManagement: {
			maxSessionDuration: number; // hours
			concurrentSessions: number;
		};
		auditLogging: {
			enabled: boolean;
			retentionDays: number;
		};
		customAuthPlugins: boolean;
	};
}

export const enum SSOProvider {
	SAML = 'saml',
	OIDC = 'oidc',
	OAUTH2 = 'oauth2',
	GOOGLE = 'google',
	MICROSOFT = 'microsoft',
	OKTA = 'okta',
	CUSTOM = 'custom',
}

export interface TierLimits {
	tier: AuthenticationTier;
	users: number | 'unlimited';
	ssoProviders: number;
	ldapConnections: number;
	customPlugins: number;
}

@Service()
export class TierManager {
	private tierCapabilities: Map<AuthenticationTier, TierCapabilities>;

	constructor(
		private readonly logger: Logger,
		private readonly license: License,
	) {
		this.logger = this.logger.scoped('tier-manager');
		this.tierCapabilities = this.initializeTierCapabilities();
	}

	/**
	 * Get current authentication tier based on license
	 */
	getCurrentTier(): AuthenticationTier {
		const planName = this.license.getPlanName();

		this.logger.info('Determining authentication tier', { planName });

		// Map license plan to authentication tier
		switch (planName.toLowerCase()) {
			case 'enterprise':
				return AuthenticationTier.ENTERPRISE;
			case 'pro':
				return AuthenticationTier.PRO;
			case 'starter':
				return AuthenticationTier.STARTER;
			case 'community':
			default:
				return AuthenticationTier.COMMUNITY;
		}
	}

	/**
	 * Get capabilities for current tier
	 */
	getCurrentCapabilities(): TierCapabilities {
		const currentTier = this.getCurrentTier();
		const capabilities = this.tierCapabilities.get(currentTier);

		if (!capabilities) {
			this.logger.warn('No capabilities found for tier, using community', { currentTier });
			return this.tierCapabilities.get(AuthenticationTier.COMMUNITY)!;
		}

		this.logger.info('Retrieved tier capabilities', {
			tier: currentTier,
			ssoEnabled: capabilities.features.sso.enabled,
			ldapEnabled: capabilities.features.ldap.enabled,
		});

		return capabilities;
	}

	/**
	 * Get capabilities for specific tier
	 */
	getTierCapabilities(tier: AuthenticationTier): TierCapabilities | undefined {
		return this.tierCapabilities.get(tier);
	}

	/**
	 * Check if feature is available in current tier
	 */
	isFeatureAvailable(featurePath: string): boolean {
		const capabilities = this.getCurrentCapabilities();

		// Parse feature path (e.g., 'sso.enabled', 'ldap.enabled')
		const parts = featurePath.split('.');
		let current: any = capabilities.features;

		for (const part of parts) {
			if (current[part] === undefined) {
				return false;
			}
			current = current[part];
		}

		return !!current;
	}

	/**
	 * Check if SSO is available
	 */
	isSSOAvailable(): boolean {
		return this.isFeatureAvailable('sso.enabled');
	}

	/**
	 * Check if LDAP is available
	 */
	isLDAPAvailable(): boolean {
		return this.isFeatureAvailable('ldap.enabled');
	}

	/**
	 * Get maximum SSO providers allowed
	 */
	getMaxSSOProviders(): number {
		const capabilities = this.getCurrentCapabilities();
		return capabilities.features.sso.providers;
	}

	/**
	 * Get maximum LDAP connections allowed
	 */
	getMaxLDAPConnections(): number {
		const capabilities = this.getCurrentCapabilities();
		return capabilities.features.ldap.maxConnections;
	}

	/**
	 * Check if can add another SSO provider
	 */
	canAddSSOProvider(currentProviders: number): boolean {
		const maxProviders = this.getMaxSSOProviders();
		return maxProviders === -1 || currentProviders < maxProviders;
	}

	/**
	 * Check if can add another LDAP connection
	 */
	canAddLDAPConnection(currentConnections: number): boolean {
		const maxConnections = this.getMaxLDAPConnections();
		return maxConnections === -1 || currentConnections < maxConnections;
	}

	/**
	 * Get tier limits
	 */
	getTierLimits(tier: AuthenticationTier): TierLimits {
		const limits: Record<AuthenticationTier, TierLimits> = {
			[AuthenticationTier.COMMUNITY]: {
				tier: AuthenticationTier.COMMUNITY,
				users: 5,
				ssoProviders: 1, // Limited SSO in community
				ldapConnections: 0,
				customPlugins: 0,
			},
			[AuthenticationTier.STARTER]: {
				tier: AuthenticationTier.STARTER,
				users: 10,
				ssoProviders: 2,
				ldapConnections: 1,
				customPlugins: 2,
			},
			[AuthenticationTier.PRO]: {
				tier: AuthenticationTier.PRO,
				users: 50,
				ssoProviders: 5,
				ldapConnections: 3,
				customPlugins: 10,
			},
			[AuthenticationTier.ENTERPRISE]: {
				tier: AuthenticationTier.ENTERPRISE,
				users: 'unlimited',
				ssoProviders: -1, // unlimited
				ldapConnections: -1, // unlimited
				customPlugins: -1, // unlimited
			},
		};

		return limits[tier];
	}

	/**
	 * Get upgrade message for feature
	 */
	getUpgradeMessage(feature: string): string {
		const currentTier = this.getCurrentTier();

		const messages: Record<string, string> = {
			sso: `SSO is limited in ${currentTier} tier. Upgrade to Pro or Enterprise for unlimited SSO providers.`,
			ldap: `LDAP is not available in ${currentTier} tier. Upgrade to Starter, Pro, or Enterprise to enable LDAP.`,
			customRoles: 'Custom roles require Pro or Enterprise tier.',
			advancedPermissions: 'Advanced permissions require Enterprise tier.',
			customPlugins: 'Custom authentication plugins require Starter tier or higher.',
		};

		return (
			messages[feature] || `This feature is not available in ${currentTier} tier. Please upgrade.`
		);
	}

	/**
	 * Initialize tier capabilities
	 */
	private initializeTierCapabilities(): Map<AuthenticationTier, TierCapabilities> {
		const capabilities = new Map<AuthenticationTier, TierCapabilities>();

		// Community Edition - Basic features + Limited SSO
		capabilities.set(AuthenticationTier.COMMUNITY, {
			tier: AuthenticationTier.COMMUNITY,
			features: {
				basicAuth: true,
				sso: {
					enabled: true, // NOW ENABLED IN COMMUNITY
					providers: 1, // Only 1 SSO provider
					supportedProviders: [SSOProvider.OIDC], // Limited to OIDC
				},
				ldap: {
					enabled: false,
					maxConnections: 0,
				},
				mfa: {
					enabled: true,
					enforced: false,
				},
				customRoles: false,
				advancedPermissions: false,
				sessionManagement: {
					maxSessionDuration: 24,
					concurrentSessions: 3,
				},
				auditLogging: {
					enabled: true, // Basic audit logging
					retentionDays: 30,
				},
				customAuthPlugins: false,
			},
		});

		// Starter Edition - More SSO providers and basic LDAP
		capabilities.set(AuthenticationTier.STARTER, {
			tier: AuthenticationTier.STARTER,
			features: {
				basicAuth: true,
				sso: {
					enabled: true,
					providers: 2,
					supportedProviders: [SSOProvider.OIDC, SSOProvider.SAML, SSOProvider.GOOGLE],
				},
				ldap: {
					enabled: true, // NOW ENABLED IN STARTER
					maxConnections: 1,
				},
				mfa: {
					enabled: true,
					enforced: true,
				},
				customRoles: false,
				advancedPermissions: false,
				sessionManagement: {
					maxSessionDuration: 48,
					concurrentSessions: 5,
				},
				auditLogging: {
					enabled: true,
					retentionDays: 90,
				},
				customAuthPlugins: true, // Limited custom plugins
			},
		});

		// Pro Edition - Multiple SSO providers and LDAP connections
		capabilities.set(AuthenticationTier.PRO, {
			tier: AuthenticationTier.PRO,
			features: {
				basicAuth: true,
				sso: {
					enabled: true,
					providers: 5,
					supportedProviders: [
						SSOProvider.OIDC,
						SSOProvider.SAML,
						SSOProvider.GOOGLE,
						SSOProvider.MICROSOFT,
						SSOProvider.OKTA,
					],
				},
				ldap: {
					enabled: true,
					maxConnections: 3,
				},
				mfa: {
					enabled: true,
					enforced: true,
				},
				customRoles: true,
				advancedPermissions: false,
				sessionManagement: {
					maxSessionDuration: 168, // 1 week
					concurrentSessions: 10,
				},
				auditLogging: {
					enabled: true,
					retentionDays: 365,
				},
				customAuthPlugins: true,
			},
		});

		// Enterprise Edition - All features unlimited
		capabilities.set(AuthenticationTier.ENTERPRISE, {
			tier: AuthenticationTier.ENTERPRISE,
			features: {
				basicAuth: true,
				sso: {
					enabled: true,
					providers: -1, // Unlimited
					supportedProviders: Object.values(SSOProvider),
				},
				ldap: {
					enabled: true,
					maxConnections: -1, // Unlimited
				},
				mfa: {
					enabled: true,
					enforced: true,
				},
				customRoles: true,
				advancedPermissions: true,
				sessionManagement: {
					maxSessionDuration: 720, // 30 days
					concurrentSessions: -1, // Unlimited
				},
				auditLogging: {
					enabled: true,
					retentionDays: -1, // Unlimited
				},
				customAuthPlugins: true,
			},
		});

		return capabilities;
	}

	/**
	 * Get all tier comparison
	 */
	getAllTierComparison(): TierCapabilities[] {
		return [
			this.tierCapabilities.get(AuthenticationTier.COMMUNITY)!,
			this.tierCapabilities.get(AuthenticationTier.STARTER)!,
			this.tierCapabilities.get(AuthenticationTier.PRO)!,
			this.tierCapabilities.get(AuthenticationTier.ENTERPRISE)!,
		];
	}
}
