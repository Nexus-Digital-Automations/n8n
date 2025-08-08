# Custom Node Management API Design

## Overview

This document outlines the comprehensive RESTful API design for custom node lifecycle management in n8n. The API provides complete lifecycle management from upload and validation to deployment and monitoring.

## API Architecture

### Base URL
```
/api/custom-nodes
```

### Authentication
- **Bearer Token**: JWT-based authentication for users
- **API Key**: Service-to-service authentication via `X-API-Key` header
- **Scopes**: Role-based access control with granular permissions

### Security Scopes
```typescript
const CustomNodeScopes = {
  'customNode:create': 'Upload and create custom nodes',
  'customNode:read': 'View custom nodes and their details',
  'customNode:update': 'Modify existing custom nodes', 
  'customNode:delete': 'Remove custom nodes',
  'customNode:deploy': 'Deploy nodes to runtime',
  'customNode:manage': 'Full custom node management',
  'customNode:admin': 'Administrative operations'
}
```

## Endpoint Summary

### 1. Core CRUD Operations

#### POST /api/custom-nodes
**Purpose**: Upload and create custom nodes
- **Authentication**: `customNode:create`
- **Content Types**: `multipart/form-data`, `application/json`
- **Features**:
  - File upload (.js, .ts, .tgz, .tar.gz, .zip)
  - Remote source integration (Git, npm, URL)
  - Real-time validation with detailed results
  - Validate-only mode for testing
  - Security scanning and dependency resolution

#### GET /api/custom-nodes
**Purpose**: List custom nodes with filtering and pagination
- **Authentication**: `customNode:read`
- **Features**:
  - Advanced filtering (status, category, author, tags, search)
  - Pagination with configurable limits
  - Sorting by multiple fields
  - Available filter aggregations

#### GET /api/custom-nodes/:id
**Purpose**: Get detailed node information
- **Authentication**: `customNode:read`
- **Features**:
  - Complete node metadata
  - Validation and test results
  - Deployment information and history
  - File listings and dependencies
  - Runtime performance metrics

#### PATCH /api/custom-nodes/:id
**Purpose**: Update existing nodes
- **Authentication**: `customNode:update`
- **Features**:
  - Metadata updates (name, description, tags, category)
  - File updates with re-validation
  - Version management with conflict detection
  - Permission enforcement (owner/admin only)

#### DELETE /api/custom-nodes/:id
**Purpose**: Delete custom nodes
- **Authentication**: `customNode:delete`
- **Features**:
  - Safety checks for deployed nodes
  - Force deletion option
  - Runtime cleanup
  - Audit trail preservation

### 2. Deployment Management

#### POST /api/custom-nodes/:id/deploy
**Purpose**: Deploy nodes to runtime environment
- **Authentication**: `customNode:deploy`
- **Features**:
  - Environment selection (staging/production)
  - Version-specific deployment
  - Rollback capability
  - Graceful shutdown options
  - Real-time deployment status

#### GET /api/custom-nodes/:id/status
**Purpose**: Get deployment status and runtime metrics
- **Authentication**: `customNode:read`
- **Features**:
  - Deployment status tracking
  - Runtime performance metrics
  - Health monitoring
  - Memory and resource usage
  - Deployment history

### 3. Batch Operations

#### POST /api/custom-nodes/batch
**Purpose**: Perform operations on multiple nodes
- **Authentication**: `customNode:manage`
- **Operations**: deploy, undeploy, delete, validate
- **Features**:
  - Parallel or sequential execution
  - Configurable concurrency limits
  - Detailed operation results
  - Force options for safety overrides

### 4. Templates and Code Generation

#### GET /api/custom-nodes/templates
**Purpose**: Get available node templates
- **Authentication**: `customNode:read`
- **Features**:
  - Template categorization
  - Parameter definitions
  - Preview capabilities

#### POST /api/custom-nodes/templates/:templateId/generate
**Purpose**: Generate nodes from templates
- **Authentication**: `customNode:create`
- **Features**:
  - Parameter-driven code generation
  - Multiple file output
  - Template validation
  - Immediate node creation

### 5. Import/Export

#### POST /api/custom-nodes/import
**Purpose**: Import nodes from external sources
- **Authentication**: `customNode:create`
- **Formats**: JSON, ZIP, Git repositories, npm packages
- **Features**:
  - Bulk import processing
  - Selective import options
  - Conflict resolution
  - Import validation

#### GET /api/custom-nodes/:id/export
**Purpose**: Export nodes for external use
- **Authentication**: `customNode:read`
- **Formats**: JSON configuration, ZIP package
- **Features**:
  - Complete node packaging
  - Dependency inclusion
  - Documentation export

## Request/Response Patterns

### Standard Request Structure
```typescript
interface AuthenticatedRequest<Params, ResponseBody, RequestBody, Query> {
  user: User;           // Authenticated user context
  params: Params;       // URL parameters
  body: RequestBody;    // Request payload
  query: Query;         // Query parameters
  file?: File;          // Uploaded file (multipart)
}
```

### Standard Response Structure
```typescript
interface StandardResponse<T> {
  data: T;                    // Response payload
  success: boolean;           // Operation success indicator
  timestamp: string;          // Response timestamp
  requestId?: string;         // Request tracking ID
}
```

### Error Response Structure
```typescript
interface ErrorResponse {
  error: string;              // Error code
  message: string;            // Human-readable message
  details?: object;           // Additional error context
  validationResults?: ValidationResults;  // For validation errors
}
```

## Validation Framework

### File Upload Validation
```typescript
interface SecurityValidation {
  allowedFileTypes: ['.js', '.ts', '.json', '.tgz', '.tar.gz'];
  maxFileSize: '10MB';
  virusScan: true;
  sandboxValidation: true;
  codeAnalysis: {
    maliciousPatterns: true;
    dangerousFunctions: true;
    networkCalls: 'whitelist';
    fileSystem: 'restricted';
  };
}
```

### Validation Results Schema
```typescript
interface ValidationResults {
  syntax: boolean;            // TypeScript/JavaScript syntax check
  dependencies: boolean;      // npm dependency resolution
  security: boolean;          // Security scan results
  tests: boolean;             // Test execution results
  warnings: string[];         // Non-blocking issues
  errors: string[];           // Blocking issues
}
```

## Real-time Features

### WebSocket Push Notifications
```typescript
// Deployment status updates
{
  type: 'customNodeDeploymentStarted',
  data: { nodeId, deploymentId, nodeName, version, environment }
}

// Node lifecycle events
{
  type: 'customNodeDeleted',
  data: { nodeId, nodeName, version }
}

// Runtime updates
{
  type: 'customNodeStatusChanged',
  data: { nodeId, status, health, performance }
}
```

### Event System Integration
```typescript
// Audit logging events
this.eventService.emit('custom-node-created', {
  user: req.user,
  nodeId: node.id,
  nodeName: name,
  version,
  success: validationResults.syntax && validationResults.dependencies,
  validateOnly: !!validateOnly,
});
```

## Security Considerations

### File Upload Security
- **File Type Validation**: Restricted to safe extensions
- **Size Limits**: 10MB maximum per upload
- **Virus Scanning**: Automatic malware detection
- **Sandbox Validation**: Isolated execution environment
- **Code Analysis**: Static analysis for dangerous patterns

### Access Control
- **Permission-based Access**: Granular scope enforcement
- **Resource Ownership**: Users can only modify their own nodes
- **Admin Override**: Administrative access to all resources
- **Rate Limiting**: Request throttling per user/endpoint

### Runtime Security
- **Isolation Boundaries**: Separate execution contexts
- **Resource Limits**: Memory and CPU constraints
- **Network Restrictions**: Controlled outbound connections
- **Monitoring**: Runtime behavior tracking

## Performance Optimizations

### Caching Strategy
- **Validation Results**: Cache expensive validation operations
- **Node Metadata**: Cache frequently accessed node information
- **Template Data**: Cache template definitions
- **Status Information**: Cache runtime metrics with TTL

### Pagination and Filtering
- **Efficient Queries**: Database-level filtering and sorting
- **Index Optimization**: Strategic database indexing
- **Result Limits**: Maximum 100 results per page
- **Filter Aggregation**: Pre-computed filter options

### File Handling
- **Streaming Uploads**: Large file support
- **Compression**: Automatic response compression
- **CDN Integration**: Static asset delivery
- **Temporary Storage**: Secure temporary file handling

## Monitoring and Observability

### Metrics Collection
```typescript
// Performance metrics
- api.custom-nodes.request.duration
- api.custom-nodes.request.count
- api.custom-nodes.error.rate

// Business metrics
- custom-nodes.upload.count
- custom-nodes.validation.success_rate
- custom-nodes.deployment.duration
```

### Health Checks
```typescript
// API health endpoint
GET /api/custom-nodes/health
{
  status: 'healthy' | 'degraded' | 'unhealthy',
  checks: {
    database: 'healthy',
    filesystem: 'healthy',
    validation_service: 'healthy',
    deployment_service: 'degraded'
  },
  uptime: 3600,
  version: '1.0.0'
}
```

### Logging Strategy
- **Structured Logging**: JSON format with consistent fields
- **Request Tracing**: Unique request IDs across services
- **Error Context**: Detailed error information with stack traces
- **Audit Trails**: Complete user action history

## Error Handling

### HTTP Status Codes
- **200 OK**: Successful operations
- **201 Created**: Resource creation
- **202 Accepted**: Asynchronous operations started
- **400 Bad Request**: Invalid request parameters
- **401 Unauthorized**: Authentication required
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource not found
- **409 Conflict**: Resource conflicts (version, name)
- **413 Payload Too Large**: File size exceeded
- **422 Unprocessable Entity**: Validation failures
- **500 Internal Server Error**: System errors

### Error Recovery
- **Retry Logic**: Automatic retry with exponential backoff
- **Circuit Breaker**: Service isolation during failures
- **Graceful Degradation**: Reduced functionality during issues
- **Rollback Capability**: Automatic rollback on deployment failures

## Integration Points

### n8n Core Integration
- **Node Type Registration**: Dynamic loading of custom nodes
- **Workflow Engine**: Runtime execution integration
- **Event System**: Lifecycle event propagation
- **Push Service**: Real-time UI updates

### External Services
- **File Storage**: S3/GCS for node file storage
- **Container Registry**: Docker images for sandboxed validation
- **Version Control**: Git integration for source management
- **npm Registry**: Package dependency resolution

## Development Guidelines

### Code Quality Standards
- **TypeScript**: Strict type checking
- **ESLint**: Code style enforcement
- **Unit Tests**: 80% coverage minimum
- **Integration Tests**: End-to-end workflow testing
- **Documentation**: Comprehensive API documentation

### Development Workflow
1. **API Design**: OpenAPI specification first
2. **Interface Definition**: TypeScript interfaces
3. **Controller Implementation**: Business logic implementation
4. **Service Layer**: Reusable business services
5. **Testing**: Comprehensive test coverage
6. **Documentation**: API and usage documentation

## Future Enhancements

### Planned Features
- **Node Marketplace**: Public/private node sharing
- **Version Control**: Git-based node versioning
- **Collaborative Development**: Multi-user node editing
- **Advanced Analytics**: Usage and performance analytics
- **AI-Powered Generation**: LLM-based node creation

### Scalability Considerations
- **Horizontal Scaling**: Load balancer compatibility
- **Database Sharding**: Multi-tenant data isolation
- **Microservice Architecture**: Service decomposition
- **Event-Driven Updates**: Asynchronous processing
- **CDN Integration**: Global file distribution

## Conclusion

This API design provides a comprehensive, secure, and scalable solution for custom node management in n8n. It follows RESTful principles, implements proper security measures, and provides the flexibility needed for enterprise-grade custom node lifecycle management.

The design balances functionality with usability, providing powerful features while maintaining simplicity for common use cases. The extensive validation, monitoring, and error handling ensure reliability and security in production environments.