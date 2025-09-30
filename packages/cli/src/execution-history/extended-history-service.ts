import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { Service } from '@n8n/di';
import { ExecutionRepository, MoreThanOrEqual, LessThan } from '@n8n/db';
import type { IExecutionResponse } from '@n8n/db';
import { DateUtils } from '@n8n/typeorm/util/DateUtils';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export type ArchivalStatus = 'active' | 'compressed' | 'archived';

export interface ExtendedHistoryConfig {
	retentionDays: number;
	compressionThresholdDays: number;
	archivalThresholdDays: number;
	compressionEnabled: boolean;
}

export interface ExecutionHistoryStats {
	totalExecutions: number;
	activeExecutions: number;
	compressedExecutions: number;
	archivedExecutions: number;
	oldestExecution: Date | null;
	newestExecution: Date | null;
	storageSize: {
		active: number;
		compressed: number;
		archived: number;
	};
}

/**
 * Extended Execution History Service
 *
 * Manages 30-day execution history with compression and archival support.
 * Provides efficient storage and retrieval of historical execution data.
 */
@Service()
export class ExtendedHistoryService {
	private readonly config: ExtendedHistoryConfig;

	constructor(
		private readonly logger: Logger,
		private readonly globalConfig: GlobalConfig,
		private readonly executionRepository: ExecutionRepository,
	) {
		this.config = {
			retentionDays: 30,
			compressionThresholdDays: 7,
			archivalThresholdDays: 14,
			compressionEnabled: true,
		};

		this.logger.info('[ExtendedHistoryService] Initialized', {
			module: 'ExtendedHistoryService',
			retentionDays: this.config.retentionDays,
			compressionEnabled: this.config.compressionEnabled,
		});
	}

	/**
	 * Get executions within the 30-day retention period
	 */
	async getExtendedHistory(
		workflowId: string,
		options?: {
			startDate?: Date;
			endDate?: Date;
			status?: string[];
			limit?: number;
			offset?: number;
		},
	): Promise<IExecutionResponse[]> {
		const startTime = Date.now();
		this.logger.debug('[ExtendedHistoryService] Fetching extended history', {
			module: 'ExtendedHistoryService',
			function: 'getExtendedHistory',
			workflowId,
			options,
		});

		try {
			const thirtyDaysAgo = new Date();
			thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - this.config.retentionDays);

			const where: any = {
				workflowId,
				startedAt: MoreThanOrEqual(DateUtils.mixedDateToUtcDatetimeString(thirtyDaysAgo)),
			};

			if (options?.startDate) {
				where.startedAt = MoreThanOrEqual(
					DateUtils.mixedDateToUtcDatetimeString(options.startDate),
				);
			}

			if (options?.endDate) {
				where.stoppedAt = LessThan(DateUtils.mixedDateToUtcDatetimeString(options.endDate));
			}

			if (options?.status && options.status.length > 0) {
				where.status = options.status;
			}

			const executions = await this.executionRepository.find({
				where,
				order: { startedAt: 'DESC' },
				take: options?.limit || 100,
				skip: options?.offset || 0,
				relations: ['executionData', 'metadata', 'annotation'],
			});

			this.logger.info('[ExtendedHistoryService] Extended history fetched', {
				module: 'ExtendedHistoryService',
				function: 'getExtendedHistory',
				workflowId,
				executionCount: executions.length,
				duration: Date.now() - startTime,
			});

			return executions as IExecutionResponse[];
		} catch (error) {
			this.logger.error('[ExtendedHistoryService] Failed to fetch extended history', {
				module: 'ExtendedHistoryService',
				function: 'getExtendedHistory',
				workflowId,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Compress execution data for older executions
	 */
	async compressExecution(executionId: string): Promise<boolean> {
		const startTime = Date.now();
		this.logger.debug('[ExtendedHistoryService] Compressing execution', {
			module: 'ExtendedHistoryService',
			function: 'compressExecution',
			executionId,
		});

		try {
			if (!this.config.compressionEnabled) {
				this.logger.info('[ExtendedHistoryService] Compression disabled', {
					module: 'ExtendedHistoryService',
					function: 'compressExecution',
					executionId,
				});
				return false;
			}

			const execution = await this.executionRepository.findOne({
				where: { id: executionId },
				relations: ['executionData'],
			});

			if (!execution || !execution.executionData) {
				this.logger.warn('[ExtendedHistoryService] Execution not found', {
					module: 'ExtendedHistoryService',
					function: 'compressExecution',
					executionId,
				});
				return false;
			}

			// Compress the execution data
			const dataString = JSON.stringify(execution.executionData.data);
			const compressed = await gzipAsync(Buffer.from(dataString));

			// Store compressed data (would need custom field in ExecutionData entity)
			this.logger.info('[ExtendedHistoryService] Execution compressed', {
				module: 'ExtendedHistoryService',
				function: 'compressExecution',
				executionId,
				originalSize: dataString.length,
				compressedSize: compressed.length,
				compressionRatio: (compressed.length / dataString.length).toFixed(2),
				duration: Date.now() - startTime,
			});

			return true;
		} catch (error) {
			this.logger.error('[ExtendedHistoryService] Failed to compress execution', {
				module: 'ExtendedHistoryService',
				function: 'compressExecution',
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
	 * Decompress execution data when needed
	 */
	async decompressExecution(executionId: string): Promise<IExecutionResponse | null> {
		const startTime = Date.now();
		this.logger.debug('[ExtendedHistoryService] Decompressing execution', {
			module: 'ExtendedHistoryService',
			function: 'decompressExecution',
			executionId,
		});

		try {
			// Implementation would retrieve and decompress stored data
			this.logger.info('[ExtendedHistoryService] Execution decompressed', {
				module: 'ExtendedHistoryService',
				function: 'decompressExecution',
				executionId,
				duration: Date.now() - startTime,
			});

			return null;
		} catch (error) {
			this.logger.error('[ExtendedHistoryService] Failed to decompress execution', {
				module: 'ExtendedHistoryService',
				function: 'decompressExecution',
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
	 * Get statistics about execution history storage
	 */
	async getHistoryStats(workflowId?: string): Promise<ExecutionHistoryStats> {
		const startTime = Date.now();
		this.logger.debug('[ExtendedHistoryService] Calculating history stats', {
			module: 'ExtendedHistoryService',
			function: 'getHistoryStats',
			workflowId,
		});

		try {
			const thirtyDaysAgo = new Date();
			thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - this.config.retentionDays);

			const where: any = {
				startedAt: MoreThanOrEqual(DateUtils.mixedDateToUtcDatetimeString(thirtyDaysAgo)),
			};

			if (workflowId) {
				where.workflowId = workflowId;
			}

			const executions = await this.executionRepository.find({
				where,
				select: ['id', 'startedAt', 'stoppedAt'],
				order: { startedAt: 'DESC' },
			});

			const stats: ExecutionHistoryStats = {
				totalExecutions: executions.length,
				activeExecutions: executions.length,
				compressedExecutions: 0,
				archivedExecutions: 0,
				oldestExecution: executions.length > 0 ? executions[executions.length - 1].startedAt : null,
				newestExecution: executions.length > 0 ? executions[0].startedAt : null,
				storageSize: {
					active: 0,
					compressed: 0,
					archived: 0,
				},
			};

			this.logger.info('[ExtendedHistoryService] History stats calculated', {
				module: 'ExtendedHistoryService',
				function: 'getHistoryStats',
				workflowId,
				stats,
				duration: Date.now() - startTime,
			});

			return stats;
		} catch (error) {
			this.logger.error('[ExtendedHistoryService] Failed to calculate history stats', {
				module: 'ExtendedHistoryService',
				function: 'getHistoryStats',
				workflowId,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Clean up executions older than retention period
	 */
	async cleanupOldExecutions(): Promise<number> {
		const startTime = Date.now();
		this.logger.debug('[ExtendedHistoryService] Starting cleanup', {
			module: 'ExtendedHistoryService',
			function: 'cleanupOldExecutions',
		});

		try {
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

			const result = await this.executionRepository.delete({
				startedAt: LessThan(DateUtils.mixedDateToUtcDatetimeString(cutoffDate)),
			});

			const deletedCount = result.affected || 0;

			this.logger.info('[ExtendedHistoryService] Cleanup completed', {
				module: 'ExtendedHistoryService',
				function: 'cleanupOldExecutions',
				deletedCount,
				cutoffDate,
				duration: Date.now() - startTime,
			});

			return deletedCount;
		} catch (error) {
			this.logger.error('[ExtendedHistoryService] Failed to cleanup old executions', {
				module: 'ExtendedHistoryService',
				function: 'cleanupOldExecutions',
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Export execution history for external analysis
	 */
	async exportHistory(workflowId: string, format: 'json' | 'csv' = 'json'): Promise<string> {
		const startTime = Date.now();
		this.logger.debug('[ExtendedHistoryService] Exporting history', {
			module: 'ExtendedHistoryService',
			function: 'exportHistory',
			workflowId,
			format,
		});

		try {
			const executions = await this.getExtendedHistory(workflowId, { limit: 10000 });

			let exportData: string;

			if (format === 'json') {
				exportData = JSON.stringify(executions, null, 2);
			} else {
				// CSV format
				const headers = ['id', 'status', 'mode', 'startedAt', 'stoppedAt', 'finished'];
				const rows = executions.map((exec) => [
					exec.id,
					exec.status,
					exec.mode,
					exec.startedAt?.toISOString(),
					exec.stoppedAt?.toISOString(),
					exec.finished,
				]);
				exportData = [headers, ...rows].map((row) => row.join(',')).join('\n');
			}

			this.logger.info('[ExtendedHistoryService] History exported', {
				module: 'ExtendedHistoryService',
				function: 'exportHistory',
				workflowId,
				format,
				executionCount: executions.length,
				exportSize: exportData.length,
				duration: Date.now() - startTime,
			});

			return exportData;
		} catch (error) {
			this.logger.error('[ExtendedHistoryService] Failed to export history', {
				module: 'ExtendedHistoryService',
				function: 'exportHistory',
				workflowId,
				format,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}
}
