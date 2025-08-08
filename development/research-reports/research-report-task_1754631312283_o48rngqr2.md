# Custom Node Management API Research Report

**Task ID:** task_1754631312283_o48rngqr2  
**Created:** 2025-08-08  
**Research Focus:** RESTful API endpoints for custom node lifecycle management

## Executive Summary

This research analyzes the existing n8n API patterns and architecture to design comprehensive RESTful endpoints for custom node management. The proposed API extends the existing community packages functionality to support full lifecycle management including upload, validation, deployment, and runtime management.

## Current Architecture Analysis

### Existing Community Packages API

**Controller:** `/community-packages` 
**Location:** `packages/cli/src/community-packages/community-packages.controller.ts`

**Current Endpoints:**
- `POST /community-packages/` - Install package via npm
- `GET /community-packages/` - List installed packages  
- `DELETE /community-packages/` - Uninstall package
- `PATCH /community-packages/` - Update package (inferred from service)

**Limitations of Current System:**
1. **NPM-only installation** - No support for direct file uploads
2. **Limited validation** - Basic checksum validation only
3. **No deployment control** - Automatic deployment to runtime
4. **No status monitoring** - Limited visibility into deployment state
5. **No versioning** - Limited version management capabilities
6. **No staging environment** - Direct production deployment

### Node Types Controller Analysis

**Controller:** `/node-types`
**Location:** `packages/cli/src/controllers/node-types.controller.ts`

**Current Capabilities:**
- Node type description retrieval
- Translation support
- Node testing (via NodeTestingService)
- Node execution simulation

## API Architecture Patterns

### n8n API Design Patterns

1. **Decorators:** `@RestController`, `@Post`, `@Get`, `@Delete`, `@Patch`
2. **Authorization:** `@GlobalScope('scope:action')`  
3. **Request Types:** `AuthenticatedRequest<RouteParams, ResponseBody, RequestBody, RequestQuery>`
4. **Error Handling:** `BadRequestError`, `NotFoundError`, `InternalServerError`
5. **Event System:** `EventService.emit()` for audit logging
6. **Push Notifications:** `Push.broadcast()` for real-time updates

### Request/Response Patterns

**Standardized Responses:**
- Success: Return entity data directly
- Error: Throw typed error classes
- Lists: Array of entities with metadata
- Status: Include status and metadata objects

## Proposed Custom Node Management API

### API Endpoint Design

#### Base Route: `/api/custom-nodes`

## 1. Node Upload/Creation
```
POST /api/custom-nodes
```

**Purpose:** Upload and validate custom node files  
**Content-Type:** `multipart/form-data` or `application/json`

**Request Schema:**
```typescript
interface CreateNodeRequest {
  // File upload (multipart)
  file?: File; // .tgz, .tar.gz, .js, .ts files
  
  // Or JSON payload for remote/git sources
  source?: {
    type: 'git' | 'url' | 'npm';
    location: string;
    version?: string;
    credentials?: {
      token?: string;
      username?: string;
      password?: string;
    };
  };
  
  // Metadata
  name: string;
  description?: string;
  version: string;
  tags?: string[];
  category?: string;
  
  // Validation options
  validateOnly?: boolean; // Only validate, don't store
  skipTests?: boolean;
}
```

**Response Schema:**
```typescript
interface CreateNodeResponse {
  id: string;
  name: string;
  version: string;
  status: 'validating' | 'validated' | 'failed';
  validationResults: {
    syntax: boolean;
    dependencies: boolean;
    security: boolean;
    tests: boolean;
    warnings: string[];
    errors: string[];
  };
  metadata: {
    nodeTypes: string[];
    author: string;
    license: string;
    fileSize: string;
    dependencies: string[];
  };
  uploadedAt: string;
  validatedAt?: string;
}
```

## 2. List Custom Nodes
```
GET /api/custom-nodes
```

**Query Parameters:**
```typescript
interface ListNodesQuery {
  status?: 'all' | 'validated' | 'deployed' | 'failed';
  category?: string;
  author?: string;
  search?: string;
  tags?: string; // comma-separated
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'createdAt' | 'version' | 'status';
  sortOrder?: 'asc' | 'desc';
}
```

**Response Schema:**
```typescript
interface ListNodesResponse {
  nodes: CustomNodeSummary[];
  total: number;
  limit: number;
  offset: number;
  filters: {
    categories: string[];
    authors: string[];
    tags: string[];
    statuses: string[];
  };
}

interface CustomNodeSummary {
  id: string;
  name: string;
  version: string;
  status: NodeStatus;
  description: string;
  author: string;
  category: string;
  tags: string[];
  nodeTypes: string[];
  createdAt: string;
  updatedAt: string;
  deployedAt?: string;
  isActive: boolean;
}
```

## 3. Get Node Details
```
GET /api/custom-nodes/:id
```

**Response Schema:**
```typescript
interface NodeDetailsResponse extends CustomNodeSummary {
  validationResults: ValidationResults;
  metadata: NodeMetadata;
  deploymentInfo?: {
    deployedVersion: string;
    deploymentStatus: 'deploying' | 'deployed' | 'failed';
    lastDeployment: string;
    rollbackAvailable: boolean;
  };
  files: {
    name: string;
    size: number;
    type: string;
    path: string;
  }[];
  dependencies: {
    name: string;
    version: string;
    resolved: boolean;
  }[];
  testResults?: {
    passed: number;
    failed: number;
    coverage?: number;
    details: TestResult[];
  };
}
```

## 4. Update Node
```
PUT /api/custom-nodes/:id
```

**Request Schema:**
```typescript
interface UpdateNodeRequest {
  name?: string;
  description?: string;
  tags?: string[];
  category?: string;
  // File update
  file?: File;
  version?: string;
  
  // Metadata updates
  metadata?: {
    [key: string]: any;
  };
}
```

## 5. Delete Node
```
DELETE /api/custom-nodes/:id
```

**Query Parameters:**
```typescript
interface DeleteNodeQuery {
  force?: boolean; // Force delete even if deployed
  cleanup?: boolean; // Remove runtime instances
}
```

## 6. Deploy Node to Runtime
```
POST /api/custom-nodes/:id/deploy
```

**Request Schema:**
```typescript
interface DeployNodeRequest {
  environment?: 'staging' | 'production';
  version?: string; // Deploy specific version
  rollback?: boolean; // Rollback to previous version
  options?: {
    restartWorkflows?: boolean;
    gracefulShutdown?: boolean;
    timeout?: number; // seconds
  };
}
```

**Response Schema:**
```typescript
interface DeployNodeResponse {
  deploymentId: string;
  nodeId: string;
  version: string;
  status: 'queued' | 'deploying' | 'deployed' | 'failed';
  environment: string;
  startedAt: string;
  estimatedDuration?: number;
  message?: string;
}
```

## 7. Get Deployment Status
```
GET /api/custom-nodes/:id/status
```

**Response Schema:**
```typescript
interface NodeStatusResponse {
  nodeId: string;
  deploymentStatus: 'not-deployed' | 'deploying' | 'deployed' | 'failed' | 'rollback-available';
  runtime: {
    isLoaded: boolean;
    version: string;
    loadedAt?: string;
    instances: number;
    memory?: {
      used: string;
      peak: string;
    };
    performance?: {
      executionCount: number;
      averageExecutionTime: number;
      errorRate: number;
    };
  };
  health: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    lastCheck: string;
    issues: string[];
  };
  deploymentHistory: DeploymentHistoryEntry[];
}
```

## 8. Batch Operations
```
POST /api/custom-nodes/batch
```

**Request Schema:**
```typescript
interface BatchOperationRequest {
  operation: 'deploy' | 'undeploy' | 'delete' | 'validate';
  nodeIds: string[];
  options?: {
    environment?: string;
    force?: boolean;
    parallel?: boolean;
    maxConcurrency?: number;
  };
}
```

## 9. Node Templates/Scaffolding
```
GET /api/custom-nodes/templates
POST /api/custom-nodes/templates/:templateId/generate
```

## 10. Import/Export
```
POST /api/custom-nodes/import
GET /api/custom-nodes/:id/export
```

## Authentication & Authorization

### Required Scopes

```typescript
const CustomNodeScopes = {
  'customNode:create': 'Upload and create custom nodes',
  'customNode:read': 'View custom nodes and their details',
  'customNode:update': 'Modify existing custom nodes', 
  'customNode:delete': 'Remove custom nodes',
  'customNode:deploy': 'Deploy nodes to runtime',
  'customNode:manage': 'Full custom node management',
  'customNode:admin': 'Administrative operations'
} as const;
```

### Role-Based Access

- **Owner/Admin:** Full access to all operations
- **Editor:** Create, read, update, deploy (own nodes)
- **Viewer:** Read-only access to deployed nodes
- **Developer:** Full access to development/staging, limited production

## Security Considerations

### 1. File Upload Security
```typescript
const SecurityValidation = {
  allowedFileTypes: ['.js', '.ts', '.json', '.tgz', '.tar.gz'],
  maxFileSize: '10MB',
  virusScan: true,
  sandboxValidation: true,
  codeAnalysis: {
    maliciousPatterns: true,
    dangerousFunctions: true,
    networkCalls: 'whitelist',
    fileSystem: 'restricted'
  }
};
```

### 2. Code Validation
- **Static Analysis:** ESLint, TypeScript compiler
- **Security Scan:** Code patterns, dependency vulnerabilities
- **Runtime Testing:** Isolated execution environment
- **Memory Limits:** Resource constraints during validation

### 3. Deployment Security
- **Isolation:** Separate runtime contexts
- **Permission Model:** Restricted API access
- **Network Security:** Outbound connection controls  
- **Monitoring:** Runtime behavior tracking

## Data Models

### Database Schema

```sql
-- Custom Nodes table
CREATE TABLE custom_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  description TEXT,
  author_id UUID REFERENCES users(id),
  category VARCHAR(100),
  tags TEXT[], -- PostgreSQL array
  status VARCHAR(50) DEFAULT 'uploaded',
  file_path TEXT NOT NULL,
  file_size BIGINT,
  node_types JSONB, -- Array of node type definitions
  metadata JSONB DEFAULT '{}',
  validation_results JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP NULL,
  
  UNIQUE(name, version),
  INDEX idx_custom_nodes_status (status),
  INDEX idx_custom_nodes_author (author_id),
  INDEX idx_custom_nodes_category (category),
  INDEX idx_custom_nodes_tags USING gin(tags)
);

-- Deployment History
CREATE TABLE custom_node_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID REFERENCES custom_nodes(id) ON DELETE CASCADE,
  version VARCHAR(50) NOT NULL,
  environment VARCHAR(50) DEFAULT 'production',
  status VARCHAR(50) DEFAULT 'queued',
  deployed_by UUID REFERENCES users(id),
  deployed_at TIMESTAMP DEFAULT NOW(),
  rollback_available BOOLEAN DEFAULT false,
  deployment_config JSONB DEFAULT '{}',
  error_message TEXT,
  
  INDEX idx_deployments_node (node_id),
  INDEX idx_deployments_status (status)
);
```

## Integration Points

### 1. Workflow Engine Integration
- **Node Registration:** Dynamic node type loading
- **Execution Context:** Isolated execution environments
- **State Management:** Node instance lifecycle
- **Error Handling:** Graceful failure modes

### 2. File Storage Integration  
- **Local Storage:** Development/testing environments
- **S3/Object Storage:** Production file storage
- **CDN:** Fast file delivery
- **Backup:** Version history and rollbacks

### 3. Monitoring Integration
- **Metrics:** Performance and usage statistics
- **Logging:** Deployment and runtime logs  
- **Alerting:** Failure notifications
- **Health Checks:** Automated monitoring

## Implementation Timeline

### Phase 1: Core API (Weeks 1-2)
- Basic CRUD operations
- File upload and storage
- Validation framework
- Database schema

### Phase 2: Deployment System (Weeks 3-4)  
- Runtime integration
- Deployment pipeline
- Status monitoring
- Rollback functionality

### Phase 3: Advanced Features (Weeks 5-6)
- Batch operations
- Templates/scaffolding
- Import/export
- Performance monitoring

### Phase 4: Security & Production (Weeks 7-8)
- Security hardening
- Load testing
- Documentation
- Production deployment

## Testing Strategy

### 1. Unit Testing
- Controller endpoint testing
- Service layer validation  
- Security validation
- Error handling

### 2. Integration Testing
- Database operations
- File system integration
- Runtime deployment
- Webhook notifications

### 3. Security Testing
- File upload security
- Code injection prevention
- Permission validation
- Rate limiting

### 4. Performance Testing
- File upload limits
- Concurrent operations
- Memory usage
- Runtime performance

## Conclusion

The proposed Custom Node Management API provides a comprehensive solution for managing custom nodes throughout their entire lifecycle. It extends n8n's existing community packages functionality with enterprise-grade features including validation, deployment control, monitoring, and security.

The API design follows n8n's established patterns while introducing new capabilities essential for production custom node management. The phased implementation approach allows for iterative development and testing while maintaining system stability.

**Key Benefits:**
- **Complete Lifecycle Management:** From upload to deployment to monitoring
- **Enhanced Security:** Comprehensive validation and sandboxing  
- **Production Ready:** Deployment control, rollbacks, and monitoring
- **Developer Friendly:** Clear APIs, templates, and tooling
- **Enterprise Scale:** Batch operations, role-based access, audit logging

---

**Next Steps:**
1. Review and approve API design
2. Create detailed implementation specifications  
3. Set up development environment
4. Begin Phase 1 implementation