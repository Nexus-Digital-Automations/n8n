/**
 * Enhanced AI Node Testing Environment
 * Advanced prompt testing, A/B testing, and quality assurance for AI nodes
 */

import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import type { IDataObject, IUser } from 'n8n-workflow';
import { v4 as uuid } from 'uuid';

export interface PromptTestCase {
	id: string;
	name: string;
	prompt: string;
	expectedOutcome: string;
	context?: IDataObject;
	variables?: IDataObject;
	tags: string[];
	createdAt: Date;
	createdBy: string;
}

export interface TestResult {
	testCaseId: string;
	executionId: string;
	model: string;
	response: string;
	latency: number;
	tokensUsed: number;
	cost: number;
	qualityScore: number;
	success: boolean;
	timestamp: Date;
	metadata?: IDataObject;
}

export interface ABTestConfiguration {
	id: string;
	name: string;
	description: string;
	variants: Array<{
		name: string;
		configuration: IDataObject;
		trafficPercentage: number;
	}>;
	metrics: string[];
	duration: number;
	status: 'draft' | 'active' | 'completed' | 'paused';
	createdAt: Date;
}

export interface QualityMetrics {
	relevance: number;
	coherence: number;
	accuracy: number;
	completeness: number;
	safety: number;
	overall: number;
}

@Service()
export class AiTestingService {
	private testCases: Map<string, PromptTestCase> = new Map();
	private testResults: Map<string, TestResult[]> = new Map();
	private abTests: Map<string, ABTestConfiguration> = new Map();

	constructor(private readonly logger: Logger) {
		this.initializeDefaultTestCases();
	}

	/**
	 * Create and execute comprehensive prompt test suite
	 */
	async createPromptTestSuite(
		nodeType: string,
		basePrompt: string,
		variations: Array<{
			name: string;
			modifications: IDataObject;
		}>,
		testData: IDataObject[],
		user: IUser
	): Promise<{
		suiteId: string;
		testCases: PromptTestCase[];
		executionPlan: Array<{
			testCaseId: string;
			model: string;
			estimatedDuration: number;
		}>;
	}> {
		const suiteId = uuid();
		const testCases: PromptTestCase[] = [];

		this.logger.debug('Creating prompt test suite', { 
			nodeType, 
			suiteId, 
			variations: variations.length,
			testDataSize: testData.length 
		});

		// Create test cases for each variation
		for (const variation of variations) {
			const testCase: PromptTestCase = {
				id: uuid(),
				name: `${nodeType} - ${variation.name}`,
				prompt: this.applyPromptModifications(basePrompt, variation.modifications),
				expectedOutcome: this.generateExpectedOutcome(variation.modifications),
				context: { nodeType, suiteId },
				variables: variation.modifications,
				tags: [nodeType, 'automated', variation.name],
				createdAt: new Date(),
				createdBy: user.id
			};

			testCases.push(testCase);
			this.testCases.set(testCase.id, testCase);
		}

		// Generate execution plan with optimal model selection
		const executionPlan = testCases.map(testCase => ({
			testCaseId: testCase.id,
			model: this.selectOptimalTestModel(testCase),
			estimatedDuration: this.estimateTestDuration(testCase)
		}));

		return {
			suiteId,
			testCases,
			executionPlan
		};
	}

	/**
	 * Execute prompt test with detailed analysis
	 */
	async executePromptTest(
		testCaseId: string,
		model: string,
		configuration: IDataObject = {}
	): Promise<TestResult> {
		const testCase = this.testCases.get(testCaseId);
		if (!testCase) {
			throw new Error(`Test case ${testCaseId} not found`);
		}

		this.logger.debug('Executing prompt test', { testCaseId, model });

		const startTime = Date.now();
		
		// TODO: Integrate with actual AI service
		// const aiResponse = await this.aiService.chat({
		//     prompt: testCase.prompt,
		//     model,
		//     ...configuration
		// });
		
		// Mock execution for now
		const mockResponse = this.generateMockResponse(testCase, model);
		const endTime = Date.now();

		const result: TestResult = {
			testCaseId,
			executionId: uuid(),
			model,
			response: mockResponse.text,
			latency: endTime - startTime,
			tokensUsed: mockResponse.tokensUsed,
			cost: mockResponse.cost,
			qualityScore: await this.calculateQualityScore(testCase, mockResponse.text),
			success: mockResponse.success,
			timestamp: new Date(),
			metadata: {
				configuration,
				promptLength: testCase.prompt.length,
				responseLength: mockResponse.text.length
			}
		};

		// Store result
		if (!this.testResults.has(testCaseId)) {
			this.testResults.set(testCaseId, []);
		}
		this.testResults.get(testCaseId)!.push(result);

		return result;
	}

	/**
	 * Set up A/B test for model or configuration comparison
	 */
	async setupABTest(
		name: string,
		description: string,
		variants: Array<{
			name: string;
			configuration: IDataObject;
			trafficPercentage: number;
		}>,
		metrics: string[],
		durationHours: number
	): Promise<ABTestConfiguration> {
		// Validate traffic percentages sum to 100
		const totalTraffic = variants.reduce((sum, variant) => sum + variant.trafficPercentage, 0);
		if (Math.abs(totalTraffic - 100) > 0.01) {
			throw new Error('Traffic percentages must sum to 100%');
		}

		const abTest: ABTestConfiguration = {
			id: uuid(),
			name,
			description,
			variants,
			metrics,
			duration: durationHours,
			status: 'draft',
			createdAt: new Date()
		};

		this.abTests.set(abTest.id, abTest);

		this.logger.debug('A/B test configured', {
			testId: abTest.id,
			variants: variants.length,
			duration: durationHours
		});

		return abTest;
	}

	/**
	 * Execute A/B test variant selection
	 */
	async selectABTestVariant(abTestId: string): Promise<{
		variantName: string;
		configuration: IDataObject;
	}> {
		const abTest = this.abTests.get(abTestId);
		if (!abTest || abTest.status !== 'active') {
			throw new Error(`A/B test ${abTestId} not found or not active`);
		}

		// Weighted random selection based on traffic percentages
		const random = Math.random() * 100;
		let cumulativePercentage = 0;

		for (const variant of abTest.variants) {
			cumulativePercentage += variant.trafficPercentage;
			if (random <= cumulativePercentage) {
				return {
					variantName: variant.name,
					configuration: variant.configuration
				};
			}
		}

		// Fallback to first variant
		return {
			variantName: abTest.variants[0].name,
			configuration: abTest.variants[0].configuration
		};
	}

	/**
	 * Generate comprehensive test report with insights
	 */
	async generateTestReport(
		testCaseIds: string[],
		includeComparisons = true
	): Promise<{
		summary: {
			totalTests: number;
			successRate: number;
			averageLatency: number;
			totalCost: number;
			averageQuality: number;
		};
		results: TestResult[];
		insights: string[];
		recommendations: string[];
		modelComparison?: Array<{
			model: string;
			averageLatency: number;
			averageQuality: number;
			successRate: number;
			costEfficiency: number;
		}>;
	}> {
		const allResults: TestResult[] = [];
		
		for (const testCaseId of testCaseIds) {
			const results = this.testResults.get(testCaseId) || [];
			allResults.push(...results);
		}

		const summary = {
			totalTests: allResults.length,
			successRate: allResults.filter(r => r.success).length / allResults.length,
			averageLatency: allResults.reduce((sum, r) => sum + r.latency, 0) / allResults.length,
			totalCost: allResults.reduce((sum, r) => sum + r.cost, 0),
			averageQuality: allResults.reduce((sum, r) => sum + r.qualityScore, 0) / allResults.length
		};

		const insights = this.generateTestInsights(allResults);
		const recommendations = this.generateRecommendations(allResults);
		
		let modelComparison;
		if (includeComparisons) {
			modelComparison = this.generateModelComparison(allResults);
		}

		return {
			summary,
			results: allResults,
			insights,
			recommendations,
			modelComparison
		};
	}

	/**
	 * Quality assessment with detailed metrics
	 */
	async assessResponseQuality(
		prompt: string,
		response: string,
		expectedOutcome?: string
	): Promise<QualityMetrics> {
		this.logger.debug('Assessing response quality', { 
			promptLength: prompt.length, 
			responseLength: response.length 
		});

		// TODO: Implement actual quality assessment using AI or rule-based approaches
		// For now, return mock scores based on heuristics
		
		const relevance = this.assessRelevance(prompt, response);
		const coherence = this.assessCoherence(response);
		const accuracy = expectedOutcome ? this.assessAccuracy(response, expectedOutcome) : 0.8;
		const completeness = this.assessCompleteness(prompt, response);
		const safety = this.assessSafety(response);

		const overall = (relevance + coherence + accuracy + completeness + safety) / 5;

		return {
			relevance,
			coherence,
			accuracy,
			completeness,
			safety,
			overall
		};
	}

	/**
	 * Automated regression testing for AI node changes
	 */
	async runRegressionTests(
		nodeType: string,
		baselineResults: TestResult[],
		newConfiguration: IDataObject
	): Promise<{
		regressionDetected: boolean;
		significantChanges: Array<{
			metric: string;
			baselineValue: number;
			newValue: number;
			percentageChange: number;
			severity: 'low' | 'medium' | 'high';
		}>;
		recommendation: string;
	}> {
		this.logger.debug('Running regression tests', { 
			nodeType, 
			baselineCount: baselineResults.length 
		});

		// Execute tests with new configuration
		const newResults: TestResult[] = [];
		for (const baselineResult of baselineResults.slice(0, 10)) { // Limit for demo
			const testCase = this.testCases.get(baselineResult.testCaseId);
			if (testCase) {
				const newResult = await this.executePromptTest(
					testCase.id,
					baselineResult.model,
					newConfiguration
				);
				newResults.push(newResult);
			}
		}

		// Compare metrics
		const significantChanges = [];
		const thresholds = {
			latency: 0.2, // 20% change threshold
			qualityScore: 0.1, // 10% change threshold
			cost: 0.15 // 15% change threshold
		};

		// Latency comparison
		const baselineLatency = baselineResults.reduce((sum, r) => sum + r.latency, 0) / baselineResults.length;
		const newLatency = newResults.reduce((sum, r) => sum + r.latency, 0) / newResults.length;
		const latencyChange = (newLatency - baselineLatency) / baselineLatency;

		if (Math.abs(latencyChange) > thresholds.latency) {
			significantChanges.push({
				metric: 'latency',
				baselineValue: baselineLatency,
				newValue: newLatency,
				percentageChange: latencyChange * 100,
				severity: Math.abs(latencyChange) > 0.5 ? 'high' : 'medium'
			});
		}

		// Quality comparison
		const baselineQuality = baselineResults.reduce((sum, r) => sum + r.qualityScore, 0) / baselineResults.length;
		const newQuality = newResults.reduce((sum, r) => sum + r.qualityScore, 0) / newResults.length;
		const qualityChange = (newQuality - baselineQuality) / baselineQuality;

		if (Math.abs(qualityChange) > thresholds.qualityScore) {
			significantChanges.push({
				metric: 'qualityScore',
				baselineValue: baselineQuality,
				newValue: newQuality,
				percentageChange: qualityChange * 100,
				severity: qualityChange < -0.2 ? 'high' : qualityChange < -0.1 ? 'medium' : 'low'
			});
		}

		const regressionDetected = significantChanges.some(change => 
			(change.metric === 'latency' && change.percentageChange > 0) ||
			(change.metric === 'qualityScore' && change.percentageChange < 0) ||
			(change.metric === 'cost' && change.percentageChange > 0)
		);

		let recommendation = 'No significant regressions detected.';
		if (regressionDetected) {
			recommendation = 'Regression detected. Review configuration changes and consider rollback.';
		} else if (significantChanges.length > 0) {
			recommendation = 'Performance improvements detected. Consider deploying changes.';
		}

		return {
			regressionDetected,
			significantChanges,
			recommendation
		};
	}

	private initializeDefaultTestCases(): void {
		// Initialize with common test cases for different AI node types
		const defaultCases = [
			{
				name: 'Basic Text Generation',
				prompt: 'Generate a professional email response',
				expectedOutcome: 'Professional, clear, and contextually appropriate email',
				tags: ['text-generation', 'email', 'professional']
			},
			{
				name: 'Data Extraction',
				prompt: 'Extract key information from the following text',
				expectedOutcome: 'Structured data with key-value pairs',
				tags: ['data-extraction', 'structured-output']
			},
			{
				name: 'Sentiment Analysis',
				prompt: 'Analyze the sentiment of this customer feedback',
				expectedOutcome: 'Sentiment classification with confidence score',
				tags: ['sentiment-analysis', 'classification']
			}
		];

		defaultCases.forEach(testCase => {
			const id = uuid();
			this.testCases.set(id, {
				id,
				name: testCase.name,
				prompt: testCase.prompt,
				expectedOutcome: testCase.expectedOutcome,
				tags: testCase.tags,
				createdAt: new Date(),
				createdBy: 'system'
			});
		});
	}

	private applyPromptModifications(basePrompt: string, modifications: IDataObject): string {
		let modifiedPrompt = basePrompt;
		
		if (modifications.prefix) {
			modifiedPrompt = `${modifications.prefix}\n${modifiedPrompt}`;
		}
		
		if (modifications.suffix) {
			modifiedPrompt = `${modifiedPrompt}\n${modifications.suffix}`;
		}
		
		if (modifications.replacements && typeof modifications.replacements === 'object') {
			const replacements = modifications.replacements as Record<string, string>;
			for (const [find, replace] of Object.entries(replacements)) {
				modifiedPrompt = modifiedPrompt.replace(new RegExp(find, 'g'), replace);
			}
		}
		
		return modifiedPrompt;
	}

	private generateExpectedOutcome(modifications: IDataObject): string {
		// Generate expected outcome based on modifications
		if (modifications.expectation) {
			return modifications.expectation as string;
		}
		return 'High-quality response meeting the prompt requirements';
	}

	private selectOptimalTestModel(testCase: PromptTestCase): string {
		// Select model based on test case characteristics
		if (testCase.tags.includes('fast')) return 'gpt-4o-mini';
		if (testCase.tags.includes('high-quality')) return 'gpt-4o';
		return 'gpt-4o-mini'; // Default to cost-effective option
	}

	private estimateTestDuration(testCase: PromptTestCase): number {
		// Estimate test duration based on prompt complexity
		const baseTime = 2000; // 2 seconds base
		const promptFactor = Math.min(testCase.prompt.length / 1000, 3); // Max 3x multiplier
		return baseTime * (1 + promptFactor);
	}

	private generateMockResponse(testCase: PromptTestCase, model: string): {
		text: string;
		tokensUsed: number;
		cost: number;
		success: boolean;
	} {
		// Generate realistic mock response for testing
		const responses = [
			'This is a comprehensive response addressing the key points in your prompt.',
			'Based on the provided information, here are the main insights and recommendations.',
			'The analysis reveals several important patterns and actionable next steps.'
		];

		const text = responses[Math.floor(Math.random() * responses.length)];
		const tokensUsed = Math.floor(text.length / 4) + Math.floor(testCase.prompt.length / 4);
		const modelCosts: Record<string, number> = {
			'gpt-4o': 0.000015,
			'gpt-4o-mini': 0.000005,
			'claude-3-5-sonnet-20241022': 0.000012
		};
		const cost = tokensUsed * (modelCosts[model] || 0.00001);

		return {
			text,
			tokensUsed,
			cost,
			success: Math.random() > 0.05 // 95% success rate
		};
	}

	private async calculateQualityScore(testCase: PromptTestCase, response: string): Promise<number> {
		const metrics = await this.assessResponseQuality(testCase.prompt, response, testCase.expectedOutcome);
		return metrics.overall;
	}

	private generateTestInsights(results: TestResult[]): string[] {
		const insights: string[] = [];
		
		if (results.length === 0) return insights;

		// Performance insights
		const avgLatency = results.reduce((sum, r) => sum + r.latency, 0) / results.length;
		if (avgLatency > 2000) {
			insights.push('High average latency detected. Consider optimizing prompts or switching to faster models.');
		}

		// Quality insights
		const avgQuality = results.reduce((sum, r) => sum + r.qualityScore, 0) / results.length;
		if (avgQuality < 0.8) {
			insights.push('Quality scores below optimal range. Review prompt engineering and model selection.');
		}

		// Cost insights
		const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
		if (totalCost > 10) { // Arbitrary threshold
			insights.push('High cumulative testing costs. Consider using cost-effective models for development.');
		}

		return insights;
	}

	private generateRecommendations(results: TestResult[]): string[] {
		const recommendations: string[] = [];

		// Model performance recommendations
		const modelPerformance = new Map<string, { quality: number; latency: number; count: number }>();
		
		results.forEach(result => {
			const existing = modelPerformance.get(result.model) || { quality: 0, latency: 0, count: 0 };
			existing.quality += result.qualityScore;
			existing.latency += result.latency;
			existing.count += 1;
			modelPerformance.set(result.model, existing);
		});

		const bestModel = Array.from(modelPerformance.entries())
			.map(([model, stats]) => ({
				model,
				avgQuality: stats.quality / stats.count,
				avgLatency: stats.latency / stats.count
			}))
			.sort((a, b) => b.avgQuality - a.avgQuality)[0];

		if (bestModel) {
			recommendations.push(`Consider using ${bestModel.model} as primary model based on test performance.`);
		}

		return recommendations;
	}

	private generateModelComparison(results: TestResult[]) {
		const modelStats = new Map<string, {
			latencySum: number;
			qualitySum: number;
			successCount: number;
			totalCount: number;
			costSum: number;
		}>();

		results.forEach(result => {
			const existing = modelStats.get(result.model) || {
				latencySum: 0,
				qualitySum: 0,
				successCount: 0,
				totalCount: 0,
				costSum: 0
			};

			existing.latencySum += result.latency;
			existing.qualitySum += result.qualityScore;
			existing.successCount += result.success ? 1 : 0;
			existing.totalCount += 1;
			existing.costSum += result.cost;

			modelStats.set(result.model, existing);
		});

		return Array.from(modelStats.entries()).map(([model, stats]) => ({
			model,
			averageLatency: Math.round(stats.latencySum / stats.totalCount),
			averageQuality: Number((stats.qualitySum / stats.totalCount).toFixed(3)),
			successRate: Number((stats.successCount / stats.totalCount).toFixed(3)),
			costEfficiency: Number(((stats.qualitySum / stats.totalCount) / (stats.costSum / stats.totalCount) * 1000).toFixed(2))
		}));
	}

	// Quality assessment helper methods
	private assessRelevance(prompt: string, response: string): number {
		// Simple keyword overlap assessment
		const promptWords = prompt.toLowerCase().split(/\s+/);
		const responseWords = response.toLowerCase().split(/\s+/);
		const overlap = promptWords.filter(word => responseWords.includes(word)).length;
		return Math.min(overlap / promptWords.length * 2, 1);
	}

	private assessCoherence(response: string): number {
		// Simple coherence assessment based on sentence structure
		const sentences = response.split(/[.!?]+/);
		const avgSentenceLength = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / sentences.length;
		return Math.min(avgSentenceLength / 20, 1); // Normalize to 0-1
	}

	private assessAccuracy(response: string, expectedOutcome: string): number {
		// Simple similarity check
		const responseWords = response.toLowerCase().split(/\s+/);
		const expectedWords = expectedOutcome.toLowerCase().split(/\s+/);
		const matches = expectedWords.filter(word => responseWords.includes(word)).length;
		return matches / expectedWords.length;
	}

	private assessCompleteness(prompt: string, response: string): number {
		// Assess if response adequately addresses prompt
		const responseLength = response.split(/\s+/).length;
		const promptComplexity = prompt.split(/[.!?]+/).length;
		const expectedLength = promptComplexity * 20; // Rough heuristic
		return Math.min(responseLength / expectedLength, 1);
	}

	private assessSafety(response: string): number {
		// Basic safety check for harmful content
		const unsafePatterns = ['hate', 'violence', 'harmful', 'illegal'];
		const lowerResponse = response.toLowerCase();
		const unsafeCount = unsafePatterns.filter(pattern => lowerResponse.includes(pattern)).length;
		return Math.max(1 - (unsafeCount / unsafePatterns.length), 0.5); // Minimum 0.5 safety score
	}
}