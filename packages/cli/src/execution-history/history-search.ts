import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { ExecutionRepository } from '@n8n/db';
import type { IExecutionResponse } from '@n8n/db';
import { Service } from '@n8n/di';
import { DateUtils } from '@n8n/typeorm/util/DateUtils';
import { Between, MoreThanOrEqual, LessThanOrEqual, In } from 'typeorm';
import type { ExecutionStatus } from 'n8n-workflow';

export interface SearchCriteria {
	workflowId?: string;
	status?: ExecutionStatus[];
	startDate?: Date;
	endDate?: Date;
	mode?: string;
	searchText?: string;
	limit?: number;
	offset?: number;
	sortBy?: 'startedAt' | 'stoppedAt' | 'status' | 'mode';
	sortOrder?: 'ASC' | 'DESC';
	metadata?: Array<{ key: string; value: string }>;
	minDuration?: number;
	maxDuration?: number;
}

export interface SearchResult {
	executions: IExecutionResponse[];
	total: number;
	page: number;
	pageSize: number;
	hasMore: boolean;
}

export interface AggregatedStats {
	totalExecutions: number;
	successCount: number;
	errorCount: number;
	runningCount: number;
	averageDuration: number;
	statusBreakdown: Record<string, number>;
	modeBreakdown: Record<string, number>;
	executionsPerDay: Record<string, number>;
}

/**
 * History Search Service
 *
 * Advanced search and filtering interface for execution history.
 * Provides powerful querying capabilities with aggregation support.
 */
@Service()
export class HistorySearch {
	constructor(
		private readonly logger: Logger,
		private readonly globalConfig: GlobalConfig,
		private readonly executionRepository: ExecutionRepository,
	) {
		this.logger.info('[HistorySearch] Initialized', {
			module: 'HistorySearch',
		});
	}

	/**
	 * Search executions with advanced criteria
	 */
	async search(criteria: SearchCriteria): Promise<SearchResult> {
		const startTime = Date.now();
		this.logger.debug('[HistorySearch] Starting search', {
			module: 'HistorySearch',
			function: 'search',
			criteria,
		});

		try {
			const limit = criteria.limit || 50;
			const offset = criteria.offset || 0;
			const sortBy = criteria.sortBy || 'startedAt';
			const sortOrder = criteria.sortOrder || 'DESC';

			// Build where clause
			const where: any = {};

			if (criteria.workflowId) {
				where.workflowId = criteria.workflowId;
			}

			if (criteria.status && criteria.status.length > 0) {
				where.status = In(criteria.status);
			}

			if (criteria.mode) {
				where.mode = criteria.mode;
			}

			if (criteria.startDate && criteria.endDate) {
				where.startedAt = Between(
					DateUtils.mixedDateToUtcDatetimeString(criteria.startDate),
					DateUtils.mixedDateToUtcDatetimeString(criteria.endDate),
				);
			} else if (criteria.startDate) {
				where.startedAt = MoreThanOrEqual(
					DateUtils.mixedDateToUtcDatetimeString(criteria.startDate),
				);
			} else if (criteria.endDate) {
				where.startedAt = LessThanOrEqual(DateUtils.mixedDateToUtcDatetimeString(criteria.endDate));
			}

			// Execute query
			const [executions, total] = await this.executionRepository.findAndCount({
				where,
				order: { [sortBy]: sortOrder },
				take: limit,
				skip: offset,
				relations: ['metadata', 'annotation'],
			});

			// Filter by duration if specified
			let filteredExecutions = executions as IExecutionResponse[];
			if (criteria.minDuration !== undefined || criteria.maxDuration !== undefined) {
				filteredExecutions = this.filterByDuration(
					filteredExecutions,
					criteria.minDuration,
					criteria.maxDuration,
				);
			}

			// Filter by metadata if specified
			if (criteria.metadata && criteria.metadata.length > 0) {
				filteredExecutions = this.filterByMetadata(filteredExecutions, criteria.metadata);
			}

			// Filter by search text if specified
			if (criteria.searchText) {
				filteredExecutions = this.filterBySearchText(filteredExecutions, criteria.searchText);
			}

			const result: SearchResult = {
				executions: filteredExecutions,
				total,
				page: Math.floor(offset / limit) + 1,
				pageSize: limit,
				hasMore: offset + limit < total,
			};

			this.logger.info('[HistorySearch] Search completed', {
				module: 'HistorySearch',
				function: 'search',
				totalResults: total,
				returnedResults: filteredExecutions.length,
				page: result.page,
				duration: Date.now() - startTime,
			});

			return result;
		} catch (error) {
			this.logger.error('[HistorySearch] Search failed', {
				module: 'HistorySearch',
				function: 'search',
				criteria,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Filter executions by duration
	 */
	private filterByDuration(
		executions: IExecutionResponse[],
		minDuration?: number,
		maxDuration?: number,
	): IExecutionResponse[] {
		return executions.filter((exec) => {
			if (!exec.startedAt || !exec.stoppedAt) return false;

			const duration = new Date(exec.stoppedAt).getTime() - new Date(exec.startedAt).getTime();

			if (minDuration !== undefined && duration < minDuration) return false;
			if (maxDuration !== undefined && duration > maxDuration) return false;

			return true;
		});
	}

	/**
	 * Filter executions by metadata
	 */
	private filterByMetadata(
		executions: IExecutionResponse[],
		metadata: Array<{ key: string; value: string }>,
	): IExecutionResponse[] {
		return executions.filter((exec) => {
			if (!exec.metadata) return false;

			return metadata.every((filter) =>
				exec.metadata.some((meta: any) => meta.key === filter.key && meta.value === filter.value),
			);
		});
	}

	/**
	 * Filter executions by search text
	 */
	private filterBySearchText(
		executions: IExecutionResponse[],
		searchText: string,
	): IExecutionResponse[] {
		const lowerSearchText = searchText.toLowerCase();

		return executions.filter((exec) => {
			// Search in workflow name, ID, status, mode
			const searchableText = [
				exec.id,
				exec.workflowId,
				exec.status,
				exec.mode,
				exec.workflowData?.name || '',
			]
				.join(' ')
				.toLowerCase();

			return searchableText.includes(lowerSearchText);
		});
	}

	/**
	 * Get aggregated statistics for executions
	 */
	async getAggregatedStats(criteria: SearchCriteria): Promise<AggregatedStats> {
		const startTime = Date.now();
		this.logger.debug('[HistorySearch] Calculating aggregated stats', {
			module: 'HistorySearch',
			function: 'getAggregatedStats',
			criteria,
		});

		try {
			// Search with no limit to get all matching executions
			const searchResult = await this.search({ ...criteria, limit: 10000 });
			const executions = searchResult.executions;

			const stats: AggregatedStats = {
				totalExecutions: executions.length,
				successCount: 0,
				errorCount: 0,
				runningCount: 0,
				averageDuration: 0,
				statusBreakdown: {},
				modeBreakdown: {},
				executionsPerDay: {},
			};

			let totalDuration = 0;
			let durationCount = 0;

			for (const exec of executions) {
				// Status counts
				if (exec.status === 'success') stats.successCount++;
				if (exec.status === 'error') stats.errorCount++;
				if (exec.status === 'running') stats.runningCount++;

				// Status breakdown
				stats.statusBreakdown[exec.status] = (stats.statusBreakdown[exec.status] || 0) + 1;

				// Mode breakdown
				stats.modeBreakdown[exec.mode] = (stats.modeBreakdown[exec.mode] || 0) + 1;

				// Duration calculation
				if (exec.startedAt && exec.stoppedAt) {
					const duration = new Date(exec.stoppedAt).getTime() - new Date(exec.startedAt).getTime();
					totalDuration += duration;
					durationCount++;
				}

				// Executions per day
				if (exec.startedAt) {
					const day = new Date(exec.startedAt).toISOString().split('T')[0];
					stats.executionsPerDay[day] = (stats.executionsPerDay[day] || 0) + 1;
				}
			}

			stats.averageDuration = durationCount > 0 ? totalDuration / durationCount : 0;

			this.logger.info('[HistorySearch] Aggregated stats calculated', {
				module: 'HistorySearch',
				function: 'getAggregatedStats',
				stats,
				duration: Date.now() - startTime,
			});

			return stats;
		} catch (error) {
			this.logger.error('[HistorySearch] Failed to calculate aggregated stats', {
				module: 'HistorySearch',
				function: 'getAggregatedStats',
				criteria,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Find similar executions based on error patterns
	 */
	async findSimilarExecutions(
		executionId: string,
		limit: number = 10,
	): Promise<IExecutionResponse[]> {
		const startTime = Date.now();
		this.logger.debug('[HistorySearch] Finding similar executions', {
			module: 'HistorySearch',
			function: 'findSimilarExecutions',
			executionId,
			limit,
		});

		try {
			// Get the reference execution
			const execution = await this.executionRepository.findOne({
				where: { id: executionId },
				relations: ['executionData'],
			});

			if (!execution) {
				this.logger.warn('[HistorySearch] Execution not found', {
					module: 'HistorySearch',
					function: 'findSimilarExecutions',
					executionId,
				});
				return [];
			}

			// Find executions with same workflow and status
			const similarExecutions = await this.executionRepository.find({
				where: {
					workflowId: execution.workflowId,
					status: execution.status,
				},
				order: { startedAt: 'DESC' },
				take: limit + 1, // +1 to exclude the reference execution
				relations: ['executionData'],
			});

			// Filter out the reference execution
			const filtered = similarExecutions.filter((exec) => exec.id !== executionId).slice(0, limit);

			this.logger.info('[HistorySearch] Similar executions found', {
				module: 'HistorySearch',
				function: 'findSimilarExecutions',
				executionId,
				similarCount: filtered.length,
				duration: Date.now() - startTime,
			});

			return filtered as IExecutionResponse[];
		} catch (error) {
			this.logger.error('[HistorySearch] Failed to find similar executions', {
				module: 'HistorySearch',
				function: 'findSimilarExecutions',
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
	 * Get execution timeline for visualization
	 */
	async getExecutionTimeline(workflowId: string, days: number = 30): Promise<Record<string, any>> {
		const startTime = Date.now();
		this.logger.debug('[HistorySearch] Getting execution timeline', {
			module: 'HistorySearch',
			function: 'getExecutionTimeline',
			workflowId,
			days,
		});

		try {
			const startDate = new Date();
			startDate.setDate(startDate.getDate() - days);

			const executions = await this.search({
				workflowId,
				startDate,
				sortBy: 'startedAt',
				sortOrder: 'ASC',
				limit: 10000,
			});

			const timeline: Record<string, any> = {
				days: [],
				successCount: [],
				errorCount: [],
				totalCount: [],
			};

			const dayMap = new Map<string, { success: number; error: number; total: number }>();

			for (const exec of executions.executions) {
				if (!exec.startedAt) continue;

				const day = new Date(exec.startedAt).toISOString().split('T')[0];
				if (!dayMap.has(day)) {
					dayMap.set(day, { success: 0, error: 0, total: 0 });
				}

				const stats = dayMap.get(day)!;
				stats.total++;
				if (exec.status === 'success') stats.success++;
				if (exec.status === 'error') stats.error++;
			}

			// Convert map to arrays
			for (const [day, stats] of Array.from(dayMap.entries()).sort()) {
				timeline.days.push(day);
				timeline.successCount.push(stats.success);
				timeline.errorCount.push(stats.error);
				timeline.totalCount.push(stats.total);
			}

			this.logger.info('[HistorySearch] Execution timeline generated', {
				module: 'HistorySearch',
				function: 'getExecutionTimeline',
				workflowId,
				days,
				totalDays: timeline.days.length,
				duration: Date.now() - startTime,
			});

			return timeline;
		} catch (error) {
			this.logger.error('[HistorySearch] Failed to get execution timeline', {
				module: 'HistorySearch',
				function: 'getExecutionTimeline',
				workflowId,
				days,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}
}
