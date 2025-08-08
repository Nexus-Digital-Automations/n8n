import { Service } from '@n8n/di';
import { DataSource, Repository, LessThanOrEqual, MoreThan } from '@n8n/typeorm';
import { NotificationHistoryEntity, type NotificationStatus } from '../entities/notification-history.entity';

export interface NotificationHistoryStats {
	total: number;
	sent: number;
	failed: number;
	pending: number;
	retrying: number;
	channels: Record<string, number>;
	recentActivity: Array<{
		date: string;
		sent: number;
		failed: number;
	}>;
}

/**
 * Repository for notification history operations
 */
@Service()
export class NotificationHistoryRepository extends Repository<NotificationHistoryEntity> {
	constructor(dataSource: DataSource) {
		super(NotificationHistoryEntity, dataSource.manager);
	}

	/**
	 * Find notification history by workflow ID
	 */
	async findByWorkflowId(workflowId: string, limit = 100): Promise<NotificationHistoryEntity[]> {
		return await this.find({
			where: { workflowId },
			relations: ['user', 'workflow', 'execution'],
			order: { createdAt: 'DESC' },
			take: limit,
		});
	}

	/**
	 * Find notification history by execution ID
	 */
	async findByExecutionId(executionId: string): Promise<NotificationHistoryEntity[]> {
		return await this.find({
			where: { executionId },
			relations: ['user', 'workflow', 'execution'],
			order: { createdAt: 'DESC' },
		});
	}

	/**
	 * Find notification history by user ID
	 */
	async findByUserId(userId: string, limit = 100): Promise<NotificationHistoryEntity[]> {
		return await this.find({
			where: { userId },
			relations: ['user', 'workflow', 'execution'],
			order: { createdAt: 'DESC' },
			take: limit,
		});
	}

	/**
	 * Find notifications ready for retry
	 */
	async findReadyForRetry(): Promise<NotificationHistoryEntity[]> {
		return await this.find({
			where: {
				status: 'retrying',
				nextRetryAt: LessThanOrEqual(new Date()),
			},
			relations: ['user', 'workflow', 'execution'],
			order: { nextRetryAt: 'ASC' },
		});
	}

	/**
	 * Find notifications by status
	 */
	async findByStatus(
		status: NotificationStatus,
		limit = 100,
	): Promise<NotificationHistoryEntity[]> {
		return await this.find({
			where: { status },
			relations: ['user', 'workflow', 'execution'],
			order: { createdAt: 'DESC' },
			take: limit,
		});
	}

	/**
	 * Find failed notifications that can still be retried
	 */
	async findRetryable(maxRetries = 3): Promise<NotificationHistoryEntity[]> {
		return await this.createQueryBuilder('notification')
			.where('notification.status = :status', { status: 'retrying' })
			.andWhere('notification.retryCount < :maxRetries', { maxRetries })
			.andWhere('notification.nextRetryAt <= :now', { now: new Date() })
			.leftJoinAndSelect('notification.user', 'user')
			.leftJoinAndSelect('notification.workflow', 'workflow')
			.leftJoinAndSelect('notification.execution', 'execution')
			.orderBy('notification.nextRetryAt', 'ASC')
			.getMany();
	}

	/**
	 * Get notification statistics
	 */
	async getStats(
		workflowId?: string,
		userId?: string,
		since?: Date,
	): Promise<NotificationHistoryStats> {
		const queryBuilder = this.createQueryBuilder('notification');
		
		if (workflowId) {
			queryBuilder.andWhere('notification.workflowId = :workflowId', { workflowId });
		}
		
		if (userId) {
			queryBuilder.andWhere('notification.userId = :userId', { userId });
		}
		
		if (since) {
			queryBuilder.andWhere('notification.createdAt >= :since', { since });
		}

		const notifications = await queryBuilder.getMany();
		
		const stats: NotificationHistoryStats = {
			total: notifications.length,
			sent: 0,
			failed: 0,
			pending: 0,
			retrying: 0,
			channels: {},
			recentActivity: [],
		};

		// Count by status and channel
		notifications.forEach(notification => {
			switch (notification.status) {
				case 'sent':
					stats.sent++;
					break;
				case 'failed':
					stats.failed++;
					break;
				case 'pending':
					stats.pending++;
					break;
				case 'retrying':
					stats.retrying++;
					break;
			}

			stats.channels[notification.channel] = (stats.channels[notification.channel] || 0) + 1;
		});

		// Calculate recent activity (last 7 days)
		const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
		const recentNotifications = notifications.filter(n => n.createdAt >= sevenDaysAgo);
		
		const dailyStats = new Map<string, { sent: number; failed: number }>();
		
		recentNotifications.forEach(notification => {
			const date = notification.createdAt.toISOString().split('T')[0];
			if (!dailyStats.has(date)) {
				dailyStats.set(date, { sent: 0, failed: 0 });
			}
			
			const dayStats = dailyStats.get(date)!;
			if (notification.status === 'sent') {
				dayStats.sent++;
			} else if (notification.status === 'failed') {
				dayStats.failed++;
			}
		});

		stats.recentActivity = Array.from(dailyStats.entries()).map(([date, counts]) => ({
			date,
			sent: counts.sent,
			failed: counts.failed,
		}));

		return stats;
	}

	/**
	 * Get notification history with pagination
	 */
	async findPaginated(
		page = 1,
		limit = 50,
		filters?: {
			workflowId?: string;
			userId?: string;
			status?: NotificationStatus;
			channel?: string;
			since?: Date;
			until?: Date;
		},
	): Promise<{
		notifications: NotificationHistoryEntity[];
		total: number;
		page: number;
		totalPages: number;
	}> {
		const queryBuilder = this.createQueryBuilder('notification')
			.leftJoinAndSelect('notification.user', 'user')
			.leftJoinAndSelect('notification.workflow', 'workflow')
			.leftJoinAndSelect('notification.execution', 'execution');

		if (filters) {
			if (filters.workflowId) {
				queryBuilder.andWhere('notification.workflowId = :workflowId', { 
					workflowId: filters.workflowId,
				});
			}
			
			if (filters.userId) {
				queryBuilder.andWhere('notification.userId = :userId', { userId: filters.userId });
			}
			
			if (filters.status) {
				queryBuilder.andWhere('notification.status = :status', { status: filters.status });
			}
			
			if (filters.channel) {
				queryBuilder.andWhere('notification.channel = :channel', { channel: filters.channel });
			}
			
			if (filters.since) {
				queryBuilder.andWhere('notification.createdAt >= :since', { since: filters.since });
			}
			
			if (filters.until) {
				queryBuilder.andWhere('notification.createdAt <= :until', { until: filters.until });
			}
		}

		const total = await queryBuilder.getCount();
		const notifications = await queryBuilder
			.orderBy('notification.createdAt', 'DESC')
			.skip((page - 1) * limit)
			.take(limit)
			.getMany();

		return {
			notifications,
			total,
			page,
			totalPages: Math.ceil(total / limit),
		};
	}

	/**
	 * Clean up old notification history entries
	 */
	async cleanup(olderThanDays = 90): Promise<number> {
		const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
		
		const result = await this.delete({
			createdAt: LessThanOrEqual(cutoffDate),
		});

		return result.affected || 0;
	}

	/**
	 * Get recent failure rate for a workflow
	 */
	async getRecentFailureRate(
		workflowId: string,
		hours = 24,
	): Promise<{ total: number; failed: number; rate: number }> {
		const since = new Date(Date.now() - hours * 60 * 60 * 1000);
		
		const notifications = await this.find({
			where: {
				workflowId,
				createdAt: MoreThan(since),
			},
		});

		const total = notifications.length;
		const failed = notifications.filter(n => n.status === 'failed').length;
		const rate = total > 0 ? (failed / total) * 100 : 0;

		return { total, failed, rate };
	}

	/**
	 * Find notifications that need cleanup (old pending/retrying)
	 */
	async findStaleNotifications(hours = 24): Promise<NotificationHistoryEntity[]> {
		const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);
		
		return await this.find({
			where: [
				{
					status: 'pending',
					createdAt: LessThanOrEqual(cutoffDate),
				},
				{
					status: 'retrying',
					createdAt: LessThanOrEqual(cutoffDate),
					nextRetryAt: LessThanOrEqual(cutoffDate),
				},
			],
		});
	}

	/**
	 * Mark stale notifications as failed
	 */
	async markStaleAsFailed(): Promise<number> {
		const staleNotifications = await this.findStaleNotifications();
		
		for (const notification of staleNotifications) {
			notification.markAsFailed('Notification timed out');
			await this.save(notification);
		}

		return staleNotifications.length;
	}

	/**
	 * Get channel performance metrics
	 */
	async getChannelMetrics(
		since?: Date,
	): Promise<Record<string, { total: number; success: number; failure: number; successRate: number }>> {
		const queryBuilder = this.createQueryBuilder('notification');
		
		if (since) {
			queryBuilder.where('notification.createdAt >= :since', { since });
		}

		const notifications = await queryBuilder.getMany();
		const metrics: Record<string, { total: number; success: number; failure: number; successRate: number }> = {};

		notifications.forEach(notification => {
			if (!metrics[notification.channel]) {
				metrics[notification.channel] = { total: 0, success: 0, failure: 0, successRate: 0 };
			}

			const channelMetric = metrics[notification.channel];
			channelMetric.total++;

			if (notification.status === 'sent') {
				channelMetric.success++;
			} else if (notification.status === 'failed') {
				channelMetric.failure++;
			}
		});

		// Calculate success rates
		Object.values(metrics).forEach(metric => {
			metric.successRate = metric.total > 0 ? (metric.success / metric.total) * 100 : 0;
		});

		return metrics;
	}
}