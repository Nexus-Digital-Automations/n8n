import { Service } from '@n8n/di';
import { Logger } from '@n8n/backend-common';
import { NotificationConfig } from '@n8n/config';
import { NotificationHistoryRepository } from '@n8n/db';

import { NotificationService } from './notification.service';

/**
 * Service for handling notification retry logic and scheduling
 */
@Service()
export class NotificationRetryService {
	private retryTimer: NodeJS.Timeout | null = null;
	private readonly retryInterval: number;
	private isShuttingDown = false;

	constructor(
		private readonly logger: Logger,
		private readonly notificationConfig: NotificationConfig,
		private readonly notificationHistoryRepository: NotificationHistoryRepository,
		private readonly notificationService: NotificationService,
	) {
		// Set retry check interval (default: 30 seconds)
		this.retryInterval = (this.notificationConfig.retryDelay || 30) * 1000;
		
		if (this.notificationConfig.enabled) {
			this.startRetryScheduler();
		}
	}

	/**
	 * Start the retry scheduler
	 */
	private startRetryScheduler(): void {
		if (this.retryTimer) {
			clearInterval(this.retryTimer);
		}

		this.retryTimer = setInterval(async () => {
			if (!this.isShuttingDown) {
				await this.processRetries();
			}
		}, this.retryInterval);

		this.logger.info('Notification retry scheduler started', {
			interval: this.retryInterval,
		});
	}

	/**
	 * Process retry notifications
	 */
	async processRetries(): Promise<void> {
		try {
			this.logger.debug('Processing notification retries');

			// Process failed notifications through the main service
			await this.notificationService.processRetryNotifications();

			// Clean up stale notifications
			await this.cleanupStaleNotifications();

		} catch (error) {
			this.logger.error('Failed to process notification retries', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Clean up stale notifications that are stuck in pending/retrying state
	 */
	private async cleanupStaleNotifications(): Promise<void> {
		try {
			const markedCount = await this.notificationHistoryRepository.markStaleAsFailed();
			
			if (markedCount > 0) {
				this.logger.info('Marked stale notifications as failed', { count: markedCount });
			}

		} catch (error) {
			this.logger.error('Failed to cleanup stale notifications', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Force retry of a specific notification
	 */
	async forceRetry(notificationId: string): Promise<boolean> {
		try {
			const notification = await this.notificationHistoryRepository.findOne({
				where: { id: notificationId },
				relations: ['user', 'workflow', 'execution'],
			});

			if (!notification) {
				this.logger.warn('Notification not found for force retry', { notificationId });
				return false;
			}

			if (notification.status !== 'failed' && notification.status !== 'retrying') {
				this.logger.warn('Cannot retry notification with current status', {
					notificationId,
					status: notification.status,
				});
				return false;
			}

			// Reset for immediate retry
			notification.status = 'retrying';
			notification.nextRetryAt = new Date();
			notification.error = null;
			
			await this.notificationHistoryRepository.save(notification);

			this.logger.info('Notification marked for forced retry', { notificationId });
			return true;

		} catch (error) {
			this.logger.error('Failed to force retry notification', {
				notificationId,
				error: error instanceof Error ? error.message : String(error),
			});
			return false;
		}
	}

	/**
	 * Get retry statistics
	 */
	async getRetryStats(): Promise<{
		pendingRetries: number;
		totalRetries: number;
		successfulRetries: number;
		failedRetries: number;
		averageRetryTime: number;
	}> {
		try {
			// Get pending retries
			const pendingRetries = await this.notificationHistoryRepository.count({
				where: {
					status: 'retrying',
				},
			});

			// Get retry statistics from last 24 hours
			const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
			const recentNotifications = await this.notificationHistoryRepository.find({
				where: {
					createdAt: { $gte: since } as any, // TypeORM syntax may vary
				},
			});

			let totalRetries = 0;
			let successfulRetries = 0;
			let failedRetries = 0;
			let totalRetryTime = 0;

			recentNotifications.forEach(notification => {
				if (notification.retryCount > 0) {
					totalRetries++;
					
					if (notification.status === 'sent') {
						successfulRetries++;
						if (notification.sentAt && notification.createdAt) {
							totalRetryTime += notification.sentAt.getTime() - notification.createdAt.getTime();
						}
					} else if (notification.status === 'failed') {
						failedRetries++;
					}
				}
			});

			const averageRetryTime = successfulRetries > 0 ? totalRetryTime / successfulRetries : 0;

			return {
				pendingRetries,
				totalRetries,
				successfulRetries,
				failedRetries,
				averageRetryTime: Math.round(averageRetryTime / 1000), // Convert to seconds
			};

		} catch (error) {
			this.logger.error('Failed to get retry statistics', {
				error: error instanceof Error ? error.message : String(error),
			});

			return {
				pendingRetries: 0,
				totalRetries: 0,
				successfulRetries: 0,
				failedRetries: 0,
				averageRetryTime: 0,
			};
		}
	}

	/**
	 * Clean up old notification history
	 */
	async cleanupOldHistory(olderThanDays = 90): Promise<number> {
		try {
			const deletedCount = await this.notificationHistoryRepository.cleanup(olderThanDays);
			
			if (deletedCount > 0) {
				this.logger.info('Cleaned up old notification history', {
					deletedCount,
					olderThanDays,
				});
			}

			return deletedCount;

		} catch (error) {
			this.logger.error('Failed to cleanup old notification history', {
				error: error instanceof Error ? error.message : String(error),
			});
			return 0;
		}
	}

	/**
	 * Pause retry processing temporarily
	 */
	pauseRetries(): void {
		if (this.retryTimer) {
			clearInterval(this.retryTimer);
			this.retryTimer = null;
			this.logger.info('Notification retry processing paused');
		}
	}

	/**
	 * Resume retry processing
	 */
	resumeRetries(): void {
		if (!this.retryTimer && this.notificationConfig.enabled && !this.isShuttingDown) {
			this.startRetryScheduler();
			this.logger.info('Notification retry processing resumed');
		}
	}

	/**
	 * Check if retry scheduler is running
	 */
	isRunning(): boolean {
		return this.retryTimer !== null;
	}

	/**
	 * Process retries immediately (for manual trigger)
	 */
	async processRetriesNow(): Promise<void> {
		this.logger.info('Processing retries immediately');
		await this.processRetries();
	}

	/**
	 * Get next scheduled retry time
	 */
	async getNextRetryTime(): Promise<Date | null> {
		try {
			const nextRetry = await this.notificationHistoryRepository
				.createQueryBuilder('notification')
				.where('notification.status = :status', { status: 'retrying' })
				.andWhere('notification.nextRetryAt IS NOT NULL')
				.orderBy('notification.nextRetryAt', 'ASC')
				.limit(1)
				.getOne();

			return nextRetry?.nextRetryAt || null;

		} catch (error) {
			this.logger.error('Failed to get next retry time', {
				error: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	}

	/**
	 * Shutdown the retry service
	 */
	async shutdown(): Promise<void> {
		this.isShuttingDown = true;

		if (this.retryTimer) {
			clearInterval(this.retryTimer);
			this.retryTimer = null;
		}

		// Process any immediate retries before shutdown
		try {
			await this.processRetries();
			this.logger.info('Notification retry service shut down');
		} catch (error) {
			this.logger.error('Error during retry service shutdown', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}