import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { Service } from '@n8n/di';

export interface PerformanceMetrics {
	nodeName: string;
	executionCount: number;
	totalDuration: number;
	averageDuration: number;
	minDuration: number;
	maxDuration: number;
	memoryUsage?: number;
	cpuUsage?: number;
	errorCount: number;
	successCount: number;
}

export interface BottleneckAnalysis {
	nodeName: string;
	severity: 'low' | 'medium' | 'high' | 'critical';
	avgDuration: number;
	percentOfTotal: number;
	recommendations: string[];
}

export interface ProfileReport {
	executionId: string;
	workflowId: string;
	totalDuration: number;
	nodeMetrics: PerformanceMetrics[];
	bottlenecks: BottleneckAnalysis[];
	summary: {
		totalNodes: number;
		slowestNode: string;
		fastestNode: string;
		totalErrors: number;
		averageNodeDuration: number;
	};
}

/**
 * Performance Profiler
 *
 * Profiles workflow execution performance and identifies bottlenecks.
 * Provides detailed metrics and optimization recommendations.
 */
@Service()
export class PerformanceProfiler {
	private profiles: Map<string, Map<string, PerformanceMetrics>> = new Map();
	private executionStartTimes: Map<string, number> = new Map();

	constructor(
		private readonly logger: Logger,
		private readonly globalConfig: GlobalConfig,
	) {
		this.logger.info('[PerformanceProfiler] Initialized', {
			module: 'PerformanceProfiler',
		});
	}

	/**
	 * Start profiling an execution
	 */
	startProfiling(executionId: string): void {
		const startTime = Date.now();
		this.logger.debug('[PerformanceProfiler] Starting profiling', {
			module: 'PerformanceProfiler',
			function: 'startProfiling',
			executionId,
		});

		try {
			this.executionStartTimes.set(executionId, Date.now());
			this.profiles.set(executionId, new Map());

			this.logger.info('[PerformanceProfiler] Profiling started', {
				module: 'PerformanceProfiler',
				function: 'startProfiling',
				executionId,
				duration: Date.now() - startTime,
			});
		} catch (error) {
			this.logger.error('[PerformanceProfiler] Failed to start profiling', {
				module: 'PerformanceProfiler',
				function: 'startProfiling',
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
	 * Record node performance
	 */
	recordNodePerformance(
		executionId: string,
		nodeName: string,
		duration: number,
		success: boolean,
		memoryUsage?: number,
		cpuUsage?: number,
	): void {
		const startTime = Date.now();
		this.logger.debug('[PerformanceProfiler] Recording node performance', {
			module: 'PerformanceProfiler',
			function: 'recordNodePerformance',
			executionId,
			nodeName,
			duration,
			success,
		});

		try {
			const executionProfile = this.profiles.get(executionId);
			if (!executionProfile) {
				this.logger.warn('[PerformanceProfiler] Execution profile not found', {
					module: 'PerformanceProfiler',
					function: 'recordNodePerformance',
					executionId,
				});
				return;
			}

			let metrics = executionProfile.get(nodeName);
			if (!metrics) {
				metrics = {
					nodeName,
					executionCount: 0,
					totalDuration: 0,
					averageDuration: 0,
					minDuration: Infinity,
					maxDuration: 0,
					errorCount: 0,
					successCount: 0,
				};
				executionProfile.set(nodeName, metrics);
			}

			// Update metrics
			metrics.executionCount++;
			metrics.totalDuration += duration;
			metrics.averageDuration = metrics.totalDuration / metrics.executionCount;
			metrics.minDuration = Math.min(metrics.minDuration, duration);
			metrics.maxDuration = Math.max(metrics.maxDuration, duration);

			if (success) {
				metrics.successCount++;
			} else {
				metrics.errorCount++;
			}

			if (memoryUsage !== undefined) {
				metrics.memoryUsage = memoryUsage;
			}

			if (cpuUsage !== undefined) {
				metrics.cpuUsage = cpuUsage;
			}

			this.logger.info('[PerformanceProfiler] Node performance recorded', {
				module: 'PerformanceProfiler',
				function: 'recordNodePerformance',
				executionId,
				nodeName,
				duration,
				avgDuration: metrics.averageDuration,
				executionCount: metrics.executionCount,
				duration: Date.now() - startTime,
			});
		} catch (error) {
			this.logger.error('[PerformanceProfiler] Failed to record node performance', {
				module: 'PerformanceProfiler',
				function: 'recordNodePerformance',
				executionId,
				nodeName,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Generate profile report
	 */
	generateReport(executionId: string, workflowId: string): ProfileReport {
		const startTime = Date.now();
		this.logger.debug('[PerformanceProfiler] Generating report', {
			module: 'PerformanceProfiler',
			function: 'generateReport',
			executionId,
			workflowId,
		});

		try {
			const executionProfile = this.profiles.get(executionId);
			if (!executionProfile) {
				this.logger.warn('[PerformanceProfiler] Execution profile not found', {
					module: 'PerformanceProfiler',
					function: 'generateReport',
					executionId,
				});

				return {
					executionId,
					workflowId,
					totalDuration: 0,
					nodeMetrics: [],
					bottlenecks: [],
					summary: {
						totalNodes: 0,
						slowestNode: '',
						fastestNode: '',
						totalErrors: 0,
						averageNodeDuration: 0,
					},
				};
			}

			const nodeMetrics = Array.from(executionProfile.values());
			const totalDuration = nodeMetrics.reduce((sum, m) => sum + m.totalDuration, 0);

			// Calculate bottlenecks
			const bottlenecks = this.analyzeBottlenecks(nodeMetrics, totalDuration);

			// Calculate summary
			const sortedByDuration = [...nodeMetrics].sort(
				(a, b) => b.averageDuration - a.averageDuration,
			);
			const summary = {
				totalNodes: nodeMetrics.length,
				slowestNode: sortedByDuration[0]?.nodeName || '',
				fastestNode: sortedByDuration[sortedByDuration.length - 1]?.nodeName || '',
				totalErrors: nodeMetrics.reduce((sum, m) => sum + m.errorCount, 0),
				averageNodeDuration: totalDuration / nodeMetrics.length,
			};

			const report: ProfileReport = {
				executionId,
				workflowId,
				totalDuration,
				nodeMetrics,
				bottlenecks,
				summary,
			};

			this.logger.info('[PerformanceProfiler] Report generated', {
				module: 'PerformanceProfiler',
				function: 'generateReport',
				executionId,
				totalDuration,
				nodeCount: nodeMetrics.length,
				bottleneckCount: bottlenecks.length,
				duration: Date.now() - startTime,
			});

			return report;
		} catch (error) {
			this.logger.error('[PerformanceProfiler] Failed to generate report', {
				module: 'PerformanceProfiler',
				function: 'generateReport',
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
	 * Analyze bottlenecks
	 */
	private analyzeBottlenecks(
		metrics: PerformanceMetrics[],
		totalDuration: number,
	): BottleneckAnalysis[] {
		const startTime = Date.now();
		this.logger.debug('[PerformanceProfiler] Analyzing bottlenecks', {
			module: 'PerformanceProfiler',
			function: 'analyzeBottlenecks',
			nodeCount: metrics.length,
		});

		try {
			const bottlenecks: BottleneckAnalysis[] = [];

			for (const metric of metrics) {
				const percentOfTotal = (metric.totalDuration / totalDuration) * 100;

				// Determine severity
				let severity: BottleneckAnalysis['severity'] = 'low';
				const recommendations: string[] = [];

				if (percentOfTotal > 50) {
					severity = 'critical';
					recommendations.push('This node consumes over 50% of total execution time');
					recommendations.push('Consider optimizing or splitting this node');
				} else if (percentOfTotal > 30) {
					severity = 'high';
					recommendations.push('This node is a significant bottleneck');
					recommendations.push('Review node logic and consider caching');
				} else if (percentOfTotal > 15) {
					severity = 'medium';
					recommendations.push('This node takes noticeable time');
					recommendations.push('Consider optimization if executed frequently');
				}

				if (metric.errorCount > 0) {
					recommendations.push(`${metric.errorCount} errors occurred - review error handling`);
				}

				if (metric.averageDuration > 5000) {
					recommendations.push('Average execution time exceeds 5 seconds');
					recommendations.push('Consider async processing or batching');
				}

				if (severity !== 'low' || recommendations.length > 0) {
					bottlenecks.push({
						nodeName: metric.nodeName,
						severity,
						avgDuration: metric.averageDuration,
						percentOfTotal,
						recommendations,
					});
				}
			}

			// Sort by severity
			const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
			bottlenecks.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

			this.logger.info('[PerformanceProfiler] Bottlenecks analyzed', {
				module: 'PerformanceProfiler',
				function: 'analyzeBottlenecks',
				bottleneckCount: bottlenecks.length,
				criticalCount: bottlenecks.filter((b) => b.severity === 'critical').length,
				highCount: bottlenecks.filter((b) => b.severity === 'high').length,
				duration: Date.now() - startTime,
			});

			return bottlenecks;
		} catch (error) {
			this.logger.error('[PerformanceProfiler] Failed to analyze bottlenecks', {
				module: 'PerformanceProfiler',
				function: 'analyzeBottlenecks',
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Get optimization recommendations
	 */
	getOptimizationRecommendations(executionId: string, workflowId: string): string[] {
		const startTime = Date.now();
		this.logger.debug('[PerformanceProfiler] Getting optimization recommendations', {
			module: 'PerformanceProfiler',
			function: 'getOptimizationRecommendations',
			executionId,
		});

		try {
			const report = this.generateReport(executionId, workflowId);
			const recommendations: string[] = [];

			// General recommendations
			if (report.summary.totalErrors > 0) {
				recommendations.push(
					`Found ${report.summary.totalErrors} errors - implement better error handling`,
				);
			}

			if (report.summary.averageNodeDuration > 3000) {
				recommendations.push('Average node duration is high - consider parallel execution');
			}

			// Bottleneck-specific recommendations
			for (const bottleneck of report.bottlenecks) {
				recommendations.push(
					`${bottleneck.nodeName} (${bottleneck.severity}): ${bottleneck.recommendations.join(', ')}`,
				);
			}

			// Node-specific recommendations
			for (const metric of report.nodeMetrics) {
				if (metric.executionCount > 10) {
					recommendations.push(
						`${metric.nodeName} executed ${metric.executionCount} times - consider batching`,
					);
				}

				if (metric.maxDuration > metric.averageDuration * 3) {
					recommendations.push(
						`${metric.nodeName} has inconsistent performance - investigate spikes`,
					);
				}
			}

			this.logger.info('[PerformanceProfiler] Optimization recommendations generated', {
				module: 'PerformanceProfiler',
				function: 'getOptimizationRecommendations',
				executionId,
				recommendationCount: recommendations.length,
				duration: Date.now() - startTime,
			});

			return recommendations;
		} catch (error) {
			this.logger.error('[PerformanceProfiler] Failed to get optimization recommendations', {
				module: 'PerformanceProfiler',
				function: 'getOptimizationRecommendations',
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
	 * Compare performance between executions
	 */
	comparePerformance(
		executionId1: string,
		executionId2: string,
		workflowId: string,
	): Record<string, any> {
		const startTime = Date.now();
		this.logger.debug('[PerformanceProfiler] Comparing performance', {
			module: 'PerformanceProfiler',
			function: 'comparePerformance',
			executionId1,
			executionId2,
		});

		try {
			const report1 = this.generateReport(executionId1, workflowId);
			const report2 = this.generateReport(executionId2, workflowId);

			const comparison = {
				totalDurationChange: {
					execution1: report1.totalDuration,
					execution2: report2.totalDuration,
					difference: report2.totalDuration - report1.totalDuration,
					percentageChange:
						((report2.totalDuration - report1.totalDuration) / report1.totalDuration) * 100,
				},
				nodeComparison: this.compareNodeMetrics(report1.nodeMetrics, report2.nodeMetrics),
				bottleneckChanges: {
					execution1Count: report1.bottlenecks.length,
					execution2Count: report2.bottlenecks.length,
					newBottlenecks: report2.bottlenecks
						.filter((b) => !report1.bottlenecks.some((b1) => b1.nodeName === b.nodeName))
						.map((b) => b.nodeName),
					resolvedBottlenecks: report1.bottlenecks
						.filter((b) => !report2.bottlenecks.some((b2) => b2.nodeName === b.nodeName))
						.map((b) => b.nodeName),
				},
			};

			this.logger.info('[PerformanceProfiler] Performance compared', {
				module: 'PerformanceProfiler',
				function: 'comparePerformance',
				executionId1,
				executionId2,
				durationChange: comparison.totalDurationChange.difference,
				percentageChange: comparison.totalDurationChange.percentageChange,
				duration: Date.now() - startTime,
			});

			return comparison;
		} catch (error) {
			this.logger.error('[PerformanceProfiler] Failed to compare performance', {
				module: 'PerformanceProfiler',
				function: 'comparePerformance',
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
	 * Compare node metrics
	 */
	private compareNodeMetrics(
		metrics1: PerformanceMetrics[],
		metrics2: PerformanceMetrics[],
	): Record<string, unknown>[] {
		const comparison: Record<string, unknown>[] = [];

		const metricsMap1 = new Map(metrics1.map((m) => [m.nodeName, m]));
		const metricsMap2 = new Map(metrics2.map((m) => [m.nodeName, m]));

		const allNodes = new Set([...metricsMap1.keys(), ...metricsMap2.keys()]);

		for (const nodeName of allNodes) {
			const metric1 = metricsMap1.get(nodeName);
			const metric2 = metricsMap2.get(nodeName);

			if (metric1 && metric2) {
				comparison.push({
					nodeName,
					avgDurationChange: metric2.averageDuration - metric1.averageDuration,
					percentageChange:
						((metric2.averageDuration - metric1.averageDuration) / metric1.averageDuration) * 100,
					errorChange: metric2.errorCount - metric1.errorCount,
				});
			}
		}

		return comparison.sort(
			(a, b) => Math.abs(b.percentageChange as number) - Math.abs(a.percentageChange as number),
		);
	}

	/**
	 * Clear profile data
	 */
	clearProfile(executionId: string): void {
		const startTime = Date.now();
		this.logger.debug('[PerformanceProfiler] Clearing profile', {
			module: 'PerformanceProfiler',
			function: 'clearProfile',
			executionId,
		});

		try {
			this.profiles.delete(executionId);
			this.executionStartTimes.delete(executionId);

			this.logger.info('[PerformanceProfiler] Profile cleared', {
				module: 'PerformanceProfiler',
				function: 'clearProfile',
				executionId,
				duration: Date.now() - startTime,
			});
		} catch (error) {
			this.logger.error('[PerformanceProfiler] Failed to clear profile', {
				module: 'PerformanceProfiler',
				function: 'clearProfile',
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
	 * Export profile report to JSON
	 */
	exportReport(executionId: string, workflowId: string): string {
		const startTime = Date.now();
		this.logger.debug('[PerformanceProfiler] Exporting report', {
			module: 'PerformanceProfiler',
			function: 'exportReport',
			executionId,
		});

		try {
			const report = this.generateReport(executionId, workflowId);
			const recommendations = this.getOptimizationRecommendations(executionId, workflowId);

			const exportData = {
				report,
				recommendations,
				exportedAt: new Date(),
			};

			const jsonData = JSON.stringify(exportData, null, 2);

			this.logger.info('[PerformanceProfiler] Report exported', {
				module: 'PerformanceProfiler',
				function: 'exportReport',
				executionId,
				size: jsonData.length,
				duration: Date.now() - startTime,
			});

			return jsonData;
		} catch (error) {
			this.logger.error('[PerformanceProfiler] Failed to export report', {
				module: 'PerformanceProfiler',
				function: 'exportReport',
				executionId,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}
}
