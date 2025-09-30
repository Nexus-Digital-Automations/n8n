/**
 * Enterprise Authentication Module for n8n
 *
 * This module provides enterprise-grade authentication features including:
 * - SSO (SAML, OAuth2, OIDC) integration
 * - LDAP/Active Directory authentication
 * - External secrets management (AWS, Azure, GCP, Vault)
 * - Role-Based Access Control (RBAC)
 * - Enhanced authentication middleware with audit logging
 */

export { SSOProvider } from './sso-provider';
export { LDAPConnector } from './ldap-connector';
export { ExternalSecretsManager } from './external-secrets';
export { RBACManager } from './rbac-manager';
export { EnterpriseAuthMiddleware } from './auth-middleware';

// Re-export types for convenience
export type {
	// SSO types
	SSOConfig,
	SSOProfile,
} from './sso-provider';

export type {
	// LDAP types
	LDAPConfig,
	LDAPUser,
	LDAPGroup,
} from './ldap-connector';

export type {
	// Secrets types
	SecretsConfig,
	Secret,
	SecretMetadata,
} from './external-secrets';

export type {
	// RBAC types
	ResourceType,
	Action,
	Permission,
	Role,
	Policy,
	AccessRequest,
	AccessDecision,
} from './rbac-manager';

export type {
	// Middleware types
	AuthMiddlewareConfig,
	SessionInfo,
	AuditLogEntry,
} from './auth-middleware';
