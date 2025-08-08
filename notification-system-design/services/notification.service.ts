/**
 * Core notification service following n8n's service architecture patterns
 */

import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { Service } from '@n8n/di';
import { ErrorReporter } from 'n8n-core';

import type {
	NotificationAlert,
	NotificationChannel,
	NotificationResult,
	NotificationContext,
	INotificationChannelService,
	AlertSeverity,
	DeliveryStatus,
} from '../interfaces/notification-channel.interface';
import type {
	AlertRule,
	AlertEvaluationContext,
	AlertRuleEvaluationResult,
	IAlertRuleService,
} from '../interfaces/alert-rules.interface';

import { EmailChannelService } from './channels/email-channel.service';
import { WebhookChannelService } from './channels/webhook-channel.service';
import { SmsChannelService } from './channels/sms-channel.service';
import { SlackChannelService } from './channels/slack-channel.service';
import { AlertRuleService } from './alert-rule.service';
import { NotificationQueueService } from './notification-queue.service';
import { RateLimitService } from './rate-limit.service';
import { NotificationTemplateService } from './notification-template.service';
import { NotificationRepository } from '../repositories/notification.repository';

@Service()
export class NotificationService {
	private readonly channelServices = new Map<string, INotificationChannelService>();

	constructor(
		private readonly globalConfig: GlobalConfig,
		private readonly logger: Logger,
		private readonly errorReporter: ErrorReporter,
		private readonly alertRuleService: IAlertRuleService,
		private readonly queueService: NotificationQueueService,
		private readonly rateLimitService: RateLimitService,
		private readonly templateService: NotificationTemplateService,
		private readonly notificationRepository: NotificationRepository,
	) {
		this.initializeChannelServices();
	}

	/**
	 * Initialize all notification channel services
	 */
	private initializeChannelServices(): void {
		// Register built-in channel services
		this.channelServices.set('email', new EmailChannelService(
			this.globalConfig,
			this.logger,
			this.errorReporter,
		));
		this.channelServices.set('webhook', new WebhookChannelService(
			this.globalConfig,
			this.logger,
			this.errorReporter,
		));
		this.channelServices.set('sms', new SmsChannelService(
			this.globalConfig,
			this.logger,
			this.errorReporter,
		));
		this.channelServices.set('slack', new SlackChannelService(
			this.globalConfig,
			this.logger,
			this.errorReporter,
		));

		this.logger.debug('Initialized notification channel services', {
			channels: Array.from(this.channelServices.keys()),
		});
	}

	/**
	 * Process an alert and send notifications based on configured rules
	 */
	async processAlert(
		alert: NotificationAlert,
		context: NotificationContext,
	): Promise<NotificationProcessResult> {
		const requestId = context.requestId;
		const startTime = Date.now();

		this.logger.debug('Processing alert', {
			requestId,
			alertId: alert.id,
			alertType: alert.type,
			severity: alert.severity,
		});

		try {
			// Build evaluation context
			const evaluationContext: AlertEvaluationContext = {
				alert,
				execution: alert.execution,
				workflow: alert.workflow,
				user: context.user,
				project: context.project,
				instance: context.instance,
				request: {
					id: requestId,
					timestamp: context.timestamp,
				},
			};

			// Evaluate alert against all rules
			const ruleResults = await this.alertRuleService.evaluateAlert(
				alert,
				evaluationContext,
			);

			// Filter to only matched rules
			const matchedRules = ruleResults.filter(result => result.matched);

			if (matchedRules.length === 0) {
				this.logger.debug('No matching rules found for alert', {
					requestId,
					alertId: alert.id,
				});
				return {
					success: true,
					alertId: alert.id,
					matchedRules: 0,
					notifications: [],
					processingTime: Date.now() - startTime,
				};
			}

			this.logger.debug('Found matching rules', {
				requestId,
				alertId: alert.id,
				matchedRules: matchedRules.length,
				ruleIds: matchedRules.map(r => r.ruleId),
			});

			// Execute actions for matched rules
			const notifications: NotificationResult[] = [];
			
			for (const ruleResult of matchedRules) {
				const ruleNotifications = await this.executeRuleActions(
					ruleResult,
					alert,
					context,
				);
				notifications.push(...ruleNotifications);
			}

			// Store processing result
			await this.notificationRepository.saveAlertProcessing({
				alertId: alert.id,
				requestId,
				matchedRules: matchedRules.length,
				notifications: notifications.length,
				successfulNotifications: notifications.filter(n => n.success).length,
				processingTime: Date.now() - startTime,
				createdAt: new Date(),
			});

			return {
				success: true,
				alertId: alert.id,
				matchedRules: matchedRules.length,
				notifications,
				processingTime: Date.now() - startTime,
			};

		} catch (error) {
			this.errorReporter.error(error);
			this.logger.error('Failed to process alert', {
				requestId,
				alertId: alert.id,
				error: error as Error,
			});

			return {
				success: false,
				alertId: alert.id,
				matchedRules: 0,
				notifications: [],
				processingTime: Date.now() - startTime,
				error: error as Error,
			};
		}
	}

	/**
	 * Execute actions for a matched rule
	 */
	private async executeRuleActions(
		ruleResult: AlertRuleEvaluationResult,
		alert: NotificationAlert,
		context: NotificationContext,
	): Promise<NotificationResult[]> {
		const results: NotificationResult[] = [];

		for (const action of ruleResult.actionsToExecute) {
			try {
				if (action.type === 'send_notification') {
					const notificationResult = await this.sendNotificationAction(
						action.target.id,
						alert,
						context,
						action.parameters,
					);
					results.push(notificationResult);
				}
				// Add other action types as needed
			} catch (error) {
				this.logger.error('Failed to execute rule action', {
					ruleId: ruleResult.ruleId,
					actionType: action.type,
					targetId: action.target.id,
					error: error as Error,
				});

				results.push({
					success: false,
					status: DeliveryStatus.FAILED,
					attempts: 1,
					error: {
						code: 'ACTION_EXECUTION_FAILED',
						message: (error as Error).message,
						retryable: true,
					},
				});
			}
		}

		return results;
	}

	/**
	 * Send notification through a specific channel
	 */
	private async sendNotificationAction(
		channelId: string,
		alert: NotificationAlert,
		context: NotificationContext,
		parameters: any,
	): Promise<NotificationResult> {
		// Get channel configuration
		const channel = await this.notificationRepository.getChannel(channelId);
		if (!channel) {
			throw new Error(`Notification channel not found: ${channelId}`);
		}

		if (!channel.enabled) {
			this.logger.debug('Skipping disabled channel', {
				channelId,
				alertId: alert.id,
			});
			return {
				success: false,
				status: DeliveryStatus.FAILED,
				attempts: 0,
				error: {
					code: 'CHANNEL_DISABLED',
					message: 'Notification channel is disabled',
					retryable: false,
				},
			};
		}

		// Check rate limits
		const rateLimitResult = await this.rateLimitService.checkLimit(
			channelId,
			channel.rateLimits,
		);

		if (!rateLimitResult.allowed) {
			this.logger.warn('Rate limit exceeded for channel', {
				channelId,
				alertId: alert.id,
				resetAt: rateLimitResult.resetAt,
			});

			// Queue for later delivery if rate limited
			await this.queueService.enqueueNotification({
				channelId,
				alert,
				context,
				parameters,
				scheduledAt: rateLimitResult.resetAt,
			});

			return {
				success: false,
				status: DeliveryStatus.RATE_LIMITED,
				attempts: 0,
				nextRetryAt: rateLimitResult.resetAt,
			};
		}

		// Get channel service
		const channelService = this.channelServices.get(channel.type);
		if (!channelService) {
			throw new Error(`No service available for channel type: ${channel.type}`);
		}

		// Send notification
		try {
			const result = await channelService.sendNotification(
				channel,
				alert,
				context,
			);

			// Update rate limit counter
			await this.rateLimitService.recordUsage(channelId);

			// Store notification record
			await this.notificationRepository.saveNotification({
				id: result.messageId || `${alert.id}-${channelId}-${Date.now()}`,
				alertId: alert.id,
				channelId,
				status: result.status,
				attempts: result.attempts,
				sentAt: result.success ? new Date() : undefined,
				error: result.error,
				metadata: result.providerMetadata,
			});

			return result;

		} catch (error) {
			this.errorReporter.error(error);
			this.logger.error('Failed to send notification', {
				channelId,
				alertId: alert.id,
				error: error as Error,
			});

			// Check if error is retryable
			const isRetryable = this.isRetryableError(error as Error, channel);
			
			if (isRetryable && channel.retryConfig) {
				// Queue for retry
				await this.queueService.enqueueNotification({
					channelId,
					alert,
					context,
					parameters,
					attempt: 1,
					maxAttempts: channel.retryConfig.maxAttempts,
				});

				return {
					success: false,
					status: DeliveryStatus.RETRY_SCHEDULED,
					attempts: 1,
					nextRetryAt: new Date(Date.now() + channel.retryConfig.baseDelayMs),
					error: {
						code: 'SEND_FAILED_RETRY_SCHEDULED',
						message: (error as Error).message,
						retryable: true,
					},
				};
			}

			return {
				success: false,
				status: DeliveryStatus.FAILED,
				attempts: 1,
				error: {
					code: 'SEND_FAILED',
					message: (error as Error).message,
					retryable: false,
				},
			};
		}
	}

	/**
	 * Send immediate notification (bypass rules)
	 */
	async sendImmediateNotification(
		channelId: string,
		alert: NotificationAlert,
		context: NotificationContext,
	): Promise<NotificationResult> {
		this.logger.debug('Sending immediate notification', {
			channelId,
			alertId: alert.id,
			requestId: context.requestId,
		});

		return this.sendNotificationAction(channelId, alert, context, {});
	}

	/**
	 * Test notification channel
	 */
	async testChannel(channelId: string): Promise<TestChannelResult> {
		const channel = await this.notificationRepository.getChannel(channelId);
		if (!channel) {
			throw new Error(`Notification channel not found: ${channelId}`);
		}

		const channelService = this.channelServices.get(channel.type);
		if (!channelService) {
			throw new Error(`No service available for channel type: ${channel.type}`);
		}

		const startTime = Date.now();

		try {
			const testResult = await channelService.testConnection(channel.configuration);
			
			return {
				success: testResult.success,
				channelId,
				channelType: channel.type,
				responseTime: Date.now() - startTime,
				message: testResult.message,
				error: testResult.error,
				details: testResult.details,
			};
		} catch (error) {
			return {
				success: false,
				channelId,
				channelType: channel.type,
				responseTime: Date.now() - startTime,
				message: 'Test failed with exception',
				error: (error as Error).message,
			};
		}
	}

	/**
	 * Get notification statistics
	 */
	async getNotificationStatistics(
		filters: NotificationStatisticsFilters,
	): Promise<NotificationStatistics> {
		return this.notificationRepository.getStatistics(filters);
	}

	/**
	 * Register custom channel service
	 */
	registerChannelService(
		channelType: string,
		service: INotificationChannelService,
	): void {
		this.channelServices.set(channelType, service);
		this.logger.debug('Registered custom channel service', { channelType });
	}

	/**
	 * Check if error is retryable
	 */
	private isRetryableError(error: Error, channel: NotificationChannel): boolean {
		if (!channel.retryConfig) {
			return false;
		}

		// Check error message patterns
		const retryablePatterns = [
			'timeout',
			'rate limit',
			'service unavailable',
			'internal server error',
			'connection refused',
			'network error',
		];

		const errorMessage = error.message.toLowerCase();
		return retryablePatterns.some(pattern => errorMessage.includes(pattern));
	}
}

/**
 * Supporting interfaces
 */
export interface NotificationProcessResult {
	success: boolean;
	alertId: string;
	matchedRules: number;
	notifications: NotificationResult[];
	processingTime: number;
	error?: Error;
}

export interface TestChannelResult {
	success: boolean;
	channelId: string;
	channelType: string;
	responseTime: number;
	message: string;
	error?: string;
	details?: Record<string, any>;
}

export interface NotificationStatisticsFilters {
	startDate: Date;
	endDate: Date;
	channelIds?: string[];
	alertTypes?: string[];
	severities?: AlertSeverity[];
	projectIds?: string[];
}

export interface NotificationStatistics {
	totalAlerts: number;
	totalNotifications: number;
	successfulNotifications: number;
	failedNotifications: number;
	successRate: number;
	averageProcessingTime: number;
	byChannel: Record<string, ChannelStatistics>;
	bySeverity: Record<AlertSeverity, number>;
	byAlertType: Record<string, number>;
	topFailureReasons: FailureReason[];
	timeSeriesData: TimeSeriesDataPoint[];
}

export interface ChannelStatistics {
	channelId: string;
	channelType: string;
	totalNotifications: number;
	successfulNotifications: number;
	failedNotifications: number;
	successRate: number;
	averageResponseTime: number;
	rateLimitHits: number;
}

export interface FailureReason {
	reason: string;
	count: number;
	percentage: number;
}

export interface TimeSeriesDataPoint {
	timestamp: Date;
	totalNotifications: number;
	successfulNotifications: number;
	failedNotifications: number;
}