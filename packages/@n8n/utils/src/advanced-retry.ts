import { Logger } from '@n8n/backend-common';
import { CircuitBreaker } from './circuit-breaker';

/**
 * Error categories for intelligent retry logic
 */
export enum ErrorCategory {
	/** Transient errors that should be retried (network issues, timeouts) */
	TRANSIENT = 'TRANSIENT',
	/** Permanent errors that should not be retried (validation errors, auth failures) */
	PERMANENT = 'PERMANENT',
	/** Rate limit errors (special handling with backoff) */
	RATE_LIMIT = 'RATE_LIMIT',
	/** Unknown error category */
	UNKNOWN = 'UNKNOWN',
}

export interface AdvancedRetryOptions {
	/** Maximum number of retry attempts */
	maxRetries: number;
	/** Initial retry interval in milliseconds */
	initialInterval: number;
	/** Maximum interval cap in milliseconds */
	maxInterval: number;
	/** Backoff multiplier for exponential backoff */
	backoffMultiplier: number;
	/** Jitter to add randomness (0-1, percentage of interval) */
	jitter: number;
	/** Timeout for each individual attempt (ms) */
	attemptTimeout?: number;
	/** Circuit breaker for the operation */
	circuitBreaker?: CircuitBreaker;
	/** Logger instance */
	logger?: Logger;
	/** Operation name for logging */
	operationName: string;
	/** Callback for retry events */
	onRetry?: (attempt: number, error: Error, nextRetryMs: number) => void;
	/** Error categorization function */
	categorizeError?: (error: Error) => ErrorCategory;
}

interface RetryStats {
	totalAttempts: number;
	successfulAttempts: number;
	failedAttempts: number;
	retriedAttempts: number;
	avgRetryTime: number;
	lastError: Error | null;
}

/**
 * Categorize common error types
 */
export function defaultErrorCategorizer(error: Error): ErrorCategory {
	const errorMessage = error.message.toLowerCase();
	const errorName = error.name.toLowerCase();

	// Transient errors - safe to retry
	const transientPatterns = [
		'timeout',
		'econnreset',
		'econnrefused',
		'enotfound',
		'socket hang up',
		'network error',
		'etimedout',
		'temporarily unavailable',
		'service unavailable',
		'502',
		'503',
		'504',
	];

	// Permanent errors - do not retry
	const permanentPatterns = [
		'validation',
		'invalid',
		'not found',
		'unauthorized',
		'forbidden',
		'bad request',
		'400',
		'401',
		'403',
		'404',
		'422',
	];

	// Rate limit errors - special handling
	const rateLimitPatterns = ['rate limit', 'too many requests', '429', 'quota exceeded'];

	if (
		rateLimitPatterns.some(
			(pattern) => errorMessage.includes(pattern) || errorName.includes(pattern),
		)
	) {
		return ErrorCategory.RATE_LIMIT;
	}

	if (
		permanentPatterns.some(
			(pattern) => errorMessage.includes(pattern) || errorName.includes(pattern),
		)
	) {
		return ErrorCategory.PERMANENT;
	}

	if (
		transientPatterns.some(
			(pattern) => errorMessage.includes(pattern) || errorName.includes(pattern),
		)
	) {
		return ErrorCategory.TRANSIENT;
	}

	return ErrorCategory.UNKNOWN;
}

/**
 * Advanced Retry Mechanism with Circuit Breaker and Error Categorization
 */
export class AdvancedRetry {
	private stats: RetryStats = {
		totalAttempts: 0,
		successfulAttempts: 0,
		failedAttempts: 0,
		retriedAttempts: 0,
		avgRetryTime: 0,
		lastError: null,
	};

	constructor(private readonly options: AdvancedRetryOptions) {}

	/**
	 * Execute function with advanced retry logic
	 */
	async execute<T>(fn: () => Promise<T>): Promise<T> {
		const startTime = Date.now();
		let attempt = 0;
		let lastError: Error | null = null;

		while (attempt < this.options.maxRetries) {
			attempt++;
			this.stats.totalAttempts++;

			try {
				this.logInfo(
					`Attempt ${attempt}/${this.options.maxRetries} for ${this.options.operationName}`,
				);

				// Execute with circuit breaker if provided
				const result = this.options.circuitBreaker
					? await this.options.circuitBreaker.execute(fn)
					: await this.executeWithTimeout(fn);

				this.stats.successfulAttempts++;
				this.logInfo(`Operation ${this.options.operationName} succeeded on attempt ${attempt}`);

				return result;
			} catch (error) {
				lastError = error as Error;
				this.stats.lastError = lastError;
				this.stats.failedAttempts++;

				// Categorize the error
				const category = this.options.categorizeError
					? this.options.categorizeError(lastError)
					: defaultErrorCategorizer(lastError);

				this.logError(`Attempt ${attempt} failed for ${this.options.operationName}`, {
					error: lastError.message,
					category,
					stack: lastError.stack,
				});

				// Don't retry permanent errors
				if (category === ErrorCategory.PERMANENT) {
					this.logWarn('Permanent error detected, not retrying', {
						error: lastError.message,
					});
					throw lastError;
				}

				// Calculate next retry interval
				if (attempt < this.options.maxRetries) {
					const retryInterval = this.calculateRetryInterval(attempt, category);

					this.stats.retriedAttempts++;
					this.stats.avgRetryTime =
						(this.stats.avgRetryTime * (this.stats.retriedAttempts - 1) + retryInterval) /
						this.stats.retriedAttempts;

					this.logInfo(`Retrying in ${retryInterval}ms`, {
						attempt,
						maxRetries: this.options.maxRetries,
						category,
					});

					// Call onRetry callback
					this.options.onRetry?.(attempt, lastError, retryInterval);

					await this.sleep(retryInterval);
				}
			}
		}

		// All retries exhausted
		const totalTime = Date.now() - startTime;
		this.logError(
			`All ${this.options.maxRetries} retries exhausted for ${this.options.operationName}`,
			{
				totalTime,
				lastError: lastError?.message,
			},
		);

		throw lastError || new Error('Operation failed after all retries');
	}

	/**
	 * Calculate retry interval with exponential backoff and jitter
	 */
	private calculateRetryInterval(attempt: number, category: ErrorCategory): number {
		let interval =
			this.options.initialInterval * Math.pow(this.options.backoffMultiplier, attempt - 1);

		// Special handling for rate limits - longer backoff
		if (category === ErrorCategory.RATE_LIMIT) {
			interval *= 2;
		}

		// Cap at max interval
		interval = Math.min(interval, this.options.maxInterval);

		// Add jitter
		const jitterAmount = interval * this.options.jitter;
		const jitter = Math.random() * jitterAmount - jitterAmount / 2;
		interval += jitter;

		return Math.floor(interval);
	}

	/**
	 * Execute function with timeout
	 */
	private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
		if (!this.options.attemptTimeout) {
			return fn();
		}

		return Promise.race([
			fn(),
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error(`Operation timeout after ${this.options.attemptTimeout}ms`)),
					this.options.attemptTimeout,
				),
			),
		]);
	}

	/**
	 * Sleep for specified milliseconds
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Get retry statistics
	 */
	getStats(): RetryStats {
		return { ...this.stats };
	}

	/**
	 * Reset statistics
	 */
	resetStats(): void {
		this.stats = {
			totalAttempts: 0,
			successfulAttempts: 0,
			failedAttempts: 0,
			retriedAttempts: 0,
			avgRetryTime: 0,
			lastError: null,
		};
	}

	private logInfo(message: string, meta?: Record<string, any>): void {
		if (this.options.logger) {
			this.options.logger.info(message, { operation: this.options.operationName, ...meta });
		}
	}

	private logWarn(message: string, meta?: Record<string, any>): void {
		if (this.options.logger) {
			this.options.logger.warn(message, { operation: this.options.operationName, ...meta });
		}
	}

	private logError(message: string, meta?: Record<string, any>): void {
		if (this.options.logger) {
			this.options.logger.error(message, { operation: this.options.operationName, ...meta });
		}
	}
}

/**
 * Retry with default options (convenience function)
 */
export async function retryWithDefaults<T>(
	fn: () => Promise<T>,
	operationName: string,
	options?: Partial<AdvancedRetryOptions>,
): Promise<T> {
	const retry = new AdvancedRetry({
		maxRetries: 3,
		initialInterval: 1000,
		maxInterval: 30000,
		backoffMultiplier: 2,
		jitter: 0.1,
		operationName,
		...options,
	});

	return retry.execute(fn);
}
