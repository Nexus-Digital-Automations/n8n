/**
 * n8n Authentication Tier Expansion
 *
 * This module expands enterprise authentication features to lower pricing tiers:
 * - Tier-based authentication capabilities management
 * - Limited SSO in community edition (1 provider, OIDC only)
 * - LDAP available from Starter tier
 * - Authentication plugin system for extensibility
 * - Community marketplace for authentication plugins
 */

export {
	TierManager,
	AuthenticationTier,
	type TierCapabilities,
	type TierLimits,
	SSOProvider,
} from './tier-manager';
export {
	SSOCommunityService,
	type SSOConfiguration,
	type SSOValidationResult,
} from './sso-community';
export {
	AuthPluginSystem,
	type AuthPlugin,
	type AuthPluginHooks,
	type PluginValidationResult,
} from './auth-plugin-system';
export {
	AuthMarketplace,
	type MarketplacePlugin,
	type PluginReview,
	type MarketplaceCategory,
	type PluginSearchFilter,
} from './auth-marketplace';
