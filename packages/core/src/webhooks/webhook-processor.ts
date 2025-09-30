import type { Logger } from 'n8n-workflow';
import { ApplicationError } from 'n8n-workflow';

import type { IWebhookQueueEvent } from './webhook-queue';

/**
 * Webhook Processing Result
 */
export interface IWebhookProcessingResult {
	success: boolean;
	statusCode?: number;
	response?: unknown;
	error?: string;
	processingTimeMs: number;
}

/**
 * Webhook Processing Context
 * Contains workflow execution context and utilities
 */
export interface IWebhookProcessingContext {
	workflowId: string;
	eventId: string;
	executeWorkflow: (workflowId: string, webhookData: IWebhookQueueEvent) => Promise<unknown>;
	logger: Logger;
}

/**
 * Rate Limiter Configuration
 */
export interface IRateLimiterConfig {
	maxRequestsPerMinute: number;
	maxRequestsPerHour: number;
	maxConcurrentRequests: number;
}

/**
 * Webhook Processor Configuration
 */
export interface IWebhookProcessorConfig {
	timeout: number;
	rateLimiter?: IRateLimiterConfig;
	enableMetrics: boolean;
	maxPayloadSizeBytes: number;
}

/**
 * Webhook Processing Metrics
 */
export interface IWebhookMetrics {
	totalProcessed: number;
	successful: number;
	failed: number;
	averageProcessingTimeMs: number;
	lastProcessedAt?: Date;
}

/**
 * Rate Limiter
 * Implements token bucket algorithm for rate limiting
 */
class RateLimiter {
	private minuteTokens: number;
	private hourTokens: number;
	private activeRequests = 0;
	private readonly config: IRateLimiterConfig;
	private readonly logger: Logger;
	private minuteResetInterval?: NodeJS.Timeout;
	private hourResetInterval?: NodeJS.Timeout;

	constructor(config: IRateLimiterConfig, logger: Logger) {
		this.config = config;
		this.logger = logger;
		this.minuteTokens = config.maxRequestsPerMinute;
		this.hourTokens = config.maxRequestsPerHour;

		this.minuteResetInterval = setInterval(() => {
			this.minuteTokens = this.config.maxRequestsPerMinute;
		}, 60000);

		this.hourResetInterval = setInterval(() => {
			this.hourTokens = this.config.maxRequestsPerHour;
		}, 3600000);

		this.logger.info('RateLimiter initialized', {
			function: 'constructor',
			config,
		});
	}

	/**
	 * Try to acquire a token for processing
	 */
	async acquire(): Promise<boolean> {
		this.logger.debug('Attempting to acquire rate limit token', {
			function: 'acquire',
			minuteTokens: this.minuteTokens,
			hourTokens: this.hourTokens,
			activeRequests: this.activeRequests,
		});

		if (this.activeRequests >= this.config.maxConcurrentRequests) {
			this.logger.warn('Max concurrent requests reached', {
				function: 'acquire',
				activeRequests: this.activeRequests,
				maxConcurrentRequests: this.config.maxConcurrentRequests,
			});
			return false;
		}

		if (this.minuteTokens <= 0 || this.hourTokens <= 0) {
			this.logger.warn('Rate limit exceeded', {
				function: 'acquire',
				minuteTokens: this.minuteTokens,
				hourTokens: this.hourTokens,
			});
			return false;
		}

		this.minuteTokens--;
		this.hourTokens--;
		this.activeRequests++;

		this.logger.debug('Rate limit token acquired', {
			function: 'acquire',
			remainingMinuteTokens: this.minuteTokens,
			remainingHourTokens: this.hourTokens,
			activeRequests: this.activeRequests,
		});

		return true;
	}

	/**
	 * Release the token after processing
	 */
	release(): void {
		this.activeRequests--;
		this.logger.debug('Rate limit token released', {
			function: 'release',
			activeRequests: this.activeRequests,
		});
	}

	/**
	 * Cleanup rate limiter
	 */
	destroy(): void {
		if (this.minuteResetInterval) {
			clearInterval(this.minuteResetInterval);
		}
		if (this.hourResetInterval) {
			clearInterval(this.hourResetInterval);
		}
		this.logger.info('RateLimiter destroyed', { function: 'destroy' });
	}
}

/**
 * Webhook Processor
 * Processes webhook events with retry logic, rate limiting, and metrics
 */
export class WebhookProcessor {
	private readonly config: IWebhookProcessorConfig;
	private readonly logger: Logger;
	private readonly rateLimiter?: RateLimiter;
	private readonly metrics: IWebhookMetrics = {
		totalProcessed: 0,
		successful: 0,
		failed: 0,
		averageProcessingTimeMs: 0,
	};

	constructor(logger: Logger, config?: Partial<IWebhookProcessorConfig>) {
		this.logger = logger;
		this.config = {
			timeout: config?.timeout ?? 30000,
			rateLimiter: config?.rateLimiter,
			enableMetrics: config?.enableMetrics ?? true,
			maxPayloadSizeBytes: config?.maxPayloadSizeBytes ?? 10485760, // 10MB
		};

		if (this.config.rateLimiter) {
			this.rateLimiter = new RateLimiter(this.config.rateLimiter, logger);
		}

		this.logger.info('WebhookProcessor initialized', {
			function: 'constructor',
			config: this.config,
		});
	}

	/**
	 * Process a webhook event
	 */
	async process(
		event: IWebhookQueueEvent,
		context: IWebhookProcessingContext,
	): Promise<IWebhookProcessingResult> {
		const startTime = Date.now();
		this.logger.info('Function started', {
			function: 'process',
			eventId: event.id,
			workflowId: event.workflowId,
			webhookPath: event.webhookPath,
		});

		try {
			// Validate payload size
			const payloadSize = this.calculatePayloadSize(event);
			if (payloadSize > this.config.maxPayloadSizeBytes) {
				throw new ApplicationError('Webhook payload exceeds maximum size', {
					extra: {
						payloadSize,
						maxSize: this.config.maxPayloadSizeBytes,
					},
				});
			}

			// Apply rate limiting
			if (this.rateLimiter) {
				const acquired = await this.rateLimiter.acquire();
				if (!acquired) {
					throw new ApplicationError('Rate limit exceeded', {
						extra: { eventId: event.id },
					});
				}
			}

			try {
				// Execute webhook with timeout
				const result = await this.executeWithTimeout(event, context);

				// Update metrics
				if (this.config.enableMetrics) {
					this.updateMetrics(true, Date.now() - startTime);
				}

				this.logger.info('Function completed', {
					function: 'process',
					eventId: event.id,
					workflowId: event.workflowId,
					duration: Date.now() - startTime,
					success: true,
				});

				return result;
			} finally {
				if (this.rateLimiter) {
					this.rateLimiter.release();
				}
			}
		} catch (error) {
			// Update metrics
			if (this.config.enableMetrics) {
				this.updateMetrics(false, Date.now() - startTime);
			}

			this.logger.error('Function failed', {
				function: 'process',
				eventId: event.id,
				workflowId: event.workflowId,
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});

			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				processingTimeMs: Date.now() - startTime,
			};
		}
	}

	/**
	 * Execute webhook with timeout
	 */
	private async executeWithTimeout(
		event: IWebhookQueueEvent,
		context: IWebhookProcessingContext,
	): Promise<IWebhookProcessingResult> {
		const startTime = Date.now();
		this.logger.debug('Executing webhook with timeout', {
			function: 'executeWithTimeout',
			eventId: event.id,
			timeout: this.config.timeout,
		});

		return await Promise.race([
			this.executeWebhook(event, context),
			this.createTimeoutPromise(this.config.timeout),
		]);
	}

	/**
	 * Execute the actual webhook workflow
	 */
	private async executeWebhook(
		event: IWebhookQueueEvent,
		context: IWebhookProcessingContext,
	): Promise<IWebhookProcessingResult> {
		const startTime = Date.now();
		this.logger.info('Function started', {
			function: 'executeWebhook',
			eventId: event.id,
			workflowId: event.workflowId,
		});

		try {
			const response = await context.executeWorkflow(event.workflowId, event);

			this.logger.info('Function completed', {
				function: 'executeWebhook',
				eventId: event.id,
				workflowId: event.workflowId,
				duration: Date.now() - startTime,
			});

			return {
				success: true,
				response,
				statusCode: 200,
				processingTimeMs: Date.now() - startTime,
			};
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'executeWebhook',
				eventId: event.id,
				workflowId: event.workflowId,
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});

			throw error;
		}
	}

	/**
	 * Create a timeout promise
	 */
	private async createTimeoutPromise(timeoutMs: number): Promise<IWebhookProcessingResult> {
		return await new Promise((_, reject) => {
			setTimeout(() => {
				reject(
					new ApplicationError('Webhook processing timeout', {
						extra: { timeoutMs },
					}),
				);
			}, timeoutMs);
		});
	}

	/**
	 * Calculate payload size in bytes
	 */
	private calculatePayloadSize(event: IWebhookQueueEvent): number {
		try {
			const jsonString = JSON.stringify({
				body: event.body,
				headers: event.headers,
				queryParams: event.queryParams,
			});
			return Buffer.byteLength(jsonString, 'utf8');
		} catch (error) {
			this.logger.warn('Failed to calculate payload size', {
				function: 'calculatePayloadSize',
				error: error instanceof Error ? error.message : String(error),
			});
			return 0;
		}
	}

	/**
	 * Update processing metrics
	 */
	private updateMetrics(success: boolean, processingTimeMs: number): void {
		this.metrics.totalProcessed++;
		if (success) {
			this.metrics.successful++;
		} else {
			this.metrics.failed++;
		}

		// Calculate moving average
		this.metrics.averageProcessingTimeMs =
			(this.metrics.averageProcessingTimeMs * (this.metrics.totalProcessed - 1) +
				processingTimeMs) /
			this.metrics.totalProcessed;

		this.metrics.lastProcessedAt = new Date();

		this.logger.debug('Metrics updated', {
			function: 'updateMetrics',
			metrics: this.metrics,
		});
	}

	/**
	 * Get current metrics
	 */
	getMetrics(): IWebhookMetrics {
		return { ...this.metrics };
	}

	/**
	 * Reset metrics
	 */
	resetMetrics(): void {
		this.logger.info('Resetting metrics', { function: 'resetMetrics' });
		this.metrics.totalProcessed = 0;
		this.metrics.successful = 0;
		this.metrics.failed = 0;
		this.metrics.averageProcessingTimeMs = 0;
		this.metrics.lastProcessedAt = undefined;
	}

	/**
	 * Cleanup processor resources
	 */
	destroy(): void {
		this.logger.info('Function started', { function: 'destroy' });

		if (this.rateLimiter) {
			this.rateLimiter.destroy();
		}

		this.logger.info('Function completed', { function: 'destroy' });
	}
}
