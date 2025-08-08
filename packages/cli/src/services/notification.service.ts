import { Logger } from '@n8n/backend-common';
import { NotificationConfig } from '@n8n/config';
import type { 
	NotificationSettingsEntity, 
	NotificationHistoryEntity,
	WorkflowEntity,
	ExecutionEntity,
	User 
} from '@n8n/db';
import { 
	NotificationSettingsRepository,
	NotificationHistoryRepository,
	WorkflowRepository,
	ExecutionRepository,
	UserRepository
} from '@n8n/db';
import { Service } from '@n8n/di';
import { CacheService } from '@/services/cache/cache.service';
import { UrlService } from '@/services/url.service';

import type { 
	INotificationChannel, 
	NotificationPayload, 
	NotificationResult 
} from './notification-channels';
import {
	EmailNotificationChannel,
	WebhookNotificationChannel,
	SlackNotificationChannel,
} from './notification-channels';

export interface NotificationContext {
	workflowId: string;
	executionId: string;
	userId?: string;
	errorMessage?: string;
	failedNode?: string;
	retryCount?: number;
}

export interface BatchNotificationOptions {
	enabled: boolean;
	interval: number; // seconds
	maxSize: number;
	flushOnShutdown: boolean;
}

export interface RateLimitConfig {
	windowMs: number;
	maxRequests: number;
	keyGenerator: (context: NotificationContext) => string;
}

/**
 * Core notification service for handling workflow failure notifications
 * 
 * Features:
 * - Multiple notification channels (email, webhook, Slack, etc.)
 * - Rate limiting per workflow/user
 * - Batch notifications
 * - Retry logic with exponential backoff
 * - Notification history tracking
 * - Real-time and scheduled delivery
 */
@Service()
export class NotificationService {
	private readonly channels = new Map<string, INotificationChannel>();
	private readonly rateLimitCache = new Map<string, { count: number; resetTime: number }>();
	private readonly batchQueue: NotificationContext[] = [];
	private batchTimer: NodeJS.Timeout | null = null;

	constructor(
		private readonly logger: Logger,
		private readonly notificationConfig: NotificationConfig,
		private readonly cacheService: CacheService,
		private readonly urlService: UrlService,
		private readonly notificationSettingsRepository: NotificationSettingsRepository,
		private readonly notificationHistoryRepository: NotificationHistoryRepository,
		private readonly workflowRepository: WorkflowRepository,
		private readonly executionRepository: ExecutionRepository,
		private readonly userRepository: UserRepository,
		private readonly emailChannel: EmailNotificationChannel,
		private readonly webhookChannel: WebhookNotificationChannel,
		private readonly slackChannel: SlackNotificationChannel,
	) {
		this.initializeChannels();
		
		if (this.notificationConfig.batchEnabled) {
			this.startBatchProcessor();
		}
	}

	/**
	 * Initialize notification channels
	 */
	private initializeChannels(): void {
		this.channels.set('email', this.emailChannel);
		this.channels.set('webhook', this.webhookChannel);
		this.channels.set('slack', this.slackChannel);

		this.logger.debug('Notification channels initialized', {
			channels: Array.from(this.channels.keys()),
		});
	}

	/**
	 * Send workflow failure notification
	 */
	async sendWorkflowFailureNotification(context: NotificationContext): Promise<void> {
		try {
			if (!this.notificationConfig.enabled) {
				this.logger.debug('Notifications disabled, skipping', { workflowId: context.workflowId });
				return;
			}

			this.logger.info('Processing workflow failure notification', {
				workflowId: context.workflowId,
				executionId: context.executionId,
				userId: context.userId,
			});

			// Get notification settings for the workflow
			const settings = await this.getNotificationSettings(context.workflowId, context.userId);
			if (!settings.length) {
				this.logger.debug('No notification settings found', { workflowId: context.workflowId });
				return;
			}

			// Process notifications for each user setting
			for (const setting of settings) {
				await this.processUserNotification(context, setting);
			}

		} catch (error) {
			this.logger.error('Failed to send workflow failure notification', {
				workflowId: context.workflowId,
				executionId: context.executionId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Process notification for a specific user setting
	 */
	private async processUserNotification(
		context: NotificationContext,
		setting: NotificationSettingsEntity,
	): Promise<void> {
		if (!setting.enabled) {
			this.logger.debug('Notifications disabled for user', {
				workflowId: context.workflowId,
				userId: setting.userId,
			});
			return;
		}

		// Check rate limiting
		const rateLimitKey = `${setting.workflowId}:${setting.userId}`;
		if (this.isRateLimited(rateLimitKey, setting.rateLimitPerMinute)) {
			this.logger.warn('Rate limit exceeded, skipping notification', {
				workflowId: context.workflowId,
				userId: setting.userId,
				rateLimitKey,
			});
			return;
		}

		// Handle batch notifications
		if (setting.batchEnabled && this.notificationConfig.batchEnabled) {
			this.addToBatch(context);
			return;
		}

		// Send immediate notification
		await this.sendImmediateNotification(context, setting);
	}

	/**
	 * Send immediate notification through configured channels
	 */
	private async sendImmediateNotification(
		context: NotificationContext,
		setting: NotificationSettingsEntity,
	): Promise<void> {
		try {
			// Build notification payload
			const payload = await this.buildNotificationPayload(context);
			if (!payload) {
				this.logger.warn('Failed to build notification payload', { 
					workflowId: context.workflowId,
					executionId: context.executionId,
				});
				return;
			}

			// Send through each configured channel
			const promises = setting.channels.map(channelType =>
				this.sendThroughChannel(channelType, payload, setting)
			);

			await Promise.allSettled(promises);

		} catch (error) {
			this.logger.error('Failed to send immediate notification', {
				workflowId: context.workflowId,
				executionId: context.executionId,
				userId: setting.userId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Send notification through a specific channel
	 */
	private async sendThroughChannel(
		channelType: string,
		payload: NotificationPayload,
		setting: NotificationSettingsEntity,
	): Promise<void> {
		const channel = this.channels.get(channelType);
		if (!channel) {
			this.logger.warn('Unknown notification channel', { channelType });
			return;
		}

		// Create notification history entry
		const history = await this.createNotificationHistory(
			setting.workflowId,
			payload.execution.id,
			setting.userId,
			channelType,
		);

		try {
			// Check if channel is available
			const isAvailable = await channel.isAvailable();
			if (!isAvailable) {
				throw new Error(`Channel ${channelType} is not available`);
			}

			// Get channel configuration
			const channelConfig = setting.config[channelType as keyof typeof setting.config];
			
			// Send notification
			const result = await channel.send(payload, channelConfig);

			if (result.success) {
				// Mark as sent
				history.markAsSent(result.response);
				await this.notificationHistoryRepository.save(history);

				this.logger.info('Notification sent successfully', {
					workflowId: setting.workflowId,
					executionId: payload.execution.id,
					userId: setting.userId,
					channel: channelType,
					historyId: history.id,
				});
			} else {
				throw new Error(result.error || 'Unknown error');
			}

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			
			// Schedule retry if applicable
			const retryConfig = channel.getRetryConfig();
			const nextRetryAt = history.canRetry(retryConfig.maxRetries) 
				? new Date(Date.now() + channel.calculateRetryDelay(history.retryCount) * 1000)
				: undefined;

			history.markAsFailed(errorMessage, nextRetryAt);
			await this.notificationHistoryRepository.save(history);

			this.logger.error('Failed to send notification', {
				workflowId: setting.workflowId,
				executionId: payload.execution.id,
				userId: setting.userId,
				channel: channelType,
				error: errorMessage,
				willRetry: !!nextRetryAt,
				nextRetryAt: nextRetryAt?.toISOString(),
				historyId: history.id,
			});
		}
	}

	/**
	 * Build notification payload from context
	 */
	private async buildNotificationPayload(context: NotificationContext): Promise<NotificationPayload | null> {
		try {
			// Get workflow, execution, and user data
			const [workflow, execution, user] = await Promise.all([
				this.workflowRepository.findOne({ where: { id: context.workflowId } }),
				this.executionRepository.findOne({ where: { id: context.executionId } }),
				context.userId 
					? this.userRepository.findOne({ where: { id: context.userId } })
					: null,
			]);

			if (!workflow || !execution) {
				this.logger.warn('Missing workflow or execution data', {
					workflowId: context.workflowId,
					executionId: context.executionId,
					hasWorkflow: !!workflow,
					hasExecution: !!execution,
				});
				return null;
			}

			// Build URLs
			const executionUrl = this.urlService.getWebhookBaseUrl() 
				? `${this.urlService.getWebhookBaseUrl()}/execution/${execution.id}`
				: undefined;
			
			const workflowUrl = this.urlService.getWebhookBaseUrl()
				? `${this.urlService.getWebhookBaseUrl()}/workflow/${workflow.id}`
				: undefined;

			const instanceUrl = this.urlService.getWebhookBaseUrl();

			return {
				workflow: {
					id: workflow.id,
					name: workflow.name,
					active: workflow.active,
					nodes: workflow.nodes,
				},
				execution: {
					id: execution.id,
					mode: execution.mode,
					startedAt: execution.startedAt || new Date(),
					stoppedAt: execution.stoppedAt || null,
					status: execution.status,
					error: execution.executionData?.data ? JSON.parse(execution.executionData.data)?.resultData?.error?.message : undefined,
				},
				user: user ? {
					id: user.id,
					email: user.email,
					firstName: user.firstName,
					lastName: user.lastName,
				} : {
					id: 'system',
					email: 'system@n8n.io',
					firstName: 'System',
					lastName: 'User',
				},
				context: {
					executionUrl,
					workflowUrl,
					instanceUrl,
					errorMessage: context.errorMessage,
					failedNode: context.failedNode,
					retryCount: context.retryCount,
				},
			};

		} catch (error) {
			this.logger.error('Failed to build notification payload', {
				workflowId: context.workflowId,
				executionId: context.executionId,
				error: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	}

	/**
	 * Get notification settings for a workflow
	 */
	private async getNotificationSettings(
		workflowId: string,
		userId?: string,
	): Promise<NotificationSettingsEntity[]> {
		const where = userId 
			? { workflowId, userId }
			: { workflowId };

		return await this.notificationSettingsRepository.find({
			where,
			relations: ['user', 'workflow'],
		});
	}

	/**
	 * Create notification history entry
	 */
	private async createNotificationHistory(
		workflowId: string,
		executionId: string,
		userId: string,
		channel: string,
	): Promise<NotificationHistoryEntity> {
		const history = this.notificationHistoryRepository.create({
			workflowId,
			executionId,
			userId,
			channel,
			status: 'pending',
			retryCount: 0,
			metadata: {
				payload: {},
			},
		});

		return await this.notificationHistoryRepository.save(history);
	}

	/**
	 * Check if requests are rate limited
	 */
	private isRateLimited(key: string, maxRequests: number): boolean {
		const now = Date.now();
		const windowMs = 60 * 1000; // 1 minute
		
		const existing = this.rateLimitCache.get(key);
		
		if (!existing || existing.resetTime <= now) {
			// Reset window
			this.rateLimitCache.set(key, { count: 1, resetTime: now + windowMs });
			return false;
		}

		if (existing.count >= maxRequests) {
			return true;
		}

		existing.count++;
		return false;
	}

	/**
	 * Add notification to batch queue
	 */
	private addToBatch(context: NotificationContext): void {
		this.batchQueue.push(context);
		
		if (this.batchQueue.length >= this.notificationConfig.batchSize) {
			this.processBatch();
		}
	}

	/**
	 * Start batch processor timer
	 */
	private startBatchProcessor(): void {
		if (this.batchTimer) {
			clearInterval(this.batchTimer);
		}

		this.batchTimer = setInterval(() => {
			if (this.batchQueue.length > 0) {
				this.processBatch();
			}
		}, this.notificationConfig.batchInterval * 1000);

		this.logger.debug('Batch processor started', {
			interval: this.notificationConfig.batchInterval,
			maxSize: this.notificationConfig.batchSize,
		});
	}

	/**
	 * Process batched notifications
	 */
	private async processBatch(): Promise<void> {
		if (this.batchQueue.length === 0) {
			return;
		}

		const batch = this.batchQueue.splice(0, this.notificationConfig.batchSize);
		
		this.logger.info('Processing notification batch', { batchSize: batch.length });

		const promises = batch.map(context => this.sendWorkflowFailureNotification(context));
		await Promise.allSettled(promises);
	}

	/**
	 * Process retry notifications
	 */
	async processRetryNotifications(): Promise<void> {
		try {
			// Find notifications ready for retry
			const retryNotifications = await this.notificationHistoryRepository.find({
				where: {
					status: 'retrying',
					nextRetryAt: { $lte: new Date() } as any, // TypeORM syntax may vary
				},
				relations: ['workflow', 'execution', 'user'],
			});

			this.logger.info('Processing retry notifications', { count: retryNotifications.length });

			for (const history of retryNotifications) {
				await this.retryNotification(history);
			}

		} catch (error) {
			this.logger.error('Failed to process retry notifications', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Retry a failed notification
	 */
	private async retryNotification(history: NotificationHistoryEntity): Promise<void> {
		const channel = this.channels.get(history.channel);
		if (!channel) {
			this.logger.warn('Channel not found for retry', { 
				historyId: history.id,
				channel: history.channel,
			});
			return;
		}

		try {
			// Build payload for retry
			const context: NotificationContext = {
				workflowId: history.workflowId,
				executionId: history.executionId,
				userId: history.userId,
			};

			const payload = await this.buildNotificationPayload(context);
			if (!payload) {
				throw new Error('Failed to build notification payload for retry');
			}

			// Get notification settings for channel config
			const settings = await this.notificationSettingsRepository.findOne({
				where: { workflowId: history.workflowId, userId: history.userId },
			});

			if (!settings) {
				throw new Error('Notification settings not found for retry');
			}

			const channelConfig = settings.config[history.channel as keyof typeof settings.config];
			const result = await channel.send(payload, channelConfig);

			if (result.success) {
				history.markAsSent(result.response);
				this.logger.info('Retry notification sent successfully', {
					historyId: history.id,
					channel: history.channel,
					retryCount: history.retryCount,
				});
			} else {
				throw new Error(result.error || 'Unknown retry error');
			}

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const retryConfig = channel.getRetryConfig();
			
			const nextRetryAt = history.canRetry(retryConfig.maxRetries)
				? new Date(Date.now() + channel.calculateRetryDelay(history.retryCount) * 1000)
				: undefined;

			history.markAsFailed(errorMessage, nextRetryAt);
			
			this.logger.error('Retry notification failed', {
				historyId: history.id,
				channel: history.channel,
				retryCount: history.retryCount,
				error: errorMessage,
				willRetryAgain: !!nextRetryAt,
			});
		}

		await this.notificationHistoryRepository.save(history);
	}

	/**
	 * Get notification statistics
	 */
	async getNotificationStats(workflowId?: string, userId?: string): Promise<{
		total: number;
		sent: number;
		failed: number;
		pending: number;
		channels: Record<string, number>;
	}> {
		const where: Record<string, unknown> = {};
		if (workflowId) where.workflowId = workflowId;
		if (userId) where.userId = userId;

		const notifications = await this.notificationHistoryRepository.find({ where });
		
		const stats = {
			total: notifications.length,
			sent: 0,
			failed: 0,
			pending: 0,
			channels: {} as Record<string, number>,
		};

		notifications.forEach(notification => {
			switch (notification.status) {
				case 'sent':
					stats.sent++;
					break;
				case 'failed':
					stats.failed++;
					break;
				case 'pending':
				case 'retrying':
					stats.pending++;
					break;
			}

			stats.channels[notification.channel] = (stats.channels[notification.channel] || 0) + 1;
		});

		return stats;
	}

	/**
	 * Clean up resources on shutdown
	 */
	async shutdown(): Promise<void> {
		if (this.batchTimer) {
			clearInterval(this.batchTimer);
			this.batchTimer = null;
		}

		// Process any remaining batched notifications
		if (this.batchQueue.length > 0) {
			this.logger.info('Processing remaining batched notifications on shutdown', {
				count: this.batchQueue.length,
			});
			await this.processBatch();
		}

		this.logger.info('Notification service shut down');
	}
}