/**
 * Repository implementation for notification system data operations
 * Following n8n's repository patterns
 */

import { Service } from '@n8n/di';
import { DataSource, Repository, Between, In, MoreThan, LessThan } from '@n8n/typeorm';
import { Logger } from '@n8n/backend-common';

import {
	NotificationChannelEntity,
	NotificationTemplateEntity,
	NotificationHistoryEntity,
	AlertProcessingHistoryEntity,
	NotificationRateLimitEntity,
	NotificationQueueJobEntity,
	NotificationSystemMetricsEntity,
} from '../database/entities/notification-channel.entity';

import type {
	NotificationChannel,
	NotificationResult,
	AlertSeverity,
} from '../interfaces/notification-channel.interface';

@Service()
export class NotificationRepository {
	private channelRepository: Repository<NotificationChannelEntity>;
	private templateRepository: Repository<NotificationTemplateEntity>;
	private historyRepository: Repository<NotificationHistoryEntity>;
	private processingHistoryRepository: Repository<AlertProcessingHistoryEntity>;
	private rateLimitRepository: Repository<NotificationRateLimitEntity>;
	private queueJobRepository: Repository<NotificationQueueJobEntity>;
	private metricsRepository: Repository<NotificationSystemMetricsEntity>;

	constructor(
		private readonly dataSource: DataSource,
		private readonly logger: Logger,
	) {
		this.channelRepository = this.dataSource.getRepository(NotificationChannelEntity);
		this.templateRepository = this.dataSource.getRepository(NotificationTemplateEntity);
		this.historyRepository = this.dataSource.getRepository(NotificationHistoryEntity);
		this.processingHistoryRepository = this.dataSource.getRepository(AlertProcessingHistoryEntity);
		this.rateLimitRepository = this.dataSource.getRepository(NotificationRateLimitEntity);
		this.queueJobRepository = this.dataSource.getRepository(NotificationQueueJobEntity);
		this.metricsRepository = this.dataSource.getRepository(NotificationSystemMetricsEntity);
	}

	/**
	 * Get notification channel by ID
	 */
	async getChannel(channelId: string): Promise<NotificationChannel | null> {
		try {
			const entity = await this.channelRepository.findOne({
				where: { id: channelId },
				relations: ['templates'],
			});

			return entity ? this.entityToChannel(entity) : null;
		} catch (error) {
			this.logger.error('Failed to get notification channel', {
				channelId,
				error: error as Error,
			});
			throw error;
		}
	}

	/**
	 * Get all enabled channels for a project
	 */
	async getEnabledChannels(projectId?: string): Promise<NotificationChannel[]> {
		try {
			const queryBuilder = this.channelRepository.createQueryBuilder('channel')
				.leftJoinAndSelect('channel.templates', 'template')
				.where('channel.enabled = :enabled', { enabled: true });

			if (projectId) {
				queryBuilder.andWhere('(channel.projectId = :projectId OR channel.projectId IS NULL)', {
					projectId,
				});
			}

			const entities = await queryBuilder.getMany();
			return entities.map(entity => this.entityToChannel(entity));
		} catch (error) {
			this.logger.error('Failed to get enabled channels', {
				projectId,
				error: error as Error,
			});
			throw error;
		}
	}

	/**
	 * Create notification channel
	 */
	async createChannel(channelData: Partial<NotificationChannel> & { 
		ownerId: string;
		createdBy: string;
	}): Promise<NotificationChannel> {
		try {
			const entity = this.channelRepository.create({
				...channelData,
				updatedBy: channelData.createdBy,
			});

			const savedEntity = await this.channelRepository.save(entity);
			return this.entityToChannel(savedEntity);
		} catch (error) {
			this.logger.error('Failed to create notification channel', {
				channelData: { ...channelData, configuration: '[REDACTED]' },
				error: error as Error,
			});
			throw error;
		}
	}

	/**
	 * Update notification channel
	 */
	async updateChannel(
		channelId: string,
		updateData: Partial<NotificationChannel> & { updatedBy: string },
	): Promise<NotificationChannel | null> {
		try {
			await this.channelRepository.update(
				{ id: channelId },
				{ ...updateData, updatedAt: new Date() },
			);

			return this.getChannel(channelId);
		} catch (error) {
			this.logger.error('Failed to update notification channel', {
				channelId,
				updateData: { ...updateData, configuration: '[REDACTED]' },
				error: error as Error,
			});
			throw error;
		}
	}

	/**
	 * Delete notification channel
	 */
	async deleteChannel(channelId: string): Promise<boolean> {
		try {
			const result = await this.channelRepository.delete({ id: channelId });
			return result.affected! > 0;
		} catch (error) {
			this.logger.error('Failed to delete notification channel', {
				channelId,
				error: error as Error,
			});
			throw error;
		}
	}

	/**
	 * Save notification processing result
	 */
	async saveAlertProcessing(processingData: {
		alertId: string;
		requestId: string;
		matchedRules: number;
		notifications: number;
		successfulNotifications: number;
		processingTime: number;
		createdAt: Date;
	}): Promise<void> {
		try {
			const entity = this.processingHistoryRepository.create({
				alertId: processingData.alertId,
				requestId: processingData.requestId,
				alertType: 'unknown', // Would be populated from alert data
				alertSeverity: 'medium', // Would be populated from alert data
				matchedRules: processingData.matchedRules,
				totalNotifications: processingData.notifications,
				successfulNotifications: processingData.successfulNotifications,
				failedNotifications: processingData.notifications - processingData.successfulNotifications,
				processingTimeMs: processingData.processingTime,
			});

			await this.processingHistoryRepository.save(entity);
		} catch (error) {
			this.logger.error('Failed to save alert processing history', {
				processingData,
				error: error as Error,
			});
			// Don't throw - this shouldn't fail the main processing
		}
	}

	/**
	 * Save individual notification result
	 */
	async saveNotification(notificationData: {
		id: string;
		alertId: string;
		channelId: string;
		status: string;
		attempts: number;
		sentAt?: Date;
		error?: any;
		metadata?: any;
	}): Promise<void> {
		try {
			const entity = this.historyRepository.create({
				id: notificationData.id,
				alertId: notificationData.alertId,
				channelId: notificationData.channelId,
				channelType: 'unknown', // Would be populated from channel data
				status: notificationData.status,
				alertType: 'unknown', // Would be populated from alert data
				alertSeverity: 'medium', // Would be populated from alert data
				attempts: notificationData.attempts,
				sentAt: notificationData.sentAt,
				error: notificationData.error,
				metadata: notificationData.metadata,
			});

			await this.historyRepository.save(entity);
		} catch (error) {
			this.logger.error('Failed to save notification history', {
				notificationData: { ...notificationData, metadata: '[REDACTED]' },
				error: error as Error,
			});
			// Don't throw - this shouldn't fail the main processing
		}
	}

	/**
	 * Get notification statistics
	 */
	async getStatistics(filters: {
		startDate: Date;
		endDate: Date;
		channelIds?: string[];
		alertTypes?: string[];
		severities?: AlertSeverity[];
		projectIds?: string[];
	}): Promise<any> {
		try {
			const queryBuilder = this.historyRepository.createQueryBuilder('notification')
				.where('notification.createdAt BETWEEN :startDate AND :endDate', {
					startDate: filters.startDate,
					endDate: filters.endDate,
				});

			if (filters.channelIds?.length) {
				queryBuilder.andWhere('notification.channelId IN (:...channelIds)', {
					channelIds: filters.channelIds,
				});
			}

			if (filters.alertTypes?.length) {
				queryBuilder.andWhere('notification.alertType IN (:...alertTypes)', {
					alertTypes: filters.alertTypes,
				});
			}

			if (filters.severities?.length) {
				queryBuilder.andWhere('notification.alertSeverity IN (:...severities)', {
					severities: filters.severities,
				});
			}

			if (filters.projectIds?.length) {
				queryBuilder.andWhere('notification.projectId IN (:...projectIds)', {
					projectIds: filters.projectIds,
				});
			}

			// Get basic counts
			const [totalNotifications, successfulNotifications] = await Promise.all([
				queryBuilder.getCount(),
				queryBuilder.clone().andWhere('notification.status IN (:...successStatuses)', {
					successStatuses: ['sent', 'delivered'],
				}).getCount(),
			]);

			const failedNotifications = totalNotifications - successfulNotifications;
			const successRate = totalNotifications > 0 ? (successfulNotifications / totalNotifications) * 100 : 0;

			// Get channel statistics
			const channelStats = await queryBuilder
				.select([
					'notification.channelId as channelId',
					'notification.channelType as channelType',
					'COUNT(*) as totalNotifications',
					'SUM(CASE WHEN notification.status IN (\'sent\', \'delivered\') THEN 1 ELSE 0 END) as successfulNotifications',
					'AVG(notification.responseTimeMs) as averageResponseTime',
				])
				.groupBy('notification.channelId, notification.channelType')
				.getRawMany();

			// Get severity distribution
			const severityStats = await queryBuilder
				.select([
					'notification.alertSeverity as severity',
					'COUNT(*) as count',
				])
				.groupBy('notification.alertSeverity')
				.getRawMany();

			// Get alert type distribution
			const alertTypeStats = await queryBuilder
				.select([
					'notification.alertType as alertType',
					'COUNT(*) as count',
				])
				.groupBy('notification.alertType')
				.getRawMany();

			// Get failure reasons
			const failureReasons = await this.historyRepository
				.createQueryBuilder('notification')
				.select([
					'notification.error->\'$.code\' as reason',
					'COUNT(*) as count',
				])
				.where('notification.createdAt BETWEEN :startDate AND :endDate', {
					startDate: filters.startDate,
					endDate: filters.endDate,
				})
				.andWhere('notification.status = :status', { status: 'failed' })
				.andWhere('notification.error IS NOT NULL')
				.groupBy('notification.error->\'$.code\'')
				.orderBy('count', 'DESC')
				.limit(10)
				.getRawMany();

			return {
				totalNotifications,
				successfulNotifications,
				failedNotifications,
				successRate,
				byChannel: this.processChannelStats(channelStats),
				bySeverity: this.processSeverityStats(severityStats),
				byAlertType: this.processAlertTypeStats(alertTypeStats),
				topFailureReasons: this.processFailureReasons(failureReasons, totalNotifications),
			};

		} catch (error) {
			this.logger.error('Failed to get notification statistics', {
				filters,
				error: error as Error,
			});
			throw error;
		}
	}

	/**
	 * Get rate limit status for channel
	 */
	async getRateLimitStatus(
		channelId: string,
		windowDurationSeconds: number,
	): Promise<{ count: number; resetAt: Date | null }> {
		try {
			const windowStart = new Date(Date.now() - (windowDurationSeconds * 1000));
			
			const rateLimitRecord = await this.rateLimitRepository.findOne({
				where: {
					channelId,
					windowStart: MoreThan(windowStart),
				},
				order: { createdAt: 'DESC' },
			});

			if (!rateLimitRecord) {
				return { count: 0, resetAt: null };
			}

			const resetAt = new Date(rateLimitRecord.windowStart.getTime() + (windowDurationSeconds * 1000));
			return {
				count: rateLimitRecord.notificationCount,
				resetAt: resetAt > new Date() ? resetAt : null,
			};
		} catch (error) {
			this.logger.error('Failed to get rate limit status', {
				channelId,
				windowDurationSeconds,
				error: error as Error,
			});
			throw error;
		}
	}

	/**
	 * Update rate limit counter
	 */
	async updateRateLimitCounter(
		channelId: string,
		windowDurationSeconds: number,
		maxNotifications: number,
	): Promise<void> {
		try {
			const now = new Date();
			const windowStart = new Date(Math.floor(now.getTime() / (windowDurationSeconds * 1000)) * (windowDurationSeconds * 1000));

			await this.rateLimitRepository.upsert({
				channelId,
				limitType: 'channel',
				windowStart,
				windowDurationSeconds,
				maxNotifications,
				notificationCount: () => 'notification_count + 1',
				resetAt: new Date(windowStart.getTime() + (windowDurationSeconds * 1000)),
			}, ['channelId', 'windowStart']);
		} catch (error) {
			this.logger.error('Failed to update rate limit counter', {
				channelId,
				windowDurationSeconds,
				maxNotifications,
				error: error as Error,
			});
			// Don't throw - rate limiting failure shouldn't break notifications
		}
	}

	/**
	 * Clean up old data based on retention policies
	 */
	async cleanupOldData(retentionDays: number): Promise<{ deletedRecords: number }> {
		try {
			const cutoffDate = new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000));
			
			const [historyResult, processingResult, rateLimitResult] = await Promise.all([
				this.historyRepository.delete({
					createdAt: LessThan(cutoffDate),
				}),
				this.processingHistoryRepository.delete({
					createdAt: LessThan(cutoffDate),
				}),
				this.rateLimitRepository.delete({
					createdAt: LessThan(cutoffDate),
				}),
			]);

			const totalDeleted = (historyResult.affected || 0) + 
				(processingResult.affected || 0) + 
				(rateLimitResult.affected || 0);

			this.logger.info('Cleaned up old notification data', {
				retentionDays,
				cutoffDate,
				deletedRecords: totalDeleted,
			});

			return { deletedRecords: totalDeleted };
		} catch (error) {
			this.logger.error('Failed to cleanup old data', {
				retentionDays,
				error: error as Error,
			});
			throw error;
		}
	}

	/**
	 * Convert entity to domain model
	 */
	private entityToChannel(entity: NotificationChannelEntity): NotificationChannel {
		return {
			id: entity.id,
			name: entity.name,
			type: entity.type,
			enabled: entity.enabled,
			configuration: entity.configuration,
			rateLimits: entity.rateLimits,
			retryConfig: entity.retryConfig,
			templates: entity.templates?.map(template => ({
				id: template.id,
				alertType: template.alertType as any,
				content: {
					subject: template.subject,
					body: template.bodyTemplate,
					textBody: template.textTemplate,
					attachments: template.attachments,
				},
				variables: template.variables || [],
				conditions: template.conditions,
			})) || [],
		};
	}

	/**
	 * Process channel statistics
	 */
	private processChannelStats(rawStats: any[]): Record<string, any> {
		const channelStats: Record<string, any> = {};
		
		for (const stat of rawStats) {
			const successRate = stat.totalNotifications > 0 
				? (stat.successfulNotifications / stat.totalNotifications) * 100 
				: 0;

			channelStats[stat.channelId] = {
				channelId: stat.channelId,
				channelType: stat.channelType,
				totalNotifications: parseInt(stat.totalNotifications),
				successfulNotifications: parseInt(stat.successfulNotifications),
				failedNotifications: parseInt(stat.totalNotifications) - parseInt(stat.successfulNotifications),
				successRate: Math.round(successRate * 100) / 100,
				averageResponseTime: stat.averageResponseTime ? Math.round(stat.averageResponseTime) : null,
			};
		}

		return channelStats;
	}

	/**
	 * Process severity statistics
	 */
	private processSeverityStats(rawStats: any[]): Record<string, number> {
		const severityStats: Record<string, number> = {};
		
		for (const stat of rawStats) {
			severityStats[stat.severity] = parseInt(stat.count);
		}

		return severityStats;
	}

	/**
	 * Process alert type statistics
	 */
	private processAlertTypeStats(rawStats: any[]): Record<string, number> {
		const alertTypeStats: Record<string, number> = {};
		
		for (const stat of rawStats) {
			alertTypeStats[stat.alertType] = parseInt(stat.count);
		}

		return alertTypeStats;
	}

	/**
	 * Process failure reasons
	 */
	private processFailureReasons(rawReasons: any[], totalNotifications: number): any[] {
		return rawReasons.map(reason => ({
			reason: reason.reason || 'Unknown',
			count: parseInt(reason.count),
			percentage: totalNotifications > 0 
				? Math.round((parseInt(reason.count) / totalNotifications) * 10000) / 100
				: 0,
		}));
	}
}