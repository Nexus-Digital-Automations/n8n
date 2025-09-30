# Enterprise Authentication Module

This module provides enterprise-grade authentication and authorization features for n8n.

## Features

### 1. SSO Provider (`sso-provider.ts`)
Multi-provider Single Sign-On support with automatic user provisioning.

**Supported Providers:**
- Google OAuth2
- Microsoft Azure AD / Office 365
- Okta
- Auth0
- Generic SAML 2.0
- Generic OpenID Connect (OIDC)

**Key Features:**
- Multi-provider configuration
- Automatic user creation and synchronization
- Domain-based access control
- Session management and token validation
- Back-channel logout support

**Usage Example:**
```typescript
import { SSOProvider } from './enterprise';

const ssoProvider = new SSOProvider(logger, globalConfig, userRepository);

await ssoProvider.initialize({
  enabled: true,
  provider: 'google',
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackUrl: 'https://n8n.example.com/api/v1/auth/callback/google',
  autoCreateUser: true,
  defaultRole: 'member',
  allowedDomains: ['example.com']
});

// Authenticate user
const user = await ssoProvider.authenticate('google', req);
```

### 2. LDAP Connector (`ldap-connector.ts`)
Full LDAP/Active Directory integration with user synchronization.

**Key Features:**
- LDAP authentication with bind verification
- Automatic user provisioning
- Group-to-role mapping
- Periodic user synchronization
- Automatic user deactivation
- TLS/SSL support

**Usage Example:**
```typescript
import { LDAPConnector } from './enterprise';

const ldapConnector = new LDAPConnector(logger, globalConfig, userRepository);

await ldapConnector.initialize({
  enabled: true,
  url: 'ldaps://ldap.example.com:636',
  bindDN: 'cn=admin,dc=example,dc=com',
  bindPassword: process.env.LDAP_BIND_PASSWORD,
  baseDN: 'ou=users,dc=example,dc=com',
  searchFilter: '(uid={0})',
  userIdAttribute: 'uid',
  emailAttribute: 'mail',
  firstNameAttribute: 'givenName',
  lastNameAttribute: 'sn',
  groupBaseDN: 'ou=groups,dc=example,dc=com',
  groupRoleMapping: {
    'cn=admins,ou=groups,dc=example,dc=com': 'admin',
    'cn=users,ou=groups,dc=example,dc=com': 'member'
  },
  syncEnabled: true,
  syncInterval: 60, // minutes
  autoCreateUser: true,
  autoDisableUser: true
});

// Authenticate user
const user = await ldapConnector.authenticate('john.doe', 'password123');

// Sync all users
const stats = await ldapConnector.syncAllUsers();
```

### 3. External Secrets Manager (`external-secrets.ts`)
Integration with enterprise secret management systems.

**Supported Providers:**
- AWS Secrets Manager
- Azure Key Vault
- Google Cloud Secret Manager
- HashiCorp Vault (planned)

**Key Features:**
- Multi-provider support
- Automatic secret caching with TTL
- Secret rotation support
- Secret versioning
- Centralized secret management

**Usage Example:**
```typescript
import { ExternalSecretsManager } from './enterprise';

const secretsManager = new ExternalSecretsManager(logger, globalConfig);

await secretsManager.initialize({
  enabled: true,
  provider: 'aws',
  awsRegion: 'us-east-1',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  cacheTTL: 300, // 5 minutes
  autoRotate: true,
  rotationInterval: 30, // days
  secretPrefix: 'n8n/'
});

// Get secret
const dbPassword = await secretsManager.getSecret('database-password');

// Set secret
await secretsManager.setSecret('api-key', 'new-api-key-value', {
  environment: 'production',
  application: 'n8n'
});

// Rotate secret
await secretsManager.rotateSecret('database-password');

// List secrets
const secrets = await secretsManager.listSecrets();
```

### 4. RBAC Manager (`rbac-manager.ts`)
Fine-grained Role-Based Access Control with policies.

**Key Features:**
- Built-in system roles (Owner, Admin, Member, Viewer)
- Custom role creation with inheritance
- Resource-level permissions
- Policy-based access control
- Time-based and IP-based restrictions
- Permission caching for performance

**Usage Example:**
```typescript
import { RBACManager } from './enterprise';

const rbacManager = new RBACManager(logger, globalConfig, userRepository);

// Create custom role
rbacManager.createRole({
  id: 'workflow-manager',
  name: 'Workflow Manager',
  description: 'Can manage workflows but not users',
  permissions: [
    { id: 'workflow:create', resource: 'workflow', action: 'create', effect: 'allow' },
    { id: 'workflow:read', resource: 'workflow', action: 'read', effect: 'allow' },
    { id: 'workflow:update', resource: 'workflow', action: 'update', effect: 'allow' },
    { id: 'workflow:delete', resource: 'workflow', action: 'delete', effect: 'allow' }
  ],
  inherits: ['member'], // Inherit from member role
  priority: 70
});

// Assign role to user
await rbacManager.assignRole(userId, 'workflow-manager');

// Check permission
const decision = await rbacManager.checkPermission({
  userId: 'user-123',
  resource: 'workflow',
  action: 'delete',
  resourceId: 'workflow-456',
  context: {
    ip: '192.168.1.100',
    timestamp: new Date()
  }
});

if (decision.allowed) {
  // User has permission
} else {
  // Access denied: decision.reason
}

// Create policy with time restrictions
rbacManager.createPolicy({
  id: 'business-hours-only',
  name: 'Business Hours Access',
  description: 'Allow workflow execution only during business hours',
  enabled: true,
  rules: [{
    resource: 'workflow',
    action: 'execute',
    effect: 'allow',
    conditions: {
      timeRestrictions: {
        startTime: '09:00',
        endTime: '17:00',
        daysOfWeek: [1, 2, 3, 4, 5], // Monday-Friday
        timezone: 'America/New_York'
      }
    }
  }]
});
```

### 5. Enterprise Auth Middleware (`auth-middleware.ts`)
Enhanced authentication middleware with enterprise features.

**Key Features:**
- Multiple authentication methods (SSO, LDAP, standard)
- Session tracking and limits
- IP whitelisting/blacklisting
- Comprehensive audit logging
- Permission-based route protection
- Session management

**Usage Example:**
```typescript
import { EnterpriseAuthMiddleware } from './enterprise';

const authMiddleware = new EnterpriseAuthMiddleware(
  logger,
  globalConfig,
  authService,
  rbacManager,
  ssoProvider,
  ldapConnector
);

authMiddleware.initialize({
  enableSSO: true,
  enableLDAP: true,
  enableRBAC: true,
  sessionTimeout: 60, // minutes
  maxConcurrentSessions: 5,
  enableSessionTracking: true,
  enableAuditLogging: true,
  ipWhitelist: ['192.168.1.0/24', '10.0.0.0/8'],
  ipBlacklist: ['1.2.3.4']
});

// Use in Express routes
app.use('/api/v1/workflows',
  authMiddleware.requirePermission('workflow', 'read'),
  workflowController.list
);

app.use('/api/v1/admin',
  authMiddleware.requirePermission('user', 'manage'),
  adminController.router
);

// SSO-only route
app.get('/api/v1/sso/profile',
  authMiddleware.requireSSO(),
  profileController.show
);

// Get user sessions
const sessions = authMiddleware.getUserSessions(userId);

// Revoke session
authMiddleware.revokeSession(userId, sessionId);

// Get audit logs
const auditLogs = authMiddleware.getAuditLog({
  userId: 'user-123',
  startDate: new Date('2024-01-01'),
  limit: 100
});

// Get statistics
const stats = authMiddleware.getStats();
console.log(`Active users: ${stats.activeUsers}`);
console.log(`Failed attempts: ${stats.failedAttempts}`);
```

## Configuration

### Environment Variables

```bash
# SSO Configuration
SSO_ENABLED=true
SSO_PROVIDER=google
SSO_CLIENT_ID=your-client-id
SSO_CLIENT_SECRET=your-client-secret
SSO_CALLBACK_URL=https://n8n.example.com/api/v1/auth/callback/google
SSO_AUTO_CREATE_USER=true
SSO_DEFAULT_ROLE=member
SSO_ALLOWED_DOMAINS=example.com,example.org

# LDAP Configuration
LDAP_ENABLED=true
LDAP_URL=ldaps://ldap.example.com:636
LDAP_BIND_DN=cn=admin,dc=example,dc=com
LDAP_BIND_PASSWORD=secret
LDAP_BASE_DN=ou=users,dc=example,dc=com
LDAP_SEARCH_FILTER=(uid={0})
LDAP_USER_ID_ATTR=uid
LDAP_EMAIL_ATTR=mail
LDAP_FIRST_NAME_ATTR=givenName
LDAP_LAST_NAME_ATTR=sn
LDAP_GROUP_BASE_DN=ou=groups,dc=example,dc=com
LDAP_SYNC_ENABLED=true
LDAP_SYNC_INTERVAL=60

# External Secrets
SECRETS_ENABLED=true
SECRETS_PROVIDER=aws
SECRETS_AWS_REGION=us-east-1
SECRETS_AWS_ACCESS_KEY_ID=AKIA...
SECRETS_AWS_SECRET_ACCESS_KEY=secret
SECRETS_CACHE_TTL=300
SECRETS_PREFIX=n8n/

# RBAC
RBAC_ENABLED=true

# Auth Middleware
AUTH_SESSION_TIMEOUT=60
AUTH_MAX_CONCURRENT_SESSIONS=5
AUTH_ENABLE_AUDIT_LOGGING=true
```

## Security Considerations

### 1. Secret Management
- **Never** store secrets in code or configuration files
- Use external secrets manager for production deployments
- Rotate secrets regularly
- Use separate secrets for different environments

### 2. SSO Configuration
- Always use HTTPS for callback URLs
- Validate SSO tokens on the backend
- Implement proper logout (including back-channel logout)
- Restrict allowed domains to prevent unauthorized access

### 3. LDAP Security
- Always use LDAPS (LDAP over TLS/SSL)
- Use a dedicated service account with minimal permissions
- Regularly audit LDAP group mappings
- Implement connection timeouts

### 4. RBAC Best Practices
- Follow principle of least privilege
- Use role inheritance to simplify management
- Regularly review and audit permissions
- Implement time and IP restrictions for sensitive operations

### 5. Audit Logging
- Enable comprehensive audit logging in production
- Regularly review audit logs for suspicious activity
- Store audit logs in a secure, tamper-proof location
- Implement log retention policies

### 6. Session Management
- Implement session timeouts
- Limit concurrent sessions per user
- Track and log session creation/destruction
- Implement session revocation for compromised accounts

## Migration Guide

### Existing n8n Installation

To add enterprise authentication to an existing n8n installation:

1. **Install dependencies:**
```bash
pnpm add passport passport-google-oauth20 passport-saml openid-client ldapts
```

2. **Update configuration:**
Add enterprise auth configuration to your n8n config file.

3. **Initialize services:**
```typescript
// In your main server initialization
import {
  SSOProvider,
  LDAPConnector,
  ExternalSecretsManager,
  RBACManager,
  EnterpriseAuthMiddleware
} from './auth/enterprise';

// Initialize services based on configuration
if (config.sso.enabled) {
  await ssoProvider.initialize(config.sso);
}

if (config.ldap.enabled) {
  await ldapConnector.initialize(config.ldap);
}

if (config.secrets.enabled) {
  await secretsManager.initialize(config.secrets);
}

// Initialize RBAC (always recommended)
const rbacManager = new RBACManager(logger, globalConfig, userRepository);

// Initialize enterprise middleware
const authMiddleware = new EnterpriseAuthMiddleware(
  logger,
  globalConfig,
  authService,
  rbacManager,
  ssoProvider,
  ldapConnector
);
```

4. **Update routes:**
Replace standard auth middleware with enterprise middleware on protected routes.

5. **Migrate users:**
- SSO: Users will be auto-created on first login
- LDAP: Run initial sync to import existing users
- RBAC: Assign roles to migrated users

## Testing

### Unit Tests
Each component includes comprehensive logging for debugging and testing.

### Integration Tests
Test SSO, LDAP, and secrets integration in a staging environment before production deployment.

### Performance Tests
- RBAC permission checks are cached for 1 minute
- Secrets are cached based on TTL configuration
- Session tracking is optimized for high concurrency

## Troubleshooting

### Common Issues

**SSO Authentication Fails:**
- Verify callback URL matches SSO provider configuration
- Check client ID and secret
- Ensure HTTPS is used for callback URLs
- Review SSO provider logs

**LDAP Connection Issues:**
- Verify LDAP URL and port (636 for LDAPS)
- Check bind DN and password
- Ensure network connectivity
- Verify TLS certificate if using LDAPS

**Permission Denied:**
- Check user roles: `rbacManager.getUserRoles(userId)`
- Review RBAC policies: `rbacManager.listPolicies()`
- Check audit logs for permission denials
- Verify time/IP restrictions

**Secrets Not Loading:**
- Verify provider credentials
- Check secret names and prefixes
- Review cache TTL settings
- Test provider connection: `secretsManager.healthCheck()`

## Performance Optimization

### Caching
- Permission checks are cached for 1 minute
- Secrets are cached based on TTL (default 5 minutes)
- Session data is kept in memory

### Scaling
- RBAC manager is stateless and can be scaled horizontally
- Secrets manager supports multiple instances with shared cache
- Session tracking can be moved to Redis for multi-instance deployments

### Monitoring
- Enable audit logging to track authentication patterns
- Monitor failed authentication attempts
- Track permission check performance
- Monitor secret manager health

## License

This enterprise authentication module is part of n8n and follows the same licensing terms.