/**
 * Comprehensive error handling and logging strategy for the notification system
 */

import { ApplicationError } from 'n8n-workflow';
import { Logger } from '@n8n/backend-common';
import { ErrorReporter } from 'n8n-core';

/**
 * Base notification system error
 */
export abstract class NotificationSystemError extends ApplicationError {
	constructor(
		message: string,
		public readonly errorCode: string,
		public readonly retryable: boolean = false,
		public readonly context?: Record<string, any>,
	) {
		super(message, { cause: context });
		this.name = this.constructor.name;
	}

	toJSON() {
		return {
			name: this.name,
			message: this.message,
			errorCode: this.errorCode,
			retryable: this.retryable,
			context: this.context,
			stack: this.stack,
		};
	}
}

/**
 * Channel-specific errors
 */
export class ChannelConfigurationError extends NotificationSystemError {
	constructor(channelId: string, message: string, context?: Record<string, any>) {
		super(
			`Channel configuration error for ${channelId}: ${message}`,
			'CHANNEL_CONFIGURATION_ERROR',
			false,
			{ channelId, ...context },
		);
	}
}

export class ChannelNotFoundError extends NotificationSystemError {
	constructor(channelId: string) {
		super(
			`Notification channel not found: ${channelId}`,
			'CHANNEL_NOT_FOUND',
			false,
			{ channelId },
		);
	}
}

export class ChannelDisabledError extends NotificationSystemError {
	constructor(channelId: string) {
		super(
			`Notification channel is disabled: ${channelId}`,
			'CHANNEL_DISABLED',
			false,
			{ channelId },
		);
	}
}

export class ChannelConnectionError extends NotificationSystemError {
	constructor(channelId: string, channelType: string, originalError: Error) {
		super(
			`Failed to connect to ${channelType} channel ${channelId}: ${originalError.message}`,
			'CHANNEL_CONNECTION_ERROR',
			true,
			{ channelId, channelType, originalError: originalError.message },
		);
	}
}

export class ChannelTimeoutError extends NotificationSystemError {
	constructor(channelId: string, channelType: string, timeoutMs: number) {
		super(
			`${channelType} channel ${channelId} timed out after ${timeoutMs}ms`,
			'CHANNEL_TIMEOUT',
			true,
			{ channelId, channelType, timeoutMs },
		);
	}
}

/**
 * Rate limiting errors
 */
export class RateLimitExceededError extends NotificationSystemError {
	constructor(
		channelId: string,
		currentCount: number,
		maxAllowed: number,
		resetAt: Date,
	) {
		super(
			`Rate limit exceeded for channel ${channelId}: ${currentCount}/${maxAllowed} notifications`,
			'RATE_LIMIT_EXCEEDED',
			false,
			{ channelId, currentCount, maxAllowed, resetAt },
		);
	}
}

export class RateLimitServiceError extends NotificationSystemError {
	constructor(message: string, context?: Record<string, any>) {
		super(
			`Rate limit service error: ${message}`,
			'RATE_LIMIT_SERVICE_ERROR',
			true,
			context,
		);
	}
}

/**
 * Alert rule errors
 */
export class AlertRuleEvaluationError extends NotificationSystemError {
	constructor(ruleId: string, message: string, context?: Record<string, any>) {
		super(
			`Alert rule evaluation failed for rule ${ruleId}: ${message}`,
			'ALERT_RULE_EVALUATION_ERROR',
			true,
			{ ruleId, ...context },
		);
	}
}

export class AlertRuleNotFoundError extends NotificationSystemError {
	constructor(ruleId: string) {
		super(
			`Alert rule not found: ${ruleId}`,
			'ALERT_RULE_NOT_FOUND',
			false,
			{ ruleId },
		);
	}
}

export class AlertRuleValidationError extends NotificationSystemError {
	constructor(ruleId: string, validationErrors: string[], context?: Record<string, any>) {
		super(
			`Alert rule validation failed for rule ${ruleId}: ${validationErrors.join(', ')}`,
			'ALERT_RULE_VALIDATION_ERROR',
			false,
			{ ruleId, validationErrors, ...context },
		);
	}
}

/**
 * Template errors
 */
export class TemplateNotFoundError extends NotificationSystemError {
	constructor(templateId: string, alertType: string) {
		super(
			`Template not found for alert type ${alertType}: ${templateId}`,
			'TEMPLATE_NOT_FOUND',
			false,
			{ templateId, alertType },
		);
	}
}

export class TemplateRenderError extends NotificationSystemError {
	constructor(templateId: string, renderError: Error, context?: Record<string, any>) {
		super(
			`Failed to render template ${templateId}: ${renderError.message}`,
			'TEMPLATE_RENDER_ERROR',
			false,
			{ templateId, renderError: renderError.message, ...context },
		);
	}
}

export class TemplateValidationError extends NotificationSystemError {
	constructor(templateId: string, validationErrors: string[]) {
		super(
			`Template validation failed for ${templateId}: ${validationErrors.join(', ')}`,
			'TEMPLATE_VALIDATION_ERROR',
			false,
			{ templateId, validationErrors },
		);
	}
}

/**
 * Queue errors
 */
export class QueueServiceError extends NotificationSystemError {
	constructor(operation: string, message: string, context?: Record<string, any>) {
		super(
			`Queue service error during ${operation}: ${message}`,
			'QUEUE_SERVICE_ERROR',
			true,
			{ operation, ...context },
		);
	}
}

export class QueueJobError extends NotificationSystemError {
	constructor(jobId: string, message: string, context?: Record<string, any>) {
		super(
			`Queue job ${jobId} failed: ${message}`,
			'QUEUE_JOB_ERROR',
			true,
			{ jobId, ...context },
		);
	}
}

/**
 * Provider-specific errors
 */
export class EmailProviderError extends NotificationSystemError {
	constructor(provider: string, statusCode: number, message: string, context?: Record<string, any>) {
		super(
			`Email provider ${provider} error (${statusCode}): ${message}`,
			'EMAIL_PROVIDER_ERROR',
			this.isRetryableStatusCode(statusCode),
			{ provider, statusCode, ...context },
		);
	}

	private isRetryableStatusCode(statusCode: number): boolean {
		// 429 (rate limit), 500-504 (server errors) are retryable
		return statusCode === 429 || (statusCode >= 500 && statusCode <= 504);
	}
}

export class WebhookProviderError extends NotificationSystemError {
	constructor(url: string, statusCode: number, message: string, context?: Record<string, any>) {
		super(
			`Webhook request to ${url} failed (${statusCode}): ${message}`,
			'WEBHOOK_PROVIDER_ERROR',
			this.isRetryableStatusCode(statusCode),
			{ url, statusCode, ...context },
		);
	}

	private isRetryableStatusCode(statusCode: number): boolean {
		return statusCode === 429 || (statusCode >= 500 && statusCode <= 504);
	}
}

export class SmsProviderError extends NotificationSystemError {
	constructor(provider: string, errorCode: string, message: string, context?: Record<string, any>) {
		super(
			`SMS provider ${provider} error (${errorCode}): ${message}`,
			'SMS_PROVIDER_ERROR',
			this.isRetryableErrorCode(errorCode),
			{ provider, providerErrorCode: errorCode, ...context },
		);
	}

	private isRetryableErrorCode(errorCode: string): boolean {
		// Common retryable SMS error codes
		const retryableErrors = [
			'rate_limit_exceeded',
			'service_unavailable',
			'temporary_failure',
			'network_error',
		];
		return retryableErrors.includes(errorCode.toLowerCase());
	}
}

export class SlackProviderError extends NotificationSystemError {
	constructor(errorCode: string, message: string, context?: Record<string, any>) {
		super(
			`Slack API error (${errorCode}): ${message}`,
			'SLACK_PROVIDER_ERROR',
			this.isRetryableErrorCode(errorCode),
			{ slackErrorCode: errorCode, ...context },
		);
	}

	private isRetryableErrorCode(errorCode: string): boolean {
		const retryableErrors = [
			'rate_limited',
			'internal_error',
			'service_unavailable',
		];
		return retryableErrors.includes(errorCode);
	}
}

/**
 * Security errors
 */
export class SecurityValidationError extends NotificationSystemError {
	constructor(reason: string, context?: Record<string, any>) {
		super(
			`Security validation failed: ${reason}`,
			'SECURITY_VALIDATION_ERROR',
			false,
			context,
		);
	}
}

export class PayloadTooLargeError extends NotificationSystemError {
	constructor(actualSize: number, maxSize: number) {
		super(
			`Notification payload too large: ${actualSize} bytes exceeds limit of ${maxSize} bytes`,
			'PAYLOAD_TOO_LARGE',
			false,
			{ actualSize, maxSize },
		);
	}
}

export class BlockedDomainError extends NotificationSystemError {
	constructor(domain: string) {
		super(
			`Domain is blocked for notifications: ${domain}`,
			'BLOCKED_DOMAIN',
			false,
			{ domain },
		);
	}
}

/**
 * System errors
 */
export class DatabaseConnectionError extends NotificationSystemError {
	constructor(operation: string, originalError: Error) {
		super(
			`Database connection error during ${operation}: ${originalError.message}`,
			'DATABASE_CONNECTION_ERROR',
			true,
			{ operation, originalError: originalError.message },
		);
	}
}

export class ConfigurationError extends NotificationSystemError {
	constructor(configKey: string, message: string) {
		super(
			`Configuration error for ${configKey}: ${message}`,
			'CONFIGURATION_ERROR',
			false,
			{ configKey },
		);
	}
}

export class ServiceUnavailableError extends NotificationSystemError {
	constructor(serviceName: string, message: string, context?: Record<string, any>) {
		super(
			`Service ${serviceName} is unavailable: ${message}`,
			'SERVICE_UNAVAILABLE',
			true,
			{ serviceName, ...context },
		);
	}
}

/**
 * Error handler class for centralized error management
 */
export class NotificationErrorHandler {
	constructor(
		private readonly logger: Logger,
		private readonly errorReporter: ErrorReporter,
	) {}

	/**
	 * Handle and log errors appropriately
	 */
	async handleError(error: Error, context?: Record<string, any>): Promise<void> {
		const errorContext = {
			...context,
			timestamp: new Date().toISOString(),
		};

		if (error instanceof NotificationSystemError) {
			// Structured logging for known errors
			this.logger.error(`Notification system error: ${error.message}`, {
				errorCode: error.errorCode,
				retryable: error.retryable,
				context: { ...errorContext, ...error.context },
				stack: error.stack,
			});

			// Report to error tracking system if critical
			if (!error.retryable || this.isCriticalError(error)) {
				this.errorReporter.error(error, errorContext);
			}
		} else {
			// Unknown error - log as warning and report
			this.logger.warn(`Unexpected notification system error: ${error.message}`, {
				errorType: error.constructor.name,
				context: errorContext,
				stack: error.stack,
			});

			this.errorReporter.error(error, errorContext);
		}
	}

	/**
	 * Determine if error should trigger immediate alerting
	 */
	private isCriticalError(error: NotificationSystemError): boolean {
		const criticalErrorCodes = [
			'CHANNEL_CONFIGURATION_ERROR',
			'DATABASE_CONNECTION_ERROR',
			'SECURITY_VALIDATION_ERROR',
			'SERVICE_UNAVAILABLE',
		];

		return criticalErrorCodes.includes(error.errorCode);
	}

	/**
	 * Create error response for API endpoints
	 */
	createErrorResponse(error: Error): {
		success: false;
		error: {
			code: string;
			message: string;
			retryable: boolean;
			context?: Record<string, any>;
		};
	} {
		if (error instanceof NotificationSystemError) {
			return {
				success: false,
				error: {
					code: error.errorCode,
					message: error.message,
					retryable: error.retryable,
					context: this.sanitizeContext(error.context),
				},
			};
		}

		return {
			success: false,
			error: {
				code: 'UNKNOWN_ERROR',
				message: 'An unexpected error occurred',
				retryable: false,
			},
		};
	}

	/**
	 * Sanitize error context to remove sensitive information
	 */
	private sanitizeContext(context?: Record<string, any>): Record<string, any> | undefined {
		if (!context) return undefined;

		const sensitiveKeys = [
			'password',
			'apiKey',
			'token',
			'secret',
			'credentials',
			'auth',
		];

		const sanitized = { ...context };

		for (const key of Object.keys(sanitized)) {
			if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
				sanitized[key] = '[REDACTED]';
			}
		}

		return sanitized;
	}
}

/**
 * Error recovery strategies
 */
export class ErrorRecoveryService {
	constructor(
		private readonly logger: Logger,
		private readonly errorHandler: NotificationErrorHandler,
	) {}

	/**
	 * Execute operation with automatic retry for retryable errors
	 */
	async executeWithRetry<T>(
		operation: () => Promise<T>,
		maxAttempts: number = 3,
		baseDelayMs: number = 1000,
		context?: Record<string, any>,
	): Promise<T> {
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				return await operation();
			} catch (error) {
				lastError = error as Error;
				
				const isRetryable = this.isRetryableError(error as Error);
				const isLastAttempt = attempt === maxAttempts;

				if (!isRetryable || isLastAttempt) {
					await this.errorHandler.handleError(error as Error, {
						...context,
						attempt,
						maxAttempts,
						finalAttempt: isLastAttempt,
					});

					throw error;
				}

				// Calculate delay with exponential backoff
				const delay = baseDelayMs * Math.pow(2, attempt - 1);
				const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd
				const totalDelay = delay + jitter;

				this.logger.debug('Retrying operation after error', {
					attempt,
					maxAttempts,
					delayMs: Math.round(totalDelay),
					error: (error as Error).message,
					...context,
				});

				await new Promise(resolve => setTimeout(resolve, totalDelay));
			}
		}

		throw lastError; // This should never be reached, but satisfies TypeScript
	}

	/**
	 * Execute operation with circuit breaker pattern
	 */
	async executeWithCircuitBreaker<T>(
		operation: () => Promise<T>,
		circuitBreakerKey: string,
		context?: Record<string, any>,
	): Promise<T> {
		// Circuit breaker implementation would go here
		// For now, just execute the operation
		try {
			return await operation();
		} catch (error) {
			await this.errorHandler.handleError(error as Error, {
				...context,
				circuitBreakerKey,
			});
			throw error;
		}
	}

	/**
	 * Determine if an error is retryable
	 */
	private isRetryableError(error: Error): boolean {
		if (error instanceof NotificationSystemError) {
			return error.retryable;
		}

		// Check for common retryable error patterns
		const retryablePatterns = [
			'timeout',
			'connection refused',
			'network error',
			'service unavailable',
			'internal server error',
			'rate limit',
		];

		const errorMessage = error.message.toLowerCase();
		return retryablePatterns.some(pattern => errorMessage.includes(pattern));
	}
}

/**
 * Metrics collection for error monitoring
 */
export interface ErrorMetrics {
	totalErrors: number;
	errorsByType: Record<string, number>;
	errorsByChannel: Record<string, number>;
	retryableErrors: number;
	criticalErrors: number;
	averageErrorRate: number;
}

export class ErrorMetricsCollector {
	private errorCounts = new Map<string, number>();
	private channelErrorCounts = new Map<string, number>();
	private totalErrors = 0;
	private retryableErrors = 0;
	private criticalErrors = 0;

	constructor(private readonly logger: Logger) {}

	/**
	 * Record an error occurrence
	 */
	recordError(error: Error, channelId?: string): void {
		this.totalErrors++;

		const errorType = error instanceof NotificationSystemError 
			? error.errorCode 
			: error.constructor.name;

		this.errorCounts.set(errorType, (this.errorCounts.get(errorType) || 0) + 1);

		if (channelId) {
			this.channelErrorCounts.set(channelId, (this.channelErrorCounts.get(channelId) || 0) + 1);
		}

		if (error instanceof NotificationSystemError) {
			if (error.retryable) {
				this.retryableErrors++;
			}
			// Critical errors would be determined by error type/code
		}
	}

	/**
	 * Get current error metrics
	 */
	getMetrics(timeWindowMinutes: number = 60): ErrorMetrics {
		// In a real implementation, this would filter by time window
		return {
			totalErrors: this.totalErrors,
			errorsByType: Object.fromEntries(this.errorCounts),
			errorsByChannel: Object.fromEntries(this.channelErrorCounts),
			retryableErrors: this.retryableErrors,
			criticalErrors: this.criticalErrors,
			averageErrorRate: this.totalErrors / timeWindowMinutes,
		};
	}

	/**
	 * Reset metrics (typically called after reporting)
	 */
	resetMetrics(): void {
		this.errorCounts.clear();
		this.channelErrorCounts.clear();
		this.totalErrors = 0;
		this.retryableErrors = 0;
		this.criticalErrors = 0;
	}
}