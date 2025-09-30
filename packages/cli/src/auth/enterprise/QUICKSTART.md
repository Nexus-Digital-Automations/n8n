# Enterprise Authentication - Quick Start Guide

## 5-Minute Setup

This guide will help you quickly enable enterprise authentication features in n8n.

## Prerequisites

- n8n installed and running
- Node.js 20.19 or higher
- Access to your n8n configuration
- Administrative access to SSO provider (if using SSO)
- Access to LDAP server (if using LDAP)

## Step 1: Install Dependencies (2 minutes)

```bash
cd packages/cli
pnpm add passport @types/passport passport-google-oauth20 @types/passport-google-oauth20 passport-saml @types/passport-saml
```

## Step 2: Choose Your Authentication Method

### Option A: Google SSO (Easiest)

1. **Create Google OAuth Application**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project or select existing
   - Enable Google+ API
   - Create OAuth 2.0 credentials
   - Add authorized redirect URI: `https://your-n8n-domain.com/api/v1/auth/callback/google`

2. **Configure Environment Variables**
   ```bash
   # Add to .env file
   SSO_ENABLED=true
   SSO_PROVIDER=google
   SSO_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
   SSO_CLIENT_SECRET=your-google-client-secret
   SSO_CALLBACK_URL=https://your-n8n-domain.com/api/v1/auth/callback/google
   SSO_AUTO_CREATE_USER=true
   SSO_DEFAULT_ROLE=member
   SSO_ALLOWED_DOMAINS=your-company.com
   ```

3. **Initialize SSO in Your Server**
   ```typescript
   import { SSOProvider } from '@/auth/enterprise';

   const ssoProvider = Container.get(SSOProvider);
   await ssoProvider.initialize({
     enabled: true,
     provider: 'google',
     clientId: process.env.SSO_CLIENT_ID,
     clientSecret: process.env.SSO_CLIENT_SECRET,
     callbackUrl: process.env.SSO_CALLBACK_URL,
     autoCreateUser: true,
     defaultRole: 'member',
     allowedDomains: process.env.SSO_ALLOWED_DOMAINS.split(','),
   });
   ```

4. **Add SSO Route**
   ```typescript
   import passport from 'passport';

   app.get('/api/v1/auth/google',
     passport.authenticate('google', { scope: ['profile', 'email'] })
   );

   app.get('/api/v1/auth/callback/google',
     passport.authenticate('google', { session: false }),
     (req, res) => {
       authService.issueCookie(res, req.user as User, false);
       res.redirect('/');
     }
   );
   ```

### Option B: LDAP/Active Directory

1. **Configure Environment Variables**
   ```bash
   # Add to .env file
   LDAP_ENABLED=true
   LDAP_URL=ldaps://ldap.your-company.com:636
   LDAP_BIND_DN=cn=service-account,dc=company,dc=com
   LDAP_BIND_PASSWORD=your-secure-password
   LDAP_BASE_DN=ou=users,dc=company,dc=com
   LDAP_SEARCH_FILTER=(uid={0})
   LDAP_USER_ID_ATTR=uid
   LDAP_EMAIL_ATTR=mail
   LDAP_FIRST_NAME_ATTR=givenName
   LDAP_LAST_NAME_ATTR=sn
   LDAP_AUTO_CREATE_USER=true
   ```

2. **Initialize LDAP**
   ```typescript
   import { LDAPConnector } from '@/auth/enterprise';

   const ldapConnector = Container.get(LDAPConnector);
   await ldapConnector.initialize({
     enabled: true,
     url: process.env.LDAP_URL,
     bindDN: process.env.LDAP_BIND_DN,
     bindPassword: process.env.LDAP_BIND_PASSWORD,
     baseDN: process.env.LDAP_BASE_DN,
     searchFilter: process.env.LDAP_SEARCH_FILTER,
     userIdAttribute: process.env.LDAP_USER_ID_ATTR,
     emailAttribute: process.env.LDAP_EMAIL_ATTR,
     firstNameAttribute: process.env.LDAP_FIRST_NAME_ATTR,
     lastNameAttribute: process.env.LDAP_LAST_NAME_ATTR,
     autoCreateUser: true,
   });
   ```

3. **Add LDAP Authentication Endpoint**
   ```typescript
   app.post('/api/v1/auth/ldap', async (req, res) => {
     const { username, password } = req.body;

     const user = await ldapConnector.authenticate(username, password);
     if (!user) {
       return res.status(401).json({ error: 'Invalid credentials' });
     }

     authService.issueCookie(res, user, false);
     res.json({ success: true, user });
   });
   ```

### Option C: AWS Secrets Manager

1. **Configure Environment Variables**
   ```bash
   # Add to .env file
   SECRETS_ENABLED=true
   SECRETS_PROVIDER=aws
   SECRETS_AWS_REGION=us-east-1
   SECRETS_AWS_ACCESS_KEY_ID=AKIA...
   SECRETS_AWS_SECRET_ACCESS_KEY=your-secret-key
   SECRETS_CACHE_TTL=300
   SECRETS_PREFIX=n8n/
   ```

2. **Initialize Secrets Manager**
   ```typescript
   import { ExternalSecretsManager } from '@/auth/enterprise';

   const secretsManager = Container.get(ExternalSecretsManager);
   await secretsManager.initialize({
     enabled: true,
     provider: 'aws',
     awsRegion: process.env.SECRETS_AWS_REGION,
     awsAccessKeyId: process.env.SECRETS_AWS_ACCESS_KEY_ID,
     awsSecretAccessKey: process.env.SECRETS_AWS_SECRET_ACCESS_KEY,
     cacheTTL: 300,
     secretPrefix: 'n8n/',
   });
   ```

3. **Use Secrets in Your Code**
   ```typescript
   // Instead of process.env.DATABASE_PASSWORD
   const dbPassword = await secretsManager.getSecret('database-password');

   // Instead of process.env.API_KEY
   const apiKey = await secretsManager.getSecret('api-key');
   ```

## Step 3: Enable RBAC (1 minute)

1. **Initialize RBAC Manager**
   ```typescript
   import { RBACManager } from '@/auth/enterprise';

   const rbacManager = Container.get(RBACManager);
   // No configuration needed - system roles are auto-created
   ```

2. **Assign Roles to Users**
   ```typescript
   // Assign admin role to user
   await rbacManager.assignRole(userId, 'admin');

   // Or create custom role
   rbacManager.createRole({
     id: 'workflow-manager',
     name: 'Workflow Manager',
     description: 'Can manage workflows',
     permissions: [
       { id: 'workflow:create', resource: 'workflow', action: 'create', effect: 'allow' },
       { id: 'workflow:read', resource: 'workflow', action: 'read', effect: 'allow' },
       { id: 'workflow:update', resource: 'workflow', action: 'update', effect: 'allow' },
       { id: 'workflow:delete', resource: 'workflow', action: 'delete', effect: 'allow' },
     ],
   });
   ```

3. **Protect Routes**
   ```typescript
   import { EnterpriseAuthMiddleware } from '@/auth/enterprise';

   const authMiddleware = Container.get(EnterpriseAuthMiddleware);
   authMiddleware.initialize({ enableRBAC: true });

   // Protect workflow routes
   app.use('/api/v1/workflows',
     authMiddleware.requirePermission('workflow', 'read'),
     workflowController.list
   );

   app.delete('/api/v1/workflows/:id',
     authMiddleware.requirePermission('workflow', 'delete'),
     workflowController.delete
   );
   ```

## Step 4: Enable Audit Logging (30 seconds)

```typescript
const authMiddleware = Container.get(EnterpriseAuthMiddleware);
authMiddleware.initialize({
  enableAuditLogging: true,
  enableSessionTracking: true,
  sessionTimeout: 60,
});

// View audit logs
const logs = authMiddleware.getAuditLog({
  userId: 'user-123',
  startDate: new Date('2024-01-01'),
  limit: 100,
});

console.log(logs);
```

## Step 5: Test Your Setup

### Test SSO
1. Navigate to `https://your-n8n-domain.com/api/v1/auth/google`
2. Sign in with your Google account
3. Verify you're redirected back to n8n
4. Check that user is created in database

### Test LDAP
```bash
curl -X POST https://your-n8n-domain.com/api/v1/auth/ldap \
  -H "Content-Type: application/json" \
  -d '{"username": "john.doe", "password": "secret"}'
```

### Test RBAC
```typescript
// Check if user can delete workflows
const decision = await rbacManager.checkPermission({
  userId: 'user-123',
  resource: 'workflow',
  action: 'delete',
});

console.log('Can delete:', decision.allowed);
console.log('Reason:', decision.reason);
```

### Test Secrets Manager
```typescript
// Get secret
const secret = await secretsManager.getSecret('test-secret');
console.log('Secret retrieved:', secret);

// List secrets
const secrets = await secretsManager.listSecrets();
console.log('Available secrets:', secrets);
```

## Common Issues and Solutions

### SSO: "Callback URL Mismatch"
- Verify callback URL in SSO provider matches exactly
- Ensure HTTPS is used
- Check for trailing slashes

### LDAP: "Connection Timeout"
- Verify LDAP server is accessible
- Check firewall rules
- Ensure correct port (636 for LDAPS)

### RBAC: "Permission Denied"
- Check user roles: `rbacManager.getUserRoles(userId)`
- Verify permission exists in role
- Check policy restrictions (time, IP)

### Secrets: "Access Denied"
- Verify AWS credentials
- Check IAM permissions
- Ensure secret exists in AWS Secrets Manager

## Production Deployment Checklist

- [ ] HTTPS enabled with valid certificate
- [ ] Secrets stored in external secrets manager
- [ ] Rate limiting configured
- [ ] Audit logging enabled
- [ ] Session timeout configured
- [ ] IP whitelisting configured (if needed)
- [ ] Error messages don't reveal internal details
- [ ] Security headers configured
- [ ] LDAP uses LDAPS (not plain LDAP)
- [ ] Regular secret rotation enabled
- [ ] Monitoring and alerting configured

## Next Steps

1. **Read Full Documentation**: See [README.md](./README.md) for comprehensive guide
2. **Security Review**: Read [SECURITY.md](./SECURITY.md) for security best practices
3. **Implementation Details**: See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
4. **Configure Advanced Features**:
   - Time-based access control
   - IP-based restrictions
   - Custom roles and policies
   - Secret rotation
   - LDAP group sync

## Example: Complete Server Setup

```typescript
import { Container } from '@n8n/di';
import {
  SSOProvider,
  LDAPConnector,
  ExternalSecretsManager,
  RBACManager,
  EnterpriseAuthMiddleware,
} from '@/auth/enterprise';

export class Server {
  async initializeEnterpriseAuth(): Promise<void> {
    // Initialize SSO
    if (process.env.SSO_ENABLED === 'true') {
      const ssoProvider = Container.get(SSOProvider);
      await ssoProvider.initialize({
        enabled: true,
        provider: 'google',
        clientId: process.env.SSO_CLIENT_ID!,
        clientSecret: process.env.SSO_CLIENT_SECRET!,
        callbackUrl: process.env.SSO_CALLBACK_URL!,
        autoCreateUser: true,
        defaultRole: 'member',
        allowedDomains: process.env.SSO_ALLOWED_DOMAINS?.split(',') ?? [],
      });
      this.logger.info('SSO initialized');
    }

    // Initialize LDAP
    if (process.env.LDAP_ENABLED === 'true') {
      const ldapConnector = Container.get(LDAPConnector);
      await ldapConnector.initialize({
        enabled: true,
        url: process.env.LDAP_URL!,
        bindDN: process.env.LDAP_BIND_DN!,
        bindPassword: process.env.LDAP_BIND_PASSWORD!,
        baseDN: process.env.LDAP_BASE_DN!,
        searchFilter: process.env.LDAP_SEARCH_FILTER!,
        userIdAttribute: process.env.LDAP_USER_ID_ATTR!,
        emailAttribute: process.env.LDAP_EMAIL_ATTR!,
        firstNameAttribute: process.env.LDAP_FIRST_NAME_ATTR!,
        lastNameAttribute: process.env.LDAP_LAST_NAME_ATTR!,
        autoCreateUser: true,
      });
      this.logger.info('LDAP initialized');
    }

    // Initialize Secrets
    if (process.env.SECRETS_ENABLED === 'true') {
      const secretsManager = Container.get(ExternalSecretsManager);
      await secretsManager.initialize({
        enabled: true,
        provider: 'aws',
        awsRegion: process.env.SECRETS_AWS_REGION!,
        awsAccessKeyId: process.env.SECRETS_AWS_ACCESS_KEY_ID,
        awsSecretAccessKey: process.env.SECRETS_AWS_SECRET_ACCESS_KEY,
        cacheTTL: 300,
        secretPrefix: 'n8n/',
      });
      this.logger.info('Secrets manager initialized');
    }

    // Initialize RBAC
    const rbacManager = Container.get(RBACManager);
    this.logger.info('RBAC initialized');

    // Initialize middleware
    const authMiddleware = Container.get(EnterpriseAuthMiddleware);
    authMiddleware.initialize({
      enableSSO: process.env.SSO_ENABLED === 'true',
      enableLDAP: process.env.LDAP_ENABLED === 'true',
      enableRBAC: true,
      enableAuditLogging: true,
      enableSessionTracking: true,
      sessionTimeout: 60,
      maxConcurrentSessions: 5,
    });
    this.logger.info('Enterprise auth middleware initialized');
  }
}
```

## Support

For issues or questions:
- Check [README.md](./README.md) for detailed documentation
- Review [SECURITY.md](./SECURITY.md) for security guidance
- See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) for implementation details