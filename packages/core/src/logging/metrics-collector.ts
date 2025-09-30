import { EventEmitter } from 'events';

export interface MetricValue {
	timestamp: Date;
	value: number;
	tags?: Record<string, string>;
}

export interface AggregatedMetrics {
	count: number;
	sum: number;
	min: number;
	max: number;
	avg: number;
	p50: number;
	p95: number;
	p99: number;
}

export interface WorkflowExecutionMetrics {
	executionId: string;
	workflowId: string;
	startTime: Date;
	endTime?: Date;
	duration?: number;
	status: 'running' | 'success' | 'error' | 'cancelled';
	nodesExecuted: number;
	dataProcessed: number; // bytes
	errorCount: number;
}

/**
 * Metrics Collector for n8n
 *
 * Collects and aggregates metrics for:
 * - Workflow executions
 * - Node performance
 * - System resources
 * - API requests
 * - Error rates
 */
export class MetricsCollector extends EventEmitter {
	private metrics = new Map<string, MetricValue[]>();
	private workflowMetrics = new Map<string, WorkflowExecutionMetrics>();
	private readonly retentionPeriod: number; // milliseconds
	private cleanupInterval?: NodeJS.Timeout;

	constructor(retentionPeriodHours: number = 24) {
		super();
		this.retentionPeriod = retentionPeriodHours * 60 * 60 * 1000;
		this.startCleanup();
	}

	/**
	 * Record a metric value
	 */
	record(name: string, value: number, tags?: Record<string, string>): void {
		const metric: MetricValue = {
			timestamp: new Date(),
			value,
			tags,
		};

		if (!this.metrics.has(name)) {
			this.metrics.set(name, []);
		}

		this.metrics.get(name)!.push(metric);
		this.emit('metric', { name, ...metric });
	}

	/**
	 * Increment a counter
	 */
	increment(name: string, tags?: Record<string, string>): void {
		this.record(name, 1, tags);
	}

	/**
	 * Record timing in milliseconds
	 */
	timing(name: string, durationMs: number, tags?: Record<string, string>): void {
		this.record(`${name}.duration`, durationMs, tags);
	}

	/**
	 * Record gauge value (point-in-time measurement)
	 */
	gauge(name: string, value: number, tags?: Record<string, string>): void {
		this.record(`${name}.gauge`, value, tags);
	}

	/**
	 * Start tracking workflow execution
	 */
	startWorkflowExecution(executionId: string, workflowId: string): void {
		const metrics: WorkflowExecutionMetrics = {
			executionId,
			workflowId,
			startTime: new Date(),
			status: 'running',
			nodesExecuted: 0,
			dataProcessed: 0,
			errorCount: 0,
		};

		this.workflowMetrics.set(executionId, metrics);
		this.emit('workflow.start', metrics);
	}

	/**
	 * End workflow execution tracking
	 */
	endWorkflowExecution(executionId: string, status: 'success' | 'error' | 'cancelled'): void {
		const metrics = this.workflowMetrics.get(executionId);
		if (!metrics) return;

		metrics.endTime = new Date();
		metrics.duration = metrics.endTime.getTime() - metrics.startTime.getTime();
		metrics.status = status;

		// Record metrics
		this.timing('workflow.execution', metrics.duration, {
			workflowId: metrics.workflowId,
			status,
		});

		this.record('workflow.nodes_executed', metrics.nodesExecuted, {
			workflowId: metrics.workflowId,
		});

		this.record('workflow.data_processed', metrics.dataProcessed, {
			workflowId: metrics.workflowId,
		});

		if (status === 'error') {
			this.increment('workflow.errors', { workflowId: metrics.workflowId });
		}

		this.emit('workflow.end', metrics);
	}

	/**
	 * Update workflow metrics during execution
	 */
	updateWorkflowMetrics(executionId: string, update: Partial<WorkflowExecutionMetrics>): void {
		const metrics = this.workflowMetrics.get(executionId);
		if (!metrics) return;

		Object.assign(metrics, update);
		this.emit('workflow.update', metrics);
	}

	/**
	 * Get aggregated metrics for a specific metric name
	 */
	getAggregatedMetrics(name: string, timeWindowMs?: number): AggregatedMetrics | null {
		const values = this.metrics.get(name);
		if (!values || values.length === 0) return null;

		const now = Date.now();
		const filteredValues = timeWindowMs
			? values.filter((v) => now - v.timestamp.getTime() <= timeWindowMs)
			: values;

		if (filteredValues.length === 0) return null;

		const numericValues = filteredValues.map((v) => v.value).sort((a, b) => a - b);
		const sum = numericValues.reduce((a, b) => a + b, 0);
		const count = numericValues.length;

		return {
			count,
			sum,
			min: numericValues[0],
			max: numericValues[count - 1],
			avg: sum / count,
			p50: this.percentile(numericValues, 50),
			p95: this.percentile(numericValues, 95),
			p99: this.percentile(numericValues, 99),
		};
	}

	/**
	 * Get all metrics summary
	 */
	getAllMetrics(timeWindowMs?: number): Record<string, AggregatedMetrics> {
		const summary: Record<string, AggregatedMetrics> = {};

		this.metrics.forEach((_, name) => {
			const aggregated = this.getAggregatedMetrics(name, timeWindowMs);
			if (aggregated) {
				summary[name] = aggregated;
			}
		});

		return summary;
	}

	/**
	 * Get workflow execution statistics
	 */
	getWorkflowStats(workflowId?: string): {
		total: number;
		success: number;
		error: number;
		cancelled: number;
		avgDuration: number;
		totalDataProcessed: number;
	} {
		const relevantMetrics = Array.from(this.workflowMetrics.values()).filter(
			(m) => !workflowId || m.workflowId === workflowId,
		);

		const completed = relevantMetrics.filter((m) => m.status !== 'running');
		const durations = completed.filter((m) => m.duration !== undefined).map((m) => m.duration!);

		return {
			total: relevantMetrics.length,
			success: completed.filter((m) => m.status === 'success').length,
			error: completed.filter((m) => m.status === 'error').length,
			cancelled: completed.filter((m) => m.status === 'cancelled').length,
			avgDuration:
				durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
			totalDataProcessed: relevantMetrics.reduce((sum, m) => sum + m.dataProcessed, 0),
		};
	}

	/**
	 * Get top slowest workflows
	 */
	getSlowestWorkflows(limit: number = 10): WorkflowExecutionMetrics[] {
		return Array.from(this.workflowMetrics.values())
			.filter((m) => m.duration !== undefined)
			.sort((a, b) => (b.duration || 0) - (a.duration || 0))
			.slice(0, limit);
	}

	/**
	 * Get recent errors
	 */
	getRecentErrors(limit: number = 50): WorkflowExecutionMetrics[] {
		return Array.from(this.workflowMetrics.values())
			.filter((m) => m.status === 'error')
			.sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
			.slice(0, limit);
	}

	/**
	 * Export metrics in Prometheus format
	 */
	exportPrometheus(): string {
		let output = '';

		this.metrics.forEach((values, name) => {
			const aggregated = this.getAggregatedMetrics(name);
			if (!aggregated) return;

			const metricName = name.replace(/[^a-zA-Z0-9_]/g, '_');

			output += `# HELP ${metricName}_total Total count\n`;
			output += `# TYPE ${metricName}_total counter\n`;
			output += `${metricName}_total ${aggregated.count}\n\n`;

			output += `# HELP ${metricName}_sum Sum of values\n`;
			output += `# TYPE ${metricName}_sum gauge\n`;
			output += `${metricName}_sum ${aggregated.sum}\n\n`;

			output += `# HELP ${metricName}_avg Average value\n`;
			output += `# TYPE ${metricName}_avg gauge\n`;
			output += `${metricName}_avg ${aggregated.avg}\n\n`;
		});

		return output;
	}

	/**
	 * Clear all metrics
	 */
	clear(): void {
		this.metrics.clear();
		this.workflowMetrics.clear();
		this.emit('metrics.cleared');
	}

	/**
	 * Calculate percentile
	 */
	private percentile(sortedValues: number[], p: number): number {
		if (sortedValues.length === 0) return 0;

		const index = (p / 100) * (sortedValues.length - 1);
		const lower = Math.floor(index);
		const upper = Math.ceil(index);
		const weight = index - lower;

		if (lower === upper) {
			return sortedValues[lower];
		}

		return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
	}

	/**
	 * Start periodic cleanup of old metrics
	 */
	private startCleanup(): void {
		this.cleanupInterval = setInterval(
			() => {
				this.cleanup();
			},
			60 * 60 * 1000,
		); // Run every hour
	}

	/**
	 * Clean up old metrics beyond retention period
	 */
	private cleanup(): void {
		const cutoffTime = Date.now() - this.retentionPeriod;

		// Clean metrics
		this.metrics.forEach((values, name) => {
			const filtered = values.filter((v) => v.timestamp.getTime() >= cutoffTime);
			if (filtered.length === 0) {
				this.metrics.delete(name);
			} else {
				this.metrics.set(name, filtered);
			}
		});

		// Clean workflow metrics
		this.workflowMetrics.forEach((metrics, executionId) => {
			if (metrics.startTime.getTime() < cutoffTime) {
				this.workflowMetrics.delete(executionId);
			}
		});

		this.emit('metrics.cleanup', {
			timestamp: new Date(),
			metricsRetained: this.metrics.size,
			workflowsRetained: this.workflowMetrics.size,
		});
	}

	/**
	 * Stop cleanup interval
	 */
	destroy(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
		}
	}
}

/**
 * Global metrics collector instance
 */
let globalCollector: MetricsCollector | null = null;

export function getMetricsCollector(): MetricsCollector {
	if (!globalCollector) {
		globalCollector = new MetricsCollector(24);
	}
	return globalCollector;
}

export function setMetricsCollector(collector: MetricsCollector): void {
	globalCollector = collector;
}
