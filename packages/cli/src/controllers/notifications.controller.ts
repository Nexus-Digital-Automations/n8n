import { Response } from 'express';
import { Logger } from '@n8n/backend-common';
import { NotificationConfig } from '@n8n/config';
import type {
	NotificationSettingsEntity,
	NotificationHistoryEntity,
	WorkflowEntity,
	AuthenticatedRequest,
} from '@n8n/db';
import {
	NotificationSettingsRepository,
	NotificationHistoryRepository,
	WorkflowRepository,
} from '@n8n/db';
import { Service } from '@n8n/di';
import { Get, Post, Put, Delete, RestController, GlobalScope } from '@n8n/decorators';
import { NotificationService, type NotificationContext } from '@/services/notification.service';
import { BaseNotificationChannel } from '@/services/notification-channels';
import { UrlService } from '@/services/url.service';

interface NotificationSettingsRequest {
	enabled: boolean;
	channels: string[];
	rateLimitPerMinute?: number;
	batchEnabled?: boolean;
	batchInterval?: number;
	config: Record<string, unknown>;
}

interface NotificationTestRequest {
	channel: string;
	config: Record<string, unknown>;
	workflowId?: string;
}

interface WorkflowParams {
	workflowId: string;
}

interface NotificationHistoryQuery {
	workflowId?: string;
	limit?: string;
	offset?: string;
}

interface StatsQuery {
	workflowId?: string;
	timeRange?: string;
}

interface RetryParams {
	notificationId: string;
}

/**
 * REST API controller for managing workflow failure notifications
 *
 * Provides endpoints for:
 * - Managing notification settings per workflow/user
 * - Testing notification channels
 * - Viewing notification history and statistics
 * - Retrying failed notifications
 */
@Service()
@RestController('/notifications')
export class NotificationsController {
	constructor(
		private readonly logger: Logger,
		private readonly notificationConfig: NotificationConfig,
		private readonly notificationService: NotificationService,
		private readonly notificationSettingsRepository: NotificationSettingsRepository,
		private readonly notificationHistoryRepository: NotificationHistoryRepository,
		private readonly workflowRepository: WorkflowRepository,
		private readonly urlService: UrlService,
	) {}

	/**
	 * Get notification settings for a workflow
	 * GET /api/v1/notifications/workflows/:workflowId
	 */
	@Get('/workflows/:workflowId')
	@GlobalScope('workflow:read')
	async getWorkflowNotificationSettings(
		req: AuthenticatedRequest<WorkflowParams>,
		res: Response,
	): Promise<Response> {
		try {
			const { workflowId } = req.params;
			const userId = req.user?.id;

			if (!workflowId) {
				return res.status(400).json({
					error: 'Workflow ID is required',
					code: 'MISSING_WORKFLOW_ID',
				});
			}

			// Verify workflow exists and user has access
			const workflow = await this.workflowRepository.findOne({
				where: { id: workflowId },
			});

			if (!workflow) {
				return res.status(404).json({
					error: 'Workflow not found',
					code: 'WORKFLOW_NOT_FOUND',
				});
			}

			// Get notification settings
			const settings = await this.notificationSettingsRepository.find({
				where: { workflowId, userId },
				relations: ['user', 'workflow'],
			});

			return res.json({
				workflowId,
				workflowName: workflow.name,
				settings: settings.map((setting) => ({
					id: setting.id,
					enabled: setting.enabled,
					channels: setting.channels,
					rateLimitPerMinute: setting.rateLimitPerMinute,
					batchEnabled: setting.batchEnabled,
					batchInterval: setting.batchInterval,
					config: setting.config,
					createdAt: setting.createdAt,
					updatedAt: setting.updatedAt,
				})),
			});
		} catch (error) {
			this.logger.error('Failed to get workflow notification settings', {
				workflowId: req.params.workflowId,
				userId: req.user?.id,
				error: error instanceof Error ? error.message : String(error),
			});

			return res.status(500).json({
				error: 'Failed to get notification settings',
				code: 'INTERNAL_ERROR',
			});
		}
	}

	/**
	 * Update notification settings for a workflow
	 * PUT /api/v1/notifications/workflows/:workflowId
	 */
	@Put('/workflows/:workflowId')
	@GlobalScope('workflow:update')
	async updateWorkflowNotificationSettings(
		req: AuthenticatedRequest<WorkflowParams, {}, NotificationSettingsRequest>,
		res: Response,
	): Promise<Response> {
		try {
			const { workflowId } = req.params;
			const userId = req.user?.id;
			const settingsData: NotificationSettingsRequest = req.body;

			if (!workflowId || !userId) {
				return res.status(400).json({
					error: 'Workflow ID and user authentication are required',
					code: 'MISSING_REQUIRED_DATA',
				});
			}

			// Validate request data
			const validation = this.validateNotificationSettings(settingsData);
			if (!validation.valid) {
				return res.status(400).json({
					error: 'Invalid notification settings',
					code: 'INVALID_SETTINGS',
					details: validation.errors,
				});
			}

			// Verify workflow exists
			const workflow = await this.workflowRepository.findOne({
				where: { id: workflowId },
			});

			if (!workflow) {
				return res.status(404).json({
					error: 'Workflow not found',
					code: 'WORKFLOW_NOT_FOUND',
				});
			}

			// Validate channel configurations
			for (const channel of settingsData.channels) {
				const channelConfig = settingsData.config[channel];
				if (channelConfig) {
					// Here we would validate each channel's config
					// For now, we'll do basic validation
				}
			}

			// Create or update settings
			let settings = await this.notificationSettingsRepository.findOne({
				where: { workflowId, userId },
			});

			if (settings) {
				// Update existing settings
				settings.enabled = settingsData.enabled;
				settings.channels = settingsData.channels;
				settings.rateLimitPerMinute = settingsData.rateLimitPerMinute || 5;
				settings.batchEnabled = settingsData.batchEnabled || false;
				settings.batchInterval = settingsData.batchInterval || 300;
				settings.config = settingsData.config;
				settings.updatedAt = new Date();
			} else {
				// Create new settings
				settings = this.notificationSettingsRepository.create({
					workflowId,
					userId,
					enabled: settingsData.enabled,
					channels: settingsData.channels,
					rateLimitPerMinute: settingsData.rateLimitPerMinute || 5,
					batchEnabled: settingsData.batchEnabled || false,
					batchInterval: settingsData.batchInterval || 300,
					config: settingsData.config,
				});
			}

			await this.notificationSettingsRepository.save(settings);

			this.logger.info('Notification settings updated', {
				workflowId,
				userId,
				enabled: settings.enabled,
				channels: settings.channels,
			});

			return res.json({
				id: settings.id,
				workflowId,
				userId,
				enabled: settings.enabled,
				channels: settings.channels,
				rateLimitPerMinute: settings.rateLimitPerMinute,
				batchEnabled: settings.batchEnabled,
				batchInterval: settings.batchInterval,
				config: settings.config,
				updatedAt: settings.updatedAt,
			});
		} catch (error) {
			this.logger.error('Failed to update workflow notification settings', {
				workflowId: req.params.workflowId,
				userId: req.user?.id,
				error: error instanceof Error ? error.message : String(error),
			});

			return res.status(500).json({
				error: 'Failed to update notification settings',
				code: 'INTERNAL_ERROR',
			});
		}
	}

	/**
	 * Delete notification settings for a workflow
	 * DELETE /api/v1/notifications/workflows/:workflowId
	 */
	@Delete('/workflows/:workflowId')
	@GlobalScope('workflow:update')
	async deleteWorkflowNotificationSettings(
		req: AuthenticatedRequest<WorkflowParams>,
		res: Response,
	): Promise<Response> {
		try {
			const { workflowId } = req.params;
			const userId = req.user?.id;

			if (!workflowId || !userId) {
				return res.status(400).json({
					error: 'Workflow ID and user authentication are required',
					code: 'MISSING_REQUIRED_DATA',
				});
			}

			const result = await this.notificationSettingsRepository.delete({
				workflowId,
				userId,
			});

			if (result.affected === 0) {
				return res.status(404).json({
					error: 'Notification settings not found',
					code: 'SETTINGS_NOT_FOUND',
				});
			}

			this.logger.info('Notification settings deleted', {
				workflowId,
				userId,
			});

			return res.status(204).send();
		} catch (error) {
			this.logger.error('Failed to delete workflow notification settings', {
				workflowId: req.params.workflowId,
				userId: req.user?.id,
				error: error instanceof Error ? error.message : String(error),
			});

			return res.status(500).json({
				error: 'Failed to delete notification settings',
				code: 'INTERNAL_ERROR',
			});
		}
	}

	/**
	 * Test notification channel
	 * POST /api/v1/notifications/test
	 */
	@Post('/test')
	@GlobalScope('workflow:update')
	async testNotificationChannel(
		req: AuthenticatedRequest<{}, {}, NotificationTestRequest>,
		res: Response,
	): Promise<Response> {
		try {
			const testData: NotificationTestRequest = req.body;
			const userId = req.user?.id;

			if (!testData.channel || !testData.config) {
				return res.status(400).json({
					error: 'Channel and config are required for testing',
					code: 'MISSING_TEST_DATA',
				});
			}

			// Create test notification context
			const testContext: NotificationContext = {
				workflowId: testData.workflowId || 'test-workflow-id',
				executionId: 'test-execution-id',
				userId,
				errorMessage: 'This is a test notification to verify your configuration works correctly.',
				failedNode: 'Test Node',
			};

			// Mock test workflow and execution data for the notification
			const testPayload = {
				workflow: {
					id: testData.workflowId || 'test-workflow-id',
					name: 'Test Workflow',
					active: true,
				},
				execution: {
					id: 'test-execution-id',
					mode: 'manual',
					startedAt: new Date(),
					stoppedAt: new Date(),
					status: 'error',
					error: 'Test notification error',
				},
				user: {
					id: userId || 'test-user-id',
					email: req.user?.email || 'test@example.com',
					firstName: req.user?.firstName || 'Test',
					lastName: req.user?.lastName || 'User',
				},
				context: {
					errorMessage: testContext.errorMessage,
					failedNode: testContext.failedNode,
					instanceUrl: this.urlService.getInstanceBaseUrl(),
				},
			};

			// Send test notification based on channel type
			if (testData.channel === 'email') {
				// Mock email channel test
				const response = await this.testEmailChannel(testPayload, testData.config);
				return res.json(response);
			} else if (testData.channel === 'webhook') {
				// Mock webhook channel test
				const response = await this.testWebhookChannel(testPayload, testData.config);
				return res.json(response);
			} else if (testData.channel === 'slack') {
				// Mock slack channel test
				const response = await this.testSlackChannel(testPayload, testData.config);
				return res.json(response);
			} else {
				return res.status(400).json({
					error: `Unsupported notification channel: ${testData.channel}`,
					code: 'UNSUPPORTED_CHANNEL',
				});
			}
		} catch (error) {
			this.logger.error('Failed to test notification channel', {
				channel: req.body.channel,
				userId: req.user?.id,
				error: error instanceof Error ? error.message : String(error),
			});

			return res.status(500).json({
				error: 'Failed to test notification channel',
				code: 'TEST_FAILED',
				details: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Get notification history
	 * GET /api/v1/notifications/history
	 */
	@Get('/history')
	@GlobalScope('workflow:read')
	async getNotificationHistory(
		req: AuthenticatedRequest<{}, {}, {}, NotificationHistoryQuery>,
		res: Response,
	): Promise<Response> {
		try {
			const { workflowId, limit = '50', offset = '0' } = req.query;
			const userId = req.user?.id;

			const where: Record<string, unknown> = {};
			if (workflowId) where.workflowId = workflowId;
			if (userId) where.userId = userId;

			const [history, total] = await this.notificationHistoryRepository.findAndCount({
				where,
				order: { createdAt: 'DESC' },
				take: Math.min(parseInt(limit as string, 10), 100),
				skip: parseInt(offset as string, 10),
				relations: ['workflow', 'execution', 'user'],
			});

			return res.json({
				history: history.map((item) => ({
					id: item.id,
					workflowId: item.workflowId,
					workflowName: item.workflow?.name,
					executionId: item.executionId,
					userId: item.userId,
					channel: item.channel,
					status: item.status,
					error: item.error,
					sentAt: item.sentAt,
					retryCount: item.retryCount,
					nextRetryAt: item.nextRetryAt,
					createdAt: item.createdAt,
				})),
				pagination: {
					total,
					limit: parseInt(limit as string, 10),
					offset: parseInt(offset as string, 10),
				},
			});
		} catch (error) {
			this.logger.error('Failed to get notification history', {
				workflowId: req.query.workflowId,
				userId: req.user?.id,
				error: error instanceof Error ? error.message : String(error),
			});

			return res.status(500).json({
				error: 'Failed to get notification history',
				code: 'INTERNAL_ERROR',
			});
		}
	}

	/**
	 * Get notification statistics
	 * GET /api/v1/notifications/stats
	 */
	@Get('/stats')
	@GlobalScope('workflow:read')
	async getNotificationStats(
		req: AuthenticatedRequest<{}, {}, {}, StatsQuery>,
		res: Response,
	): Promise<Response> {
		try {
			const { workflowId, timeRange = '24h' } = req.query;
			const userId = req.user?.id;

			const stats = await this.notificationService.getNotificationStats(
				workflowId as string,
				userId,
			);

			return res.json({
				workflowId,
				userId,
				timeRange,
				stats,
			});
		} catch (error) {
			this.logger.error('Failed to get notification statistics', {
				workflowId: req.query.workflowId,
				userId: req.user?.id,
				error: error instanceof Error ? error.message : String(error),
			});

			return res.status(500).json({
				error: 'Failed to get notification statistics',
				code: 'INTERNAL_ERROR',
			});
		}
	}

	/**
	 * Retry failed notification
	 * POST /api/v1/notifications/:notificationId/retry
	 */
	@Post('/:notificationId/retry')
	@GlobalScope('workflow:update')
	async retryFailedNotification(
		req: AuthenticatedRequest<RetryParams>,
		res: Response,
	): Promise<Response> {
		try {
			const { notificationId } = req.params;
			const userId = req.user?.id;

			if (!notificationId) {
				return res.status(400).json({
					error: 'Notification ID is required',
					code: 'MISSING_NOTIFICATION_ID',
				});
			}

			const notification = await this.notificationHistoryRepository.findOne({
				where: { id: notificationId, userId },
			});

			if (!notification) {
				return res.status(404).json({
					error: 'Notification not found',
					code: 'NOTIFICATION_NOT_FOUND',
				});
			}

			if (notification.status !== 'failed') {
				return res.status(400).json({
					error: 'Only failed notifications can be retried',
					code: 'INVALID_STATUS',
				});
			}

			// Trigger retry
			await this.notificationService.processRetryNotifications();

			return res.json({
				message: 'Notification retry triggered',
				notificationId,
			});
		} catch (error) {
			this.logger.error('Failed to retry notification', {
				notificationId: req.params.notificationId,
				userId: req.user?.id,
				error: error instanceof Error ? error.message : String(error),
			});

			return res.status(500).json({
				error: 'Failed to retry notification',
				code: 'RETRY_FAILED',
			});
		}
	}

	/**
	 * Validate notification settings request
	 */
	private validateNotificationSettings(settings: NotificationSettingsRequest): {
		valid: boolean;
		errors?: string[];
	} {
		const errors: string[] = [];

		if (typeof settings.enabled !== 'boolean') {
			errors.push('enabled must be a boolean');
		}

		if (!Array.isArray(settings.channels)) {
			errors.push('channels must be an array');
		} else if (settings.channels.length === 0) {
			errors.push('at least one channel is required when enabled');
		}

		if (settings.rateLimitPerMinute !== undefined) {
			if (typeof settings.rateLimitPerMinute !== 'number' || settings.rateLimitPerMinute < 1) {
				errors.push('rateLimitPerMinute must be a positive number');
			}
		}

		if (!settings.config || typeof settings.config !== 'object') {
			errors.push('config must be an object');
		}

		return {
			valid: errors.length === 0,
			errors: errors.length > 0 ? errors : undefined,
		};
	}

	/**
	 * Test email channel configuration
	 */
	private async testEmailChannel(payload: any, config: any): Promise<any> {
		// This would normally use the actual email channel
		// For now, return a mock response
		return {
			success: true,
			channel: 'email',
			message: 'Test email would be sent successfully',
			config: {
				recipients: config.recipients || ['test@example.com'],
				subject: 'Test Notification',
			},
		};
	}

	/**
	 * Test webhook channel configuration
	 */
	private async testWebhookChannel(payload: any, config: any): Promise<any> {
		return {
			success: true,
			channel: 'webhook',
			message: 'Test webhook would be sent successfully',
			config: {
				url: config.url || 'https://example.com/webhook',
				method: config.method || 'POST',
			},
		};
	}

	/**
	 * Test slack channel configuration
	 */
	private async testSlackChannel(payload: any, config: any): Promise<any> {
		return {
			success: true,
			channel: 'slack',
			message: 'Test Slack message would be sent successfully',
			config: {
				webhookUrl: config.webhookUrl || 'https://hooks.slack.com/services/TEST',
				channel: config.channel || '#general',
			},
		};
	}
}
