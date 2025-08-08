import { Logger } from '@n8n/backend-common';
import { NotificationConfig } from '@n8n/config';
import { Service } from '@n8n/di';
import axios, { type AxiosResponse } from 'axios';

import {
	BaseNotificationChannel,
	type NotificationPayload,
	type NotificationResult,
} from './base-notification-channel';

export interface SlackNotificationConfig {
	webhookUrl: string;
	channel?: string;
	username?: string;
	iconEmoji?: string;
	iconUrl?: string;
	template?: 'basic' | 'detailed';
	mentionUsers?: string[];
	mentionChannel?: boolean;
}

interface SlackMessage {
	text?: string;
	channel?: string;
	username?: string;
	icon_emoji?: string;
	icon_url?: string;
	attachments?: SlackAttachment[];
	blocks?: SlackBlock[];
}

interface SlackAttachment {
	color?: string;
	pretext?: string;
	author_name?: string;
	author_link?: string;
	author_icon?: string;
	title?: string;
	title_link?: string;
	text?: string;
	fields?: SlackField[];
	image_url?: string;
	thumb_url?: string;
	footer?: string;
	footer_icon?: string;
	ts?: number;
}

interface SlackField {
	title: string;
	value: string;
	short?: boolean;
}

interface SlackBlock {
	type: string;
	text?: {
		type: string;
		text: string;
		emoji?: boolean;
	};
	elements?: unknown[];
	fields?: {
		type: string;
		text: string;
	}[];
}

/**
 * Slack notification channel using incoming webhooks
 */
@Service()
export class SlackNotificationChannel extends BaseNotificationChannel {
	public readonly channelType = 'slack';
	public readonly channelName = 'Slack';

	constructor(
		logger: Logger,
		private readonly notificationConfig: NotificationConfig,
	) {
		super(logger);
	}

	/**
	 * Send Slack notification
	 */
	async send(
		payload: NotificationPayload,
		config?: Record<string, unknown>,
	): Promise<NotificationResult> {
		try {
			const slackConfig = config as SlackNotificationConfig;
			
			if (!slackConfig?.webhookUrl) {
				return this.createFailureResult('Slack webhook URL is required');
			}

			const slackMessage = this.buildSlackMessage(payload, slackConfig);

			this.logger.debug('Sending Slack notification', {
				workflowId: payload.workflow.id,
				executionId: payload.execution.id,
				channel: slackConfig.channel,
				template: slackConfig.template || 'detailed',
			});

			const response: AxiosResponse = await axios.post(
				slackConfig.webhookUrl,
				slackMessage,
				{
					headers: {
						'Content-Type': 'application/json',
					},
					timeout: 10000,
				}
			);

			// Slack webhook returns 'ok' for successful messages
			if (response.data !== 'ok') {
				throw new Error(`Slack API returned: ${response.data}`);
			}

			this.logger.info('Slack notification sent successfully', {
				workflowId: payload.workflow.id,
				executionId: payload.execution.id,
				channel: slackConfig.channel,
			});

			return this.createSuccessResult({
				statusCode: response.status,
				response: response.data,
				channel: slackConfig.channel,
			});

		} catch (error) {
			const errorMessage = this.formatError(error);
			
			this.logger.error('Failed to send Slack notification', {
				workflowId: payload.workflow.id,
				executionId: payload.execution.id,
				error: errorMessage,
			});

			const metadata: Record<string, unknown> = {
				originalError: error instanceof Error ? error.message : String(error),
			};

			if (axios.isAxiosError(error)) {
				metadata.statusCode = error.response?.status;
				metadata.responseData = error.response?.data;
			}

			return this.createFailureResult(errorMessage, metadata);
		}
	}

	/**
	 * Validate Slack configuration
	 */
	async validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors?: string[] }> {
		const slackConfig = config as SlackNotificationConfig;
		const errors: string[] = [];

		// Check required webhook URL
		if (!slackConfig.webhookUrl || typeof slackConfig.webhookUrl !== 'string') {
			errors.push('webhookUrl is required and must be a string');
		} else if (!slackConfig.webhookUrl.startsWith('https://hooks.slack.com/')) {
			errors.push('webhookUrl must be a valid Slack webhook URL');
		}

		// Check template if specified
		if (slackConfig.template && !['basic', 'detailed'].includes(slackConfig.template)) {
			errors.push('template must be either "basic" or "detailed"');
		}

		// Check mention users format
		if (slackConfig.mentionUsers) {
			if (!Array.isArray(slackConfig.mentionUsers)) {
				errors.push('mentionUsers must be an array');
			} else {
				const invalidUsers = slackConfig.mentionUsers.filter(
					user => typeof user !== 'string' || !user.trim()
				);
				if (invalidUsers.length > 0) {
					errors.push('all mentionUsers must be non-empty strings');
				}
			}
		}

		return {
			valid: errors.length === 0,
			errors: errors.length > 0 ? errors : undefined,
		};
	}

	/**
	 * Check if Slack channel is available
	 */
	async isAvailable(): Promise<boolean> {
		const config = this.notificationConfig;
		
		// Check if default Slack webhook URL is configured
		if (config.slackWebhookUrl && config.slackWebhookUrl.trim()) {
			return true;
		}

		// Slack channel is available if webhook URLs are provided per notification
		this.logger.debug('Slack channel available but requires webhook URL configuration');
		return true;
	}

	/**
	 * Build Slack message payload
	 */
	private buildSlackMessage(
		payload: NotificationPayload,
		config: SlackNotificationConfig,
	): SlackMessage {
		const { workflow, execution, context } = payload;
		const template = config.template || 'detailed';

		// Build mention text
		const mentionText = this.buildMentionText(config);
		
		const message: SlackMessage = {
			channel: config.channel,
			username: config.username || 'n8n Notifications',
			icon_emoji: config.iconEmoji || ':warning:',
		};

		if (config.iconUrl) {
			message.icon_url = config.iconUrl;
			delete message.icon_emoji;
		}

		if (template === 'basic') {
			// Simple text message
			message.text = [
				mentionText,
				`:x: *Workflow "${workflow.name}" failed*`,
				`Execution ID: \`${execution.id}\``,
				context.errorMessage ? `Error: ${context.errorMessage}` : '',
				context.executionUrl ? `<${context.executionUrl}|View Execution>` : '',
			].filter(Boolean).join('\n');
		} else {
			// Rich attachment format
			message.text = mentionText ? mentionText : undefined;
			message.attachments = [
				{
					color: '#ff4444',
					pretext: ':x: *Workflow Failure Alert*',
					title: workflow.name,
					title_link: context.workflowUrl,
					text: context.errorMessage || 'Workflow execution failed',
					fields: this.buildSlackFields(payload),
					footer: 'n8n',
					footer_icon: 'https://n8n.io/favicon.ico',
					ts: Math.floor(execution.startedAt.getTime() / 1000),
				},
			];

			// Add action buttons if URLs are available
			if (context.executionUrl || context.workflowUrl) {
				message.attachments[0].actions = [];
				
				if (context.executionUrl) {
					message.attachments[0].actions.push({
						type: 'button',
						text: 'View Execution',
						url: context.executionUrl,
						style: 'primary',
					});
				}
				
				if (context.workflowUrl) {
					message.attachments[0].actions.push({
						type: 'button',
						text: 'Edit Workflow',
						url: context.workflowUrl,
					});
				}
			}
		}

		return message;
	}

	/**
	 * Build mention text for users or channel
	 */
	private buildMentionText(config: SlackNotificationConfig): string {
		const mentions: string[] = [];

		if (config.mentionChannel) {
			mentions.push('<!channel>');
		}

		if (config.mentionUsers && config.mentionUsers.length > 0) {
			config.mentionUsers.forEach(user => {
				// Add @ prefix if not already present
				const mention = user.startsWith('@') ? user : `@${user}`;
				mentions.push(`<${mention}>`);
			});
		}

		return mentions.length > 0 ? mentions.join(' ') : '';
	}

	/**
	 * Build Slack attachment fields
	 */
	private buildSlackFields(payload: NotificationPayload): SlackField[] {
		const { workflow, execution, context } = payload;
		const fields: SlackField[] = [
			{
				title: 'Workflow ID',
				value: `\`${workflow.id}\``,
				short: true,
			},
			{
				title: 'Execution ID',
				value: `\`${execution.id}\``,
				short: true,
			},
			{
				title: 'Status',
				value: execution.status.toUpperCase(),
				short: true,
			},
			{
				title: 'Started',
				value: execution.startedAt.toLocaleString(),
				short: true,
			},
		];

		if (execution.stoppedAt) {
			fields.push({
				title: 'Stopped',
				value: execution.stoppedAt.toLocaleString(),
				short: true,
			});
		}

		if (context.failedNode) {
			fields.push({
				title: 'Failed Node',
				value: context.failedNode,
				short: true,
			});
		}

		if (context.retryCount && context.retryCount > 0) {
			fields.push({
				title: 'Retry Count',
				value: String(context.retryCount),
				short: true,
			});
		}

		return fields;
	}

	/**
	 * Override retry config for Slack - they handle rate limiting well
	 */
	getRetryConfig() {
		return {
			maxRetries: 3,
			baseDelay: 1, // Start with 1 second
			exponentialBackoff: true,
			maxDelay: 30, // Max 30 seconds delay
		};
	}
}