# n8n Security Integration Guide

This guide shows how to integrate the new security features into your n8n instance.

## Quick Start

### 1. Import Security Services

```typescript
// In your main server file or initialization module
import {
  // Community Security
  SecurityScanner,
  SecretRotationService,
  SecretAuditingService,
  ComplianceReporter,
  VulnerabilityChecker,

  // Tier Expansion
  TierManager,
  SSOCommunityService,
  AuthPluginSystem,
  AuthMarketplace,
} from '@/security';

import { Container } from '@n8n/di';
```

### 2. Initialize Services

Services are automatically initialized through dependency injection when first accessed:

```typescript
// Services are lazy-loaded, no manual initialization needed
const scanner = Container.get(SecurityScanner);
const tierManager = Container.get(TierManager);
```

## REST API Endpoints

Add these endpoints to expose security features via API.

### Security Scanning Endpoints

```typescript
import { Post, RestController } from '@/decorators';
import { SecurityScanner } from '@/security';

@RestController('/security')
export class SecurityController {
  constructor(private readonly securityScanner: SecurityScanner) {}

  @Post('/scan')
  async runSecurityScan() {
    const result = await this.securityScanner.runScan();
    return {
      scanId: result.scanId,
      summary: result.summary,
      vulnerabilities: result.vulnerabilities,
    };
  }
}
```

### Secret Rotation Endpoints

```typescript
import { Post, Get, Patch, RestController } from '@/decorators';
import { SecretRotationService } from '@/security';

@RestController('/security/rotation')
export class SecretRotationController {
  constructor(private readonly rotationService: SecretRotationService) {}

  @Post('/policy')
  async setRotationPolicy(req: AuthenticatedRequest) {
    const { credentialId, rotationIntervalDays, autoRotate } = req.body;

    await this.rotationService.setRotationPolicy({
      credentialId,
      rotationIntervalDays,
      autoRotate,
    });

    return { success: true };
  }

  @Get('/schedule')
  async getRotationSchedule() {
    const schedule = await this.rotationService.getRotationSchedule();
    return { schedule };
  }

  @Post('/mark-rotated/:credentialId')
  async markAsRotated(req: AuthenticatedRequest) {
    const { credentialId } = req.params;
    const { type } = req.body;

    await this.rotationService.markAsRotated(
      credentialId,
      type || 'manual',
      req.user.id
    );

    return { success: true };
  }

  @Get('/statistics')
  async getStatistics() {
    const stats = await this.rotationService.getRotationStatistics();
    return { statistics: stats };
  }
}
```

### Compliance Endpoints

```typescript
import { Get, RestController } from '@/decorators';
import { ComplianceReporter, SecurityScanner, SecretAuditingService, SecretRotationService } from '@/security';

@RestController('/security/compliance')
export class ComplianceController {
  constructor(
    private readonly reporter: ComplianceReporter,
    private readonly scanner: SecurityScanner,
    private readonly auditService: SecretAuditingService,
    private readonly rotationService: SecretRotationService,
  ) {}

  @Get('/gdpr')
  async generateGDPRReport() {
    const report = await this.reporter.generateGDPRReport(
      this.scanner,
      this.auditService
    );
    return { report };
  }

  @Get('/soc2')
  async generateSOC2Report() {
    const report = await this.reporter.generateSOC2Report(
      this.scanner,
      this.rotationService
    );
    return { report };
  }

  @Get('/iso27001')
  async generateISO27001Report() {
    const report = await this.reporter.generateISO27001Report(this.scanner);
    return { report };
  }
}
```

### SSO Management Endpoints

```typescript
import { Post, Get, Delete, Patch, RestController } from '@/decorators';
import { SSOCommunityService, TierManager } from '@/security';

@RestController('/security/sso')
export class SSOController {
  constructor(
    private readonly ssoService: SSOCommunityService,
    private readonly tierManager: TierManager,
  ) {}

  @Get('/tier-info')
  async getTierInfo() {
    return this.ssoService.getTierInfo();
  }

  @Get('/configurations')
  async getAllConfigurations() {
    return {
      configurations: this.ssoService.getAllConfigurations(),
      statistics: this.ssoService.getStatistics(),
    };
  }

  @Post('/configurations')
  async addConfiguration(req: AuthenticatedRequest) {
    const { provider, displayName, configuration } = req.body;

    const config = await this.ssoService.addSSOConfiguration(
      provider,
      displayName,
      configuration
    );

    return { configuration: config };
  }

  @Patch('/configurations/:id')
  async updateConfiguration(req: AuthenticatedRequest) {
    const { id } = req.params;
    const updates = req.body;

    const config = await this.ssoService.updateSSOConfiguration(id, updates);
    return { configuration: config };
  }

  @Delete('/configurations/:id')
  async removeConfiguration(req: AuthenticatedRequest) {
    const { id } = req.params;
    await this.ssoService.removeSSOConfiguration(id);
    return { success: true };
  }

  @Post('/configurations/:id/test')
  async testConfiguration(req: AuthenticatedRequest) {
    const { id } = req.params;
    const result = await this.ssoService.testConfiguration(id);
    return result;
  }
}
```

### Plugin System Endpoints

```typescript
import { Post, Get, Delete, RestController } from '@/decorators';
import { AuthPluginSystem, AuthMarketplace } from '@/security';

@RestController('/security/plugins')
export class PluginController {
  constructor(
    private readonly pluginSystem: AuthPluginSystem,
    private readonly marketplace: AuthMarketplace,
  ) {}

  @Get('/')
  async getAllPlugins() {
    return {
      plugins: this.pluginSystem.getAllPlugins(),
      statistics: this.pluginSystem.getStatistics(),
    };
  }

  @Post('/')
  async registerPlugin(req: AuthenticatedRequest) {
    const { plugin, hooks } = req.body;
    const registered = await this.pluginSystem.registerPlugin(plugin, hooks);
    return { plugin: registered };
  }

  @Delete('/:id')
  async unregisterPlugin(req: AuthenticatedRequest) {
    const { id } = req.params;
    await this.pluginSystem.unregisterPlugin(id);
    return { success: true };
  }

  @Get('/marketplace/search')
  async searchMarketplace(req: AuthenticatedRequest) {
    const filter = req.query;
    const plugins = this.marketplace.searchPlugins(filter);
    return { plugins };
  }

  @Get('/marketplace/featured')
  async getFeaturedPlugins() {
    const plugins = this.marketplace.getFeaturedPlugins(10);
    return { plugins };
  }

  @Post('/marketplace/:pluginId/download')
  async downloadPlugin(req: AuthenticatedRequest) {
    const { pluginId } = req.params;
    await this.marketplace.recordDownload(pluginId);
    return { success: true };
  }
}
```

## Middleware Integration

### Audit Logging Middleware

Automatically log credential access:

```typescript
import { SecretAuditingService } from '@/security';
import type { AuthenticatedRequest, Response, NextFunction } from 'express';

export function createAuditMiddleware(auditService: SecretAuditingService) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Capture original send to log after response
    const originalSend = res.send;

    res.send = function (data) {
      // Log credential access if this is a credential endpoint
      if (req.url.includes('/credentials/')) {
        const credentialId = req.params.id || req.body?.credentialId;

        if (credentialId) {
          auditService.logAccess({
            credentialId,
            credentialName: req.body?.name || 'Unknown',
            credentialType: req.body?.type || 'unknown',
            action: getActionFromMethod(req.method),
            userId: req.user?.id,
            userName: `${req.user?.firstName} ${req.user?.lastName}`,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            success: res.statusCode < 400,
          });
        }
      }

      return originalSend.call(this, data);
    };

    next();
  };
}

function getActionFromMethod(method: string): 'read' | 'create' | 'update' | 'delete' | 'execute' {
  switch (method.toUpperCase()) {
    case 'GET': return 'read';
    case 'POST': return 'create';
    case 'PATCH':
    case 'PUT': return 'update';
    case 'DELETE': return 'delete';
    default: return 'execute';
  }
}
```

### Plugin Authentication Middleware

Use custom authentication plugins:

```typescript
import { AuthPluginSystem } from '@/security';
import { Container } from '@n8n/di';

// In your route setup
const pluginSystem = Container.get(AuthPluginSystem);

// Apply plugin middleware to specific routes
app.use('/api/custom-auth', pluginSystem.createMiddleware('plugin_id_here'));
```

## Background Jobs

Set up scheduled security tasks:

```typescript
import { SecurityScanner, SecretRotationService, VulnerabilityChecker } from '@/security';
import { Container } from '@n8n/di';
import { CronJob } from 'cron';

export function setupSecurityJobs() {
  const scanner = Container.get(SecurityScanner);
  const rotationService = Container.get(SecretRotationService);
  const vulnChecker = Container.get(VulnerabilityChecker);

  // Daily security scan at 2 AM
  new CronJob('0 2 * * *', async () => {
    console.log('Running daily security scan...');
    const result = await scanner.runScan();
    console.log(`Scan complete: ${result.summary.total} vulnerabilities found`);

    // Alert on critical vulnerabilities
    if (result.summary.critical > 0) {
      // Send alert to admins
      console.error(`CRITICAL: ${result.summary.critical} critical vulnerabilities found!`);
    }
  }).start();

  // Check rotation status daily at 9 AM
  new CronJob('0 9 * * *', async () => {
    console.log('Checking credential rotation status...');
    await rotationService.checkRotationStatus();
  }).start();

  // Weekly vulnerability scan on Mondays at 3 AM
  new CronJob('0 3 * * 1', async () => {
    console.log('Running weekly vulnerability scan...');
    const result = await vulnChecker.runNpmAudit();
    console.log(`Vulnerability scan complete: ${result.summary.total} vulnerabilities found`);
  }).start();
}
```

## Event Listeners

Listen to security events:

```typescript
import { EventService } from '@/events/event.service';
import { Container } from '@n8n/di';

export function setupSecurityEventListeners() {
  const eventService = Container.get(EventService);

  // Listen for rotation events
  eventService.on('credentials-rotation-overdue', (data) => {
    console.warn('Credentials overdue for rotation:', data.credentials);
    // Send email notification to admins
  });

  eventService.on('credentials-rotation-upcoming', (data) => {
    console.info('Credentials approaching rotation:', data.credentials);
    // Send reminder to credential owners
  });

  // Listen for suspicious activity
  eventService.on('suspicious-activity-detected', (data) => {
    console.error('SECURITY ALERT: Suspicious activity detected', data);
    // Send immediate alert
    // Consider temporary account suspension
  });

  // Listen for secret access
  eventService.on('secret-accessed', (event) => {
    if (!event.success) {
      console.warn('Failed credential access attempt', {
        credentialId: event.credentialId,
        userId: event.userId,
        action: event.action,
      });
    }
  });

  // Listen for SSO configuration changes
  eventService.on('secret-rotation-policy-set', (data) => {
    console.info('Rotation policy set for credential:', data.credentialId);
  });
}
```

## Frontend Integration

Example Vue component for security dashboard:

```vue
<template>
  <div class="security-dashboard">
    <div class="security-overview">
      <h2>Security Overview</h2>

      <!-- Vulnerability Summary -->
      <div class="card">
        <h3>Security Scan</h3>
        <div v-if="securityScan">
          <div class="severity-badge critical">{{ securityScan.summary.critical }} Critical</div>
          <div class="severity-badge high">{{ securityScan.summary.high }} High</div>
          <div class="severity-badge medium">{{ securityScan.summary.medium }} Medium</div>
          <div class="severity-badge low">{{ securityScan.summary.low }} Low</div>
        </div>
        <button @click="runSecurityScan">Run Scan</button>
      </div>

      <!-- Rotation Status -->
      <div class="card">
        <h3>Secret Rotation</h3>
        <div v-if="rotationStats">
          <p>Total Policies: {{ rotationStats.totalPolicies }}</p>
          <p>Overdue: {{ rotationStats.credentialsDue }}</p>
          <p>Approaching: {{ rotationStats.credentialsApproaching }}</p>
        </div>
        <button @click="checkRotationStatus">Check Status</button>
      </div>

      <!-- Compliance -->
      <div class="card">
        <h3>Compliance</h3>
        <div v-if="complianceReports">
          <p>GDPR: {{ complianceReports.gdpr.overallScore }}%</p>
          <p>SOC2: {{ complianceReports.soc2.overallScore }}%</p>
        </div>
        <button @click="generateComplianceReports">Generate Reports</button>
      </div>

      <!-- Tier Info -->
      <div class="card">
        <h3>Authentication Tier</h3>
        <div v-if="tierInfo">
          <p>Current Tier: {{ tierInfo.currentTier }}</p>
          <p>SSO Providers: {{ tierInfo.maxProviders }}</p>
          <p>LDAP: {{ tierInfo.ldapEnabled ? 'Enabled' : 'Disabled' }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      securityScan: null,
      rotationStats: null,
      complianceReports: null,
      tierInfo: null,
    };
  },

  async mounted() {
    await this.loadSecurityData();
  },

  methods: {
    async loadSecurityData() {
      // Load all security data
      await Promise.all([
        this.runSecurityScan(),
        this.checkRotationStatus(),
        this.loadTierInfo(),
      ]);
    },

    async runSecurityScan() {
      const response = await this.$api.post('/security/scan');
      this.securityScan = response.data;
    },

    async checkRotationStatus() {
      const response = await this.$api.get('/security/rotation/statistics');
      this.rotationStats = response.data.statistics;
    },

    async generateComplianceReports() {
      const [gdpr, soc2] = await Promise.all([
        this.$api.get('/security/compliance/gdpr'),
        this.$api.get('/security/compliance/soc2'),
      ]);

      this.complianceReports = {
        gdpr: gdpr.data.report,
        soc2: soc2.data.report,
      };
    },

    async loadTierInfo() {
      const response = await this.$api.get('/security/sso/tier-info');
      this.tierInfo = response.data;
    },
  },
};
</script>
```

## Configuration

Add security configuration to n8n config:

```typescript
// In config/index.ts
export const config = {
  security: {
    // Security Scanner
    scanner: {
      enabled: process.env.N8N_SECURITY_SCANNER_ENABLED !== 'false',
      schedule: process.env.N8N_SECURITY_SCANNER_SCHEDULE || '0 2 * * *', // 2 AM daily
    },

    // Secret Rotation
    rotation: {
      enabled: process.env.N8N_SECRET_ROTATION_ENABLED !== 'false',
      defaultIntervalDays: parseInt(process.env.N8N_SECRET_ROTATION_INTERVAL_DAYS || '90'),
      notificationDays: parseInt(process.env.N8N_SECRET_ROTATION_NOTIFICATION_DAYS || '7'),
    },

    // Audit Logging
    audit: {
      enabled: process.env.N8N_AUDIT_LOGGING_ENABLED !== 'false',
      maxLogSize: parseInt(process.env.N8N_AUDIT_MAX_LOG_SIZE || '10000'),
    },

    // Vulnerability Checking
    vulnerabilities: {
      enabled: process.env.N8N_VULN_CHECKER_ENABLED !== 'false',
      schedule: process.env.N8N_VULN_CHECKER_SCHEDULE || '0 3 * * 1', // Monday 3 AM
    },
  },
};
```

## Testing

Example test for security features:

```typescript
import { Container } from '@n8n/di';
import { SecurityScanner } from '@/security';

describe('SecurityScanner', () => {
  let scanner: SecurityScanner;

  beforeAll(() => {
    scanner = Container.get(SecurityScanner);
  });

  it('should scan for vulnerabilities', async () => {
    const result = await scanner.runScan();

    expect(result).toBeDefined();
    expect(result.scanId).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.vulnerabilities).toBeInstanceOf(Array);
  });

  it('should detect outdated credentials', async () => {
    // Create test credential with old update date
    const credential = await createTestCredential({
      updatedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000), // 400 days ago
    });

    const result = await scanner.runScan();

    const outdatedVuln = result.vulnerabilities.find(
      v => v.affectedEntity.id === credential.id
    );

    expect(outdatedVuln).toBeDefined();
    expect(outdatedVuln?.severity).toBe('medium');
  });
});
```

## Deployment Checklist

Before deploying to production:

- [ ] Configure environment variables for security settings
- [ ] Set up cron jobs for automated scans
- [ ] Configure event listeners for security alerts
- [ ] Set up admin notification channels (email, Slack, etc.)
- [ ] Test tier limits and restrictions
- [ ] Verify SSO configuration validation
- [ ] Test plugin system with sample plugin
- [ ] Review and adjust rotation policies
- [ ] Configure audit log retention
- [ ] Set up monitoring dashboards

## Troubleshooting

### Issue: Security scan taking too long

**Solution**: Adjust scan scope or run asynchronously
```typescript
// Run scan in background
const scanPromise = scanner.runScan();
// Don't await, handle completion via events
```

### Issue: Tier limits not enforced

**Solution**: Verify License service integration
```typescript
const tierManager = Container.get(TierManager);
console.log('Current tier:', tierManager.getCurrentTier());
console.log('Capabilities:', tierManager.getCurrentCapabilities());
```

### Issue: Audit logs growing too large

**Solution**: Implement log rotation
```typescript
// In production, persist logs to database
// and implement TTL/retention policies
```

## Support

For questions or issues:
- Check the comprehensive README.md in the security directory
- Review the IMPLEMENTATION_SUMMARY.md for architectural details
- Contact n8n support for enterprise features

## Next Steps

After integration:
1. Monitor security scans for 1 week
2. Review rotation policies with credential owners
3. Generate first compliance reports
4. Train team on new security features
5. Set up automated alerting
6. Consider enabling SSO for your tier
7. Explore marketplace for community plugins