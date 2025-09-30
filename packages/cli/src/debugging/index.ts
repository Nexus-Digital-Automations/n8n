/**
 * Advanced Debugging Module
 *
 * Provides comprehensive debugging tools for workflow executions including:
 * - Interactive debugging sessions with breakpoints
 * - Variable inspection at each execution step
 * - Timeline visualization with bottleneck detection
 * - Performance profiling and optimization recommendations
 *
 * Usage:
 * 1. Create a debug session for a workflow
 * 2. Set breakpoints on specific nodes
 * 3. Execute workflow in debug mode
 * 4. Inspect variables and timeline at each breakpoint
 * 5. Generate performance profile and optimization recommendations
 */

export { DebugSessionManager } from './debug-session';
export type { DebugSession, DebugEvent, DebugCommand } from './debug-session';

export { BreakpointManager } from './breakpoint-manager';
export type { Breakpoint, BreakpointCondition } from './breakpoint-manager';

export { VariableInspector } from './variable-inspector';
export type { VariableSnapshot, InspectionResult } from './variable-inspector';

export { ExecutionTimeline } from './execution-timeline';
export type {
	TimelineEvent,
	NodeTiming,
	TimelineVisualization,
} from './execution-timeline';

export { PerformanceProfiler } from './performance-profiler';
export type {
	PerformanceMetrics,
	BottleneckAnalysis,
	ProfileReport,
} from './performance-profiler';
