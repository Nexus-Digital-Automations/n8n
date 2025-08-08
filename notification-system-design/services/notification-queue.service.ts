/**
 * Queue service for reliable notification processing
 * Following n8n's queue patterns with Bull/BullMQ
 */

import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { Service } from '@n8n/di';
import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';

import type {
	NotificationAlert,
	NotificationContext,
	NotificationResult,
} from '../interfaces/notification-channel.interface';
import { NotificationRepository } from '../repositories/notification.repository';
import { QueueServiceError, QueueJobError } from '../errors/notification-errors';
import { NotificationErrorHandler } from '../errors/notification-errors';

@Service()
export class NotificationQueueService {
	private queue: Queue;
	private worker: Worker;
	private queueEvents: QueueEvents;
	private redis: Redis;

	constructor(
		private readonly globalConfig: GlobalConfig,
		private readonly logger: Logger,
		private readonly notificationRepository: NotificationRepository,
		private readonly errorHandler: NotificationErrorHandler,
	) {
		this.initializeQueue();
	}

	/**
	 * Initialize queue, worker, and event listeners
	 */
	private initializeQueue(): void {
		const queueConfig = this.globalConfig.notifications?.queue;
		const redisUrl = queueConfig?.redisUrl || this.globalConfig.redis?.host;
		
		if (!redisUrl) {
			throw new Error('Redis configuration required for notification queue');
		}

		// Initialize Redis connection
		this.redis = new Redis(redisUrl, {
			maxRetriesPerRequest: 3,
			retryDelayOnFailover: 100,
		});

		// Initialize queue
		this.queue = new Queue('notification-queue', {
			connection: this.redis,
			defaultJobOptions: {
				removeOnComplete: 10, // Keep last 10 completed jobs
				removeOnFail: 50, // Keep last 50 failed jobs
				attempts: 3,
				backoff: {
					type: 'exponential',
					delay: 2000,
				},
			},
		});

		// Initialize worker
		this.worker = new Worker(
			'notification-queue',
			async (job: Job) => this.processNotificationJob(job),
			{
				connection: this.redis,
				concurrency: queueConfig?.concurrency || 5,
				limiter: {
					max: 100, // Max 100 jobs per 60 seconds
					duration: 60000,
				},
			},
		);

		// Initialize queue events
		this.queueEvents = new QueueEvents('notification-queue', {
			connection: this.redis,
		});

		this.setupEventListeners();
		
		this.logger.info('Notification queue service initialized', {
			concurrency: queueConfig?.concurrency || 5,
			redisUrl: redisUrl.replace(/\/\/.*@/, '//***@'), // Hide credentials in logs
		});
	}

	/**
	 * Setup event listeners for monitoring
	 */
	private setupEventListeners(): void {
		this.worker.on('completed', (job) => {
			this.logger.debug('Notification job completed', {
				jobId: job.id,
				channelId: job.data.channelId,
				alertId: job.data.alert?.id,
				processingTime: Date.now() - job.timestamp,
			});
		});

		this.worker.on('failed', (job, err) => {
			this.logger.error('Notification job failed', {
				jobId: job?.id,
				channelId: job?.data?.channelId,
				alertId: job?.data?.alert?.id,
				error: err.message,
				attempts: job?.attemptsMade,
			});
		});

		this.worker.on('stalled', (jobId) => {
			this.logger.warn('Notification job stalled', { jobId });
		});

		this.queueEvents.on('waiting', ({ jobId }) => {
			this.logger.debug('Notification job waiting', { jobId });
		});

		this.queueEvents.on('active', ({ jobId }) => {
			this.logger.debug('Notification job started', { jobId });
		});

		this.queueEvents.on('progress', ({ jobId, data }) => {
			this.logger.debug('Notification job progress', { jobId, progress: data });
		});
	}

	/**
	 * Enqueue notification for processing
	 */
	async enqueueNotification(notificationJob: NotificationJob): Promise<string> {
		try {
			const jobOptions: any = {
				priority: this.getJobPriority(notificationJob.alert?.severity),
				delay: notificationJob.scheduledAt 
					? notificationJob.scheduledAt.getTime() - Date.now()
					: 0,
			};

			// Configure retry settings
			if (notificationJob.maxAttempts) {
				jobOptions.attempts = notificationJob.maxAttempts;
			}

			const job = await this.queue.add('send-notification', notificationJob, jobOptions);
			
			this.logger.debug('Notification job enqueued', {
				jobId: job.id,
				channelId: notificationJob.channelId,
				alertId: notificationJob.alert?.id,
				scheduledAt: notificationJob.scheduledAt,
				priority: jobOptions.priority,
			});

			return job.id!;

		} catch (error) {
			this.logger.error('Failed to enqueue notification', {
				channelId: notificationJob.channelId,
				alertId: notificationJob.alert?.id,
				error: error as Error,
			});
			
			throw new QueueServiceError('enqueue', (error as Error).message, {
				channelId: notificationJob.channelId,
				alertId: notificationJob.alert?.id,
			});
		}
	}

	/**
	 * Process notification job
	 */
	private async processNotificationJob(job: Job<NotificationJob>): Promise<NotificationResult> {
		const startTime = Date.now();
		const jobData = job.data;

		try {
			this.logger.debug('Processing notification job', {
				jobId: job.id,
				channelId: jobData.channelId,
				alertId: jobData.alert?.id,
				attempt: job.attemptsMade + 1,
			});

			// Update job progress
			await job.updateProgress(10);

			// Get the notification service (would be injected in real implementation)
			const notificationService = await this.getNotificationService();
			
			await job.updateProgress(25);

			// Send the notification
			const result = await notificationService.sendImmediateNotification(
				jobData.channelId,
				jobData.alert,
				jobData.context,
			);

			await job.updateProgress(75);

			// Update job record in database
			await this.updateJobRecord(job.id!, 'completed', result);

			await job.updateProgress(100);

			this.logger.debug('Notification job processed successfully', {
				jobId: job.id,
				channelId: jobData.channelId,
				alertId: jobData.alert?.id,
				processingTime: Date.now() - startTime,
				success: result.success,
			});

			return result;

		} catch (error) {
			const processingTime = Date.now() - startTime;
			
			this.logger.error('Notification job processing failed', {
				jobId: job.id,
				channelId: jobData.channelId,
				alertId: jobData.alert?.id,
				attempt: job.attemptsMade + 1,
				processingTime,
				error: error as Error,
			});

			// Update job record in database
			await this.updateJobRecord(job.id!, 'failed', null, error as Error);

			// Handle error reporting
			await this.errorHandler.handleError(error as Error, {
				jobId: job.id,
				channelId: jobData.channelId,
				alertId: jobData.alert?.id,
				attempt: job.attemptsMade + 1,
			});

			throw new QueueJobError(job.id!, (error as Error).message, {
				channelId: jobData.channelId,
				alertId: jobData.alert?.id,
			});
		}
	}

	/**
	 * Get job priority based on alert severity
	 */
	private getJobPriority(severity?: string): number {
		switch (severity) {
			case 'critical':
				return 1; // Highest priority
			case 'high':
				return 5;
			case 'medium':
				return 10;
			case 'low':
				return 15;
			default:
				return 10;
		}
	}

	/**
	 * Get queue statistics
	 */
	async getQueueStatistics(): Promise<QueueStatistics> {
		try {
			const [waiting, active, completed, failed, delayed] = await Promise.all([
				this.queue.getWaiting(),
				this.queue.getActive(),
				this.queue.getCompleted(),
				this.queue.getFailed(),
				this.queue.getDelayed(),
			]);

			const stats: QueueStatistics = {
				waiting: waiting.length,
				active: active.length,
				completed: completed.length,
				failed: failed.length,
				delayed: delayed.length,
				total: waiting.length + active.length + completed.length + failed.length + delayed.length,
				throughput: await this.calculateThroughput(),
				averageProcessingTime: await this.calculateAverageProcessingTime(completed),
			};

			return stats;

		} catch (error) {
			this.logger.error('Failed to get queue statistics', {
				error: error as Error,
			});
			
			throw new QueueServiceError('getStatistics', (error as Error).message);
		}
	}

	/**
	 * Get specific job status
	 */
	async getJobStatus(jobId: string): Promise<JobStatus | null> {
		try {
			const job = await this.queue.getJob(jobId);
			
			if (!job) {
				return null;
			}

			return {
				id: job.id!,
				status: await job.getState(),
				data: job.data,
				progress: job.progress,
				attempts: job.attemptsMade,
				maxAttempts: job.opts.attempts || 3,
				createdAt: new Date(job.timestamp),
				processedAt: job.processedOn ? new Date(job.processedOn) : null,
				finishedAt: job.finishedOn ? new Date(job.finishedOn) : null,
				error: job.failedReason,
				result: job.returnvalue,
			};

		} catch (error) {
			this.logger.error('Failed to get job status', {
				jobId,
				error: error as Error,
			});
			
			return null;
		}
	}

	/**
	 * Cancel a pending job
	 */
	async cancelJob(jobId: string): Promise<boolean> {
		try {
			const job = await this.queue.getJob(jobId);
			
			if (!job) {
				return false;
			}

			const state = await job.getState();
			
			if (['waiting', 'delayed'].includes(state)) {
				await job.remove();
				
				this.logger.info('Notification job cancelled', {
					jobId,
					state,
				});
				
				return true;
			}

			return false;

		} catch (error) {
			this.logger.error('Failed to cancel job', {
				jobId,
				error: error as Error,
			});
			
			throw new QueueServiceError('cancelJob', (error as Error).message, { jobId });
		}
	}

	/**
	 * Retry a failed job
	 */
	async retryJob(jobId: string): Promise<boolean> {
		try {
			const job = await this.queue.getJob(jobId);
			
			if (!job) {
				return false;
			}

			const state = await job.getState();
			
			if (state === 'failed') {
				await job.retry();
				
				this.logger.info('Notification job retried', {
					jobId,
					attempts: job.attemptsMade,
				});
				
				return true;
			}

			return false;

		} catch (error) {
			this.logger.error('Failed to retry job', {
				jobId,
				error: error as Error,
			});
			
			throw new QueueServiceError('retryJob', (error as Error).message, { jobId });
		}
	}

	/**
	 * Clean up completed and failed jobs
	 */
	async cleanupJobs(olderThanHours: number = 24): Promise<CleanupResult> {
		try {
			const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
			
			const [completedCleaned, failedCleaned] = await Promise.all([
				this.queue.clean(cutoffTime, 'completed'),
				this.queue.clean(cutoffTime, 'failed'),
			]);

			const result: CleanupResult = {
				completedJobsRemoved: completedCleaned.length,
				failedJobsRemoved: failedCleaned.length,
				totalRemoved: completedCleaned.length + failedCleaned.length,
			};

			this.logger.info('Queue cleanup completed', {
				olderThanHours,
				...result,
			});

			return result;

		} catch (error) {
			this.logger.error('Failed to cleanup jobs', {
				olderThanHours,
				error: error as Error,
			});
			
			throw new QueueServiceError('cleanup', (error as Error).message);
		}
	}

	/**
	 * Pause queue processing
	 */
	async pauseQueue(): Promise<void> {
		try {
			await this.queue.pause();
			this.logger.info('Notification queue paused');
		} catch (error) {
			this.logger.error('Failed to pause queue', { error: error as Error });
			throw new QueueServiceError('pause', (error as Error).message);
		}
	}

	/**
	 * Resume queue processing
	 */
	async resumeQueue(): Promise<void> {
		try {
			await this.queue.resume();
			this.logger.info('Notification queue resumed');
		} catch (error) {
			this.logger.error('Failed to resume queue', { error: error as Error });
			throw new QueueServiceError('resume', (error as Error).message);
		}
	}

	/**
	 * Shutdown queue service gracefully
	 */
	async shutdown(): Promise<void> {
		try {
			this.logger.info('Shutting down notification queue service...');

			// Stop accepting new jobs
			await this.worker.close();
			
			// Wait for active jobs to complete (with timeout)
			await this.queue.close();
			
			// Close queue events
			await this.queueEvents.close();
			
			// Close Redis connection
			await this.redis.quit();

			this.logger.info('Notification queue service shutdown complete');

		} catch (error) {
			this.logger.error('Error during queue shutdown', { error: error as Error });
			throw error;
		}
	}

	/**
	 * Calculate queue throughput (jobs per minute)
	 */
	private async calculateThroughput(): Promise<number> {
		try {
			// Get completed jobs from the last hour
			const oneHourAgo = Date.now() - (60 * 60 * 1000);
			const completed = await this.queue.getJobs(['completed'], 0, -1);
			
			const recentJobs = completed.filter(job => 
				job.finishedOn && job.finishedOn > oneHourAgo,
			);

			return recentJobs.length; // Jobs per hour
		} catch {
			return 0;
		}
	}

	/**
	 * Calculate average processing time
	 */
	private async calculateAverageProcessingTime(jobs: Job[]): Promise<number> {
		if (jobs.length === 0) return 0;

		const processingTimes = jobs
			.filter(job => job.processedOn && job.finishedOn)
			.map(job => job.finishedOn! - job.processedOn!)
			.slice(0, 100); // Last 100 jobs

		if (processingTimes.length === 0) return 0;

		const sum = processingTimes.reduce((a, b) => a + b, 0);
		return Math.round(sum / processingTimes.length);
	}

	/**
	 * Update job record in database
	 */
	private async updateJobRecord(
		jobId: string,
		status: string,
		result: NotificationResult | null,
		error?: Error,
	): Promise<void> {
		try {
			// In a real implementation, this would update the NotificationQueueJobEntity
			// For now, we'll just log it
			this.logger.debug('Job record updated', {
				jobId,
				status,
				success: result?.success,
				error: error?.message,
			});
		} catch (updateError) {
			this.logger.error('Failed to update job record', {
				jobId,
				status,
				error: updateError as Error,
			});
		}
	}

	/**
	 * Get notification service instance (placeholder)
	 */
	private async getNotificationService(): Promise<any> {
		// In a real implementation, this would return the injected NotificationService
		// This is a placeholder to avoid circular dependencies in this design
		throw new Error('NotificationService injection not implemented in design phase');
	}
}

/**
 * Supporting interfaces
 */
export interface NotificationJob {
	channelId: string;
	alert: NotificationAlert;
	context: NotificationContext;
	parameters?: any;
	scheduledAt?: Date;
	attempt?: number;
	maxAttempts?: number;
}

export interface QueueStatistics {
	waiting: number;
	active: number;
	completed: number;
	failed: number;
	delayed: number;
	total: number;
	throughput: number; // jobs per hour
	averageProcessingTime: number; // milliseconds
}

export interface JobStatus {
	id: string;
	status: string;
	data: NotificationJob;
	progress: number;
	attempts: number;
	maxAttempts: number;
	createdAt: Date;
	processedAt: Date | null;
	finishedAt: Date | null;
	error?: string;
	result?: any;
}

export interface CleanupResult {
	completedJobsRemoved: number;
	failedJobsRemoved: number;
	totalRemoved: number;
}