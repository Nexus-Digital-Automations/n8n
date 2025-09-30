import type { Logger } from 'n8n-workflow';
import { ApplicationError } from 'n8n-workflow';

/**
 * Webhook Queue Event Interface
 * Represents a webhook event stored in the queue
 */
export interface IWebhookQueueEvent {
	id: string;
	workflowId: string;
	webhookPath: string;
	method: string;
	headers: Record<string, string | string[]>;
	body: unknown;
	queryParams: Record<string, string | string[]>;
	timestamp: Date;
	retryCount: number;
	maxRetries: number;
	status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead-letter';
	lastError?: string;
	nextRetryAt?: Date;
	metadata?: Record<string, unknown>;
}

/**
 * Webhook Queue Configuration
 */
export interface IWebhookQueueConfig {
	maxRetries: number;
	retryDelayMs: number;
	maxRetryDelayMs: number;
	exponentialBackoffMultiplier: number;
	queueProcessingIntervalMs: number;
	batchSize: number;
	deadLetterAfterDays: number;
}

/**
 * Database Adapter Interface
 * Abstraction for different database implementations
 */
export interface IWebhookQueueDatabaseAdapter {
	initialize(): Promise<void>;
	enqueue(event: Omit<IWebhookQueueEvent, 'id'>): Promise<string>;
	dequeue(batchSize: number): Promise<IWebhookQueueEvent[]>;
	updateStatus(
		id: string,
		status: IWebhookQueueEvent['status'],
		error?: string,
		nextRetryAt?: Date,
	): Promise<void>;
	incrementRetryCount(id: string): Promise<void>;
	moveToDeadLetter(id: string): Promise<void>;
	getEvent(id: string): Promise<IWebhookQueueEvent | null>;
	getQueueStats(): Promise<{
		pending: number;
		processing: number;
		completed: number;
		failed: number;
		deadLetter: number;
	}>;
	cleanupOldEvents(olderThanDays: number): Promise<number>;
	getEventsByWorkflow(workflowId: string, limit?: number): Promise<IWebhookQueueEvent[]>;
}

/**
 * Webhook Queue Manager
 * Manages persistent queue for webhook events with database backing
 */
export class WebhookQueue {
	private readonly config: IWebhookQueueConfig;
	private readonly logger: Logger;
	private readonly databaseAdapter: IWebhookQueueDatabaseAdapter;
	private processingInterval?: NodeJS.Timeout;
	private isProcessing = false;

	constructor(
		databaseAdapter: IWebhookQueueDatabaseAdapter,
		logger: Logger,
		config?: Partial<IWebhookQueueConfig>,
	) {
		this.logger = logger;
		this.databaseAdapter = databaseAdapter;
		this.config = {
			maxRetries: config?.maxRetries ?? 3,
			retryDelayMs: config?.retryDelayMs ?? 1000,
			maxRetryDelayMs: config?.maxRetryDelayMs ?? 60000,
			exponentialBackoffMultiplier: config?.exponentialBackoffMultiplier ?? 2,
			queueProcessingIntervalMs: config?.queueProcessingIntervalMs ?? 5000,
			batchSize: config?.batchSize ?? 10,
			deadLetterAfterDays: config?.deadLetterAfterDays ?? 30,
		};

		this.logger.info('WebhookQueue initialized', {
			function: 'constructor',
			config: this.config,
		});
	}

	/**
	 * Initialize the webhook queue
	 */
	async initialize(): Promise<void> {
		const startTime = Date.now();
		this.logger.info('Function started', { function: 'initialize' });

		try {
			await this.databaseAdapter.initialize();
			this.logger.info('Function completed', {
				function: 'initialize',
				duration: Date.now() - startTime,
			});
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'initialize',
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new ApplicationError('Failed to initialize webhook queue', { cause: error });
		}
	}

	/**
	 * Add a webhook event to the queue
	 */
	async enqueue(
		workflowId: string,
		webhookPath: string,
		method: string,
		headers: Record<string, string | string[]>,
		body: unknown,
		queryParams: Record<string, string | string[]>,
		metadata?: Record<string, unknown>,
	): Promise<string> {
		const startTime = Date.now();
		this.logger.info('Function started', {
			function: 'enqueue',
			workflowId,
			webhookPath,
			method,
		});

		try {
			const event: Omit<IWebhookQueueEvent, 'id'> = {
				workflowId,
				webhookPath,
				method,
				headers,
				body,
				queryParams,
				timestamp: new Date(),
				retryCount: 0,
				maxRetries: this.config.maxRetries,
				status: 'pending',
				metadata,
			};

			const eventId = await this.databaseAdapter.enqueue(event);

			this.logger.info('Function completed', {
				function: 'enqueue',
				workflowId,
				eventId,
				duration: Date.now() - startTime,
			});

			return eventId;
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'enqueue',
				workflowId,
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new ApplicationError('Failed to enqueue webhook event', { cause: error });
		}
	}

	/**
	 * Start processing the queue
	 */
	startProcessing(processor: (event: IWebhookQueueEvent) => Promise<void>): void {
		const startTime = Date.now();
		this.logger.info('Function started', { function: 'startProcessing' });

		if (this.processingInterval) {
			this.logger.warn('Queue processing already started', { function: 'startProcessing' });
			return;
		}

		this.processingInterval = setInterval(async () => {
			if (this.isProcessing) {
				return;
			}

			this.isProcessing = true;
			try {
				await this.processQueue(processor);
			} catch (error) {
				this.logger.error('Error in queue processing', {
					function: 'startProcessing',
					error: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
				});
			} finally {
				this.isProcessing = false;
			}
		}, this.config.queueProcessingIntervalMs);

		this.logger.info('Function completed', {
			function: 'startProcessing',
			duration: Date.now() - startTime,
		});
	}

	/**
	 * Stop processing the queue
	 */
	stopProcessing(): void {
		const startTime = Date.now();
		this.logger.info('Function started', { function: 'stopProcessing' });

		if (this.processingInterval) {
			clearInterval(this.processingInterval);
			this.processingInterval = undefined;
		}

		this.logger.info('Function completed', {
			function: 'stopProcessing',
			duration: Date.now() - startTime,
		});
	}

	/**
	 * Process queue events in batches
	 */
	private async processQueue(
		processor: (event: IWebhookQueueEvent) => Promise<void>,
	): Promise<void> {
		const startTime = Date.now();
		this.logger.debug('Processing queue batch', { function: 'processQueue' });

		try {
			const events = await this.databaseAdapter.dequeue(this.config.batchSize);

			if (events.length === 0) {
				return;
			}

			this.logger.info('Processing batch', {
				function: 'processQueue',
				batchSize: events.length,
			});

			await Promise.all(
				events.map(async (event) => {
					try {
						await this.databaseAdapter.updateStatus(event.id, 'processing');
						await processor(event);
						await this.databaseAdapter.updateStatus(event.id, 'completed');

						this.logger.info('Event processed successfully', {
							function: 'processQueue',
							eventId: event.id,
							workflowId: event.workflowId,
						});
					} catch (error) {
						await this.handleProcessingError(event, error);
					}
				}),
			);

			this.logger.debug('Batch processing completed', {
				function: 'processQueue',
				duration: Date.now() - startTime,
			});
		} catch (error) {
			this.logger.error('Failed to process queue', {
				function: 'processQueue',
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
		}
	}

	/**
	 * Handle processing errors with retry logic
	 */
	private async handleProcessingError(event: IWebhookQueueEvent, error: unknown): Promise<void> {
		const startTime = Date.now();
		const errorMessage = error instanceof Error ? error.message : String(error);

		this.logger.info('Function started', {
			function: 'handleProcessingError',
			eventId: event.id,
			retryCount: event.retryCount,
		});

		try {
			await this.databaseAdapter.incrementRetryCount(event.id);

			if (event.retryCount >= event.maxRetries) {
				this.logger.warn('Event exceeded max retries', {
					function: 'handleProcessingError',
					eventId: event.id,
					retryCount: event.retryCount,
					maxRetries: event.maxRetries,
				});

				await this.databaseAdapter.moveToDeadLetter(event.id);
				await this.databaseAdapter.updateStatus(event.id, 'dead-letter', errorMessage);
			} else {
				const nextRetryDelay = this.calculateRetryDelay(event.retryCount);
				const nextRetryAt = new Date(Date.now() + nextRetryDelay);

				this.logger.info('Scheduling retry', {
					function: 'handleProcessingError',
					eventId: event.id,
					retryCount: event.retryCount + 1,
					nextRetryAt,
				});

				await this.databaseAdapter.updateStatus(event.id, 'failed', errorMessage, nextRetryAt);
			}

			this.logger.info('Function completed', {
				function: 'handleProcessingError',
				eventId: event.id,
				duration: Date.now() - startTime,
			});
		} catch (updateError) {
			this.logger.error('Function failed', {
				function: 'handleProcessingError',
				eventId: event.id,
				duration: Date.now() - startTime,
				error: updateError instanceof Error ? updateError.message : String(updateError),
				stack: updateError instanceof Error ? updateError.stack : undefined,
			});
		}
	}

	/**
	 * Calculate retry delay with exponential backoff
	 */
	private calculateRetryDelay(retryCount: number): number {
		const delay =
			this.config.retryDelayMs * Math.pow(this.config.exponentialBackoffMultiplier, retryCount);
		return Math.min(delay, this.config.maxRetryDelayMs);
	}

	/**
	 * Get queue statistics
	 */
	async getStats(): Promise<{
		pending: number;
		processing: number;
		completed: number;
		failed: number;
		deadLetter: number;
	}> {
		const startTime = Date.now();
		this.logger.info('Function started', { function: 'getStats' });

		try {
			const stats = await this.databaseAdapter.getQueueStats();

			this.logger.info('Function completed', {
				function: 'getStats',
				stats,
				duration: Date.now() - startTime,
			});

			return stats;
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'getStats',
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new ApplicationError('Failed to get queue stats', { cause: error });
		}
	}

	/**
	 * Get a specific event by ID
	 */
	async getEvent(eventId: string): Promise<IWebhookQueueEvent | null> {
		const startTime = Date.now();
		this.logger.info('Function started', { function: 'getEvent', eventId });

		try {
			const event = await this.databaseAdapter.getEvent(eventId);

			this.logger.info('Function completed', {
				function: 'getEvent',
				eventId,
				found: !!event,
				duration: Date.now() - startTime,
			});

			return event;
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'getEvent',
				eventId,
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new ApplicationError('Failed to get webhook event', { cause: error });
		}
	}

	/**
	 * Get events by workflow ID
	 */
	async getEventsByWorkflow(workflowId: string, limit?: number): Promise<IWebhookQueueEvent[]> {
		const startTime = Date.now();
		this.logger.info('Function started', { function: 'getEventsByWorkflow', workflowId, limit });

		try {
			const events = await this.databaseAdapter.getEventsByWorkflow(workflowId, limit);

			this.logger.info('Function completed', {
				function: 'getEventsByWorkflow',
				workflowId,
				eventsCount: events.length,
				duration: Date.now() - startTime,
			});

			return events;
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'getEventsByWorkflow',
				workflowId,
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new ApplicationError('Failed to get workflow webhook events', { cause: error });
		}
	}

	/**
	 * Cleanup old completed and dead-letter events
	 */
	async cleanup(): Promise<number> {
		const startTime = Date.now();
		this.logger.info('Function started', { function: 'cleanup' });

		try {
			const deletedCount = await this.databaseAdapter.cleanupOldEvents(
				this.config.deadLetterAfterDays,
			);

			this.logger.info('Function completed', {
				function: 'cleanup',
				deletedCount,
				duration: Date.now() - startTime,
			});

			return deletedCount;
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'cleanup',
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new ApplicationError('Failed to cleanup old webhook events', { cause: error });
		}
	}
}
