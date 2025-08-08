import { Logger } from '@n8n/backend-common';
import { NotificationConfig } from '@n8n/config';
import { Service } from '@n8n/di';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

import {
	BaseNotificationChannel,
	type NotificationPayload,
	type NotificationResult,
} from './base-notification-channel';

export interface EmailNotificationConfig {
	recipients: string[];
	subject?: string;
	template?: 'basic' | 'detailed';
	includeExecutionData?: boolean;
}

/**
 * Email notification channel using SMTP
 */
@Service()
export class EmailNotificationChannel extends BaseNotificationChannel {
	public readonly channelType = 'email';
	public readonly channelName = 'Email';

	private transporter: Transporter<SMTPTransport.SentMessageInfo> | null = null;

	constructor(
		logger: Logger,
		private readonly notificationConfig: NotificationConfig,
	) {
		super(logger);
	}

	/**
	 * Initialize SMTP transporter if not already initialized
	 */
	private async getTransporter(): Promise<Transporter<SMTPTransport.SentMessageInfo>> {
		if (this.transporter) {
			return this.transporter;
		}

		const config = this.notificationConfig;
		
		this.transporter = nodemailer.createTransporter({
			host: config.emailSmtpHost,
			port: config.emailSmtpPort,
			secure: config.emailSmtpSecure,
			auth: {
				user: config.emailSmtpUser,
				pass: config.emailSmtpPassword,
			},
			// Additional options for better reliability
			pool: true,
			maxConnections: 5,
			maxMessages: 10,
			rateDelta: 1000,
			rateLimit: 5,
		});

		return this.transporter;
	}

	/**
	 * Send email notification
	 */
	async send(
		payload: NotificationPayload,
		config?: Record<string, unknown>,
	): Promise<NotificationResult> {
		try {
			const emailConfig = config as EmailNotificationConfig;
			
			if (!emailConfig?.recipients?.length) {
				return this.createFailureResult('No email recipients specified');
			}

			const transporter = await this.getTransporter();
			const { subject, message } = this.formatNotificationMessage(payload);
			
			const emailSubject = emailConfig.subject || subject;
			const htmlContent = this.formatHtmlEmail(payload, emailConfig);
			const textContent = this.formatTextEmail(payload, emailConfig);

			const mailOptions = {
				from: this.notificationConfig.emailFrom,
				to: emailConfig.recipients.join(', '),
				subject: emailSubject,
				text: textContent,
				html: htmlContent,
				headers: {
					'X-N8N-Workflow-ID': payload.workflow.id,
					'X-N8N-Execution-ID': payload.execution.id,
					'X-N8N-Notification-Type': 'workflow-failure',
				},
			};

			this.logger.debug('Sending email notification', {
				workflowId: payload.workflow.id,
				executionId: payload.execution.id,
				recipients: emailConfig.recipients.length,
			});

			const result = await transporter.sendMail(mailOptions);

			this.logger.info('Email notification sent successfully', {
				workflowId: payload.workflow.id,
				executionId: payload.execution.id,
				messageId: result.messageId,
				recipients: emailConfig.recipients.length,
			});

			return this.createSuccessResult({
				messageId: result.messageId,
				accepted: result.accepted,
				rejected: result.rejected,
				recipients: emailConfig.recipients,
			});

		} catch (error) {
			const errorMessage = this.formatError(error);
			
			this.logger.error('Failed to send email notification', {
				workflowId: payload.workflow.id,
				executionId: payload.execution.id,
				error: errorMessage,
			});

			return this.createFailureResult(errorMessage, {
				originalError: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Validate email configuration
	 */
	async validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors?: string[] }> {
		const emailConfig = config as EmailNotificationConfig;
		const errors: string[] = [];

		// Check recipients
		if (!emailConfig.recipients || !Array.isArray(emailConfig.recipients)) {
			errors.push('recipients must be an array');
		} else if (emailConfig.recipients.length === 0) {
			errors.push('at least one recipient is required');
		} else {
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			const invalidEmails = emailConfig.recipients.filter(email => 
				typeof email !== 'string' || !emailRegex.test(email)
			);
			if (invalidEmails.length > 0) {
				errors.push(`invalid email addresses: ${invalidEmails.join(', ')}`);
			}
		}

		// Check template if specified
		if (emailConfig.template && !['basic', 'detailed'].includes(emailConfig.template)) {
			errors.push('template must be either "basic" or "detailed"');
		}

		return {
			valid: errors.length === 0,
			errors: errors.length > 0 ? errors : undefined,
		};
	}

	/**
	 * Check if email channel is available
	 */
	async isAvailable(): Promise<boolean> {
		try {
			const config = this.notificationConfig;
			
			// Check if all required SMTP settings are configured
			const requiredSettings = [
				config.emailSmtpHost,
				config.emailSmtpUser,
				config.emailSmtpPassword,
				config.emailFrom,
			];

			if (requiredSettings.some(setting => !setting || !setting.trim())) {
				this.logger.debug('Email channel not available: missing SMTP configuration');
				return false;
			}

			// Test SMTP connection
			const transporter = await this.getTransporter();
			await transporter.verify();
			
			return true;
		} catch (error) {
			this.logger.debug('Email channel not available', { error: this.formatError(error) });
			return false;
		}
	}

	/**
	 * Format HTML email content
	 */
	private formatHtmlEmail(payload: NotificationPayload, config: EmailNotificationConfig): string {
		const { workflow, execution, context } = payload;
		const template = config.template || 'detailed';

		if (template === 'basic') {
			return `
				<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
					<div style="background-color: #f44336; color: white; padding: 20px; text-align: center;">
						<h1 style="margin: 0;">Workflow Failure</h1>
					</div>
					<div style="padding: 20px; background-color: #f9f9f9;">
						<p><strong>Workflow:</strong> ${workflow.name}</p>
						<p><strong>Execution ID:</strong> ${execution.id}</p>
						<p><strong>Time:</strong> ${execution.startedAt.toLocaleString()}</p>
						${context.errorMessage ? `<p><strong>Error:</strong> ${context.errorMessage}</p>` : ''}
						${context.executionUrl ? `<p><a href="${context.executionUrl}" style="color: #1976d2;">View Execution</a></p>` : ''}
					</div>
				</div>
			`;
		}

		// Detailed template
		return `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>n8n Workflow Failure Alert</title>
			</head>
			<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
				<div style="max-width: 600px; margin: 0 auto; background-color: white; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
					<!-- Header -->
					<div style="background-color: #f44336; color: white; padding: 30px 20px; text-align: center;">
						<h1 style="margin: 0; font-size: 28px; font-weight: normal;">⚠️ Workflow Failure Alert</h1>
					</div>
					
					<!-- Content -->
					<div style="padding: 30px 20px;">
						<h2 style="color: #333; margin-top: 0;">Workflow Details</h2>
						<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
							<tr>
								<td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; width: 30%;">Name:</td>
								<td style="padding: 8px 0; border-bottom: 1px solid #eee;">${workflow.name}</td>
							</tr>
							<tr>
								<td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">Workflow ID:</td>
								<td style="padding: 8px 0; border-bottom: 1px solid #eee;">${workflow.id}</td>
							</tr>
							<tr>
								<td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">Execution ID:</td>
								<td style="padding: 8px 0; border-bottom: 1px solid #eee;">${execution.id}</td>
							</tr>
							<tr>
								<td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">Status:</td>
								<td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #f44336; font-weight: bold;">${execution.status.toUpperCase()}</td>
							</tr>
							<tr>
								<td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">Started:</td>
								<td style="padding: 8px 0; border-bottom: 1px solid #eee;">${execution.startedAt.toLocaleString()}</td>
							</tr>
							${execution.stoppedAt ? `
							<tr>
								<td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">Stopped:</td>
								<td style="padding: 8px 0; border-bottom: 1px solid #eee;">${execution.stoppedAt.toLocaleString()}</td>
							</tr>
							` : ''}
							${context.failedNode ? `
							<tr>
								<td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">Failed Node:</td>
								<td style="padding: 8px 0; border-bottom: 1px solid #eee;">${context.failedNode}</td>
							</tr>
							` : ''}
						</table>

						${context.errorMessage ? `
						<h3 style="color: #333; margin-top: 25px;">Error Details</h3>
						<div style="background-color: #fff3f3; border-left: 4px solid #f44336; padding: 15px; margin: 15px 0; font-family: monospace; font-size: 14px; white-space: pre-wrap;">${context.errorMessage}</div>
						` : ''}

						<!-- Action Buttons -->
						<div style="margin-top: 30px; text-align: center;">
							${context.executionUrl ? `
							<a href="${context.executionUrl}" style="display: inline-block; background-color: #1976d2; color: white; padding: 12px 25px; text-decoration: none; border-radius: 4px; margin-right: 10px; font-weight: bold;">View Execution</a>
							` : ''}
							${context.workflowUrl ? `
							<a href="${context.workflowUrl}" style="display: inline-block; background-color: #4caf50; color: white; padding: 12px 25px; text-decoration: none; border-radius: 4px; font-weight: bold;">Edit Workflow</a>
							` : ''}
						</div>
					</div>
					
					<!-- Footer -->
					<div style="background-color: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #eee;">
						<p style="margin: 0; color: #666; font-size: 14px;">
							This notification was sent by n8n workflow automation platform.
							${context.instanceUrl ? `<br><a href="${context.instanceUrl}" style="color: #1976d2;">Visit your n8n instance</a>` : ''}
						</p>
					</div>
				</div>
			</body>
			</html>
		`;
	}

	/**
	 * Format plain text email content
	 */
	private formatTextEmail(payload: NotificationPayload, config: EmailNotificationConfig): string {
		const { workflow, execution, context } = payload;
		
		let text = `
n8n WORKFLOW FAILURE ALERT
==========================

Workflow Details:
-----------------
Name: ${workflow.name}
Workflow ID: ${workflow.id}
Execution ID: ${execution.id}
Status: ${execution.status.toUpperCase()}
Started: ${execution.startedAt.toLocaleString()}
${execution.stoppedAt ? `Stopped: ${execution.stoppedAt.toLocaleString()}` : ''}
${context.failedNode ? `Failed Node: ${context.failedNode}` : ''}

${context.errorMessage ? `
Error Details:
--------------
${context.errorMessage}
` : ''}

Actions:
--------
${context.executionUrl ? `View Execution: ${context.executionUrl}` : ''}
${context.workflowUrl ? `Edit Workflow: ${context.workflowUrl}` : ''}
${context.instanceUrl ? `n8n Instance: ${context.instanceUrl}` : ''}

This notification was sent by n8n workflow automation platform.
		`.trim();

		return text;
	}
}