import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { Service } from '@n8n/di';

export interface TimelineEvent {
	id: string;
	nodeName: string;
	eventType: 'start' | 'complete' | 'error' | 'waiting';
	timestamp: Date;
	duration?: number;
	data?: any;
	metadata?: Record<string, any>;
}

export interface NodeTiming {
	nodeName: string;
	startTime: Date;
	endTime?: Date;
	duration?: number;
	status: 'running' | 'completed' | 'error' | 'waiting';
	executionCount: number;
}

export interface TimelineVisualization {
	totalDuration: number;
	nodes: Array<{
		nodeName: string;
		startOffset: number;
		duration: number;
		status: string;
		percentage: number;
	}>;
	criticalPath: string[];
	bottlenecks: string[];
}

/**
 * Execution Timeline Service
 *
 * Provides timeline visualization and analysis of workflow execution.
 * Tracks node timing, identifies bottlenecks, and generates visualizations.
 */
@Service()
export class ExecutionTimeline {
	private timelines: Map<string, TimelineEvent[]> = new Map();
	private nodeTimings: Map<string, Map<string, NodeTiming>> = new Map();

	constructor(
		private readonly logger: Logger,
		private readonly globalConfig: GlobalConfig,
	) {
		this.logger.info('[ExecutionTimeline] Initialized', {
			module: 'ExecutionTimeline',
		});
	}

	/**
	 * Record timeline event
	 */
	recordEvent(
		executionId: string,
		nodeName: string,
		eventType: TimelineEvent['eventType'],
		data?: any,
		metadata?: Record<string, any>,
	): void {
		const startTime = Date.now();
		this.logger.debug('[ExecutionTimeline] Recording event', {
			module: 'ExecutionTimeline',
			function: 'recordEvent',
			executionId,
			nodeName,
			eventType,
		});

		try {
			const event: TimelineEvent = {
				id: `${executionId}_${nodeName}_${Date.now()}`,
				nodeName,
				eventType,
				timestamp: new Date(),
				data,
				metadata,
			};

			if (!this.timelines.has(executionId)) {
				this.timelines.set(executionId, []);
			}

			this.timelines.get(executionId)!.push(event);

			// Update node timing
			this.updateNodeTiming(executionId, nodeName, eventType);

			this.logger.info('[ExecutionTimeline] Event recorded', {
				module: 'ExecutionTimeline',
				function: 'recordEvent',
				executionId,
				nodeName,
				eventType,
				duration: Date.now() - startTime,
			});
		} catch (error) {
			this.logger.error('[ExecutionTimeline] Failed to record event', {
				module: 'ExecutionTimeline',
				function: 'recordEvent',
				executionId,
				nodeName,
				eventType,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Update node timing
	 */
	private updateNodeTiming(
		executionId: string,
		nodeName: string,
		eventType: TimelineEvent['eventType'],
	): void {
		if (!this.nodeTimings.has(executionId)) {
			this.nodeTimings.set(executionId, new Map());
		}

		const executionTimings = this.nodeTimings.get(executionId)!;

		if (!executionTimings.has(nodeName)) {
			executionTimings.set(nodeName, {
				nodeName,
				startTime: new Date(),
				status: 'running',
				executionCount: 0,
			});
		}

		const timing = executionTimings.get(nodeName)!;

		if (eventType === 'start') {
			timing.startTime = new Date();
			timing.status = 'running';
			timing.executionCount++;
		} else if (eventType === 'complete') {
			timing.endTime = new Date();
			timing.duration = timing.endTime.getTime() - timing.startTime.getTime();
			timing.status = 'completed';
		} else if (eventType === 'error') {
			timing.endTime = new Date();
			timing.duration = timing.endTime.getTime() - timing.startTime.getTime();
			timing.status = 'error';
		} else if (eventType === 'waiting') {
			timing.status = 'waiting';
		}
	}

	/**
	 * Get timeline events for execution
	 */
	getTimeline(executionId: string): TimelineEvent[] {
		const startTime = Date.now();
		this.logger.debug('[ExecutionTimeline] Getting timeline', {
			module: 'ExecutionTimeline',
			function: 'getTimeline',
			executionId,
		});

		const timeline = this.timelines.get(executionId) || [];

		this.logger.debug('[ExecutionTimeline] Timeline retrieved', {
			module: 'ExecutionTimeline',
			function: 'getTimeline',
			executionId,
			eventCount: timeline.length,
			duration: Date.now() - startTime,
		});

		return timeline;
	}

	/**
	 * Get node timings for execution
	 */
	getNodeTimings(executionId: string): NodeTiming[] {
		const startTime = Date.now();
		this.logger.debug('[ExecutionTimeline] Getting node timings', {
			module: 'ExecutionTimeline',
			function: 'getNodeTimings',
			executionId,
		});

		const timings = Array.from(this.nodeTimings.get(executionId)?.values() || []);

		this.logger.debug('[ExecutionTimeline] Node timings retrieved', {
			module: 'ExecutionTimeline',
			function: 'getNodeTimings',
			executionId,
			nodeCount: timings.length,
			duration: Date.now() - startTime,
		});

		return timings;
	}

	/**
	 * Generate timeline visualization
	 */
	generateVisualization(executionId: string): TimelineVisualization {
		const startTime = Date.now();
		this.logger.debug('[ExecutionTimeline] Generating visualization', {
			module: 'ExecutionTimeline',
			function: 'generateVisualization',
			executionId,
		});

		try {
			const timings = this.getNodeTimings(executionId);

			if (timings.length === 0) {
				this.logger.warn('[ExecutionTimeline] No timings found', {
					module: 'ExecutionTimeline',
					function: 'generateVisualization',
					executionId,
				});

				return {
					totalDuration: 0,
					nodes: [],
					criticalPath: [],
					bottlenecks: [],
				};
			}

			// Calculate total duration
			const startTimes = timings.map((t) => t.startTime.getTime());
			const endTimes = timings.filter((t) => t.endTime).map((t) => t.endTime!.getTime());

			const minStartTime = Math.min(...startTimes);
			const maxEndTime = endTimes.length > 0 ? Math.max(...endTimes) : Date.now();
			const totalDuration = maxEndTime - minStartTime;

			// Generate node visualization data
			const nodes = timings
				.filter((t) => t.duration !== undefined)
				.map((timing) => ({
					nodeName: timing.nodeName,
					startOffset: timing.startTime.getTime() - minStartTime,
					duration: timing.duration!,
					status: timing.status,
					percentage: (timing.duration! / totalDuration) * 100,
				}))
				.sort((a, b) => a.startOffset - b.startOffset);

			// Identify bottlenecks (nodes taking >20% of total time)
			const bottlenecks = nodes.filter((n) => n.percentage > 20).map((n) => n.nodeName);

			// Calculate critical path (simplified - sequential longest path)
			const criticalPath = nodes
				.sort((a, b) => b.duration - a.duration)
				.slice(0, 3)
				.map((n) => n.nodeName);

			const visualization: TimelineVisualization = {
				totalDuration,
				nodes,
				criticalPath,
				bottlenecks,
			};

			this.logger.info('[ExecutionTimeline] Visualization generated', {
				module: 'ExecutionTimeline',
				function: 'generateVisualization',
				executionId,
				totalDuration,
				nodeCount: nodes.length,
				bottleneckCount: bottlenecks.length,
				duration: Date.now() - startTime,
			});

			return visualization;
		} catch (error) {
			this.logger.error('[ExecutionTimeline] Failed to generate visualization', {
				module: 'ExecutionTimeline',
				function: 'generateVisualization',
				executionId,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Get bottleneck nodes
	 */
	getBottlenecks(executionId: string, threshold: number = 20): string[] {
		const startTime = Date.now();
		this.logger.debug('[ExecutionTimeline] Identifying bottlenecks', {
			module: 'ExecutionTimeline',
			function: 'getBottlenecks',
			executionId,
			threshold,
		});

		try {
			const visualization = this.generateVisualization(executionId);
			const bottlenecks = visualization.bottlenecks;

			this.logger.info('[ExecutionTimeline] Bottlenecks identified', {
				module: 'ExecutionTimeline',
				function: 'getBottlenecks',
				executionId,
				bottleneckCount: bottlenecks.length,
				bottlenecks,
				duration: Date.now() - startTime,
			});

			return bottlenecks;
		} catch (error) {
			this.logger.error('[ExecutionTimeline] Failed to identify bottlenecks', {
				module: 'ExecutionTimeline',
				function: 'getBottlenecks',
				executionId,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Export timeline to JSON
	 */
	exportTimeline(executionId: string): string {
		const startTime = Date.now();
		this.logger.debug('[ExecutionTimeline] Exporting timeline', {
			module: 'ExecutionTimeline',
			function: 'exportTimeline',
			executionId,
		});

		try {
			const timeline = this.getTimeline(executionId);
			const timings = this.getNodeTimings(executionId);
			const visualization = this.generateVisualization(executionId);

			const exportData = {
				executionId,
				timeline,
				timings,
				visualization,
				exportedAt: new Date(),
			};

			const jsonData = JSON.stringify(exportData, null, 2);

			this.logger.info('[ExecutionTimeline] Timeline exported', {
				module: 'ExecutionTimeline',
				function: 'exportTimeline',
				executionId,
				size: jsonData.length,
				duration: Date.now() - startTime,
			});

			return jsonData;
		} catch (error) {
			this.logger.error('[ExecutionTimeline] Failed to export timeline', {
				module: 'ExecutionTimeline',
				function: 'exportTimeline',
				executionId,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Clear timeline data
	 */
	clearTimeline(executionId: string): void {
		const startTime = Date.now();
		this.logger.debug('[ExecutionTimeline] Clearing timeline', {
			module: 'ExecutionTimeline',
			function: 'clearTimeline',
			executionId,
		});

		try {
			this.timelines.delete(executionId);
			this.nodeTimings.delete(executionId);

			this.logger.info('[ExecutionTimeline] Timeline cleared', {
				module: 'ExecutionTimeline',
				function: 'clearTimeline',
				executionId,
				duration: Date.now() - startTime,
			});
		} catch (error) {
			this.logger.error('[ExecutionTimeline] Failed to clear timeline', {
				module: 'ExecutionTimeline',
				function: 'clearTimeline',
				executionId,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Compare timelines between executions
	 */
	compareTimelines(executionId1: string, executionId2: string): Record<string, any> {
		const startTime = Date.now();
		this.logger.debug('[ExecutionTimeline] Comparing timelines', {
			module: 'ExecutionTimeline',
			function: 'compareTimelines',
			executionId1,
			executionId2,
		});

		try {
			const viz1 = this.generateVisualization(executionId1);
			const viz2 = this.generateVisualization(executionId2);

			const comparison = {
				durationChange: {
					execution1: viz1.totalDuration,
					execution2: viz2.totalDuration,
					difference: viz2.totalDuration - viz1.totalDuration,
					percentageChange: ((viz2.totalDuration - viz1.totalDuration) / viz1.totalDuration) * 100,
				},
				nodeComparison: this.compareNodeTimings(viz1.nodes, viz2.nodes),
				bottleneckChanges: {
					execution1: viz1.bottlenecks,
					execution2: viz2.bottlenecks,
					new: viz2.bottlenecks.filter((b) => !viz1.bottlenecks.includes(b)),
					resolved: viz1.bottlenecks.filter((b) => !viz2.bottlenecks.includes(b)),
				},
			};

			this.logger.info('[ExecutionTimeline] Timelines compared', {
				module: 'ExecutionTimeline',
				function: 'compareTimelines',
				executionId1,
				executionId2,
				durationChange: comparison.durationChange.difference,
				duration: Date.now() - startTime,
			});

			return comparison;
		} catch (error) {
			this.logger.error('[ExecutionTimeline] Failed to compare timelines', {
				module: 'ExecutionTimeline',
				function: 'compareTimelines',
				executionId1,
				executionId2,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Compare node timings between executions
	 */
	private compareNodeTimings(
		nodes1: TimelineVisualization['nodes'],
		nodes2: TimelineVisualization['nodes'],
	): Record<string, unknown>[] {
		const comparison: Record<string, unknown>[] = [];

		const nodeMap1 = new Map(nodes1.map((n) => [n.nodeName, n]));
		const nodeMap2 = new Map(nodes2.map((n) => [n.nodeName, n]));

		const allNodes = new Set([...nodeMap1.keys(), ...nodeMap2.keys()]);

		for (const nodeName of allNodes) {
			const node1 = nodeMap1.get(nodeName);
			const node2 = nodeMap2.get(nodeName);

			if (node1 && node2) {
				comparison.push({
					nodeName,
					execution1Duration: node1.duration,
					execution2Duration: node2.duration,
					change: node2.duration - node1.duration,
					percentageChange: ((node2.duration - node1.duration) / node1.duration) * 100,
				});
			}
		}

		return comparison.sort((a, b) => Math.abs(b.change as number) - Math.abs(a.change as number));
	}
}
