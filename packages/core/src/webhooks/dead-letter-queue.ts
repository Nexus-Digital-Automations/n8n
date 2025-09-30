import type { Logger } from 'n8n-workflow';
import { ApplicationError } from 'n8n-workflow';

import type { IWebhookQueueEvent } from './webhook-queue';

/**
 * Dead Letter Event Interface
 * Extended event with failure analysis
 */
export interface IDeadLetterEvent extends IWebhookQueueEvent {
	movedToDeadLetterAt: Date;
	failureReason: string;
	failureCount: number;
	lastAttemptedAt: Date;
	errorHistory: Array<{
		timestamp: Date;
		error: string;
		retryCount: number;
	}>;
	canReplay: boolean;
}

/**
 * Dead Letter Queue Configuration
 */
export interface IDeadLetterQueueConfig {
	maxStorageDays: number;
	enableNotifications: boolean;
	notificationThreshold: number;
	autoReplayEnabled: boolean;
	replayDelayMs: number;
}

/**
 * Dead Letter Statistics
 */
export interface IDeadLetterStats {
	totalEvents: number;
	eventsByWorkflow: Record<string, number>;
	eventsByErrorType: Record<string, number>;
	oldestEvent?: Date;
	newestEvent?: Date;
}

/**
 * Database Adapter for Dead Letter Queue
 */
export interface IDeadLetterQueueDatabaseAdapter {
	initialize(): Promise<void>;
	add(event: IDeadLetterEvent): Promise<void>;
	getAll(limit?: number, offset?: number): Promise<IDeadLetterEvent[]>;
	getById(id: string): Promise<IDeadLetterEvent | null>;
	getByWorkflow(workflowId: string, limit?: number): Promise<IDeadLetterEvent[]>;
	getByErrorType(errorType: string, limit?: number): Promise<IDeadLetterEvent[]>;
	remove(id: string): Promise<boolean>;
	removeOlderThan(days: number): Promise<number>;
	updateReplayStatus(id: string, canReplay: boolean): Promise<void>;
	getStats(): Promise<IDeadLetterStats>;
	search(query: {
		workflowId?: string;
		startDate?: Date;
		endDate?: Date;
		errorPattern?: string;
	}): Promise<IDeadLetterEvent[]>;
}

/**
 * Dead Letter Queue Manager
 * Manages permanently failed webhooks with analysis and replay capabilities
 */
export class DeadLetterQueue {
	private readonly config: IDeadLetterQueueConfig;
	private readonly logger: Logger;
	private readonly databaseAdapter: IDeadLetterQueueDatabaseAdapter;
	private cleanupInterval?: NodeJS.Timeout;
	private notificationCallback?: (events: IDeadLetterEvent[]) => Promise<void>;

	constructor(
		databaseAdapter: IDeadLetterQueueDatabaseAdapter,
		logger: Logger,
		config?: Partial<IDeadLetterQueueConfig>,
	) {
		this.logger = logger;
		this.databaseAdapter = databaseAdapter;
		this.config = {
			maxStorageDays: config?.maxStorageDays ?? 90,
			enableNotifications: config?.enableNotifications ?? true,
			notificationThreshold: config?.notificationThreshold ?? 10,
			autoReplayEnabled: config?.autoReplayEnabled ?? false,
			replayDelayMs: config?.replayDelayMs ?? 3600000, // 1 hour
		};

		this.logger.info('DeadLetterQueue initialized', {
			function: 'constructor',
			config: this.config,
		});
	}

	/**
	 * Initialize the dead letter queue
	 */
	async initialize(): Promise<void> {
		const startTime = Date.now();
		this.logger.info('Function started', { function: 'initialize' });

		try {
			await this.databaseAdapter.initialize();

			// Start automatic cleanup
			this.startAutomaticCleanup();

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
			throw new ApplicationError('Failed to initialize dead letter queue', { cause: error });
		}
	}

	/**
	 * Add a failed webhook to the dead letter queue
	 */
	async add(
		event: IWebhookQueueEvent,
		failureReason: string,
		errorHistory: Array<{ timestamp: Date; error: string; retryCount: number }>,
	): Promise<void> {
		const startTime = Date.now();
		this.logger.info('Function started', {
			function: 'add',
			eventId: event.id,
			workflowId: event.workflowId,
		});

		try {
			const deadLetterEvent: IDeadLetterEvent = {
				...event,
				movedToDeadLetterAt: new Date(),
				failureReason,
				failureCount: errorHistory.length,
				lastAttemptedAt: errorHistory[errorHistory.length - 1]?.timestamp ?? new Date(),
				errorHistory,
				canReplay: true,
			};

			await this.databaseAdapter.add(deadLetterEvent);

			// Check if notification threshold is reached
			if (this.config.enableNotifications && this.notificationCallback) {
				await this.checkNotificationThreshold();
			}

			this.logger.info('Function completed', {
				function: 'add',
				eventId: event.id,
				workflowId: event.workflowId,
				duration: Date.now() - startTime,
			});
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'add',
				eventId: event.id,
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new ApplicationError('Failed to add event to dead letter queue', { cause: error });
		}
	}

	/**
	 * Get all dead letter events with pagination
	 */
	async getAll(limit?: number, offset?: number): Promise<IDeadLetterEvent[]> {
		const startTime = Date.now();
		this.logger.info('Function started', { function: 'getAll', limit, offset });

		try {
			const events = await this.databaseAdapter.getAll(limit, offset);

			this.logger.info('Function completed', {
				function: 'getAll',
				eventsCount: events.length,
				duration: Date.now() - startTime,
			});

			return events;
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'getAll',
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new ApplicationError('Failed to get dead letter events', { cause: error });
		}
	}

	/**
	 * Get a specific dead letter event by ID
	 */
	async getById(id: string): Promise<IDeadLetterEvent | null> {
		const startTime = Date.now();
		this.logger.info('Function started', { function: 'getById', id });

		try {
			const event = await this.databaseAdapter.getById(id);

			this.logger.info('Function completed', {
				function: 'getById',
				id,
				found: !!event,
				duration: Date.now() - startTime,
			});

			return event;
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'getById',
				id,
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new ApplicationError('Failed to get dead letter event', { cause: error });
		}
	}

	/**
	 * Get dead letter events by workflow
	 */
	async getByWorkflow(workflowId: string, limit?: number): Promise<IDeadLetterEvent[]> {
		const startTime = Date.now();
		this.logger.info('Function started', { function: 'getByWorkflow', workflowId, limit });

		try {
			const events = await this.databaseAdapter.getByWorkflow(workflowId, limit);

			this.logger.info('Function completed', {
				function: 'getByWorkflow',
				workflowId,
				eventsCount: events.length,
				duration: Date.now() - startTime,
			});

			return events;
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'getByWorkflow',
				workflowId,
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new ApplicationError('Failed to get workflow dead letter events', { cause: error });
		}
	}

	/**
	 * Search dead letter events with filters
	 */
	async search(query: {
		workflowId?: string;
		startDate?: Date;
		endDate?: Date;
		errorPattern?: string;
	}): Promise<IDeadLetterEvent[]> {
		const startTime = Date.now();
		this.logger.info('Function started', { function: 'search', query });

		try {
			const events = await this.databaseAdapter.search(query);

			this.logger.info('Function completed', {
				function: 'search',
				eventsCount: events.length,
				duration: Date.now() - startTime,
			});

			return events;
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'search',
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new ApplicationError('Failed to search dead letter events', { cause: error });
		}
	}

	/**
	 * Replay a dead letter event
	 */
	async replay(
		id: string,
		replayCallback: (event: IWebhookQueueEvent) => Promise<void>,
	): Promise<boolean> {
		const startTime = Date.now();
		this.logger.info('Function started', { function: 'replay', id });

		try {
			const event = await this.databaseAdapter.getById(id);

			if (!event) {
				this.logger.warn('Event not found for replay', { function: 'replay', id });
				return false;
			}

			if (!event.canReplay) {
				this.logger.warn('Event cannot be replayed', { function: 'replay', id });
				return false;
			}

			// Attempt to replay the event
			await replayCallback(event);

			// Remove from dead letter queue on successful replay
			await this.databaseAdapter.remove(id);

			this.logger.info('Function completed', {
				function: 'replay',
				id,
				success: true,
				duration: Date.now() - startTime,
			});

			return true;
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'replay',
				id,
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});

			// Mark event as non-replayable after failed replay attempt
			await this.databaseAdapter.updateReplayStatus(id, false);

			return false;
		}
	}

	/**
	 * Remove a dead letter event
	 */
	async remove(id: string): Promise<boolean> {
		const startTime = Date.now();
		this.logger.info('Function started', { function: 'remove', id });

		try {
			const removed = await this.databaseAdapter.remove(id);

			this.logger.info('Function completed', {
				function: 'remove',
				id,
				removed,
				duration: Date.now() - startTime,
			});

			return removed;
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'remove',
				id,
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new ApplicationError('Failed to remove dead letter event', { cause: error });
		}
	}

	/**
	 * Get dead letter queue statistics
	 */
	async getStats(): Promise<IDeadLetterStats> {
		const startTime = Date.now();
		this.logger.info('Function started', { function: 'getStats' });

		try {
			const stats = await this.databaseAdapter.getStats();

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
			throw new ApplicationError('Failed to get dead letter queue stats', { cause: error });
		}
	}

	/**
	 * Analyze failure patterns in dead letter queue
	 */
	async analyzeFailures(): Promise<{
		commonErrors: Array<{ error: string; count: number }>;
		affectedWorkflows: Array<{ workflowId: string; count: number }>;
		failureTimeline: Array<{ date: string; count: number }>;
	}> {
		const startTime = Date.now();
		this.logger.info('Function started', { function: 'analyzeFailures' });

		try {
			const events = await this.databaseAdapter.getAll();

			// Analyze common errors
			const errorCounts = new Map<string, number>();
			const workflowCounts = new Map<string, number>();
			const timelineCounts = new Map<string, number>();

			events.forEach((event) => {
				// Count errors
				const errorKey = event.failureReason.substring(0, 100);
				errorCounts.set(errorKey, (errorCounts.get(errorKey) ?? 0) + 1);

				// Count workflows
				workflowCounts.set(event.workflowId, (workflowCounts.get(event.workflowId) ?? 0) + 1);

				// Count by date
				const dateKey = event.movedToDeadLetterAt.toISOString().split('T')[0];
				timelineCounts.set(dateKey, (timelineCounts.get(dateKey) ?? 0) + 1);
			});

			const analysis = {
				commonErrors: Array.from(errorCounts.entries())
					.map(([error, count]) => ({ error, count }))
					.sort((a, b) => b.count - a.count)
					.slice(0, 10),
				affectedWorkflows: Array.from(workflowCounts.entries())
					.map(([workflowId, count]) => ({ workflowId, count }))
					.sort((a, b) => b.count - a.count)
					.slice(0, 10),
				failureTimeline: Array.from(timelineCounts.entries())
					.map(([date, count]) => ({ date, count }))
					.sort((a, b) => a.date.localeCompare(b.date)),
			};

			this.logger.info('Function completed', {
				function: 'analyzeFailures',
				duration: Date.now() - startTime,
				totalEvents: events.length,
				uniqueErrors: errorCounts.size,
				affectedWorkflows: workflowCounts.size,
			});

			return analysis;
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'analyzeFailures',
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new ApplicationError('Failed to analyze dead letter queue failures', { cause: error });
		}
	}

	/**
	 * Set notification callback for dead letter events
	 */
	setNotificationCallback(
		notificationHandler: (events: IDeadLetterEvent[]) => Promise<void>,
	): void {
		this.logger.info('Notification callback registered', { function: 'setNotificationCallback' });
		this.notificationCallback = notificationHandler;
	}

	/**
	 * Check if notification threshold is reached
	 */
	private async checkNotificationThreshold(): Promise<void> {
		try {
			const stats = await this.databaseAdapter.getStats();

			if (stats.totalEvents >= this.config.notificationThreshold && this.notificationCallback) {
				const recentEvents = await this.databaseAdapter.getAll(this.config.notificationThreshold);
				await this.notificationCallback(recentEvents);

				this.logger.info('Notification sent', {
					function: 'checkNotificationThreshold',
					eventCount: recentEvents.length,
				});
			}
		} catch (error) {
			this.logger.error('Failed to check notification threshold', {
				function: 'checkNotificationThreshold',
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Start automatic cleanup of old events
	 */
	private startAutomaticCleanup(): void {
		this.logger.info('Starting automatic cleanup', { function: 'startAutomaticCleanup' });

		// Run cleanup daily
		this.cleanupInterval = setInterval(async () => {
			try {
				const deletedCount = await this.databaseAdapter.removeOlderThan(this.config.maxStorageDays);

				this.logger.info('Automatic cleanup completed', {
					function: 'startAutomaticCleanup',
					deletedCount,
				});
			} catch (error) {
				this.logger.error('Automatic cleanup failed', {
					function: 'startAutomaticCleanup',
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}, 86400000); // 24 hours
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		this.logger.info('Function started', { function: 'destroy' });

		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
		}

		this.logger.info('Function completed', { function: 'destroy' });
	}
}
