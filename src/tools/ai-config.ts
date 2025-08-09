/**
 * Enhanced AI Node Configuration Tools
 * Advanced model comparison, benchmarking, and optimization for AI nodes
 */

import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import type { IDataObject, INodeTypeDescription } from 'n8n-workflow';

export interface ModelBenchmark {
	modelName: string;
	provider: string;
	averageLatency: number;
	tokensPerSecond: number;
	costPerToken: number;
	qualityScore: number;
	reliabilityScore: number;
	lastUpdated: Date;
}

export interface ModelComparison {
	useCase: string;
	recommendedModel: string;
	alternatives: Array<{
		model: string;
		reason: string;
		tradeoff: string;
	}>;
	costAnalysis: {
		cheapest: string;
		fastest: string;
		bestValue: string;
	};
}

export interface OptimizationSuggestion {
	type: 'cost' | 'performance' | 'quality' | 'reliability';
	currentConfig: IDataObject;
	suggestedConfig: IDataObject;
	expectedImprovement: string;
	impact: 'low' | 'medium' | 'high';
	effort: 'low' | 'medium' | 'high';
}

@Service()
export class AiConfigurationService {
	private modelBenchmarks: Map<string, ModelBenchmark> = new Map();
	private useCaseProfiles: Map<string, any> = new Map();

	constructor(private readonly logger: Logger) {
		this.initializeDefaultBenchmarks();
		this.initializeUseCaseProfiles();
	}

	/**
	 * Get comprehensive model comparison for a specific use case
	 */
	async compareModels(useCase: string, requirements: {
		maxLatency?: number;
		maxCostPerToken?: number;
		minQualityScore?: number;
		preferredProviders?: string[];
	}): Promise<ModelComparison> {
		this.logger.debug('Comparing models for use case', { useCase, requirements });

		const availableModels = Array.from(this.modelBenchmarks.values())
			.filter(model => this.meetsRequirements(model, requirements));

		// Sort by composite score (quality, cost, performance)
		const rankedModels = availableModels
			.map(model => ({
				...model,
				compositeScore: this.calculateCompositeScore(model, requirements)
			}))
			.sort((a, b) => b.compositeScore - a.compositeScore);

		const recommended = rankedModels[0];
		const alternatives = rankedModels.slice(1, 4).map(model => ({
			model: model.modelName,
			reason: this.getRecommendationReason(model, recommended),
			tradeoff: this.getTradeoffAnalysis(model, recommended)
		}));

		return {
			useCase,
			recommendedModel: recommended.modelName,
			alternatives,
			costAnalysis: {
				cheapest: this.findCheapestModel(rankedModels),
				fastest: this.findFastestModel(rankedModels),
				bestValue: this.findBestValueModel(rankedModels)
			}
		};
	}

	/**
	 * Benchmark AI model performance in real-time
	 */
	async benchmarkModel(
		modelName: string,
		provider: string,
		testPrompts: string[],
		iterations = 5
	): Promise<ModelBenchmark> {
		this.logger.debug('Benchmarking model', { modelName, provider, iterations });

		const results = {
			latencies: [] as number[],
			tokensPerSecond: [] as number[],
			qualityScores: [] as number[]
		};

		for (let i = 0; i < iterations; i++) {
			for (const prompt of testPrompts) {
				const startTime = Date.now();
				
				// TODO: Integrate with actual AI service to make real requests
				// const response = await this.aiService.chat({ prompt, model: modelName });
				// const endTime = Date.now();
				// const latency = endTime - startTime;
				
				// Mock benchmark data for now
				const latency = 800 + Math.random() * 400; // 800-1200ms
				const tokensPerSec = 20 + Math.random() * 30; // 20-50 tokens/sec
				const qualityScore = 0.7 + Math.random() * 0.3; // 0.7-1.0

				results.latencies.push(latency);
				results.tokensPerSecond.push(tokensPerSec);
				results.qualityScores.push(qualityScore);
			}
		}

		const benchmark: ModelBenchmark = {
			modelName,
			provider,
			averageLatency: results.latencies.reduce((a, b) => a + b, 0) / results.latencies.length,
			tokensPerSecond: results.tokensPerSecond.reduce((a, b) => a + b, 0) / results.tokensPerSecond.length,
			costPerToken: this.getModelCostPerToken(modelName, provider),
			qualityScore: results.qualityScores.reduce((a, b) => a + b, 0) / results.qualityScores.length,
			reliabilityScore: this.calculateReliabilityScore(results),
			lastUpdated: new Date()
		};

		this.modelBenchmarks.set(`${provider}:${modelName}`, benchmark);
		return benchmark;
	}

	/**
	 * Generate optimization suggestions for AI node configuration
	 */
	async generateOptimizationSuggestions(
		nodeConfig: IDataObject,
		nodeType: INodeTypeDescription,
		executionHistory?: Array<{
			duration: number;
			cost: number;
			success: boolean;
			timestamp: Date;
		}>
	): Promise<OptimizationSuggestion[]> {
		this.logger.debug('Generating optimization suggestions', { nodeType: nodeType.name });

		const suggestions: OptimizationSuggestion[] = [];

		// Analyze current model performance
		const currentModel = nodeConfig.model as string;
		const currentBenchmark = this.modelBenchmarks.get(currentModel);

		if (currentBenchmark && executionHistory) {
			// Cost optimization
			if (this.shouldSuggestCostOptimization(executionHistory, currentBenchmark)) {
				const cheaperModel = this.findAlternativeModel(currentModel, 'cost');
				if (cheaperModel) {
					suggestions.push({
						type: 'cost',
						currentConfig: nodeConfig,
						suggestedConfig: { ...nodeConfig, model: cheaperModel.modelName },
						expectedImprovement: `Reduce costs by ${this.calculateCostSavings(currentBenchmark, cheaperModel)}%`,
						impact: 'medium',
						effort: 'low'
					});
				}
			}

			// Performance optimization
			if (this.shouldSuggestPerformanceOptimization(executionHistory, currentBenchmark)) {
				const fasterModel = this.findAlternativeModel(currentModel, 'performance');
				if (fasterModel) {
					suggestions.push({
						type: 'performance',
						currentConfig: nodeConfig,
						suggestedConfig: { ...nodeConfig, model: fasterModel.modelName },
						expectedImprovement: `Improve response time by ${this.calculateSpeedImprovement(currentBenchmark, fasterModel)}%`,
						impact: 'high',
						effort: 'low'
					});
				}
			}
		}

		// Parameter optimization
		const paramOptimizations = this.analyzeParameterOptimizations(nodeConfig, executionHistory);
		suggestions.push(...paramOptimizations);

		return suggestions;
	}

	/**
	 * Get real-time model performance monitoring data
	 */
	async getModelPerformanceMetrics(modelName: string, timeRange: {
		start: Date;
		end: Date;
	}): Promise<{
		averageLatency: number;
		successRate: number;
		costEfficiency: number;
		qualityTrend: Array<{ timestamp: Date; score: number }>;
		errorRate: number;
		recommendedActions: string[];
	}> {
		// TODO: Implement real-time metrics collection from execution data
		// This would typically query execution logs and aggregate performance data
		
		return {
			averageLatency: 850,
			successRate: 0.98,
			costEfficiency: 0.82,
			qualityTrend: [
				{ timestamp: new Date(), score: 0.85 }
			],
			errorRate: 0.02,
			recommendedActions: [
				'Consider switching to gpt-4o-mini for cost optimization',
				'Enable response caching for repeated queries'
			]
		};
	}

	/**
	 * Automatic model selection based on workload patterns
	 */
	async selectOptimalModel(workloadProfile: {
		averagePromptLength: number;
		expectedResponseLength: number;
		frequencyPerDay: number;
		latencyRequirement: number;
		budgetConstraint: number;
		qualityRequirement: number;
	}): Promise<{
		primaryModel: string;
		fallbackModel: string;
		reasoning: string;
		estimatedMonthlyCost: number;
	}> {
		const candidates = Array.from(this.modelBenchmarks.values());
		
		// Score each model based on workload profile
		const scoredModels = candidates.map(model => ({
			...model,
			workloadScore: this.calculateWorkloadScore(model, workloadProfile)
		})).sort((a, b) => b.workloadScore - a.workloadScore);

		const primary = scoredModels[0];
		const fallback = scoredModels[1];

		const estimatedTokensPerRequest = workloadProfile.averagePromptLength + workloadProfile.expectedResponseLength;
		const monthlyRequests = workloadProfile.frequencyPerDay * 30;
		const estimatedMonthlyCost = (estimatedTokensPerRequest * monthlyRequests * primary.costPerToken);

		return {
			primaryModel: primary.modelName,
			fallbackModel: fallback.modelName,
			reasoning: `Selected ${primary.modelName} for optimal balance of performance and cost. Average latency: ${primary.averageLatency}ms, Quality score: ${primary.qualityScore.toFixed(2)}`,
			estimatedMonthlyCost
		};
	}

	private initializeDefaultBenchmarks(): void {
		// Initialize with default benchmark data for common models
		const defaultBenchmarks: ModelBenchmark[] = [
			{
				modelName: 'gpt-4o',
				provider: 'openai',
				averageLatency: 1200,
				tokensPerSecond: 25,
				costPerToken: 0.000015,
				qualityScore: 0.95,
				reliabilityScore: 0.98,
				lastUpdated: new Date()
			},
			{
				modelName: 'gpt-4o-mini',
				provider: 'openai',
				averageLatency: 800,
				tokensPerSecond: 40,
				costPerToken: 0.000005,
				qualityScore: 0.88,
				reliabilityScore: 0.97,
				lastUpdated: new Date()
			},
			{
				modelName: 'claude-3-5-sonnet-20241022',
				provider: 'anthropic',
				averageLatency: 1000,
				tokensPerSecond: 30,
				costPerToken: 0.000012,
				qualityScore: 0.93,
				reliabilityScore: 0.96,
				lastUpdated: new Date()
			}
		];

		defaultBenchmarks.forEach(benchmark => {
			this.modelBenchmarks.set(`${benchmark.provider}:${benchmark.modelName}`, benchmark);
		});
	}

	private initializeUseCaseProfiles(): void {
		// Define optimization profiles for different use cases
		this.useCaseProfiles.set('content-generation', {
			prioritizeQuality: true,
			acceptableLatency: 2000,
			costSensitivity: 'medium'
		});

		this.useCaseProfiles.set('data-analysis', {
			prioritizeAccuracy: true,
			acceptableLatency: 3000,
			costSensitivity: 'low'
		});

		this.useCaseProfiles.set('chat-support', {
			prioritizeSpeed: true,
			acceptableLatency: 1000,
			costSensitivity: 'high'
		});
	}

	private meetsRequirements(model: ModelBenchmark, requirements: any): boolean {
		if (requirements.maxLatency && model.averageLatency > requirements.maxLatency) return false;
		if (requirements.maxCostPerToken && model.costPerToken > requirements.maxCostPerToken) return false;
		if (requirements.minQualityScore && model.qualityScore < requirements.minQualityScore) return false;
		if (requirements.preferredProviders && !requirements.preferredProviders.includes(model.provider)) return false;
		return true;
	}

	private calculateCompositeScore(model: ModelBenchmark, requirements: any): number {
		// Weighted scoring based on requirements
		let score = 0;
		score += model.qualityScore * 0.4; // 40% quality
		score += (1000 / model.averageLatency) * 0.3; // 30% speed (inverse of latency)
		score += (0.00001 / model.costPerToken) * 0.2; // 20% cost (inverse of cost)
		score += model.reliabilityScore * 0.1; // 10% reliability
		return score;
	}

	private getRecommendationReason(model: ModelBenchmark, recommended: ModelBenchmark): string {
		if (model.costPerToken < recommended.costPerToken * 0.8) {
			return 'More cost-effective option';
		}
		if (model.averageLatency < recommended.averageLatency * 0.8) {
			return 'Faster response time';
		}
		if (model.qualityScore > recommended.qualityScore) {
			return 'Higher quality outputs';
		}
		return 'Alternative with different trade-offs';
	}

	private getTradeoffAnalysis(model: ModelBenchmark, recommended: ModelBenchmark): string {
		const costDiff = ((model.costPerToken - recommended.costPerToken) / recommended.costPerToken * 100).toFixed(1);
		const latencyDiff = ((model.averageLatency - recommended.averageLatency) / recommended.averageLatency * 100).toFixed(1);
		const qualityDiff = ((model.qualityScore - recommended.qualityScore) / recommended.qualityScore * 100).toFixed(1);

		return `Cost: ${costDiff}%, Latency: ${latencyDiff}%, Quality: ${qualityDiff}%`;
	}

	private findCheapestModel(models: ModelBenchmark[]): string {
		return models.reduce((cheapest, model) => 
			model.costPerToken < cheapest.costPerToken ? model : cheapest
		).modelName;
	}

	private findFastestModel(models: ModelBenchmark[]): string {
		return models.reduce((fastest, model) => 
			model.averageLatency < fastest.averageLatency ? model : fastest
		).modelName;
	}

	private findBestValueModel(models: ModelBenchmark[]): string {
		return models.reduce((bestValue, model) => {
			const valueScore = model.qualityScore / (model.costPerToken * 1000 + model.averageLatency);
			const bestValueScore = bestValue.qualityScore / (bestValue.costPerToken * 1000 + bestValue.averageLatency);
			return valueScore > bestValueScore ? model : bestValue;
		}).modelName;
	}

	private getModelCostPerToken(modelName: string, provider: string): number {
		// Default cost mapping - would typically be dynamically fetched
		const costs: Record<string, number> = {
			'gpt-4o': 0.000015,
			'gpt-4o-mini': 0.000005,
			'claude-3-5-sonnet-20241022': 0.000012,
			'claude-3-haiku-20240307': 0.000008
		};
		return costs[modelName] || 0.00001;
	}

	private calculateReliabilityScore(results: any): number {
		// Calculate based on response consistency and error rates
		return 0.95 + Math.random() * 0.05; // Placeholder implementation
	}

	private shouldSuggestCostOptimization(history: any[], benchmark: ModelBenchmark): boolean {
		// Analyze if cost optimization would be beneficial
		const totalCost = history.reduce((sum, execution) => sum + execution.cost, 0);
		const avgCost = totalCost / history.length;
		return avgCost > benchmark.costPerToken * 1000; // Arbitrary threshold
	}

	private shouldSuggestPerformanceOptimization(history: any[], benchmark: ModelBenchmark): boolean {
		// Analyze if performance optimization would be beneficial
		const avgDuration = history.reduce((sum, execution) => sum + execution.duration, 0) / history.length;
		return avgDuration > benchmark.averageLatency * 1.5;
	}

	private findAlternativeModel(currentModel: string, optimizationType: 'cost' | 'performance'): ModelBenchmark | null {
		const alternatives = Array.from(this.modelBenchmarks.values())
			.filter(model => model.modelName !== currentModel);

		if (optimizationType === 'cost') {
			return alternatives.reduce((cheapest, model) => 
				!cheapest || model.costPerToken < cheapest.costPerToken ? model : cheapest
			, null as ModelBenchmark | null);
		} else {
			return alternatives.reduce((fastest, model) => 
				!fastest || model.averageLatency < fastest.averageLatency ? model : fastest
			, null as ModelBenchmark | null);
		}
	}

	private calculateCostSavings(current: ModelBenchmark, alternative: ModelBenchmark): number {
		return Math.round(((current.costPerToken - alternative.costPerToken) / current.costPerToken) * 100);
	}

	private calculateSpeedImprovement(current: ModelBenchmark, alternative: ModelBenchmark): number {
		return Math.round(((current.averageLatency - alternative.averageLatency) / current.averageLatency) * 100);
	}

	private analyzeParameterOptimizations(config: IDataObject, history?: any[]): OptimizationSuggestion[] {
		const suggestions: OptimizationSuggestion[] = [];

		// Analyze temperature settings
		if (config.temperature && typeof config.temperature === 'number') {
			if (config.temperature > 0.8 && history?.some(h => !h.success)) {
				suggestions.push({
					type: 'quality',
					currentConfig: config,
					suggestedConfig: { ...config, temperature: 0.7 },
					expectedImprovement: 'More consistent and reliable responses',
					impact: 'medium',
					effort: 'low'
				});
			}
		}

		// Analyze max tokens settings
		if (config.maxTokens && typeof config.maxTokens === 'number') {
			const avgHistoryDuration = history?.reduce((sum, h) => sum + h.duration, 0) / (history?.length || 1);
			if (config.maxTokens > 2000 && avgHistoryDuration > 3000) {
				suggestions.push({
					type: 'performance',
					currentConfig: config,
					suggestedConfig: { ...config, maxTokens: 1500 },
					expectedImprovement: 'Reduce response time by limiting output length',
					impact: 'medium',
					effort: 'low'
				});
			}
		}

		return suggestions;
	}

	private calculateWorkloadScore(model: ModelBenchmark, profile: any): number {
		let score = 0;
		
		// Latency scoring
		const latencyScore = profile.latencyRequirement / model.averageLatency;
		score += latencyScore * 0.3;

		// Cost scoring
		const dailyCost = profile.frequencyPerDay * model.costPerToken * (profile.averagePromptLength + profile.expectedResponseLength);
		const costScore = profile.budgetConstraint / (dailyCost * 30); // Monthly cost
		score += Math.min(costScore, 1) * 0.3;

		// Quality scoring
		const qualityScore = model.qualityScore / profile.qualityRequirement;
		score += Math.min(qualityScore, 1) * 0.4;

		return score;
	}
}