/**
 * Advanced Workflow Analytics and Optimization Engine
 * AI-powered workflow performance prediction, optimization, and insights
 */

import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import type { IDataObject, IUser } from 'n8n-workflow';

export interface WorkflowMetrics {
	workflowId: string;
	executionTime: number;
	successRate: number;
	errorRate: number;
	resourceUsage: {
		cpu: number;
		memory: number;
		network: number;
	};
	nodeMetrics: Array<{
		nodeId: string;
		nodeType: string;
		avgExecutionTime: number;
		successRate: number;
		errorCount: number;
	}>;
	timestamp: Date;
}

export interface PerformancePrediction {
	workflowId: string;
	predictedExecutionTime: number;
	confidence: number;
	bottleneckNodes: Array<{
		nodeId: string;
		expectedDelay: number;
		reason: string;
	}>;
	scalabilityScore: number;
	recommendations: string[];
}

export interface OptimizationSuggestion {
	type: 'performance' | 'cost' | 'reliability' | 'scalability';
	priority: 'low' | 'medium' | 'high' | 'critical';
	title: string;
	description: string;
	expectedImpact: {
		performance: number;
		cost: number;
		reliability: number;
	};
	implementation: {
		difficulty: 'easy' | 'medium' | 'hard';
		estimatedTime: string;
		steps: string[];
	};
	metrics: string[];
}

export interface WorkflowInsight {
	category: 'performance' | 'usage' | 'errors' | 'optimization' | 'trends';
	severity: 'info' | 'warning' | 'error' | 'critical';
	title: string;
	message: string;
	data?: IDataObject;
	actionable: boolean;
	suggestions?: string[];
}

@Service()
export class WorkflowAnalyticsService {
	private metricsStore: Map<string, WorkflowMetrics[]> = new Map();
	private predictionModels: Map<string, any> = new Map();
	private benchmarkData: Map<string, number> = new Map();

	constructor(private readonly logger: Logger) {
		this.initializeBenchmarkData();
		this.initializePredictionModels();
	}

	/**
	 * Collect and store workflow execution metrics
	 */
	async recordWorkflowMetrics(
		workflowId: string,
		executionData: {
			startTime: Date;
			endTime: Date;
			success: boolean;
			nodeExecutions: Array<{
				nodeId: string;
				nodeType: string;
				startTime: Date;
				endTime: Date;
				success: boolean;
				error?: string;
			}>;
			resourceUsage?: {
				cpu: number;
				memory: number;
				network: number;
			};
		}
	): Promise<WorkflowMetrics> {
		const executionTime = executionData.endTime.getTime() - executionData.startTime.getTime();
		
		// Calculate node metrics
		const nodeMetrics = executionData.nodeExecutions.map(node => ({
			nodeId: node.nodeId,
			nodeType: node.nodeType,
			avgExecutionTime: node.endTime.getTime() - node.startTime.getTime(),
			successRate: node.success ? 1 : 0,
			errorCount: node.success ? 0 : 1
		}));

		const metrics: WorkflowMetrics = {
			workflowId,
			executionTime,
			successRate: executionData.success ? 1 : 0,
			errorRate: executionData.success ? 0 : 1,
			resourceUsage: executionData.resourceUsage || { cpu: 0, memory: 0, network: 0 },
			nodeMetrics,
			timestamp: new Date()
		};

		// Store metrics
		if (!this.metricsStore.has(workflowId)) {
			this.metricsStore.set(workflowId, []);
		}
		this.metricsStore.get(workflowId)!.push(metrics);

		// Keep only last 1000 metrics per workflow
		const workflowMetrics = this.metricsStore.get(workflowId)!;
		if (workflowMetrics.length > 1000) {
			workflowMetrics.splice(0, workflowMetrics.length - 1000);
		}

		this.logger.debug('Workflow metrics recorded', {
			workflowId,
			executionTime,
			success: executionData.success,
			nodeCount: nodeMetrics.length
		});

		return metrics;
	}

	/**
	 * Generate AI-powered workflow performance prediction
	 */
	async predictWorkflowPerformance(
		workflowData: {
			nodes: any[];
			connections: any;
		},
		inputSize?: number
	): Promise<PerformancePrediction> {
		this.logger.debug('Predicting workflow performance', {
			nodeCount: workflowData.nodes.length,
			inputSize
		});

		// Analyze workflow structure
		const structureAnalysis = this.analyzeWorkflowStructure(workflowData);
		
		// Predict execution time based on node types and connections
		let predictedTime = 0;
		const bottleneckNodes: Array<{
			nodeId: string;
			expectedDelay: number;
			reason: string;
		}> = [];

		for (const node of workflowData.nodes) {
			const nodeBaseline = this.benchmarkData.get(node.type) || 1000;
			let nodePrediction = nodeBaseline;

			// Adjust for input size
			if (inputSize && this.isDataProcessingNode(node.type)) {
				nodePrediction *= Math.log(inputSize + 1) / Math.log(1000);
			}

			// Check for potential bottlenecks
			if (nodePrediction > 5000) { // 5+ seconds
				bottleneckNodes.push({
					nodeId: node.id,
					expectedDelay: nodePrediction,
					reason: this.getBottleneckReason(node.type, nodePrediction)
				});
			}

			predictedTime += nodePrediction;
		}

		// Adjust for parallelization opportunities
		const parallelizationFactor = this.calculateParallelizationFactor(workflowData);
		predictedTime *= parallelizationFactor;

		// Calculate confidence based on historical data availability
		const confidence = this.calculatePredictionConfidence(workflowData);

		// Generate scalability score
		const scalabilityScore = this.calculateScalabilityScore(structureAnalysis);

		// Generate recommendations
		const recommendations = this.generatePerformanceRecommendations(
			structureAnalysis,
			bottleneckNodes,
			scalabilityScore
		);

		return {
			workflowId: 'prediction', // Placeholder for new workflows
			predictedExecutionTime: Math.round(predictedTime),
			confidence,
			bottleneckNodes,
			scalabilityScore,
			recommendations
		};
	}

	/**
	 * Generate comprehensive workflow optimization suggestions
	 */
	async generateOptimizationSuggestions(
		workflowId: string,
		workflowData?: { nodes: any[]; connections: any }
	): Promise<OptimizationSuggestion[]> {
		const suggestions: OptimizationSuggestion[] = [];
		
		this.logger.debug('Generating optimization suggestions', { workflowId });

		// Get historical metrics if available
		const historicalMetrics = this.metricsStore.get(workflowId) || [];
		
		// Performance optimizations
		if (historicalMetrics.length > 0) {
			const avgExecutionTime = historicalMetrics.reduce((sum, m) => sum + m.executionTime, 0) / historicalMetrics.length;
			
			if (avgExecutionTime > 10000) { // > 10 seconds
				suggestions.push({
					type: 'performance',
					priority: 'high',
					title: 'Optimize Workflow Performance',
					description: `Average execution time is ${Math.round(avgExecutionTime/1000)}s. Consider parallelization and caching.`,
					expectedImpact: { performance: 40, cost: 10, reliability: 5 },
					implementation: {
						difficulty: 'medium',
						estimatedTime: '2-4 hours',
						steps: [
							'Identify sequential operations that can be parallelized',
							'Implement caching for repeated operations',
							'Optimize database queries and API calls'
						]
					},
					metrics: ['execution_time', 'throughput']
				});
			}

			// Error rate optimization
			const avgErrorRate = historicalMetrics.reduce((sum, m) => sum + m.errorRate, 0) / historicalMetrics.length;
			if (avgErrorRate > 0.05) { // > 5% error rate
				suggestions.push({
					type: 'reliability',
					priority: 'critical',
					title: 'Improve Error Handling',
					description: `Error rate is ${(avgErrorRate * 100).toFixed(1)}%. Add retry logic and error handling.`,
					expectedImpact: { performance: 10, cost: 0, reliability: 60 },
					implementation: {
						difficulty: 'medium',
						estimatedTime: '3-6 hours',
						steps: [
							'Add retry logic for transient failures',
							'Implement comprehensive error handling',
							'Add monitoring and alerting for critical paths'
						]
					},
					metrics: ['error_rate', 'success_rate', 'mttr']
				});
			}
		}

		// Structure-based optimizations
		if (workflowData) {
			suggestions.push(...this.generateStructuralOptimizations(workflowData));
		}

		// Cost optimizations
		suggestions.push(...this.generateCostOptimizations(historicalMetrics));

		// Sort by priority
		const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
		suggestions.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);

		return suggestions;
	}

	/**
	 * Generate comprehensive workflow insights and analytics
	 */
	async generateWorkflowInsights(
		workflowId: string,
		timeRange: { start: Date; end: Date }
	): Promise<WorkflowInsight[]> {
		const insights: WorkflowInsight[] = [];
		const metrics = this.metricsStore.get(workflowId) || [];
		const filteredMetrics = metrics.filter(m => 
			m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
		);

		if (filteredMetrics.length === 0) {
			return [{
				category: 'usage',
				severity: 'info',
				title: 'No Execution Data',
				message: 'No workflow executions found in the specified time range.',
				actionable: false
			}];
		}

		this.logger.debug('Generating workflow insights', {
			workflowId,
			metricsCount: filteredMetrics.length
		});

		// Performance trends
		const performanceTrend = this.analyzePerformanceTrend(filteredMetrics);
		if (performanceTrend.trend === 'degrading') {
			insights.push({
				category: 'performance',
				severity: 'warning',
				title: 'Performance Degradation Detected',
				message: `Execution time has increased by ${performanceTrend.changePercent}% over the time period.`,
				data: { trend: performanceTrend },
				actionable: true,
				suggestions: [
					'Review recent workflow changes',
					'Check for resource constraints',
					'Consider scaling infrastructure'
				]
			});
		}

		// Usage patterns
		const usagePattern = this.analyzeUsagePattern(filteredMetrics);
		if (usagePattern.peakHours.length > 0) {
			insights.push({
				category: 'usage',
				severity: 'info',
				title: 'Peak Usage Hours Identified',
				message: `Workflow shows peak usage during ${usagePattern.peakHours.join(', ')}.`,
				data: { pattern: usagePattern },
				actionable: true,
				suggestions: [
					'Consider auto-scaling during peak hours',
					'Pre-warm resources before peak times'
				]
			});
		}

		// Error analysis
		const errorAnalysis = this.analyzeErrorPatterns(filteredMetrics);
		if (errorAnalysis.criticalNodes.length > 0) {
			insights.push({
				category: 'errors',
				severity: 'error',
				title: 'High-Error Nodes Detected',
				message: `Nodes ${errorAnalysis.criticalNodes.join(', ')} have high error rates.`,
				data: { errors: errorAnalysis },
				actionable: true,
				suggestions: [
					'Review node configurations',
					'Add error handling and retry logic',
					'Consider alternative approaches'
				]
			});
		}

		// Resource utilization
		const resourceInsights = this.analyzeResourceUtilization(filteredMetrics);
		insights.push(...resourceInsights);

		// Optimization opportunities
		const optimizations = this.identifyOptimizationOpportunities(filteredMetrics);
		insights.push(...optimizations);

		return insights;
	}

	/**
	 * Real-time workflow monitoring and alerting
	 */
	async monitorWorkflowHealth(
		workflowId: string,
		thresholds: {
			maxExecutionTime?: number;
			minSuccessRate?: number;
			maxErrorRate?: number;
		} = {}
	): Promise<{
		status: 'healthy' | 'warning' | 'critical';
		alerts: Array<{
			type: string;
			severity: 'warning' | 'critical';
			message: string;
			value: number;
			threshold: number;
		}>;
		recommendations: string[];
	}> {
		const recentMetrics = this.getRecentMetrics(workflowId, 24); // Last 24 hours
		const alerts = [];
		let status: 'healthy' | 'warning' | 'critical' = 'healthy';

		// Default thresholds
		const defaultThresholds = {
			maxExecutionTime: 30000, // 30 seconds
			minSuccessRate: 0.95, // 95%
			maxErrorRate: 0.05 // 5%
		};
		const finalThresholds = { ...defaultThresholds, ...thresholds };

		if (recentMetrics.length > 0) {
			// Check execution time
			const avgExecutionTime = recentMetrics.reduce((sum, m) => sum + m.executionTime, 0) / recentMetrics.length;
			if (avgExecutionTime > finalThresholds.maxExecutionTime) {
				const severity = avgExecutionTime > finalThresholds.maxExecutionTime * 2 ? 'critical' : 'warning';
				alerts.push({
					type: 'execution_time',
					severity,
					message: 'Average execution time exceeds threshold',
					value: avgExecutionTime,
					threshold: finalThresholds.maxExecutionTime
				});
				if (severity === 'critical') status = 'critical';
				else if (status === 'healthy') status = 'warning';
			}

			// Check success rate
			const avgSuccessRate = recentMetrics.reduce((sum, m) => sum + m.successRate, 0) / recentMetrics.length;
			if (avgSuccessRate < finalThresholds.minSuccessRate) {
				const severity = avgSuccessRate < 0.5 ? 'critical' : 'warning';
				alerts.push({
					type: 'success_rate',
					severity,
					message: 'Success rate below threshold',
					value: avgSuccessRate,
					threshold: finalThresholds.minSuccessRate
				});
				if (severity === 'critical') status = 'critical';
				else if (status === 'healthy') status = 'warning';
			}
		}

		// Generate recommendations based on alerts
		const recommendations = alerts.map(alert => {
			switch (alert.type) {
				case 'execution_time':
					return 'Consider optimizing workflow performance or scaling resources';
				case 'success_rate':
					return 'Review error logs and improve error handling';
				default:
					return 'Monitor workflow closely and consider intervention';
			}
		});

		return { status, alerts, recommendations };
	}

	private initializeBenchmarkData(): void {
		// Initialize performance benchmarks for different node types
		this.benchmarkData.set('HTTP Request', 2000);
		this.benchmarkData.set('Code', 500);
		this.benchmarkData.set('Set', 100);
		this.benchmarkData.set('If', 50);
		this.benchmarkData.set('Switch', 75);
		this.benchmarkData.set('Merge', 200);
		this.benchmarkData.set('OpenAI', 3000);
		this.benchmarkData.set('Anthropic', 2500);
		this.benchmarkData.set('Database', 1500);
	}

	private initializePredictionModels(): void {
		// Initialize ML models for performance prediction
		// This would typically load pre-trained models
		this.predictionModels.set('execution_time', {
			type: 'linear_regression',
			coefficients: { nodeCount: 500, connectionCount: 200, complexity: 1000 }
		});
	}

	private analyzeWorkflowStructure(workflowData: { nodes: any[]; connections: any }): {
		complexity: number;
		parallelPaths: number;
		longestPath: number;
		cycles: boolean;
		fanOutFactor: number;
	} {
		const nodeCount = workflowData.nodes.length;
		const connectionCount = Object.keys(workflowData.connections || {}).length;
		
		return {
			complexity: nodeCount + connectionCount * 0.5,
			parallelPaths: Math.min(Math.floor(nodeCount / 3), 4),
			longestPath: Math.ceil(nodeCount * 0.6),
			cycles: false, // Simplified - would need actual cycle detection
			fanOutFactor: connectionCount / Math.max(nodeCount - 1, 1)
		};
	}

	private isDataProcessingNode(nodeType: string): boolean {
		const dataProcessingTypes = ['Code', 'Set', 'HTTP Request', 'Database', 'OpenAI', 'Anthropic'];
		return dataProcessingTypes.includes(nodeType);
	}

	private getBottleneckReason(nodeType: string, predictedTime: number): string {
		if (nodeType.includes('AI') || nodeType.includes('OpenAI') || nodeType.includes('Anthropic')) {
			return 'AI model inference can be slow, especially for complex prompts';
		}
		if (nodeType === 'HTTP Request') {
			return 'External API calls may have high latency or rate limits';
		}
		if (nodeType === 'Database') {
			return 'Database queries may be slow due to large datasets or complex operations';
		}
		return `${nodeType} operations may be resource-intensive`;
	}

	private calculateParallelizationFactor(workflowData: { nodes: any[]; connections: any }): number {
		// Simplified parallelization analysis
		const nodeCount = workflowData.nodes.length;
		if (nodeCount <= 3) return 1.0;
		
		// Assume some parallelization is possible
		const parallelNodes = Math.floor(nodeCount * 0.3);
		return 1 - (parallelNodes / nodeCount) * 0.5; // Up to 50% time reduction
	}

	private calculatePredictionConfidence(workflowData: { nodes: any[]; connections: any }): number {
		// Base confidence on known node types
		const knownTypes = workflowData.nodes.filter(node => 
			this.benchmarkData.has(node.type)
		).length;
		
		return Math.min(knownTypes / workflowData.nodes.length + 0.3, 0.95);
	}

	private calculateScalabilityScore(structureAnalysis: any): number {
		let score = 100;
		
		// Reduce score for high complexity
		if (structureAnalysis.complexity > 20) score -= 20;
		
		// Increase score for parallel paths
		score += Math.min(structureAnalysis.parallelPaths * 5, 20);
		
		// Reduce score for cycles
		if (structureAnalysis.cycles) score -= 30;
		
		return Math.max(Math.min(score, 100), 0) / 100;
	}

	private generatePerformanceRecommendations(
		structureAnalysis: any,
		bottleneckNodes: any[],
		scalabilityScore: number
	): string[] {
		const recommendations: string[] = [];
		
		if (bottleneckNodes.length > 0) {
			recommendations.push('Optimize or replace slow-performing nodes');
			recommendations.push('Consider caching results for repeated operations');
		}
		
		if (structureAnalysis.parallelPaths < 2 && structureAnalysis.complexity > 10) {
			recommendations.push('Identify opportunities for parallel execution');
		}
		
		if (scalabilityScore < 0.7) {
			recommendations.push('Simplify workflow structure for better scalability');
		}
		
		recommendations.push('Monitor execution patterns and adjust based on usage');
		
		return recommendations;
	}

	private generateStructuralOptimizations(workflowData: { nodes: any[]; connections: any }): OptimizationSuggestion[] {
		const suggestions: OptimizationSuggestion[] = [];
		
		// Check for sequential operations that could be parallelized
		if (workflowData.nodes.length > 5) {
			suggestions.push({
				type: 'performance',
				priority: 'medium',
				title: 'Parallelize Independent Operations',
				description: 'Some operations appear to be sequential but could run in parallel.',
				expectedImpact: { performance: 30, cost: 0, reliability: 0 },
				implementation: {
					difficulty: 'medium',
					estimatedTime: '2-3 hours',
					steps: [
						'Identify independent operations',
						'Restructure workflow to enable parallel execution',
						'Test performance improvements'
					]
				},
				metrics: ['execution_time', 'throughput']
			});
		}
		
		return suggestions;
	}

	private generateCostOptimizations(metrics: WorkflowMetrics[]): OptimizationSuggestion[] {
		const suggestions: OptimizationSuggestion[] = [];
		
		if (metrics.length > 10) {
			// Analyze resource usage patterns
			const avgCpuUsage = metrics.reduce((sum, m) => sum + m.resourceUsage.cpu, 0) / metrics.length;
			
			if (avgCpuUsage < 0.3) { // Low CPU utilization
				suggestions.push({
					type: 'cost',
					priority: 'medium',
					title: 'Optimize Resource Allocation',
					description: 'Low CPU utilization suggests over-provisioned resources.',
					expectedImpact: { performance: 0, cost: 25, reliability: 0 },
					implementation: {
						difficulty: 'easy',
						estimatedTime: '30 minutes',
						steps: [
							'Review current resource allocations',
							'Scale down over-provisioned resources',
							'Monitor performance after changes'
						]
					},
					metrics: ['cost_per_execution', 'resource_utilization']
				});
			}
		}
		
		return suggestions;
	}

	private analyzePerformanceTrend(metrics: WorkflowMetrics[]): {
		trend: 'improving' | 'stable' | 'degrading';
		changePercent: number;
	} {
		if (metrics.length < 10) {
			return { trend: 'stable', changePercent: 0 };
		}
		
		const firstHalf = metrics.slice(0, Math.floor(metrics.length / 2));
		const secondHalf = metrics.slice(Math.floor(metrics.length / 2));
		
		const firstAvg = firstHalf.reduce((sum, m) => sum + m.executionTime, 0) / firstHalf.length;
		const secondAvg = secondHalf.reduce((sum, m) => sum + m.executionTime, 0) / secondHalf.length;
		
		const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;
		
		if (changePercent > 10) return { trend: 'degrading', changePercent };
		if (changePercent < -10) return { trend: 'improving', changePercent: Math.abs(changePercent) };
		return { trend: 'stable', changePercent: Math.abs(changePercent) };
	}

	private analyzeUsagePattern(metrics: WorkflowMetrics[]): {
		peakHours: string[];
		executionsPerHour: Record<string, number>;
	} {
		const hourlyExecutions: Record<string, number> = {};
		
		metrics.forEach(metric => {
			const hour = metric.timestamp.getHours().toString().padStart(2, '0');
			hourlyExecutions[hour] = (hourlyExecutions[hour] || 0) + 1;
		});
		
		const avgExecutions = Object.values(hourlyExecutions).reduce((sum, count) => sum + count, 0) / 24;
		const peakHours = Object.entries(hourlyExecutions)
			.filter(([_, count]) => count > avgExecutions * 1.5)
			.map(([hour]) => `${hour}:00`)
			.slice(0, 3);
		
		return { peakHours, executionsPerHour: hourlyExecutions };
	}

	private analyzeErrorPatterns(metrics: WorkflowMetrics[]): {
		criticalNodes: string[];
		errorsByNode: Record<string, number>;
	} {
		const nodeErrors: Record<string, number> = {};
		
		metrics.forEach(metric => {
			metric.nodeMetrics.forEach(node => {
				if (node.errorCount > 0) {
					nodeErrors[node.nodeId] = (nodeErrors[node.nodeId] || 0) + node.errorCount;
				}
			});
		});
		
		const avgErrors = Object.values(nodeErrors).reduce((sum, count) => sum + count, 0) / Object.keys(nodeErrors).length;
		const criticalNodes = Object.entries(nodeErrors)
			.filter(([_, count]) => count > avgErrors * 2)
			.map(([nodeId]) => nodeId);
		
		return { criticalNodes, errorsByNode: nodeErrors };
	}

	private analyzeResourceUtilization(metrics: WorkflowMetrics[]): WorkflowInsight[] {
		const insights: WorkflowInsight[] = [];
		
		if (metrics.length === 0) return insights;
		
		const avgCpu = metrics.reduce((sum, m) => sum + m.resourceUsage.cpu, 0) / metrics.length;
		const avgMemory = metrics.reduce((sum, m) => sum + m.resourceUsage.memory, 0) / metrics.length;
		
		if (avgCpu > 0.8) {
			insights.push({
				category: 'performance',
				severity: 'warning',
				title: 'High CPU Utilization',
				message: `Average CPU utilization is ${(avgCpu * 100).toFixed(1)}%.`,
				data: { cpu: avgCpu },
				actionable: true,
				suggestions: ['Consider scaling up resources', 'Optimize CPU-intensive operations']
			});
		}
		
		if (avgMemory > 0.8) {
			insights.push({
				category: 'performance',
				severity: 'warning',
				title: 'High Memory Usage',
				message: `Average memory usage is ${(avgMemory * 100).toFixed(1)}%.`,
				data: { memory: avgMemory },
				actionable: true,
				suggestions: ['Review memory-intensive operations', 'Consider increasing memory allocation']
			});
		}
		
		return insights;
	}

	private identifyOptimizationOpportunities(metrics: WorkflowMetrics[]): WorkflowInsight[] {
		const insights: WorkflowInsight[] = [];
		
		if (metrics.length > 50) {
			// Look for patterns that suggest optimization opportunities
			const executionTimes = metrics.map(m => m.executionTime);
			const variance = this.calculateVariance(executionTimes);
			
			if (variance > 1000000) { // High variance in execution times
				insights.push({
					category: 'optimization',
					severity: 'info',
					title: 'Inconsistent Performance',
					message: 'Execution times vary significantly, suggesting optimization opportunities.',
					data: { variance },
					actionable: true,
					suggestions: [
						'Identify and optimize variable-performance operations',
						'Consider caching for repeated computations',
						'Review resource allocation consistency'
					]
				});
			}
		}
		
		return insights;
	}

	private getRecentMetrics(workflowId: string, hours: number): WorkflowMetrics[] {
		const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
		const allMetrics = this.metricsStore.get(workflowId) || [];
		return allMetrics.filter(m => m.timestamp >= cutoff);
	}

	private calculateVariance(numbers: number[]): number {
		if (numbers.length === 0) return 0;
		
		const mean = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
		const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
		return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / numbers.length;
	}
}