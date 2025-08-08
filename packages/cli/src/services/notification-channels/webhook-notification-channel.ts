import { Logger } from '@n8n/backend-common';
import { NotificationConfig } from '@n8n/config';
import { Service } from '@n8n/di';
import * as crypto from 'crypto';
import axios, { type AxiosResponse } from 'axios';

import {
	BaseNotificationChannel,
	type NotificationPayload,
	type NotificationResult,
} from './base-notification-channel';

export interface WebhookNotificationConfig {
	url: string;
	secret?: string;
	headers?: Record<string, string>;
	method?: 'POST' | 'PUT' | 'PATCH';
	timeout?: number;
	includeExecutionData?: boolean;
	customPayload?: Record<string, unknown>;
}

/**
 * Webhook notification channel for sending HTTP requests
 */
@Service()
export class WebhookNotificationChannel extends BaseNotificationChannel {
	public readonly channelType = 'webhook';
	public readonly channelName = 'Webhook';

	constructor(
		logger: Logger,
		private readonly notificationConfig: NotificationConfig,
	) {
		super(logger);
	}

	/**
	 * Send webhook notification
	 */
	async send(
		payload: NotificationPayload,
		config?: Record<string, unknown>,
	): Promise<NotificationResult> {
		try {
			if (!config) {
				return this.createFailureResult('No webhook configuration provided');
			}
			
			const webhookConfig = config as unknown as WebhookNotificationConfig;
			
			if (!webhookConfig?.url) {
				return this.createFailureResult('Webhook URL is required');
			}

			const webhookPayload = this.buildWebhookPayload(payload, webhookConfig);
			const headers = this.buildHeaders(webhookPayload, webhookConfig);

			this.logger.debug('Sending webhook notification', {
				workflowId: payload.workflow.id,
				executionId: payload.execution.id,
				url: webhookConfig.url,
				method: webhookConfig.method || 'POST',
			});

			const response: AxiosResponse = await axios({
				method: webhookConfig.method || 'POST',
				url: webhookConfig.url,
				data: webhookPayload,
				headers,
				timeout: webhookConfig.timeout || 10000,
				validateStatus: (status) => status < 400, // Accept any status code below 400
			});

			this.logger.info('Webhook notification sent successfully', {
				workflowId: payload.workflow.id,
				executionId: payload.execution.id,
				url: webhookConfig.url,
				statusCode: response.status,
				statusText: response.statusText,
			});

			return this.createSuccessResult({
				statusCode: response.status,
				statusText: response.statusText,
				responseHeaders: response.headers,
				responseData: response.data,
				url: webhookConfig.url,
			});

		} catch (error) {
			const errorMessage = this.formatError(error);
			
			this.logger.error('Failed to send webhook notification', {
				workflowId: payload.workflow.id,
				executionId: payload.execution.id,
				error: errorMessage,
			});

			// Extract additional error information from axios error
			const metadata: Record<string, unknown> = {
				originalError: error instanceof Error ? error.message : String(error),
			};

			if (axios.isAxiosError(error)) {
				metadata.statusCode = error.response?.status;
				metadata.statusText = error.response?.statusText;
				metadata.responseData = error.response?.data;
				metadata.requestUrl = error.config?.url;
			}

			return this.createFailureResult(errorMessage, metadata);
		}
	}

	/**
	 * Validate webhook configuration
	 */
	async validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors?: string[] }> {
		const errors: string[] = [];

		// Check required URL
		if (!config.url || typeof config.url !== 'string') {
			errors.push('url is required and must be a string');
		} else {
			try {
				new URL(config.url as string);
			} catch {
				errors.push('url must be a valid URL');
			}
		}

		// Check method if specified
		if (config.method && !['POST', 'PUT', 'PATCH'].includes(config.method as string)) {
			errors.push('method must be POST, PUT, or PATCH');
		}

		// Check timeout if specified
		if (config.timeout !== undefined) {
			if (typeof config.timeout !== 'number' || config.timeout <= 0) {
				errors.push('timeout must be a positive number');
			}
		}

		// Check headers if specified
		if (config.headers && typeof config.headers !== 'object') {
			errors.push('headers must be an object');
		}

		return {
			valid: errors.length === 0,
			errors: errors.length > 0 ? errors : undefined,
		};
	}

	/**
	 * Check if webhook channel is available
	 */
	async isAvailable(): Promise<boolean> {
		// Webhook channel is always available as it doesn't depend on external configuration
		// The specific webhook URLs are provided per notification
		return true;
	}

	/**
	 * Build the webhook payload
	 */
	private buildWebhookPayload(
		payload: NotificationPayload,
		config: WebhookNotificationConfig,
	): Record<string, unknown> {
		const { workflow, execution, user, context } = payload;

		// Start with custom payload if provided
		const webhookPayload: Record<string, unknown> = {
			...config.customPayload,
			// Standard n8n notification payload
			timestamp: new Date().toISOString(),
			type: 'workflow.failure',
			workflow: {
				id: workflow.id,
				name: workflow.name,
				active: workflow.active,
			},
			execution: {
				id: execution.id,
				mode: execution.mode,
				status: execution.status,
				startedAt: execution.startedAt.toISOString(),
				stoppedAt: execution.stoppedAt?.toISOString() || null,
				error: execution.error,
			},
			user: {
				id: user.id,
				email: user.email,
				firstName: user.firstName,
				lastName: user.lastName,
			},
			context: {
				executionUrl: context.executionUrl,
				workflowUrl: context.workflowUrl,
				instanceUrl: context.instanceUrl,
				errorMessage: context.errorMessage,
				failedNode: context.failedNode,
				retryCount: context.retryCount,
			},
		};

		// Include execution data if requested
		if (config.includeExecutionData && workflow.nodes) {
			const currentWorkflow = webhookPayload.workflow as Record<string, unknown>;
			webhookPayload.workflow = {
				...currentWorkflow,
				nodes: workflow.nodes,
			};
		}

		return webhookPayload;
	}

	/**
	 * Build HTTP headers including signature if secret is provided
	 */
	private buildHeaders(
		payload: Record<string, unknown>,
		config: WebhookNotificationConfig,
	): Record<string, string> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'User-Agent': 'n8n-notification-system',
			'X-N8N-Workflow-ID': String((payload.workflow as Record<string, unknown>)?.['id'] || ''),
			'X-N8N-Execution-ID': String((payload.execution as Record<string, unknown>)?.['id'] || ''),
			'X-N8N-Notification-Type': 'workflow-failure',
			'X-N8N-Timestamp': new Date().toISOString(),
			...config.headers,
		};

		// Add signature if secret is provided
		if (config.secret) {
			const payloadString = JSON.stringify(payload);
			const signature = this.calculateSignature(payloadString, config.secret);
			headers['X-N8N-Signature'] = signature;
			headers['X-N8N-Signature-256'] = `sha256=${signature}`;
		}

		return headers;
	}

	/**
	 * Calculate HMAC signature for webhook payload
	 */
	private calculateSignature(payload: string, secret: string): string {
		return crypto
			.createHmac('sha256', secret)
			.update(payload, 'utf8')
			.digest('hex');
	}

	/**
	 * Override retry config for webhooks - they typically need faster retries
	 */
	getRetryConfig() {
		return {
			maxRetries: 3,
			baseDelay: 5, // Start with 5 seconds
			exponentialBackoff: true,
			maxDelay: 60, // Max 1 minute delay
		};
	}
}