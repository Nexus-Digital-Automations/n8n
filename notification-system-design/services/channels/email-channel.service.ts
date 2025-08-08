/**
 * Email notification channel service implementation
 */

import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { Service } from '@n8n/di';
import { ErrorReporter } from 'n8n-core';
import { createTransport, type Transporter } from 'nodemailer';
import type SMTPConnection from 'nodemailer/lib/smtp-connection';
import Handlebars from 'handlebars';

import type {
	INotificationChannelService,
	NotificationChannel,
	NotificationAlert,
	NotificationContext,
	NotificationResult,
	NotificationTemplate,
	EmailConfig,
	ValidationResult,
	TestResult,
	ChannelCapabilities,
	AlertType,
	DeliveryStatus,
} from '../../interfaces/notification-channel.interface';

@Service()
export class EmailChannelService implements INotificationChannelService {
	private readonly transportCache = new Map<string, Transporter>();

	constructor(
		private readonly globalConfig: GlobalConfig,
		private readonly logger: Logger,
		private readonly errorReporter: ErrorReporter,
	) {}

	/**
	 * Send notification via email
	 */
	async sendNotification(
		channelConfig: NotificationChannel,
		alert: NotificationAlert,
		context: NotificationContext,
	): Promise<NotificationResult> {
		const startTime = Date.now();
		const emailConfig = channelConfig.configuration.channelConfig as EmailConfig;

		try {
			// Get or create email transport
			const transport = await this.getTransport(channelConfig.id, emailConfig);

			// Get template for alert type
			const template = this.getTemplateForAlert(channelConfig, alert.type);
			
			// Render email content
			const emailContent = await this.renderEmailContent(template, alert, context);

			// Prepare recipients
			const recipients = this.prepareRecipients(emailConfig, alert, context);

			// Send email
			const info = await transport.sendMail({
				from: {
					address: emailConfig.from.email,
					name: emailConfig.from.name || 'n8n Notifications',
				},
				to: recipients.to,
				cc: recipients.cc,
				bcc: recipients.bcc,
				subject: emailContent.subject,
				text: emailContent.textBody,
				html: emailContent.htmlBody,
				attachments: emailContent.attachments,
				headers: {
					'X-Alert-ID': alert.id,
					'X-Alert-Type': alert.type,
					'X-Alert-Severity': alert.severity,
					'X-Workflow-ID': alert.workflow?.id || '',
					'X-Execution-ID': alert.execution?.id || '',
					'X-Instance-ID': context.instance.id,
				},
			});

			this.logger.debug('Email notification sent successfully', {
				alertId: alert.id,
				channelId: channelConfig.id,
				messageId: info.messageId,
				recipients: recipients.to.length,
				responseTime: Date.now() - startTime,
			});

			return {
				success: true,
				messageId: info.messageId,
				status: DeliveryStatus.SENT,
				attempts: 1,
				providerMetadata: {
					response: info.response,
					envelope: info.envelope,
					accepted: info.accepted,
					rejected: info.rejected,
				},
			};

		} catch (error) {
			this.errorReporter.error(error);
			this.logger.error('Failed to send email notification', {
				alertId: alert.id,
				channelId: channelConfig.id,
				error: error as Error,
				responseTime: Date.now() - startTime,
			});

			return {
				success: false,
				status: DeliveryStatus.FAILED,
				attempts: 1,
				error: {
					code: 'EMAIL_SEND_FAILED',
					message: (error as Error).message,
					retryable: this.isRetryableError(error as Error),
				},
			};
		}
	}

	/**
	 * Validate email channel configuration
	 */
	async validateConfiguration(config: any): Promise<ValidationResult> {
		const errors: any[] = [];
		const warnings: any[] = [];

		try {
			const emailConfig = config.channelConfig as EmailConfig;

			// Validate from address
			if (!emailConfig.from?.email) {
				errors.push({
					field: 'from.email',
					message: 'From email address is required',
					code: 'REQUIRED_FIELD',
				});
			} else if (!this.isValidEmail(emailConfig.from.email)) {
				errors.push({
					field: 'from.email',
					message: 'Invalid email address format',
					code: 'INVALID_FORMAT',
				});
			}

			// Validate recipient addresses
			if (!emailConfig.to || emailConfig.to.length === 0) {
				errors.push({
					field: 'to',
					message: 'At least one recipient email address is required',
					code: 'REQUIRED_FIELD',
				});
			} else {
				emailConfig.to.forEach((email, index) => {
					if (!this.isValidEmail(email)) {
						errors.push({
							field: `to[${index}]`,
							message: `Invalid email address: ${email}`,
							code: 'INVALID_FORMAT',
						});
					}
				});
			}

			// Validate SMTP configuration if provided
			if (emailConfig.smtp) {
				if (!emailConfig.smtp.host) {
					errors.push({
						field: 'smtp.host',
						message: 'SMTP host is required',
						code: 'REQUIRED_FIELD',
					});
				}

				if (!emailConfig.smtp.port || emailConfig.smtp.port < 1 || emailConfig.smtp.port > 65535) {
					errors.push({
						field: 'smtp.port',
						message: 'Valid SMTP port (1-65535) is required',
						code: 'INVALID_RANGE',
					});
				}

				if (!emailConfig.smtp.auth?.user) {
					warnings.push({
						field: 'smtp.auth.user',
						message: 'SMTP authentication recommended for better deliverability',
						code: 'RECOMMENDED_SETTING',
					});
				}
			}

			// Validate email service provider configuration if provided
			if (emailConfig.provider) {
				if (!emailConfig.provider.apiKey) {
					errors.push({
						field: 'provider.apiKey',
						message: 'Provider API key is required',
						code: 'REQUIRED_FIELD',
					});
				}

				const supportedProviders = ['sendgrid', 'mailgun', 'ses', 'postmark'];
				if (!supportedProviders.includes(emailConfig.provider.service)) {
					errors.push({
						field: 'provider.service',
						message: `Unsupported provider. Supported: ${supportedProviders.join(', ')}`,
						code: 'INVALID_VALUE',
					});
				}
			}

			// Validate that either SMTP or provider is configured
			if (!emailConfig.smtp && !emailConfig.provider) {
				errors.push({
					field: 'configuration',
					message: 'Either SMTP or email service provider configuration is required',
					code: 'MISSING_CONFIGURATION',
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
	 * Test email channel connectivity
	 */
	async testConnection(config: any): Promise<TestResult> {
		const startTime = Date.now();

		try {
			const emailConfig = config.channelConfig as EmailConfig;
			const transport = await this.createTransport(emailConfig);

			// Verify SMTP connection
			await transport.verify();

			// Send test email
			const testInfo = await transport.sendMail({
				from: {
					address: emailConfig.from.email,
					name: emailConfig.from.name || 'n8n Test',
				},
				to: emailConfig.to[0], // Send to first recipient for testing
				subject: 'n8n Email Channel Test',
				text: 'This is a test message from n8n notification system.',
				html: '<p>This is a test message from <strong>n8n notification system</strong>.</p>',
				headers: {
					'X-Test-Message': 'true',
				},
			});

			return {
				success: true,
				responseTime: Date.now() - startTime,
				message: `Test email sent successfully (Message ID: ${testInfo.messageId})`,
				details: {
					messageId: testInfo.messageId,
					response: testInfo.response,
					accepted: testInfo.accepted,
					rejected: testInfo.rejected,
				},
			};

		} catch (error) {
			return {
				success: false,
				responseTime: Date.now() - startTime,
				message: `Email test failed: ${(error as Error).message}`,
				error: (error as Error).message,
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
			maxMessageSize: 25 * 1024 * 1024, // 25MB (typical email limit)
			supportedContentTypes: ['text/plain', 'text/html'],
			supportsRichContent: true,
			supportsAttachments: true,
			supportsTemplates: true,
			rateLimits: {
				requestsPerSecond: 10,
				requestsPerMinute: 100,
				requestsPerHour: 1000,
				requestsPerDay: 10000,
			},
		};
	}

	/**
	 * Get default template for alert type
	 */
	getDefaultTemplate(alertType: AlertType): NotificationTemplate {
		const templates = {
			[AlertType.WORKFLOW_FAILURE]: {
				id: 'workflow-failure-email',
				alertType,
				content: {
					subject: '🚨 Workflow Failure: {{workflow.name}}',
					body: `
						<h2>Workflow Execution Failed</h2>
						<p><strong>Workflow:</strong> {{workflow.name}}</p>
						<p><strong>Execution ID:</strong> {{execution.id}}</p>
						<p><strong>Error:</strong> {{execution.error.message}}</p>
						<p><strong>Started:</strong> {{execution.startedAt}}</p>
						<p><strong>Duration:</strong> {{execution.metrics.duration}}ms</p>
						
						{{#if execution.error.node}}
						<p><strong>Failed Node:</strong> {{execution.error.node}}</p>
						{{/if}}
						
						<hr>
						<p><small>Instance: {{instance.id}} | Environment: {{instance.environment}}</small></p>
					`,
					textBody: `
						Workflow Execution Failed
						
						Workflow: {{workflow.name}}
						Execution ID: {{execution.id}}
						Error: {{execution.error.message}}
						Started: {{execution.startedAt}}
						Duration: {{execution.metrics.duration}}ms
						
						{{#if execution.error.node}}
						Failed Node: {{execution.error.node}}
						{{/if}}
						
						Instance: {{instance.id}} | Environment: {{instance.environment}}
					`,
				},
				variables: [
					{ name: 'workflow', type: 'object', required: true, description: 'Workflow information' },
					{ name: 'execution', type: 'object', required: true, description: 'Execution information' },
					{ name: 'instance', type: 'object', required: true, description: 'Instance information' },
				],
			},
		};

		return templates[alertType] || this.getGenericTemplate(alertType);
	}

	/**
	 * Get or create email transport
	 */
	private async getTransport(channelId: string, emailConfig: EmailConfig): Promise<Transporter> {
		if (this.transportCache.has(channelId)) {
			return this.transportCache.get(channelId)!;
		}

		const transport = await this.createTransport(emailConfig);
		this.transportCache.set(channelId, transport);
		return transport;
	}

	/**
	 * Create email transport based on configuration
	 */
	private async createTransport(emailConfig: EmailConfig): Promise<Transporter> {
		if (emailConfig.smtp) {
			// Use SMTP configuration
			const transportConfig: SMTPConnection.Options = {
				host: emailConfig.smtp.host,
				port: emailConfig.smtp.port,
				secure: emailConfig.smtp.secure,
			};

			if (emailConfig.smtp.auth.user && 'pass' in emailConfig.smtp.auth) {
				transportConfig.auth = {
					user: emailConfig.smtp.auth.user,
					pass: emailConfig.smtp.auth.pass,
				};
			} else if ('type' in emailConfig.smtp.auth && emailConfig.smtp.auth.type === 'OAuth2') {
				transportConfig.auth = {
					type: 'OAuth2',
					user: emailConfig.smtp.auth.user,
					serviceClient: emailConfig.smtp.auth.serviceClient,
					privateKey: emailConfig.smtp.auth.privateKey.replace(/\\n/g, '\n'),
				};
			}

			return createTransport(transportConfig);
		}

		if (emailConfig.provider) {
			// Use email service provider
			switch (emailConfig.provider.service) {
				case 'sendgrid':
					return createTransport({
						service: 'sendgrid',
						auth: {
							user: 'apikey',
							pass: emailConfig.provider.apiKey,
						},
					});

				case 'mailgun':
					return createTransport({
						service: 'mailgun',
						auth: {
							user: 'api',
							pass: emailConfig.provider.apiKey,
						},
					});

				case 'ses':
					return createTransport({
						SES: { 
							aws: { 
								region: emailConfig.provider.region || 'us-east-1',
								accessKeyId: emailConfig.provider.apiKey,
							} 
						},
					});

				case 'postmark':
					return createTransport({
						service: 'postmark',
						auth: {
							user: emailConfig.provider.apiKey,
							pass: emailConfig.provider.apiKey,
						},
					});

				default:
					throw new Error(`Unsupported email provider: ${emailConfig.provider.service}`);
			}
		}

		throw new Error('No valid email configuration provided');
	}

	/**
	 * Render email content using template
	 */
	private async renderEmailContent(
		template: NotificationTemplate,
		alert: NotificationAlert,
		context: NotificationContext,
	): Promise<RenderedEmailContent> {
		const templateData = {
			alert,
			workflow: alert.workflow,
			execution: alert.execution,
			user: context.user,
			project: context.project,
			instance: context.instance,
			timestamp: context.timestamp,
		};

		const subjectTemplate = Handlebars.compile(template.content.subject || 'n8n Alert');
		const htmlTemplate = Handlebars.compile(template.content.body);
		const textTemplate = Handlebars.compile(template.content.textBody || template.content.body);

		return {
			subject: subjectTemplate(templateData),
			htmlBody: htmlTemplate(templateData),
			textBody: textTemplate(templateData).replace(/<[^>]*>/g, ''), // Strip HTML tags
			attachments: template.content.attachments || [],
		};
	}

	/**
	 * Prepare email recipients
	 */
	private prepareRecipients(
		emailConfig: EmailConfig,
		alert: NotificationAlert,
		context: NotificationContext,
	): EmailRecipients {
		// Start with configured recipients
		let to = [...emailConfig.to];
		let cc = [...(emailConfig.cc || [])];
		let bcc = [...(emailConfig.bcc || [])];

		// Add dynamic recipients based on context
		if (context.user?.email && !to.includes(context.user.email)) {
			to.push(context.user.email);
		}

		// Add project-specific recipients if configured
		// (This would be implemented based on project settings)

		return { to, cc, bcc };
	}

	/**
	 * Get template for specific alert type
	 */
	private getTemplateForAlert(
		channelConfig: NotificationChannel,
		alertType: AlertType,
	): NotificationTemplate {
		// Check for channel-specific templates
		const channelTemplate = channelConfig.templates?.find(t => t.alertType === alertType);
		if (channelTemplate) {
			return channelTemplate;
		}

		// Fall back to default template
		return this.getDefaultTemplate(alertType);
	}

	/**
	 * Get generic template for any alert type
	 */
	private getGenericTemplate(alertType: AlertType): NotificationTemplate {
		return {
			id: 'generic-email',
			alertType,
			content: {
				subject: '🔔 n8n Alert: {{alert.title}}',
				body: `
					<h2>{{alert.title}}</h2>
					<p><strong>Type:</strong> {{alert.type}}</p>
					<p><strong>Severity:</strong> {{alert.severity}}</p>
					<p><strong>Description:</strong> {{alert.description}}</p>
					<p><strong>Created:</strong> {{alert.createdAt}}</p>
					
					{{#if workflow}}
					<h3>Workflow Details</h3>
					<p><strong>Name:</strong> {{workflow.name}}</p>
					<p><strong>ID:</strong> {{workflow.id}}</p>
					{{/if}}
					
					{{#if execution}}
					<h3>Execution Details</h3>
					<p><strong>ID:</strong> {{execution.id}}</p>
					<p><strong>Status:</strong> {{execution.status}}</p>
					<p><strong>Started:</strong> {{execution.startedAt}}</p>
					{{/if}}
					
					<hr>
					<p><small>Instance: {{instance.id}} | Environment: {{instance.environment}}</small></p>
				`,
			},
			variables: [
				{ name: 'alert', type: 'object', required: true, description: 'Alert information' },
				{ name: 'workflow', type: 'object', required: false, description: 'Workflow information' },
				{ name: 'execution', type: 'object', required: false, description: 'Execution information' },
				{ name: 'instance', type: 'object', required: true, description: 'Instance information' },
			],
		};
	}

	/**
	 * Validate email address format
	 */
	private isValidEmail(email: string): boolean {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(email);
	}

	/**
	 * Check if error is retryable
	 */
	private isRetryableError(error: Error): boolean {
		const retryableMessages = [
			'timeout',
			'connection refused',
			'network error',
			'temporarily unavailable',
			'rate limit',
			'too many requests',
			'service unavailable',
			'internal server error',
		];

		const errorMessage = error.message.toLowerCase();
		return retryableMessages.some(msg => errorMessage.includes(msg));
	}
}

/**
 * Supporting interfaces
 */
interface RenderedEmailContent {
	subject: string;
	htmlBody: string;
	textBody: string;
	attachments: any[];
}

interface EmailRecipients {
	to: string[];
	cc: string[];
	bcc: string[];
}