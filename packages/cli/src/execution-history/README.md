# Extended Execution History Module

## Overview

This module extends n8n's execution history from 24 hours to 30 days with compression, archiving, and advanced search capabilities.

## Features

### 1. Extended History Service

**Purpose**: Manages 30-day execution history with efficient storage and retrieval.

**Key Features**:
- 30-day retention period (configurable)
- Compression for executions older than 7 days
- Archival for executions older than 14 days
- Efficient retrieval with pagination and filtering
- Export to JSON/CSV formats

**Usage**:
```typescript
import { ExtendedHistoryService } from './execution-history';

const historyService = new ExtendedHistoryService(logger, config, repository);

// Get extended history for a workflow
const history = await historyService.getExtendedHistory('workflow-id', {
  startDate: new Date('2025-09-01'),
  endDate: new Date('2025-09-30'),
  status: ['success', 'error'],
  limit: 100
});

// Get storage statistics
const stats = await historyService.getHistoryStats('workflow-id');
console.log(`Total executions: ${stats.totalExecutions}`);
console.log(`Storage size: ${stats.storageSize.active} bytes`);

// Export history
const csvData = await historyService.exportHistory('workflow-id', 'csv');
```

### 2. History Archiver

**Purpose**: Archives old execution data with compression to reduce storage costs.

**Key Features**:
- Automatic archival of executions older than threshold
- gzip compression (level 9)
- Organized directory structure (year/month)
- Archive restoration capabilities
- Cleanup of old archives

**Usage**:
```typescript
import { HistoryArchiver } from './execution-history';

const archiver = new HistoryArchiver(logger, config, repository);

// Archive executions older than 14 days
const archivedCount = await archiver.archiveOldExecutions(14);

// Restore archived execution
const execution = await archiver.restoreExecution('execution-id');

// Get archive statistics
const stats = await archiver.getArchiveStats();
console.log(`Total archived: ${stats.totalArchived}`);
console.log(`Total size: ${stats.totalSize} bytes`);

// Cleanup archives older than 90 days
await archiver.cleanupOldArchives(90);
```

**Configuration**:
```bash
# Environment variables
N8N_ARCHIVE_PATH=/path/to/archives  # Default: /tmp/n8n-archives
N8N_ARCHIVE_ENABLED=true            # Default: false
```

### 3. Execution Replay

**Purpose**: Replays past executions for debugging and testing.

**Key Features**:
- Replay with original or modified inputs
- Skip specific nodes during replay
- Start execution from specific node
- Load current or historical workflow version
- Compare replay results with original

**Usage**:
```typescript
import { ExecutionReplay } from './execution-history';

const replay = new ExecutionReplay(
  logger, config, executionRepo, workflowRepo, nodeTypes, runner, activeExecs
);

// Replay execution with modifications
const result = await replay.replayExecution({
  executionId: 'original-execution-id',
  modifyInputs: {
    'HTTP Request': {
      json: { url: 'https://new-endpoint.com' }
    }
  },
  skipNodes: ['Send Email'],
  startFromNode: 'HTTP Request',
  loadCurrentWorkflow: true
});

console.log(`Replay execution ID: ${result.replayExecutionId}`);
console.log(`Status: ${result.status}`);

// Compare two executions
const comparison = await replay.compareExecutions('exec-1', 'exec-2');
console.log(`Status match: ${comparison.status.match}`);
```

### 4. History Search

**Purpose**: Advanced search and filtering interface for execution history.

**Key Features**:
- Multi-criteria search (workflow, status, date range, metadata)
- Duration-based filtering
- Full-text search
- Aggregated statistics
- Similar execution finder
- Timeline visualization

**Usage**:
```typescript
import { HistorySearch } from './execution-history';

const search = new HistorySearch(logger, config, repository);

// Search with multiple criteria
const results = await search.search({
  workflowId: 'workflow-id',
  status: ['error'],
  startDate: new Date('2025-09-01'),
  endDate: new Date('2025-09-30'),
  minDuration: 5000, // 5 seconds
  maxDuration: 60000, // 1 minute
  searchText: 'timeout',
  limit: 50,
  offset: 0,
  sortBy: 'startedAt',
  sortOrder: 'DESC'
});

console.log(`Found ${results.total} executions`);
console.log(`Page ${results.page} of ${Math.ceil(results.total / results.pageSize)}`);

// Get aggregated statistics
const stats = await search.getAggregatedStats({ workflowId: 'workflow-id' });
console.log(`Success rate: ${(stats.successCount / stats.totalExecutions * 100).toFixed(2)}%`);
console.log(`Average duration: ${stats.averageDuration}ms`);

// Find similar executions
const similar = await search.findSimilarExecutions('execution-id', 10);

// Get execution timeline
const timeline = await search.getExecutionTimeline('workflow-id', 30);
console.log(`Timeline data:`, timeline);
```

## Database Schema

The module uses the existing `ExecutionEntity` schema with optional extensions:

```sql
-- Optional: Add archival_status column
ALTER TABLE execution_entity ADD COLUMN archival_status VARCHAR(20) DEFAULT 'active';

-- Optional: Add indexes for better performance
CREATE INDEX idx_execution_archival ON execution_entity(archival_status);
CREATE INDEX idx_execution_started_at ON execution_entity(started_at);
CREATE INDEX idx_execution_workflow_started ON execution_entity(workflow_id, started_at);
```

## Storage Optimization

### Compression Ratios

Typical compression ratios for execution data:
- JSON data: 60-80% reduction
- Binary data: 30-50% reduction
- Overall: 50-70% storage savings

### Archive Structure

```
/archives/
  2025/
    01/
      execution-1.json.gz
      execution-2.json.gz
    02/
      execution-3.json.gz
  2024/
    12/
      execution-4.json.gz
```

## Performance Considerations

### Query Optimization

1. **Indexes**: Ensure proper indexes on `workflowId`, `startedAt`, and `status`
2. **Pagination**: Always use `limit` and `offset` for large result sets
3. **Date Ranges**: Filter by date ranges to reduce query scope
4. **Archival**: Archive old executions to keep active database size manageable

### Memory Usage

- Extended history service: ~10MB per 1000 executions
- History archiver: ~5MB per compression batch
- Search service: ~20MB for large aggregations

### Recommended Settings

```typescript
const config = {
  retentionDays: 30,              // Keep 30 days in database
  compressionThresholdDays: 7,    // Compress after 7 days
  archivalThresholdDays: 14,      // Archive after 14 days
  compressionEnabled: true,
  batchSize: 100                  // Archive 100 executions at a time
};
```

## Integration Examples

### 1. Daily Cleanup Job

```typescript
import { ExtendedHistoryService, HistoryArchiver } from './execution-history';

async function dailyCleanup() {
  const historyService = new ExtendedHistoryService(logger, config, repository);
  const archiver = new HistoryArchiver(logger, config, repository);

  // Archive executions older than 14 days
  await archiver.archiveOldExecutions(14);

  // Clean up executions older than 30 days
  await historyService.cleanupOldExecutions();

  // Clean up archives older than 90 days
  await archiver.cleanupOldArchives(90);
}
```

### 2. Execution Analysis Dashboard

```typescript
import { HistorySearch } from './execution-history';

async function getDashboardData(workflowId: string) {
  const search = new HistorySearch(logger, config, repository);

  // Get last 7 days statistics
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  const stats = await search.getAggregatedStats({
    workflowId,
    startDate
  });

  // Get timeline
  const timeline = await search.getExecutionTimeline(workflowId, 7);

  return {
    totalExecutions: stats.totalExecutions,
    successRate: (stats.successCount / stats.totalExecutions * 100).toFixed(2),
    errorRate: (stats.errorCount / stats.totalExecutions * 100).toFixed(2),
    avgDuration: Math.round(stats.averageDuration),
    timeline
  };
}
```

### 3. Debugging Failed Executions

```typescript
import { ExecutionReplay, HistorySearch } from './execution-history';

async function debugFailedExecution(executionId: string) {
  const search = new HistorySearch(logger, config, repository);
  const replay = new ExecutionReplay(
    logger, config, executionRepo, workflowRepo, nodeTypes, runner, activeExecs
  );

  // Find similar failed executions
  const similarFailures = await search.findSimilarExecutions(executionId);

  // Replay with current workflow version
  const replayResult = await replay.replayExecution({
    executionId,
    loadCurrentWorkflow: true
  });

  // Compare original vs replay
  const comparison = await replay.compareExecutions(executionId, replayResult.replayExecutionId);

  return {
    similarFailures: similarFailures.length,
    replayStatus: replayResult.status,
    statusChanged: !comparison.status.match
  };
}
```

## Troubleshooting

### Common Issues

1. **Archive not found**: Check `N8N_ARCHIVE_PATH` environment variable and directory permissions
2. **Slow queries**: Ensure indexes are created and retention period is reasonable
3. **High memory usage**: Reduce batch sizes and pagination limits
4. **Compression errors**: Check available disk space and file permissions

### Logging

All services use comprehensive logging:
- Debug: Function entry/exit with parameters
- Info: Operation results with timing
- Error: Failures with full context and stack traces

Enable debug logging:
```bash
N8N_LOG_LEVEL=debug npm start
```

## Future Enhancements

1. **Distributed archival**: Support for S3/Azure Blob storage
2. **Advanced compression**: Column-based compression for better ratios
3. **Query cache**: Cache frequently accessed execution data
4. **Real-time search**: Elasticsearch integration for faster searches
5. **Predictive analytics**: ML-based execution failure prediction