/**
 * Webhook notification channel service implementation
 */

import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { Service } from '@n8n/di';
import { ErrorReporter } from 'n8n-core';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import https from 'node:https';
import Handlebars from 'handlebars';

import type {
	INotificationChannelService,
	NotificationChannel,
	NotificationAlert,
	NotificationContext,
	NotificationResult,
	NotificationTemplate,
	WebhookConfig,
	ValidationResult,
	TestResult,
	ChannelCapabilities,
	AlertType,
	DeliveryStatus,
} from '../../interfaces/notification-channel.interface';

@Service()
export class WebhookChannelService implements INotificationChannelService {
	private readonly httpClients = new Map<string, AxiosInstance>();

	constructor(
		private readonly globalConfig: GlobalConfig,
		private readonly logger: Logger,
		private readonly errorReporter: ErrorReporter,
	) {}

	/**
	 * Send notification via webhook
	 */
	async sendNotification(
		channelConfig: NotificationChannel,
		alert: NotificationAlert,
		context: NotificationContext,
	): Promise<NotificationResult> {
		const startTime = Date.now();
		const webhookConfig = channelConfig.configuration.channelConfig as WebhookConfig;

		try {
			// Get or create HTTP client
			const httpClient = this.getHttpClient(channelConfig.id, webhookConfig);

			// Prepare webhook payload
			const payload = await this.preparePayload(webhookConfig, alert, context);

			// Prepare headers
			const headers = this.prepareHeaders(webhookConfig, alert, context);

			// Send webhook request
			const response: AxiosResponse = await httpClient.request({
				method: webhookConfig.method,
				url: webhookConfig.url,
				data: payload,
				headers,
				timeout: webhookConfig.timeout || 30000,
			});

			this.logger.debug('Webhook notification sent successfully', {
				alertId: alert.id,
				channelId: channelConfig.id,
				url: webhookConfig.url,
				statusCode: response.status,
				responseTime: Date.now() - startTime,
			});

			return {
				success: true,
				messageId: `webhook-${channelConfig.id}-${Date.now()}`,
				status: DeliveryStatus.SENT,
				attempts: 1,
				providerMetadata: {
					statusCode: response.status,
					statusText: response.statusText,
					headers: response.headers,
					responseSize: JSON.stringify(response.data).length,
					url: webhookConfig.url,
					method: webhookConfig.method,
				},
			};

		} catch (error: any) {
			this.errorReporter.error(error);
			this.logger.error('Failed to send webhook notification', {
				alertId: alert.id,
				channelId: channelConfig.id,
				url: webhookConfig.url,
				error: error as Error,
				statusCode: error.response?.status,
				responseTime: Date.now() - startTime,
			});

			return {
				success: false,
				status: DeliveryStatus.FAILED,
				attempts: 1,
				error: {
					code: this.getErrorCode(error),
					message: error.message,
					retryable: this.isRetryableError(error),
					details: {
						statusCode: error.response?.status,
						statusText: error.response?.statusText,
						responseData: error.response?.data,
					},
				},
			};
		}
	}

	/**
	 * Validate webhook channel configuration
	 */
	async validateConfiguration(config: any): Promise<ValidationResult> {
		const errors: any[] = [];
		const warnings: any[] = [];

		try {
			const webhookConfig = config.channelConfig as WebhookConfig;

			// Validate URL
			if (!webhookConfig.url) {
				errors.push({
					field: 'url',
					message: 'Webhook URL is required',
					code: 'REQUIRED_FIELD',
				});
			} else {
				try {
					const url = new URL(webhookConfig.url);
					if (!['http:', 'https:'].includes(url.protocol)) {
						errors.push({
							field: 'url',
							message: 'URL must use HTTP or HTTPS protocol',
							code: 'INVALID_PROTOCOL',
						});
					}
				} catch {
					errors.push({
						field: 'url',
						message: 'Invalid URL format',
						code: 'INVALID_FORMAT',
					});
				}
			}

			// Validate HTTP method
			const validMethods = ['POST', 'PUT', 'PATCH'];
			if (!webhookConfig.method) {
				webhookConfig.method = 'POST'; // Default
			} else if (!validMethods.includes(webhookConfig.method)) {
				errors.push({
					field: 'method',
					message: `Invalid HTTP method. Supported: ${validMethods.join(', ')}`,
					code: 'INVALID_VALUE',
				});
			}

			// Validate timeout
			if (webhookConfig.timeout && (webhookConfig.timeout < 1000 || webhookConfig.timeout > 300000)) {
				warnings.push({
					field: 'timeout',
					message: 'Timeout should be between 1000ms (1s) and 300000ms (5m)',
					code: 'RECOMMENDED_RANGE',
				});
			}

			// Validate authentication
			if (webhookConfig.auth) {
				const supportedAuthTypes = ['basic', 'bearer', 'api-key', 'oauth2'];
				if (!supportedAuthTypes.includes(webhookConfig.auth.type)) {
					errors.push({
						field: 'auth.type',
						message: `Unsupported auth type. Supported: ${supportedAuthTypes.join(', ')}`,
						code: 'INVALID_VALUE',
					});
				}

				if (!webhookConfig.auth.credentials || Object.keys(webhookConfig.auth.credentials).length === 0) {
					errors.push({
						field: 'auth.credentials',
						message: 'Authentication credentials are required when auth is enabled',
						code: 'REQUIRED_FIELD',
					});
				}
			}

			// Validate headers
			if (webhookConfig.headers) {
				Object.entries(webhookConfig.headers).forEach(([key, value]) => {
					if (typeof value !== 'string') {
						errors.push({
							field: `headers.${key}`,
							message: 'Header values must be strings',
							code: 'INVALID_TYPE',
						});
					}
				});
			}

			// Validate payload template
			if (webhookConfig.payloadTemplate) {
				try {
					Handlebars.compile(webhookConfig.payloadTemplate);
				} catch (templateError) {
					errors.push({
						field: 'payloadTemplate',
						message: `Invalid Handlebars template: ${(templateError as Error).message}`,
						code: 'INVALID_TEMPLATE',
					});
				}
			}

			// Security warnings
			if (webhookConfig.url.startsWith('http://')) {
				warnings.push({
					field: 'url',
					message: 'HTTP URLs are not secure. Consider using HTTPS',
					code: 'SECURITY_WARNING',
				});
			}

			if (webhookConfig.verifySsl === false) {
				warnings.push({
					field: 'verifySsl',
					message: 'SSL verification is disabled. This reduces security',
					code: 'SECURITY_WARNING',
				});
			}

		} catch (error) {
			errors.push({
				field: 'configuration',
				message: `Configuration validation error: ${(error as Error).message}`,
				code: 'VALIDATION_ERROR',
			});
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		};
	}

	/**
	 * Test webhook channel connectivity
	 */
	async testConnection(config: any): Promise<TestResult> {
		const startTime = Date.now();

		try {
			const webhookConfig = config.channelConfig as WebhookConfig;
			const httpClient = this.createHttpClient(webhookConfig);

			// Create test payload
			const testPayload = {
				test: true,
				message: 'This is a test message from n8n notification system',
				timestamp: new Date().toISOString(),
				source: 'n8n-webhook-test',
			};

			// Send test request
			const response: AxiosResponse = await httpClient.request({
				method: webhookConfig.method,
				url: webhookConfig.url,
				data: testPayload,
				headers: this.prepareHeaders(webhookConfig, null as any, null as any, true),
				timeout: webhookConfig.timeout || 10000,
			});

			return {
				success: true,
				responseTime: Date.now() - startTime,
				message: `Webhook test successful (Status: ${response.status} ${response.statusText})`,
				details: {
					statusCode: response.status,
					statusText: response.statusText,
					headers: response.headers,
					responseData: response.data,
				},
			};

		} catch (error: any) {
			return {
				success: false,
				responseTime: Date.now() - startTime,
				message: `Webhook test failed: ${error.message}`,
				error: error.message,
				details: {
					statusCode: error.response?.status,
					statusText: error.response?.statusText,
					responseData: error.response?.data,
				},
			};
		}
	}

	/**
	 * Get channel capabilities
	 */
	getCapabilities(): ChannelCapabilities {
		return {
			supportedAlertTypes: [
				AlertType.WORKFLOW_FAILURE,
				AlertType.WORKFLOW_SUCCESS,
				AlertType.EXECUTION_ERROR,
				AlertType.SYSTEM_ERROR,
				AlertType.PERFORMANCE_ISSUE,
				AlertType.QUOTA_EXCEEDED,
				AlertType.SECURITY_ALERT,
				AlertType.MAINTENANCE,
				AlertType.CUSTOM,
			],
			maxMessageSize: 100 * 1024 * 1024, // 100MB
			supportedContentTypes: ['application/json', 'application/x-www-form-urlencoded', 'text/plain'],
			supportsRichContent: true,
			supportsAttachments: false,
			supportsTemplates: true,
			rateLimits: {
				requestsPerSecond: 50,
				requestsPerMinute: 1000,
				requestsPerHour: 10000,
				requestsPerDay: 100000,
			},
		};
	}

	/**
	 * Get default template for alert type
	 */
	getDefaultTemplate(alertType: AlertType): NotificationTemplate {
		return {
			id: `webhook-${alertType}`,
			alertType,
			content: {
				body: JSON.stringify({
					alert: {
						id: '{{alert.id}}',
						type: '{{alert.type}}',
						severity: '{{alert.severity}}',
						title: '{{alert.title}}',
						description: '{{alert.description}}',
						createdAt: '{{alert.createdAt}}',
						metadata: '{{json alert.metadata}}',
					},
					workflow: {
						id: '{{workflow.id}}',
						name: '{{workflow.name}}',
						status: '{{workflow.status}}',
					},
					execution: {
						id: '{{execution.id}}',
						status: '{{execution.status}}',
						startedAt: '{{execution.startedAt}}',
						endedAt: '{{execution.endedAt}}',
						duration: '{{execution.metrics.duration}}',
						error: '{{json execution.error}}',
					},
					instance: {
						id: '{{instance.id}}',
						version: '{{instance.version}}',
						environment: '{{instance.environment}}',
					},
					timestamp: '{{timestamp}}',
				}, null, 2),
			},
			variables: [
				{ name: 'alert', type: 'object', required: true, description: 'Alert information' },
				{ name: 'workflow', type: 'object', required: false, description: 'Workflow information' },
				{ name: 'execution', type: 'object', required: false, description: 'Execution information' },
				{ name: 'instance', type: 'object', required: true, description: 'Instance information' },
				{ name: 'timestamp', type: 'string', required: true, description: 'Current timestamp' },
			],
		};
	}

	/**
	 * Get or create HTTP client
	 */
	private getHttpClient(channelId: string, webhookConfig: WebhookConfig): AxiosInstance {
		if (this.httpClients.has(channelId)) {
			return this.httpClients.get(channelId)!;
		}

		const client = this.createHttpClient(webhookConfig);
		this.httpClients.set(channelId, client);
		return client;
	}

	/**
	 * Create HTTP client with configuration
	 */
	private createHttpClient(webhookConfig: WebhookConfig): AxiosInstance {
		const clientConfig: any = {
			timeout: webhookConfig.timeout || 30000,
			maxRedirects: 5,
		};

		// Configure SSL verification
		if (webhookConfig.verifySsl === false) {
			clientConfig.httpsAgent = new https.Agent({
				rejectUnauthorized: false,
			});
		}

		const client = axios.create(clientConfig);

		// Add request interceptor for authentication
		if (webhookConfig.auth) {
			client.interceptors.request.use((config) => {
				this.addAuthentication(config, webhookConfig.auth!);
				return config;
			});
		}

		// Add response interceptor for logging
		client.interceptors.response.use(
			(response) => {
				this.logger.debug('Webhook request successful', {
					url: response.config.url,
					method: response.config.method,
					status: response.status,
				});
				return response;
			},
			(error) => {
				this.logger.debug('Webhook request failed', {
					url: error.config?.url,
					method: error.config?.method,
					status: error.response?.status,
					error: error.message,
				});
				return Promise.reject(error);
			},
		);

		return client;
	}

	/**
	 * Add authentication to request config
	 */
	private addAuthentication(config: any, auth: WebhookConfig['auth']): void {
		if (!auth) return;

		switch (auth.type) {
			case 'basic':
				config.auth = {
					username: auth.credentials.username,
					password: auth.credentials.password,
				};
				break;

			case 'bearer':
				config.headers = config.headers || {};
				config.headers.Authorization = `Bearer ${auth.credentials.token}`;
				break;

			case 'api-key':
				config.headers = config.headers || {};
				const headerName = auth.credentials.headerName || 'X-API-Key';
				config.headers[headerName] = auth.credentials.apiKey;
				break;

			case 'oauth2':
				config.headers = config.headers || {};
				config.headers.Authorization = `Bearer ${auth.credentials.accessToken}`;
				break;
		}
	}

	/**
	 * Prepare webhook payload
	 */
	private async preparePayload(
		webhookConfig: WebhookConfig,
		alert: NotificationAlert,
		context: NotificationContext,
	): Promise<any> {
		const templateData = {
			alert,
			workflow: alert.workflow,
			execution: alert.execution,
			user: context.user,
			project: context.project,
			instance: context.instance,
			timestamp: context.timestamp.toISOString(),
		};

		// Register custom Handlebars helpers
		Handlebars.registerHelper('json', (obj) => {
			return JSON.stringify(obj);
		});

		if (webhookConfig.payloadTemplate) {
			// Use custom template
			const template = Handlebars.compile(webhookConfig.payloadTemplate);
			const renderedPayload = template(templateData);
			
			// Try to parse as JSON, fall back to string
			try {
				return JSON.parse(renderedPayload);
			} catch {
				return renderedPayload;
			}
		}

		// Use default payload structure
		return {
			event: 'notification',
			alert: {
				id: alert.id,
				type: alert.type,
				severity: alert.severity,
				title: alert.title,
				description: alert.description,
				createdAt: alert.createdAt.toISOString(),
				metadata: alert.metadata,
			},
			workflow: alert.workflow ? {
				id: alert.workflow.id,
				name: alert.workflow.name,
				status: alert.workflow.status,
			} : null,
			execution: alert.execution ? {
				id: alert.execution.id,
				status: alert.execution.status,
				startedAt: alert.execution.startedAt.toISOString(),
				endedAt: alert.execution.endedAt?.toISOString(),
				duration: alert.execution.metrics?.duration,
				error: alert.execution.error,
			} : null,
			instance: {
				id: context.instance.id,
				version: context.instance.version,
				environment: context.instance.environment,
			},
			timestamp: context.timestamp.toISOString(),
		};
	}

	/**
	 * Prepare HTTP headers
	 */
	private prepareHeaders(
		webhookConfig: WebhookConfig,
		alert: NotificationAlert,
		context: NotificationContext,
		isTest: boolean = false,
	): Record<string, string> {
		const headers: Record<string, string> = {
			'Content-Type': webhookConfig.contentType || 'application/json',
			'User-Agent': `n8n-notification-system/${context?.instance?.version || '1.0.0'}`,
		};

		// Add custom headers
		if (webhookConfig.headers) {
			Object.assign(headers, webhookConfig.headers);
		}

		// Add alert context headers (if not a test)
		if (!isTest && alert && context) {
			headers['X-n8n-Alert-ID'] = alert.id;
			headers['X-n8n-Alert-Type'] = alert.type;
			headers['X-n8n-Alert-Severity'] = alert.severity;
			headers['X-n8n-Instance-ID'] = context.instance.id;
			headers['X-n8n-Environment'] = context.instance.environment;

			if (alert.workflow) {
				headers['X-n8n-Workflow-ID'] = alert.workflow.id;
			}

			if (alert.execution) {
				headers['X-n8n-Execution-ID'] = alert.execution.id;
			}
		}

		// Add test header
		if (isTest) {
			headers['X-n8n-Test'] = 'true';
		}

		return headers;
	}

	/**
	 * Get error code from axios error
	 */
	private getErrorCode(error: any): string {
		if (error.response) {
			// HTTP error response
			const status = error.response.status;
			if (status >= 400 && status < 500) {
				return 'CLIENT_ERROR';
			} else if (status >= 500) {
				return 'SERVER_ERROR';
			}
		} else if (error.request) {
			// Network error
			return 'NETWORK_ERROR';
		} else if (error.code === 'ECONNABORTED') {
			// Timeout error
			return 'TIMEOUT';
		}

		return 'UNKNOWN_ERROR';
	}

	/**
	 * Check if error is retryable
	 */
	private isRetryableError(error: any): boolean {
		// Network errors are generally retryable
		if (!error.response) {
			return true;
		}

		// HTTP status codes that indicate retryable errors
		const retryableStatusCodes = [429, 500, 502, 503, 504];
		return retryableStatusCodes.includes(error.response.status);
	}
}