# n8n Environment Management System

## Overview

This directory contains a comprehensive environment management system for n8n that enables organizations to manage multiple deployment environments (development, staging, production, testing, custom) with isolated credentials, variables, and workflow promotion capabilities.

## Architecture

### Core Components

1. **EnvironmentManager** (`environment-manager.ts`)
   - Central orchestrator for all environment operations
   - Handles creation, deletion, updates, and lifecycle management
   - Provides health checks and status monitoring
   - Supports environment cloning and seeding

2. **EnvironmentConfigService** (`environment-config.ts`)
   - Manages environment-specific configuration settings
   - Supports nested configuration objects
   - Configuration versioning and history
   - Import/export functionality

3. **CredentialIsolationService** (`credential-isolation.ts`)
   - Isolates credentials per environment
   - Encrypts sensitive credential data
   - Prevents credential leakage between environments
   - Supports credential cloning

4. **PromotionWorkflowService** (`promotion-workflow.ts`)
   - Manages workflow promotion between environments
   - Validates workflows before promotion
   - Creates backups for rollback support
   - Handles credential mapping

5. **EnvironmentVariablesService** (`environment-variables.ts`)
   - Manages environment-specific variables
   - Automatic encryption for sensitive variables
   - Bulk operations support
   - Import/export capabilities

## Database Schema

### Entities

#### 1. Environment Entity
```typescript
- id: string (UUID)
- name: string (unique, indexed)
- type: 'development' | 'staging' | 'production' | 'testing' | 'custom'
- description: text (optional)
- status: 'active' | 'inactive' | 'maintenance' | 'archived'
- config: JSON object
- metadata: JSON object
- createdBy: string (user ID)
- updatedBy: string (user ID, optional)
- timestamps: createdAt, updatedAt
```

#### 2. Environment Config Entity
```typescript
- id: string (UUID)
- environmentId: string (FK to environment, unique)
- config: JSON object
- version: integer
- updatedBy: string (user ID, optional)
- timestamps: createdAt, updatedAt
```

#### 3. Environment Credential Entity
```typescript
- id: string (UUID)
- environmentId: string (FK to environment)
- credentialId: string (FK to credentials_entity)
- encryptedData: text
- isActive: boolean
- metadata: JSON object
- createdBy: string (user ID)
- timestamps: createdAt, updatedAt
- unique index on (environmentId, credentialId)
```

#### 4. Environment Variable Entity
```typescript
- id: string (UUID)
- environmentId: string (FK to environment)
- key: string
- value: text
- encrypted: boolean
- description: text (optional)
- metadata: JSON object
- createdBy: string (user ID)
- timestamps: createdAt, updatedAt
- unique index on (environmentId, key)
```

#### 5. Workflow Promotion Entity
```typescript
- id: string (UUID)
- workflowId: string (FK to workflow_entity)
- sourceEnvironmentId: string (FK to environment)
- targetEnvironmentId: string (FK to environment)
- status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back'
- completedAt: timestamp (optional)
- errors: JSON array (optional)
- backupId: string (optional)
- validationResults: JSON array (optional)
- metadata: JSON object
- performedBy: string (user ID)
- timestamps: createdAt, updatedAt
```

#### 6. Workflow Backup Entity
```typescript
- id: string (UUID)
- workflowId: string (FK to workflow_entity)
- environmentId: string (FK to environment)
- workflowData: JSON object (nodes, connections, settings, staticData)
- metadata: JSON object
- createdBy: string (user ID)
- timestamps: createdAt, updatedAt
```

## Features

### 1. Environment Management

**Creating Environments:**
```typescript
const environment = await environmentManager.createEnvironment({
  name: 'staging',
  type: 'staging',
  description: 'Staging environment for pre-production testing',
  config: {
    deployment: { maxInstances: 3 },
    security: { enforceHTTPS: true }
  },
  variables: {
    API_BASE_URL: 'https://api-staging.example.com',
    DATABASE_URL: 'postgres://...'
  }
}, userId);
```

**Listing Environments:**
```typescript
const environments = await environmentManager.listEnvironments({
  type: 'production',
  status: 'active'
});
```

**Health Checks:**
```typescript
const health = await environmentManager.performHealthCheck(environmentId);
// Returns: { status: 'healthy', checks: {...}, timestamp: Date }
```

### 2. Credential Isolation

**Associating Credentials:**
```typescript
await credentialIsolation.associateCredential(
  environmentId,
  credentialId,
  userId,
  { metadata: { purpose: 'API access' } }
);
```

**Getting Credential Data:**
```typescript
const credentialData = await credentialIsolation.getCredentialData(
  environmentId,
  credentialId
);
```

**Cloning Credentials:**
```typescript
const count = await credentialIsolation.cloneCredentials(
  sourceEnvironmentId,
  targetEnvironmentId,
  userId,
  { overwrite: false }
);
```

### 3. Environment Variables

**Setting Variables:**
```typescript
await environmentVariables.setVariable(
  environmentId,
  'API_KEY',
  'secret-key-value',
  userId,
  { encrypted: true, description: 'External API key' }
);
```

**Bulk Operations:**
```typescript
await environmentVariables.setVariables(
  environmentId,
  {
    DATABASE_HOST: 'db.example.com',
    DATABASE_PORT: '5432',
    API_SECRET: 'secret-value'
  },
  userId
);
```

**Auto-Encryption:**
Variables with keywords like PASSWORD, SECRET, KEY, TOKEN are automatically encrypted.

### 4. Workflow Promotion

**Promoting Workflows:**
```typescript
const result = await promotionWorkflow.promoteWorkflow(
  {
    workflowId: 'workflow-123',
    sourceEnvironmentId: 'staging',
    targetEnvironmentId: 'production',
    validateBeforePromotion: true,
    createBackup: true
  },
  userId,
  {
    validateCredentials: true,
    validateConnections: true,
    autoActivate: false,
    rollbackOnError: true
  }
);
```

**Rollback:**
```typescript
await promotionWorkflow.rollbackPromotion(promotionId, userId);
```

### 5. Environment Cloning

**Cloning Environments:**
```typescript
const newEnvironment = await environmentManager.cloneEnvironment(
  sourceEnvironmentId,
  {
    targetName: 'staging-2',
    targetType: 'staging',
    includeCredentials: true,
    includeVariables: true
  },
  userId
);
```

## Migration Requirements

### Database Migration Steps

1. **Run Migration:**
   ```bash
   npm run db:migration:run
   ```
   This will execute `1740000000000-AddEnvironmentManagement.ts` migration.

2. **Verify Tables:**
   - environment
   - environment_config
   - environment_credential
   - environment_variable
   - workflow_promotion
   - workflow_backup

3. **Seed Default Environments (Optional):**
   ```typescript
   await environmentManager.createEnvironment({
     name: 'development',
     type: 'development',
     status: 'active'
   }, 'system');

   await environmentManager.createEnvironment({
     name: 'production',
     type: 'production',
     status: 'active'
   }, 'system');
   ```

### Integration Points

1. **Service Registration:**
   Add services to dependency injection container:
   ```typescript
   Container.set(EnvironmentManager);
   Container.set(EnvironmentConfigService);
   Container.set(CredentialIsolationService);
   Container.set(PromotionWorkflowService);
   Container.set(EnvironmentVariablesService);
   ```

2. **API Endpoints (Recommended):**
   - `POST /api/environments` - Create environment
   - `GET /api/environments` - List environments
   - `GET /api/environments/:id` - Get environment
   - `PATCH /api/environments/:id` - Update environment
   - `DELETE /api/environments/:id` - Delete environment
   - `POST /api/environments/:id/clone` - Clone environment
   - `GET /api/environments/:id/health` - Health check
   - `POST /api/environments/:id/credentials` - Associate credential
   - `POST /api/environments/:id/variables` - Set variables
   - `POST /api/workflows/:id/promote` - Promote workflow
   - `POST /api/promotions/:id/rollback` - Rollback promotion

3. **CLI Commands (Recommended):**
   - `n8n env:create` - Create new environment
   - `n8n env:list` - List environments
   - `n8n env:delete` - Delete environment
   - `n8n env:clone` - Clone environment
   - `n8n workflow:promote` - Promote workflow

4. **UI Components (Basic Structure):**
   - Environment selector dropdown
   - Environment configuration panel
   - Workflow promotion wizard
   - Environment health dashboard

## Security Considerations

1. **Credential Encryption:**
   - All credentials are encrypted per environment
   - Use strong encryption keys (configurable via environment variable)
   - Rotate encryption keys periodically

2. **Variable Encryption:**
   - Sensitive variables are automatically encrypted
   - Manual encryption available for all variables
   - Keywords triggering auto-encryption: PASSWORD, SECRET, KEY, TOKEN, API_KEY, PRIVATE, CREDENTIAL

3. **Access Control:**
   - Implement role-based access control (RBAC) per environment
   - Audit all environment operations
   - Track user actions in metadata

4. **Validation:**
   - Validate workflow credentials before promotion
   - Check node configurations and connections
   - Prevent promotion of workflows with missing dependencies

## Performance Considerations

1. **Indexes:**
   - All foreign keys are indexed
   - Composite unique indexes on credential and variable associations
   - Environment type and status are indexed

2. **Query Optimization:**
   - Use repository pattern for consistent data access
   - Batch operations where possible
   - Lazy loading of relations

3. **Cleanup:**
   - Implement backup retention policy
   - Archive old promotions periodically
   - Clean up inactive credentials

## Testing

1. **Unit Tests:**
   - Test each service independently
   - Mock repository dependencies
   - Test encryption/decryption

2. **Integration Tests:**
   - Test workflow promotion end-to-end
   - Test environment cloning
   - Test credential isolation

3. **E2E Tests:**
   - Test complete promotion workflow
   - Test rollback scenarios
   - Test health checks

## Future Enhancements

1. **Environment Templates:**
   - Pre-configured environment templates
   - Quick setup for common scenarios

2. **Advanced Promotion:**
   - Scheduled promotions
   - Approval workflows
   - Notification integrations

3. **Monitoring:**
   - Environment metrics dashboard
   - Promotion success rates
   - Performance tracking

4. **Multi-region Support:**
   - Geo-distributed environments
   - Cross-region promotion

5. **Environment Access Control:**
   - Granular permissions per environment
   - Team-based access management

## File Structure

```
packages/cli/src/environments/
├── environment-manager.ts          # Core environment management
├── environment-config.ts            # Configuration handler
├── credential-isolation.ts          # Credential isolation
├── promotion-workflow.ts            # Workflow promotion
├── environment-variables.ts         # Variable management
├── types.ts                         # TypeScript type definitions
├── README.md                        # This file
└── repositories/
    ├── environment.repository.ts
    ├── environment-config.repository.ts
    ├── environment-credential.repository.ts
    ├── environment-variable.repository.ts
    ├── workflow-promotion.repository.ts
    └── workflow-backup.repository.ts

packages/@n8n/db/src/entities/
├── environment.entity.ts
├── environment-credential.entity.ts
├── environment-variable.entity.ts
├── environment-config.entity.ts
├── workflow-promotion.entity.ts
└── workflow-backup.entity.ts

packages/@n8n/db/src/migrations/common/
└── 1740000000000-AddEnvironmentManagement.ts
```

## Support

For questions or issues related to environment management:
1. Check existing GitHub issues
2. Review migration logs
3. Verify database schema
4. Test with development environment first

## License

Same as n8n project license.