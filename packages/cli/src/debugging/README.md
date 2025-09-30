# Advanced Debugging Module

## Overview

Comprehensive debugging tools for n8n workflow executions with breakpoints, variable inspection, timeline visualization, and performance profiling.

## Features

### 1. Debug Session Manager

**Purpose**: Manages interactive debugging sessions with breakpoint support.

**Key Features**:
- Create and manage debug sessions
- Breakpoint management per session
- Step-through execution
- Variable tracking
- Session lifecycle management

**Usage**:
```typescript
import { DebugSessionManager } from './debugging';

const debugManager = new DebugSessionManager(logger, config);

// Create debug session
const session = debugManager.createSession('workflow-id', {
  stepMode: true,
  breakpoints: ['HTTP Request', 'Data Transform']
});

console.log(`Debug session created: ${session.id}`);

// Add breakpoint
debugManager.addBreakpoint(session.id, 'Send Email');

// Check if breakpoint hit
if (debugManager.isBreakpointHit(session.id, 'HTTP Request')) {
  // Pause execution
  await debugManager.pauseAtNode(session.id, 'HTTP Request', nodeData);
}

// Continue execution
debugManager.continue(session.id);

// Stop session
debugManager.stopSession(session.id);

// Cleanup inactive sessions
const cleaned = debugManager.cleanupInactiveSessions(30); // 30 minutes
```

**Events**:
```typescript
debugManager.on('session_created', ({ sessionId, workflowId }) => {
  console.log(`Session ${sessionId} created for ${workflowId}`);
});

debugManager.on('breakpoint_hit', ({ sessionId, nodeName, data }) => {
  console.log(`Breakpoint hit at ${nodeName}`);
});

debugManager.on('execution_continued', ({ sessionId }) => {
  console.log(`Execution continued for ${sessionId}`);
});
```

### 2. Breakpoint Manager

**Purpose**: Advanced breakpoint management with conditional breakpoints.

**Key Features**:
- Conditional breakpoints (expression, data match, error, count)
- Hit counting
- Enable/disable breakpoints
- Breakpoint statistics
- Per-workflow and per-node breakpoints

**Usage**:
```typescript
import { BreakpointManager } from './debugging';

const bpManager = new BreakpointManager(logger, config);

// Create simple breakpoint
const breakpoint = bpManager.createBreakpoint('workflow-id', 'HTTP Request');

// Create conditional breakpoint
const conditionalBp = bpManager.createBreakpoint(
  'workflow-id',
  'HTTP Request',
  'data.statusCode === 500' // Break only on 500 errors
);

// Get all workflow breakpoints
const workflowBreakpoints = bpManager.getWorkflowBreakpoints('workflow-id');

// Check if breakpoint should trigger
const triggeredBp = bpManager.shouldTrigger('workflow-id', 'HTTP Request', nodeData);
if (triggeredBp) {
  console.log(`Breakpoint ${triggeredBp.id} hit ${triggeredBp.hitCount} times`);
}

// Enable/disable
bpManager.disableBreakpoint(breakpoint.id);
bpManager.enableBreakpoint(breakpoint.id);

// Get statistics
const stats = bpManager.getStatistics();
console.log(`Total: ${stats.total}, Enabled: ${stats.enabled}`);

// Reset hit counts
bpManager.resetHitCounts('workflow-id');

// Delete breakpoint
bpManager.deleteBreakpoint(breakpoint.id);
```

**Conditional Breakpoint Examples**:
```typescript
// Break on error
createBreakpoint('workflow-id', 'node-name', 'error');

// Break on specific data
createBreakpoint('workflow-id', 'node-name', 'data.status === "failed"');

// Break on data presence
createBreakpoint('workflow-id', 'node-name', 'data.userId');
```

### 3. Variable Inspector

**Purpose**: Inspect and analyze variables at each workflow execution step.

**Key Features**:
- Capture variable snapshots at each node
- Detailed data structure analysis
- Statistics calculation (items, size, types)
- Snapshot comparison
- Memory usage tracking

**Usage**:
```typescript
import { VariableInspector } from './debugging';

const inspector = new VariableInspector(logger, config);

// Capture snapshot during execution
inspector.captureSnapshot(
  'execution-id',
  'HTTP Request',
  0, // execution index
  inputData,
  outputData,
  error,
  { duration: 1234, statusCode: 200 }
);

// Get all snapshots for execution
const snapshots = inspector.getSnapshots('execution-id');

// Get specific node snapshot
const snapshot = inspector.getNodeSnapshot('execution-id', 'HTTP Request', 0);

// Inspect variables
const inspection = inspector.inspect('execution-id', 'HTTP Request');
console.log('Variables:', inspection.variables);
console.log('Data structure:', inspection.dataStructure);
console.log('Statistics:', inspection.statistics);

// Compare snapshots between executions
const comparison = inspector.compareSnapshots('exec-1', 'exec-2', 'HTTP Request');
console.log(`Input items match: ${comparison.inputItemsMatch}`);
console.log(`Differences: ${comparison.differences.length}`);

// Get memory usage
const usage = inspector.getMemoryUsage();
console.log(`Snapshots: ${usage.snapshotCount}, Size: ${usage.estimatedSizeMB} MB`);

// Clear snapshots
inspector.clearSnapshots('execution-id');
```

### 4. Execution Timeline

**Purpose**: Timeline visualization and analysis of workflow execution.

**Key Features**:
- Record timeline events (start, complete, error, waiting)
- Node timing tracking
- Timeline visualization generation
- Bottleneck identification
- Critical path analysis
- Timeline comparison

**Usage**:
```typescript
import { ExecutionTimeline } from './debugging';

const timeline = new ExecutionTimeline(logger, config);

// Record events during execution
timeline.recordEvent('execution-id', 'HTTP Request', 'start');
// ... node executes ...
timeline.recordEvent('execution-id', 'HTTP Request', 'complete', resultData);

timeline.recordEvent('execution-id', 'Transform', 'start');
// ... error occurs ...
timeline.recordEvent('execution-id', 'Transform', 'error', errorData);

// Get timeline events
const events = timeline.getTimeline('execution-id');

// Get node timings
const timings = timeline.getNodeTimings('execution-id');
for (const timing of timings) {
  console.log(`${timing.nodeName}: ${timing.duration}ms (${timing.status})`);
}

// Generate visualization
const viz = timeline.generateVisualization('execution-id');
console.log(`Total duration: ${viz.totalDuration}ms`);
console.log(`Bottlenecks: ${viz.bottlenecks.join(', ')}`);
console.log(`Critical path: ${viz.criticalPath.join(' -> ')}`);

// Get bottlenecks (nodes taking >20% of time)
const bottlenecks = timeline.getBottlenecks('execution-id', 20);

// Export timeline
const jsonData = timeline.exportTimeline('execution-id');

// Compare timelines
const comparison = timeline.compareTimelines('exec-1', 'exec-2');
console.log(`Duration change: ${comparison.durationChange.difference}ms`);
console.log(`Percentage: ${comparison.durationChange.percentageChange.toFixed(2)}%`);

// Clear timeline
timeline.clearTimeline('execution-id');
```

### 5. Performance Profiler

**Purpose**: Profile workflow performance and identify bottlenecks.

**Key Features**:
- Node performance metrics
- Bottleneck analysis with severity levels
- Optimization recommendations
- Performance comparison
- Detailed profiling reports

**Usage**:
```typescript
import { PerformanceProfiler } from './debugging';

const profiler = new PerformanceProfiler(logger, config);

// Start profiling
profiler.startProfiling('execution-id');

// Record node performance
profiler.recordNodePerformance(
  'execution-id',
  'HTTP Request',
  1234, // duration in ms
  true, // success
  50000, // memory usage (optional)
  15 // cpu usage % (optional)
);

profiler.recordNodePerformance(
  'execution-id',
  'Transform Data',
  5678,
  true
);

// Generate report
const report = profiler.generateReport('execution-id', 'workflow-id');
console.log(`Total duration: ${report.totalDuration}ms`);
console.log(`Slowest node: ${report.summary.slowestNode}`);
console.log(`Total errors: ${report.summary.totalErrors}`);

// Analyze bottlenecks
for (const bottleneck of report.bottlenecks) {
  console.log(`${bottleneck.nodeName} (${bottleneck.severity}):`);
  console.log(`  Duration: ${bottleneck.avgDuration}ms`);
  console.log(`  Percentage: ${bottleneck.percentOfTotal.toFixed(2)}%`);
  console.log(`  Recommendations:`);
  bottleneck.recommendations.forEach(rec => console.log(`    - ${rec}`));
}

// Get optimization recommendations
const recommendations = profiler.getOptimizationRecommendations('execution-id', 'workflow-id');
recommendations.forEach(rec => console.log(rec));

// Compare performance
const comparison = profiler.comparePerformance('exec-1', 'exec-2', 'workflow-id');
console.log(`Duration change: ${comparison.totalDurationChange.percentageChange.toFixed(2)}%`);
console.log(`New bottlenecks: ${comparison.bottleneckChanges.newBottlenecks.join(', ')}`);

// Export report
const jsonData = profiler.exportReport('execution-id', 'workflow-id');

// Clear profile
profiler.clearProfile('execution-id');
```

## Integration Examples

### 1. Complete Debugging Workflow

```typescript
import {
  DebugSessionManager,
  BreakpointManager,
  VariableInspector,
  ExecutionTimeline,
  PerformanceProfiler
} from './debugging';

async function debugWorkflowExecution(workflowId: string) {
  // Initialize services
  const debugManager = new DebugSessionManager(logger, config);
  const bpManager = new BreakpointManager(logger, config);
  const inspector = new VariableInspector(logger, config);
  const timeline = new ExecutionTimeline(logger, config);
  const profiler = new PerformanceProfiler(logger, config);

  // Create debug session
  const session = debugManager.createSession(workflowId, {
    stepMode: false,
    breakpoints: ['HTTP Request']
  });

  // Set up conditional breakpoint
  bpManager.createBreakpoint(workflowId, 'HTTP Request', 'error');

  // Start profiling
  profiler.startProfiling(session.id);

  // During execution...
  for (const node of workflowNodes) {
    const startTime = Date.now();
    timeline.recordEvent(session.id, node.name, 'start');

    // Check breakpoint
    const triggered = bpManager.shouldTrigger(workflowId, node.name, nodeData);
    if (triggered) {
      await debugManager.pauseAtNode(session.id, node.name, nodeData);
    }

    // Execute node
    const result = await executeNode(node);
    const duration = Date.now() - startTime;

    // Capture snapshot
    inspector.captureSnapshot(
      session.id,
      node.name,
      0,
      nodeInputData,
      result.data,
      result.error,
      { duration }
    );

    // Record performance
    profiler.recordNodePerformance(
      session.id,
      node.name,
      duration,
      !result.error
    );

    timeline.recordEvent(
      session.id,
      node.name,
      result.error ? 'error' : 'complete',
      result.data
    );
  }

  // Generate reports
  const profileReport = profiler.generateReport(session.id, workflowId);
  const timelineViz = timeline.generateVisualization(session.id);
  const recommendations = profiler.getOptimizationRecommendations(session.id, workflowId);

  // Cleanup
  debugManager.stopSession(session.id);
  inspector.clearSnapshots(session.id);
  timeline.clearTimeline(session.id);
  profiler.clearProfile(session.id);

  return {
    profile: profileReport,
    timeline: timelineViz,
    recommendations
  };
}
```

### 2. Performance Monitoring Dashboard

```typescript
async function getPerformanceDashboard(executionId: string, workflowId: string) {
  const profiler = new PerformanceProfiler(logger, config);
  const timeline = new ExecutionTimeline(logger, config);

  const report = profiler.generateReport(executionId, workflowId);
  const viz = timeline.generateVisualization(executionId);

  return {
    overview: {
      totalDuration: report.totalDuration,
      nodeCount: report.summary.totalNodes,
      errorCount: report.summary.totalErrors,
      slowestNode: report.summary.slowestNode
    },
    bottlenecks: report.bottlenecks.map(b => ({
      node: b.nodeName,
      severity: b.severity,
      duration: b.avgDuration,
      percent: b.percentOfTotal.toFixed(2)
    })),
    timeline: {
      nodes: viz.nodes,
      criticalPath: viz.criticalPath
    },
    recommendations: profiler.getOptimizationRecommendations(executionId, workflowId)
  };
}
```

### 3. A/B Testing Workflows

```typescript
async function compareWorkflowVersions(workflowIdV1: string, workflowIdV2: string) {
  const profiler = new PerformanceProfiler(logger, config);
  const timeline = new ExecutionTimeline(logger, config);

  // Execute both versions
  const execId1 = await executeWorkflow(workflowIdV1);
  const execId2 = await executeWorkflow(workflowIdV2);

  // Compare performance
  const perfComparison = profiler.comparePerformance(execId1, execId2, workflowIdV1);
  const timelineComparison = timeline.compareTimelines(execId1, execId2);

  return {
    durationChange: perfComparison.totalDurationChange,
    nodeChanges: perfComparison.nodeComparison.slice(0, 5), // Top 5 changes
    bottleneckChanges: perfComparison.bottleneckChanges,
    timelineChanges: timelineComparison.durationChange
  };
}
```

## Best Practices

### 1. Memory Management

- Clear snapshots after debugging session
- Cleanup inactive debug sessions regularly
- Limit snapshot retention to active executions
- Use pagination for large datasets

```typescript
// Cleanup routine
setInterval(() => {
  debugManager.cleanupInactiveSessions(30); // 30 minutes
  inspector.clearSnapshots(completedExecutionId);
  timeline.clearTimeline(completedExecutionId);
  profiler.clearProfile(completedExecutionId);
}, 3600000); // Every hour
```

### 2. Breakpoint Strategy

- Use conditional breakpoints to reduce noise
- Set breakpoints on error-prone nodes
- Disable breakpoints in production
- Reset hit counts periodically

```typescript
// Development
bpManager.createBreakpoint(workflowId, 'API Call', 'error');

// Production
if (process.env.NODE_ENV === 'production') {
  workflowBreakpoints.forEach(bp => bpManager.disableBreakpoint(bp.id));
}
```

### 3. Performance Monitoring

- Profile critical workflows regularly
- Compare performance across versions
- Act on 'high' and 'critical' bottlenecks
- Export reports for long-term tracking

```typescript
// Regular profiling
const report = profiler.generateReport(executionId, workflowId);
const criticalBottlenecks = report.bottlenecks.filter(
  b => b.severity === 'critical' || b.severity === 'high'
);

if (criticalBottlenecks.length > 0) {
  // Alert team
  await sendAlert({
    type: 'performance',
    workflow: workflowId,
    bottlenecks: criticalBottlenecks
  });
}
```

## Performance Considerations

### Memory Usage

- Debug Session: ~1MB per active session
- Variable Inspector: ~5MB per 100 snapshots
- Timeline: ~2MB per execution
- Profiler: ~3MB per execution

### Recommended Limits

```typescript
const config = {
  maxActiveSessions: 10,
  maxSnapshotsPerExecution: 100,
  maxTimelineEvents: 1000,
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  cleanupInterval: 60 * 60 * 1000 // 1 hour
};
```

## Troubleshooting

### Common Issues

1. **Breakpoints not triggering**: Check if breakpoint is enabled and condition is valid
2. **Memory leaks**: Ensure cleanup routines are running regularly
3. **Slow performance**: Reduce snapshot capture frequency or limit data size
4. **Missing timeline data**: Verify events are being recorded during execution

### Debug Logging

Enable debug logging to troubleshoot:
```bash
N8N_LOG_LEVEL=debug npm start
```

All services provide comprehensive logging:
- Function entry/exit with parameters
- Performance timing for all operations
- Error details with stack traces
- Success confirmations with metrics

## Future Enhancements

1. **Remote debugging**: WebSocket-based remote debugging protocol
2. **Time-travel debugging**: Replay execution state at any point
3. **Visual debugger**: Browser-based debugging UI
4. **ML-based insights**: Predictive performance analysis
5. **Distributed tracing**: Cross-workflow execution tracking
6. **Real-time profiling**: Live performance monitoring during execution