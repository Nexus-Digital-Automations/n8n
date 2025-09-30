# n8n Security Enhancements

This directory contains comprehensive security enhancements for n8n, divided into two main areas:

1. **Community Security Features** - Basic security capabilities for all n8n users
2. **Tier Expansion** - Authentication features expanded to lower pricing tiers

## Directory Structure

```
security/
├── community/                    # Community edition security features
│   ├── security-scanner.ts      # Vulnerability scanning
│   ├── secret-rotation.ts       # Automatic secret rotation
│   ├── secret-auditing.ts       # Secret usage tracking
│   ├── compliance-reporter.ts   # Compliance reporting
│   ├── vulnerability-checker.ts # Dependency vulnerability checking
│   └── index.ts
│
├── tier-expansion/               # Authentication tier management
│   ├── tier-manager.ts          # Tier capabilities management
│   ├── sso-community.ts         # Limited SSO for community
│   ├── auth-plugin-system.ts    # Plugin extensibility
│   ├── auth-marketplace.ts      # Community plugin marketplace
│   └── index.ts
│
└── README.md                     # This file
```

## Community Security Features

### Security Scanner (`security-scanner.ts`)

Comprehensive security vulnerability scanning across the n8n instance.

**Features:**
- Credential security audits
- Workflow security analysis
- Configuration security checks
- Insecure node usage detection
- Severity-based vulnerability reporting

**Usage:**
```typescript
import { SecurityScanner } from '@/security/community';

const scanner = Container.get(SecurityScanner);
const result = await scanner.runScan();

console.log(`Found ${result.summary.total} vulnerabilities`);
console.log(`Critical: ${result.summary.critical}`);
console.log(`High: ${result.summary.high}`);
```

### Secret Rotation (`secret-rotation.ts`)

Automatic credential rotation with configurable policies.

**Features:**
- Configurable rotation intervals
- Automatic and manual rotation
- Rotation scheduling and tracking
- Overdue credential detection
- Rotation history and statistics

**Usage:**
```typescript
import { SecretRotationService } from '@/security/community';

const rotationService = Container.get(SecretRotationService);

// Set rotation policy
await rotationService.setRotationPolicy({
  credentialId: 'cred_123',
  rotationIntervalDays: 90,
  autoRotate: true,
  notificationDays: 7,
});

// Check rotation status
const dueCredentials = await rotationService.getCredentialsDueForRotation();
const stats = await rotationService.getRotationStatistics();
```

### Secret Auditing (`secret-auditing.ts`)

Track and audit all credential access and usage.

**Features:**
- Comprehensive access logging
- Usage reports per credential
- Access pattern analysis
- Suspicious activity detection
- Unused credential identification

**Usage:**
```typescript
import { SecretAuditingService } from '@/security/community';

const auditService = Container.get(SecretAuditingService);

// Log credential access
auditService.logAccess({
  credentialId: 'cred_123',
  credentialName: 'Production API Key',
  credentialType: 'api',
  action: 'execute',
  userId: 'user_456',
  userName: 'John Doe',
  workflowId: 'workflow_789',
  workflowName: 'Production Workflow',
  success: true,
});

// Get usage report
const report = await auditService.getCredentialUsageReport('cred_123');
const unusedCreds = await auditService.getUnusedCredentials(90);
```

### Compliance Reporter (`compliance-reporter.ts`)

Generate compliance reports for GDPR, SOC2, and ISO 27001.

**Features:**
- GDPR compliance reporting
- SOC2 basic compliance checks
- ISO 27001 basic compliance checks
- Automated compliance checks
- Actionable recommendations

**Usage:**
```typescript
import { ComplianceReporter } from '@/security/community';

const reporter = Container.get(ComplianceReporter);

// Generate GDPR report
const gdprReport = await reporter.generateGDPRReport(
  securityScanner,
  auditingService
);

// Generate SOC2 report
const soc2Report = await reporter.generateSOC2Report(
  securityScanner,
  rotationService
);

console.log(`GDPR Compliance Score: ${gdprReport.overallScore}%`);
console.log(`SOC2 Compliance Score: ${soc2Report.overallScore}%`);
```

### Vulnerability Checker (`vulnerability-checker.ts`)

Check dependencies for known security vulnerabilities.

**Features:**
- npm audit integration
- Outdated dependency detection
- Available fix identification
- Vulnerability severity analysis
- Markdown report generation

**Usage:**
```typescript
import { VulnerabilityChecker } from '@/security/community';

const checker = Container.get(VulnerabilityChecker);

// Run vulnerability scan
const scanResult = await checker.runNpmAudit();

// Check outdated dependencies
const outdated = await checker.checkOutdatedDependencies();

// Get statistics
const stats = await checker.getVulnerabilityStatistics();

// Generate report
const markdownReport = checker.generateMarkdownReport(scanResult);
```

## Tier Expansion Features

### Tier Manager (`tier-manager.ts`)

Manage authentication capabilities across different pricing tiers.

**Authentication Tiers:**

| Tier | Users | SSO Providers | LDAP | Custom Plugins | MFA |
|------|-------|--------------|------|----------------|-----|
| **Community** | 5 | 1 (OIDC only) | ❌ | ❌ | ✅ |
| **Starter** | 10 | 2 | 1 connection | 2 plugins | ✅ Enforced |
| **Pro** | 50 | 5 | 3 connections | 10 plugins | ✅ Enforced |
| **Enterprise** | Unlimited | Unlimited | Unlimited | Unlimited | ✅ Enforced |

**Usage:**
```typescript
import { TierManager } from '@/security/tier-expansion';

const tierManager = Container.get(TierManager);

// Get current tier
const currentTier = tierManager.getCurrentTier();
const capabilities = tierManager.getCurrentCapabilities();

// Check feature availability
const ssoAvailable = tierManager.isSSOAvailable();
const ldapAvailable = tierManager.isLDAPAvailable();

// Check limits
const maxProviders = tierManager.getMaxSSOProviders();
const canAddSSO = tierManager.canAddSSOProvider(currentProviders);
```

### SSO Community (`sso-community.ts`)

Limited SSO support for community edition.

**Community Tier Limits:**
- 1 SSO provider maximum
- OIDC protocol only
- Basic configuration validation

**Usage:**
```typescript
import { SSOCommunityService } from '@/security/tier-expansion';

const ssoService = Container.get(SSOCommunityService);

// Add SSO configuration
const config = await ssoService.addSSOConfiguration(
  'oidc',
  'Google SSO',
  {
    issuer: 'https://accounts.google.com',
    clientId: 'YOUR_CLIENT_ID',
    clientSecret: 'YOUR_CLIENT_SECRET',
  }
);

// Test configuration
const testResult = await ssoService.testConfiguration(config.id);

// Get tier info
const tierInfo = ssoService.getTierInfo();
```

### Auth Plugin System (`auth-plugin-system.ts`)

Extensible authentication system supporting custom plugins.

**Features:**
- Custom authentication plugins
- Hook system (beforeAuth, afterAuth, onAuthFailure)
- User transformation/mapping
- Express middleware generation
- Plugin lifecycle management

**Usage:**
```typescript
import { AuthPluginSystem } from '@/security/tier-expansion';

const pluginSystem = Container.get(AuthPluginSystem);

// Register plugin
const plugin = await pluginSystem.registerPlugin(
  {
    name: 'Custom LDAP',
    version: '1.0.0',
    description: 'Custom LDAP authentication',
    author: 'Your Company',
    type: 'ldap',
    enabled: true,
    configuration: { /* config */ },
    metadata: { /* metadata */ },
  },
  {
    // Plugin hooks
    beforeAuth: async (req, res) => {
      console.log('Before auth hook');
      return true;
    },
    afterAuth: async (req, res, user) => {
      console.log('User authenticated:', user);
    },
  }
);

// Create middleware
const middleware = pluginSystem.createMiddleware(plugin.id);
app.use('/auth/custom', middleware);
```

### Auth Marketplace (`auth-marketplace.ts`)

Community marketplace for authentication plugins.

**Features:**
- Plugin submission and discovery
- Reviews and ratings
- Download tracking
- Verified plugin badges
- Category organization
- Search and filtering

**Usage:**
```typescript
import { AuthMarketplace } from '@/security/tier-expansion';

const marketplace = Container.get(AuthMarketplace);

// Search plugins
const plugins = marketplace.searchPlugins({
  query: 'okta',
  verified: true,
  minRating: 4,
  sortBy: 'downloads',
  limit: 10,
});

// Get featured plugins
const featured = marketplace.getFeaturedPlugins(5);

// Record download
await marketplace.recordDownload(pluginId);

// Add review
await marketplace.addReview(
  pluginId,
  userId,
  userName,
  5,
  'Excellent plugin',
  'Works perfectly with our setup'
);
```

## Integration Examples

### Complete Security Dashboard

```typescript
import {
  SecurityScanner,
  SecretRotationService,
  SecretAuditingService,
  ComplianceReporter,
  VulnerabilityChecker,
} from '@/security/community';

import { TierManager } from '@/security/tier-expansion';

// Initialize services
const scanner = Container.get(SecurityScanner);
const rotationService = Container.get(SecretRotationService);
const auditService = Container.get(SecretAuditingService);
const reporter = Container.get(ComplianceReporter);
const vulnChecker = Container.get(VulnerabilityChecker);
const tierManager = Container.get(TierManager);

// Run comprehensive security audit
async function runSecurityAudit() {
  // Run security scan
  const securityScan = await scanner.runScan();

  // Check rotation status
  const rotationStats = await rotationService.getRotationStatistics();

  // Get audit statistics
  const auditStats = auditService.getAuditStatistics();

  // Generate compliance reports
  const gdprReport = await reporter.generateGDPRReport(scanner, auditService);
  const soc2Report = await reporter.generateSOC2Report(scanner, rotationService);

  // Check vulnerabilities
  const vulnStats = await vulnChecker.getVulnerabilityStatistics();

  // Get tier capabilities
  const capabilities = tierManager.getCurrentCapabilities();

  return {
    securityScan,
    rotationStats,
    auditStats,
    compliance: {
      gdpr: gdprReport,
      soc2: soc2Report,
    },
    vulnerabilities: vulnStats,
    tier: capabilities,
  };
}
```

### Automated Security Monitoring

```typescript
import { EventService } from '@/events/event.service';

// Set up automated monitoring
async function setupSecurityMonitoring() {
  const eventService = Container.get(EventService);
  const rotationService = Container.get(SecretRotationService);
  const auditService = Container.get(SecretAuditingService);

  // Schedule daily rotation checks
  setInterval(async () => {
    await rotationService.checkRotationStatus();
  }, 24 * 60 * 60 * 1000); // Daily

  // Listen for security events
  eventService.on('credentials-rotation-overdue', (data) => {
    console.warn('Credentials overdue for rotation:', data.credentials);
    // Send alert to admins
  });

  eventService.on('suspicious-activity-detected', (data) => {
    console.error('Suspicious activity detected:', data);
    // Send immediate alert
  });

  eventService.on('secret-accessed', (event) => {
    // Real-time access monitoring
    if (!event.success) {
      console.warn('Failed credential access:', event);
    }
  });
}
```

## Migration Guide

### Existing Enterprise Customers

If you're already using SSO/LDAP in enterprise tier, no changes are required. Your features will continue working as expected.

### New Community Users

To enable limited SSO in community edition:

1. Check tier availability:
```typescript
const tierManager = Container.get(TierManager);
const ssoAvailable = tierManager.isSSOAvailable();
const maxProviders = tierManager.getMaxSSOProviders(); // Returns 1 for community
```

2. Configure SSO:
```typescript
const ssoService = Container.get(SSOCommunityService);
const config = await ssoService.addSSOConfiguration(
  'oidc', // Only OIDC supported in community
  'My SSO',
  { /* OIDC configuration */ }
);
```

### Upgrading Tiers

When upgrading from Community to Starter/Pro/Enterprise:

1. Additional SSO providers become available
2. LDAP becomes available (Starter+)
3. Custom authentication plugins become available (Starter+)
4. Increased limits on concurrent sessions and users

## Security Best Practices

1. **Enable Secret Rotation**
   - Set rotation policies for all production credentials
   - Use 90-day rotation intervals
   - Enable automatic rotation where possible

2. **Monitor Audit Logs**
   - Regularly review access patterns
   - Investigate suspicious activity
   - Track unused credentials

3. **Run Regular Scans**
   - Daily security scans
   - Weekly vulnerability checks
   - Monthly compliance reports

4. **Use SSO Where Possible**
   - Centralize authentication
   - Reduce password management overhead
   - Improve security posture

5. **Keep Dependencies Updated**
   - Monitor for outdated packages
   - Apply security patches promptly
   - Test updates in staging first

## API Reference

See individual files for detailed API documentation.

## Contributing

To contribute additional security features or authentication plugins:

1. Follow n8n's contribution guidelines
2. Add comprehensive tests
3. Document all public APIs
4. Submit plugins to the marketplace

## License

This code is part of n8n and follows the n8n license structure:
- Community features: Sustainable Use License
- Enterprise features: Commercial License

## Support

For issues or questions:
- Community edition: n8n Community Forum
- Enterprise: Contact n8n Support