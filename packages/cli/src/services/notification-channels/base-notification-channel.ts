import type { Logger } from '@n8n/backend-common';
import type { WorkflowEntity, ExecutionEntity, User } from '@n8n/db';

/**
 * Notification payload containing workflow failure details
 */
export interface NotificationPayload {
	/** The workflow that failed */
	workflow: {
		id: string;
		name: string;
		active: boolean;
		nodes?: unknown[];
	};
	/** The execution that failed */
	execution: {
		id: string;
		mode: string;
		startedAt: Date;
		stoppedAt?: Date | null;
		status: string;
		error?: string;
	};
	/** The user who owns/triggered the workflow */
	user: {
		id: string;
		email: string;
		firstName?: string;
		lastName?: string;
	};
	/** Additional context */
	context: {
		/** URL to view the execution */
		executionUrl?: string;
		/** URL to view the workflow */
		workflowUrl?: string;
		/** Instance base URL */
		instanceUrl?: string;
		/** Error details */
		errorMessage?: string;
		/** Node that failed */
		failedNode?: string;
		/** Retry count */
		retryCount?: number;
	};
}

/**
 * Result of a notification delivery attempt
 */
export interface NotificationResult {
	/** Whether the notification was sent successfully */
	success: boolean;
	/** Error message if delivery failed */
	error?: string;
	/** Response data from the notification channel */
	response?: Record<string, unknown>;
	/** Additional metadata */
	metadata?: Record<string, unknown>;
}

/**
 * Configuration for notification retry behavior
 */
export interface NotificationRetryConfig {
	/** Maximum number of retry attempts */
	maxRetries: number;
	/** Base delay between retries in seconds */
	baseDelay: number;
	/** Whether to use exponential backoff */
	exponentialBackoff: boolean;
	/** Maximum delay between retries in seconds */
	maxDelay: number;
}

/**
 * Base interface for all notification channels
 */
export interface INotificationChannel {
	/** Unique identifier for this channel type */
	readonly channelType: string;

	/** Human-readable name for this channel */
	readonly channelName: string;

	/**
	 * Send a notification through this channel
	 */
	send(payload: NotificationPayload, config?: Record<string, unknown>): Promise<NotificationResult>;

	/**
	 * Validate the configuration for this channel
	 */
	validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors?: string[] }>;

	/**
	 * Check if this channel is available and properly configured
	 */
	isAvailable(): Promise<boolean>;

	/**
	 * Get the retry configuration for this channel
	 */
	getRetryConfig(): NotificationRetryConfig;

	/**
	 * Calculate the next retry delay based on retry count
	 */
	calculateRetryDelay(retryCount: number): number;
}

/**
 * Abstract base class for notification channels
 */
export abstract class BaseNotificationChannel implements INotificationChannel {
	public abstract readonly channelType: string;
	public abstract readonly channelName: string;

	protected readonly logger: Logger;

	constructor(logger: Logger) {
		this.logger = logger;
	}

	/**
	 * Send a notification through this channel
	 */
	abstract send(
		payload: NotificationPayload,
		config?: Record<string, unknown>,
	): Promise<NotificationResult>;

	/**
	 * Validate the configuration for this channel
	 */
	abstract validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors?: string[] }>;

	/**
	 * Check if this channel is available and properly configured
	 */
	abstract isAvailable(): Promise<boolean>;

	/**
	 * Get the retry configuration for this channel
	 */
	getRetryConfig(): NotificationRetryConfig {
		return {
			maxRetries: 3,
			baseDelay: 30,
			exponentialBackoff: true,
			maxDelay: 300,
		};
	}

	/**
	 * Calculate the next retry delay based on retry count
	 */
	public calculateRetryDelay(retryCount: number): number {
		const config = this.getRetryConfig();
		
		if (!config.exponentialBackoff) {
			return config.baseDelay;
		}

		const delay = config.baseDelay * Math.pow(2, retryCount);
		return Math.min(delay, config.maxDelay);
	}

	/**
	 * Format error message for logging
	 */
	protected formatError(error: unknown): string {
		if (error instanceof Error) {
			return error.message;
		}
		if (typeof error === 'string') {
			return error;
		}
		return JSON.stringify(error);
	}

	/**
	 * Create a formatted notification message
	 */
	protected formatNotificationMessage(payload: NotificationPayload): {
		subject: string;
		message: string;
		summary: string;
	} {
		const { workflow, execution, context } = payload;
		
		const subject = `Workflow "${workflow.name}" failed`;
		
		const summary = `Workflow "${workflow.name}" (ID: ${workflow.id}) failed during execution ${execution.id}`;
		
		const message = `
**Workflow Failure Alert**

**Workflow:** ${workflow.name} (ID: ${workflow.id})
**Execution:** ${execution.id}
**Status:** ${execution.status}
**Started:** ${execution.startedAt.toISOString()}
**Stopped:** ${execution.stoppedAt?.toISOString() || 'N/A'}

${context.errorMessage ? `**Error:** ${context.errorMessage}` : ''}
${context.failedNode ? `**Failed Node:** ${context.failedNode}` : ''}
${context.retryCount ? `**Retry Count:** ${context.retryCount}` : ''}

${context.executionUrl ? `**View Execution:** ${context.executionUrl}` : ''}
${context.workflowUrl ? `**Edit Workflow:** ${context.workflowUrl}` : ''}
		`.trim();

		return { subject, message, summary };
	}

	/**
	 * Handle common validation for required configuration fields
	 */
	protected validateRequiredFields(
		config: Record<string, unknown>,
		requiredFields: string[],
	): { valid: boolean; errors?: string[] } {
		const errors: string[] = [];

		for (const field of requiredFields) {
			if (!config[field] || (typeof config[field] === 'string' && !config[field].trim())) {
				errors.push(`${field} is required`);
			}
		}

		return {
			valid: errors.length === 0,
			errors: errors.length > 0 ? errors : undefined,
		};
	}

	/**
	 * Create a successful notification result
	 */
	protected createSuccessResult(response?: Record<string, unknown>): NotificationResult {
		return {
			success: true,
			response,
			metadata: {
				timestamp: new Date().toISOString(),
				channel: this.channelType,
			},
		};
	}

	/**
	 * Create a failed notification result
	 */
	protected createFailureResult(error: string, metadata?: Record<string, unknown>): NotificationResult {
		return {
			success: false,
			error,
			metadata: {
				timestamp: new Date().toISOString(),
				channel: this.channelType,
				...metadata,
			},
		};
	}
}