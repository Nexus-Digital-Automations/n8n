import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { ExecutionRepository } from '@n8n/db';
import type { ExecutionEntity } from '@n8n/db';
import { Service } from '@n8n/di';
import { DateUtils } from '@n8n/typeorm/util/DateUtils';
import { LessThan } from 'typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export interface ArchiveConfig {
	archivePath: string;
	compressionLevel: number;
	batchSize: number;
	enabled: boolean;
}

export interface ArchiveStats {
	totalArchived: number;
	totalSize: number;
	compressionRatio: number;
	oldestArchived: Date | null;
	newestArchived: Date | null;
}

/**
 * History Archiver Service
 *
 * Archives old execution data with compression to reduce storage costs
 * while maintaining access to historical data for auditing and analysis.
 */
@Service()
export class HistoryArchiver {
	private readonly config: ArchiveConfig;

	constructor(
		private readonly logger: Logger,
		private readonly globalConfig: GlobalConfig,
		private readonly executionRepository: ExecutionRepository,
	) {
		this.config = {
			archivePath: process.env.N8N_ARCHIVE_PATH || '/tmp/n8n-archives',
			compressionLevel: 9,
			batchSize: 100,
			enabled: process.env.N8N_ARCHIVE_ENABLED === 'true',
		};

		this.logger.info('[HistoryArchiver] Initialized', {
			module: 'HistoryArchiver',
			archivePath: this.config.archivePath,
			enabled: this.config.enabled,
		});
	}

	/**
	 * Archive executions older than specified days
	 */
	async archiveOldExecutions(olderThanDays: number): Promise<number> {
		const startTime = Date.now();
		this.logger.debug('[HistoryArchiver] Starting archive process', {
			module: 'HistoryArchiver',
			function: 'archiveOldExecutions',
			olderThanDays,
		});

		try {
			if (!this.config.enabled) {
				this.logger.info('[HistoryArchiver] Archiving disabled', {
					module: 'HistoryArchiver',
					function: 'archiveOldExecutions',
				});
				return 0;
			}

			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

			const executions = await this.executionRepository.find({
				where: {
					startedAt: LessThan(DateUtils.mixedDateToUtcDatetimeString(cutoffDate)),
				},
				relations: ['executionData', 'metadata'],
				take: this.config.batchSize,
				order: { startedAt: 'ASC' },
			});

			if (executions.length === 0) {
				this.logger.info('[HistoryArchiver] No executions to archive', {
					module: 'HistoryArchiver',
					function: 'archiveOldExecutions',
					cutoffDate,
					duration: Date.now() - startTime,
				});
				return 0;
			}

			let archivedCount = 0;
			for (const execution of executions) {
				const archived = await this.archiveExecution(execution);
				if (archived) {
					archivedCount++;
				}
			}

			this.logger.info('[HistoryArchiver] Archive process completed', {
				module: 'HistoryArchiver',
				function: 'archiveOldExecutions',
				totalExecutions: executions.length,
				archivedCount,
				cutoffDate,
				duration: Date.now() - startTime,
			});

			return archivedCount;
		} catch (error) {
			this.logger.error('[HistoryArchiver] Failed to archive old executions', {
				module: 'HistoryArchiver',
				function: 'archiveOldExecutions',
				olderThanDays,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Archive a single execution
	 */
	private async archiveExecution(execution: ExecutionEntity): Promise<boolean> {
		const startTime = Date.now();
		this.logger.debug('[HistoryArchiver] Archiving execution', {
			module: 'HistoryArchiver',
			function: 'archiveExecution',
			executionId: execution.id,
		});

		try {
			// Prepare archive data
			const archiveData = {
				execution,
				archivedAt: new Date(),
				version: '1.0',
			};

			const dataString = JSON.stringify(archiveData);
			const compressed = await gzipAsync(Buffer.from(dataString), {
				level: this.config.compressionLevel,
			});

			// Generate archive filename
			const year = execution.startedAt ? new Date(execution.startedAt).getFullYear() : 'unknown';
			const month = execution.startedAt
				? String(new Date(execution.startedAt).getMonth() + 1).padStart(2, '0')
				: 'unknown';
			const archiveDir = path.join(this.config.archivePath, String(year), month);

			// Ensure archive directory exists
			await fs.mkdir(archiveDir, { recursive: true });

			// Write archive file
			const archiveFile = path.join(archiveDir, `${execution.id}.json.gz`);
			await fs.writeFile(archiveFile, compressed);

			this.logger.info('[HistoryArchiver] Execution archived', {
				module: 'HistoryArchiver',
				function: 'archiveExecution',
				executionId: execution.id,
				archiveFile,
				originalSize: dataString.length,
				compressedSize: compressed.length,
				compressionRatio: (compressed.length / dataString.length).toFixed(2),
				duration: Date.now() - startTime,
			});

			return true;
		} catch (error) {
			this.logger.error('[HistoryArchiver] Failed to archive execution', {
				module: 'HistoryArchiver',
				function: 'archiveExecution',
				executionId: execution.id,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			return false;
		}
	}

	/**
	 * Restore archived execution
	 */
	async restoreExecution(executionId: string): Promise<ExecutionEntity | null> {
		const startTime = Date.now();
		this.logger.debug('[HistoryArchiver] Restoring execution', {
			module: 'HistoryArchiver',
			function: 'restoreExecution',
			executionId,
		});

		try {
			// Search for archive file
			const archiveFile = await this.findArchiveFile(executionId);
			if (!archiveFile) {
				this.logger.warn('[HistoryArchiver] Archive file not found', {
					module: 'HistoryArchiver',
					function: 'restoreExecution',
					executionId,
				});
				return null;
			}

			// Read and decompress archive
			const compressed = await fs.readFile(archiveFile);
			const decompressed = await gunzipAsync(compressed);
			const archiveData = JSON.parse(decompressed.toString()) as { execution: ExecutionEntity };

			this.logger.info('[HistoryArchiver] Execution restored', {
				module: 'HistoryArchiver',
				function: 'restoreExecution',
				executionId,
				archiveFile,
				duration: Date.now() - startTime,
			});

			return archiveData.execution;
		} catch (error) {
			this.logger.error('[HistoryArchiver] Failed to restore execution', {
				module: 'HistoryArchiver',
				function: 'restoreExecution',
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
	 * Find archive file for execution
	 */
	private async findArchiveFile(executionId: string): Promise<string | null> {
		const startTime = Date.now();
		this.logger.debug('[HistoryArchiver] Searching for archive file', {
			module: 'HistoryArchiver',
			function: 'findArchiveFile',
			executionId,
		});

		try {
			// Search through archive directories
			const years = await fs.readdir(this.config.archivePath);

			for (const year of years) {
				const yearPath = path.join(this.config.archivePath, year);
				const stat = await fs.stat(yearPath);
				if (!stat.isDirectory()) continue;

				const months = await fs.readdir(yearPath);
				for (const month of months) {
					const archiveFile = path.join(yearPath, month, `${executionId}.json.gz`);
					try {
						await fs.access(archiveFile);
						this.logger.debug('[HistoryArchiver] Archive file found', {
							module: 'HistoryArchiver',
							function: 'findArchiveFile',
							executionId,
							archiveFile,
							duration: Date.now() - startTime,
						});
						return archiveFile;
					} catch {
						// File doesn't exist, continue searching
					}
				}
			}

			this.logger.debug('[HistoryArchiver] Archive file not found', {
				module: 'HistoryArchiver',
				function: 'findArchiveFile',
				executionId,
				duration: Date.now() - startTime,
			});
			return null;
		} catch (error) {
			this.logger.error('[HistoryArchiver] Failed to search for archive file', {
				module: 'HistoryArchiver',
				function: 'findArchiveFile',
				executionId,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			return null;
		}
	}

	/**
	 * Get archive statistics
	 */
	async getArchiveStats(): Promise<ArchiveStats> {
		const startTime = Date.now();
		this.logger.debug('[HistoryArchiver] Calculating archive stats', {
			module: 'HistoryArchiver',
			function: 'getArchiveStats',
		});

		try {
			const stats: ArchiveStats = {
				totalArchived: 0,
				totalSize: 0,
				compressionRatio: 0,
				oldestArchived: null,
				newestArchived: null,
			};

			// Traverse archive directory
			const years = await fs.readdir(this.config.archivePath);

			for (const year of years) {
				const yearPath = path.join(this.config.archivePath, year);
				const yearStat = await fs.stat(yearPath);
				if (!yearStat.isDirectory()) continue;

				const months = await fs.readdir(yearPath);
				for (const month of months) {
					const monthPath = path.join(yearPath, month);
					const monthStat = await fs.stat(monthPath);
					if (!monthStat.isDirectory()) continue;

					const files = await fs.readdir(monthPath);
					for (const file of files) {
						if (!file.endsWith('.json.gz')) continue;

						const filePath = path.join(monthPath, file);
						const fileStat = await fs.stat(filePath);
						stats.totalArchived++;
						stats.totalSize += fileStat.size;

						if (!stats.oldestArchived || fileStat.mtime < stats.oldestArchived) {
							stats.oldestArchived = fileStat.mtime;
						}
						if (!stats.newestArchived || fileStat.mtime > stats.newestArchived) {
							stats.newestArchived = fileStat.mtime;
						}
					}
				}
			}

			this.logger.info('[HistoryArchiver] Archive stats calculated', {
				module: 'HistoryArchiver',
				function: 'getArchiveStats',
				stats,
				duration: Date.now() - startTime,
			});

			return stats;
		} catch (error) {
			this.logger.error('[HistoryArchiver] Failed to calculate archive stats', {
				module: 'HistoryArchiver',
				function: 'getArchiveStats',
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Clean up archived files older than specified days
	 */
	async cleanupOldArchives(olderThanDays: number): Promise<number> {
		const startTime = Date.now();
		this.logger.debug('[HistoryArchiver] Starting archive cleanup', {
			module: 'HistoryArchiver',
			function: 'cleanupOldArchives',
			olderThanDays,
		});

		try {
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

			let deletedCount = 0;
			const years = await fs.readdir(this.config.archivePath);

			for (const year of years) {
				const yearPath = path.join(this.config.archivePath, year);
				const yearStat = await fs.stat(yearPath);
				if (!yearStat.isDirectory()) continue;

				const months = await fs.readdir(yearPath);
				for (const month of months) {
					const monthPath = path.join(yearPath, month);
					const monthStat = await fs.stat(monthPath);
					if (!monthStat.isDirectory()) continue;

					const files = await fs.readdir(monthPath);
					for (const file of files) {
						if (!file.endsWith('.json.gz')) continue;

						const filePath = path.join(monthPath, file);
						const fileStat = await fs.stat(filePath);

						if (fileStat.mtime < cutoffDate) {
							await fs.unlink(filePath);
							deletedCount++;
						}
					}
				}
			}

			this.logger.info('[HistoryArchiver] Archive cleanup completed', {
				module: 'HistoryArchiver',
				function: 'cleanupOldArchives',
				deletedCount,
				cutoffDate,
				duration: Date.now() - startTime,
			});

			return deletedCount;
		} catch (error) {
			this.logger.error('[HistoryArchiver] Failed to cleanup old archives', {
				module: 'HistoryArchiver',
				function: 'cleanupOldArchives',
				olderThanDays,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}
}
