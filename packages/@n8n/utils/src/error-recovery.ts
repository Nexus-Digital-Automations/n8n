import { Logger } from '@n8n/backend-common';
import { EventEmitter } from 'events';

/**
 * Error Recovery Strategy
 */
export enum RecoveryStrategy {
	/** Retry the operation */
	RETRY = 'RETRY',
	/** Fallback to alternative method */
	FALLBACK = 'FALLBACK',
	/** Skip and continue */
	SKIP = 'SKIP',
	/** Fail completely */
	FAIL = 'FAIL',
	/** Manual intervention required */
	MANUAL = 'MANUAL',
}

export interface ErrorRecoveryRule {
	/** Error pattern to match */
	errorPattern: RegExp | string;
	/** Recovery strategy to use */
	strategy: RecoveryStrategy;
	/** Maximum recovery attempts */
	maxAttempts: number;
	/** Fallback function (for FALLBACK strategy) */
	fallbackFn?: () => Promise<any>;
	/** Description of the rule */
	description: string;
	/** Priority (higher = checked first) */
	priority: number;
}

export interface RecoveryEvent {
	timestamp: Date;
	error: Error;
	strategy: RecoveryStrategy;
	attempt: number;
	success: boolean;
	operationName: string;
	executionId?: string;
}

export interface NotificationChannel {
	name: string;
	send: (notification: ErrorNotification) => Promise<void>;
}

export interface ErrorNotification {
	severity: 'info' | 'warning' | 'error' | 'critical';
	title: string;
	message: string;
	error?: Error;
	context?: Record<string, any>;
	timestamp: Date;
	operationName?: string;
	executionId?: string;
}

/**
 * Error Recovery Workflow System
 */
export class ErrorRecoveryWorkflow extends EventEmitter {
	private rules: ErrorRecoveryRule[] = [];
	private recoveryHistory: RecoveryEvent[] = [];
	private notificationChannels: NotificationChannel[] = [];
	private readonly logger?: Logger;

	constructor(logger?: Logger) {
		super();
		this.logger = logger;
		this.setupDefaultRules();
	}

	/**
	 * Setup default recovery rules
	 */
	private setupDefaultRules(): void {
		// Network errors - retry
		this.addRule({
			errorPattern: /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|network error/i,
			strategy: RecoveryStrategy.RETRY,
			maxAttempts: 3,
			description: 'Network errors should be retried',
			priority: 100,
		});

		// Rate limits - wait and retry
		this.addRule({
			errorPattern: /rate limit|too many requests|429/i,
			strategy: RecoveryStrategy.RETRY,
			maxAttempts: 5,
			description: 'Rate limits should be retried with backoff',
			priority: 90,
		});

		// Authentication errors - fail (require manual fix)
		this.addRule({
			errorPattern: /unauthorized|authentication failed|401|403/i,
			strategy: RecoveryStrategy.MANUAL,
			maxAttempts: 0,
			description: 'Authentication errors require manual intervention',
			priority: 80,
		});

		// Validation errors - fail (bad input)
		this.addRule({
			errorPattern: /validation|invalid input|bad request|400|422/i,
			strategy: RecoveryStrategy.FAIL,
			maxAttempts: 0,
			description: 'Validation errors should not be retried',
			priority: 70,
		});
	}

	/**
	 * Add a custom recovery rule
	 */
	addRule(rule: ErrorRecoveryRule): void {
		this.rules.push(rule);
		// Sort by priority (highest first)
		this.rules.sort((a, b) => b.priority - a.priority);
		this.logInfo('Recovery rule added', { rule: rule.description, priority: rule.priority });
	}

	/**
	 * Find matching recovery rule for an error
	 */
	private findMatchingRule(error: Error): ErrorRecoveryRule | null {
		const errorMessage = error.message;

		for (const rule of this.rules) {
			const pattern =
				typeof rule.errorPattern === 'string'
					? new RegExp(rule.errorPattern, 'i')
					: rule.errorPattern;

			if (pattern.test(errorMessage) || pattern.test(error.name)) {
				return rule;
			}
		}

		return null;
	}

	/**
	 * Attempt to recover from an error
	 */
	async recover(
		error: Error,
		operationName: string,
		attempt: number = 1,
		executionId?: string,
	): Promise<{ strategy: RecoveryStrategy; recovered: boolean; result?: any }> {
		const rule = this.findMatchingRule(error);

		if (!rule) {
			this.logWarn('No recovery rule found for error', {
				error: error.message,
				operationName,
			});
			return { strategy: RecoveryStrategy.FAIL, recovered: false };
		}

		if (attempt > rule.maxAttempts) {
			this.logError('Max recovery attempts exceeded', {
				error: error.message,
				operationName,
				maxAttempts: rule.maxAttempts,
			});

			// Send notification for exhausted retries
			await this.sendNotification({
				severity: 'error',
				title: `Recovery Failed: ${operationName}`,
				message: `All ${rule.maxAttempts} recovery attempts exhausted`,
				error,
				context: { operationName, executionId, attempt },
				timestamp: new Date(),
				operationName,
				executionId,
			});

			return { strategy: rule.strategy, recovered: false };
		}

		const event: RecoveryEvent = {
			timestamp: new Date(),
			error,
			strategy: rule.strategy,
			attempt,
			success: false,
			operationName,
			executionId,
		};

		try {
			let result: any;
			let recovered = false;

			switch (rule.strategy) {
				case RecoveryStrategy.RETRY:
					this.logInfo('Recovery strategy: RETRY', { operationName, attempt });
					recovered = false; // Caller should retry
					break;

				case RecoveryStrategy.FALLBACK:
					if (rule.fallbackFn) {
						this.logInfo('Recovery strategy: FALLBACK', { operationName });
						result = await rule.fallbackFn();
						recovered = true;
					} else {
						this.logWarn('FALLBACK strategy specified but no fallback function provided');
						recovered = false;
					}
					break;

				case RecoveryStrategy.SKIP:
					this.logInfo('Recovery strategy: SKIP', { operationName });
					recovered = true;
					result = null;
					break;

				case RecoveryStrategy.MANUAL:
					this.logWarn('Manual intervention required', {
						error: error.message,
						operationName,
					});

					await this.sendNotification({
						severity: 'critical',
						title: `Manual Intervention Required: ${operationName}`,
						message: error.message,
						error,
						context: { operationName, executionId },
						timestamp: new Date(),
						operationName,
						executionId,
					});

					recovered = false;
					break;

				case RecoveryStrategy.FAIL:
				default:
					this.logError('Recovery strategy: FAIL', {
						error: error.message,
						operationName,
					});
					recovered = false;
					break;
			}

			event.success = recovered;
			this.recoveryHistory.push(event);
			this.emit('recovery', event);

			return { strategy: rule.strategy, recovered, result };
		} catch (recoveryError) {
			this.logError('Error during recovery attempt', {
				originalError: error.message,
				recoveryError: (recoveryError as Error).message,
				operationName,
			});

			event.success = false;
			this.recoveryHistory.push(event);
			this.emit('recovery', event);

			return { strategy: rule.strategy, recovered: false };
		}
	}

	/**
	 * Add notification channel
	 */
	addNotificationChannel(channel: NotificationChannel): void {
		this.notificationChannels.push(channel);
		this.logInfo('Notification channel added', { channel: channel.name });
	}

	/**
	 * Send notification to all channels
	 */
	async sendNotification(notification: ErrorNotification): Promise<void> {
		if (this.notificationChannels.length === 0) {
			this.logWarn('No notification channels configured');
			return;
		}

		const promises = this.notificationChannels.map(async (channel) => {
			try {
				await channel.send(notification);
				this.logInfo('Notification sent', {
					channel: channel.name,
					severity: notification.severity,
					title: notification.title,
				});
			} catch (error) {
				this.logError('Failed to send notification', {
					channel: channel.name,
					error: (error as Error).message,
				});
			}
		});

		await Promise.allSettled(promises);
		this.emit('notification', notification);
	}

	/**
	 * Get recovery history
	 */
	getHistory(limit: number = 100): RecoveryEvent[] {
		return this.recoveryHistory.slice(-limit);
	}

	/**
	 * Get recovery statistics
	 */
	getStats() {
		const total = this.recoveryHistory.length;
		const successful = this.recoveryHistory.filter((e) => e.success).length;
		const failed = total - successful;

		const byStrategy: Record<string, number> = {};
		this.recoveryHistory.forEach((event) => {
			byStrategy[event.strategy] = (byStrategy[event.strategy] || 0) + 1;
		});

		return {
			total,
			successful,
			failed,
			successRate: total > 0 ? (successful / total) * 100 : 0,
			byStrategy,
		};
	}

	/**
	 * Clear recovery history
	 */
	clearHistory(): void {
		this.recoveryHistory = [];
		this.logInfo('Recovery history cleared');
	}

	private logInfo(message: string, meta?: Record<string, any>): void {
		if (this.logger) {
			this.logger.info(`[ErrorRecovery] ${message}`, meta);
		}
	}

	private logWarn(message: string, meta?: Record<string, any>): void {
		if (this.logger) {
			this.logger.warn(`[ErrorRecovery] ${message}`, meta);
		}
	}

	private logError(message: string, meta?: Record<string, any>): void {
		if (this.logger) {
			this.logger.error(`[ErrorRecovery] ${message}`, meta);
		}
	}
}

/**
 * Console Notification Channel (for development)
 */
export class ConsoleNotificationChannel implements NotificationChannel {
	name = 'console';

	async send(notification: ErrorNotification): Promise<void> {
		const icon = {
			info: 'ℹ️',
			warning: '⚠️',
			error: '❌',
			critical: '🚨',
		}[notification.severity];

		console.log(`\n${icon} [${notification.severity.toUpperCase()}] ${notification.title}`);
		console.log(`   ${notification.message}`);
		if (notification.error) {
			console.log(`   Error: ${notification.error.message}`);
		}
		if (notification.context) {
			console.log(`   Context:`, notification.context);
		}
		console.log(`   Time: ${notification.timestamp.toISOString()}\n`);
	}
}
