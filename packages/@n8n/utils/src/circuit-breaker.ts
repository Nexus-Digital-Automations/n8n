import { Logger } from '@n8n/backend-common';

/**
 * Circuit Breaker States
 */
export enum CircuitState {
	CLOSED = 'CLOSED', // Normal operation
	OPEN = 'OPEN', // Circuit is open, rejecting calls
	HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

export interface CircuitBreakerOptions {
	/** Failure threshold before opening circuit */
	failureThreshold: number;
	/** Success threshold to close circuit from half-open */
	successThreshold: number;
	/** Timeout before attempting to close circuit (ms) */
	timeout: number;
	/** Window size for tracking failures (ms) */
	windowSize?: number;
	/** Service name for logging */
	serviceName: string;
	/** Logger instance */
	logger?: Logger;
}

interface FailureRecord {
	timestamp: number;
	error: Error;
}

/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures by opening circuit when failure threshold is reached.
 * Automatically attempts recovery after timeout period.
 */
export class CircuitBreaker<T = any> {
	private state: CircuitState = CircuitState.CLOSED;
	private failureCount: number = 0;
	private successCount: number = 0;
	private nextAttempt: number = Date.now();
	private failures: FailureRecord[] = [];
	private readonly logger?: Logger;

	constructor(private readonly options: CircuitBreakerOptions) {
		this.logger = options.logger;
		this.logInfo(`Circuit breaker initialized for ${options.serviceName}`);
	}

	/**
	 * Execute function with circuit breaker protection
	 */
	async execute(fn: () => Promise<T>): Promise<T> {
		if (this.state === CircuitState.OPEN) {
			if (Date.now() < this.nextAttempt) {
				const error = new Error(
					`Circuit breaker is OPEN for ${this.options.serviceName}. ` +
						`Next attempt at ${new Date(this.nextAttempt).toISOString()}`,
				);
				this.logWarn('Circuit breaker rejected call', { state: this.state });
				throw error;
			}

			// Transition to HALF_OPEN to test service
			this.state = CircuitState.HALF_OPEN;
			this.logInfo(`Circuit breaker transitioning to HALF_OPEN for ${this.options.serviceName}`);
		}

		try {
			const result = await fn();
			this.onSuccess();
			return result;
		} catch (error) {
			this.onFailure(error as Error);
			throw error;
		}
	}

	/**
	 * Handle successful execution
	 */
	private onSuccess(): void {
		this.failureCount = 0;

		if (this.state === CircuitState.HALF_OPEN) {
			this.successCount++;
			this.logInfo(
				`Success in HALF_OPEN state: ${this.successCount}/${this.options.successThreshold}`,
			);

			if (this.successCount >= this.options.successThreshold) {
				this.close();
			}
		}
	}

	/**
	 * Handle failed execution
	 */
	private onFailure(error: Error): void {
		const now = Date.now();
		const windowSize = this.options.windowSize || this.options.timeout;

		// Record failure
		this.failures.push({ timestamp: now, error });

		// Remove old failures outside window
		this.failures = this.failures.filter((f) => now - f.timestamp < windowSize);

		this.failureCount = this.failures.length;

		this.logError('Circuit breaker recorded failure', {
			error: error.message,
			failureCount: this.failureCount,
			threshold: this.options.failureThreshold,
			state: this.state,
		});

		if (this.state === CircuitState.HALF_OPEN) {
			// Any failure in HALF_OPEN reopens the circuit
			this.open();
		} else if (this.failureCount >= this.options.failureThreshold) {
			this.open();
		}
	}

	/**
	 * Open the circuit
	 */
	private open(): void {
		this.state = CircuitState.OPEN;
		this.nextAttempt = Date.now() + this.options.timeout;
		this.successCount = 0;

		this.logWarn(`Circuit breaker OPENED for ${this.options.serviceName}`, {
			failureCount: this.failureCount,
			nextAttempt: new Date(this.nextAttempt).toISOString(),
			recentErrors: this.failures.slice(-5).map((f) => f.error.message),
		});
	}

	/**
	 * Close the circuit
	 */
	private close(): void {
		this.state = CircuitState.CLOSED;
		this.failureCount = 0;
		this.successCount = 0;
		this.failures = [];

		this.logInfo(`Circuit breaker CLOSED for ${this.options.serviceName}`);
	}

	/**
	 * Manually reset the circuit breaker
	 */
	reset(): void {
		this.close();
		this.logInfo(`Circuit breaker manually reset for ${this.options.serviceName}`);
	}

	/**
	 * Get current circuit state
	 */
	getState(): CircuitState {
		return this.state;
	}

	/**
	 * Get failure statistics
	 */
	getStats() {
		return {
			state: this.state,
			failureCount: this.failureCount,
			successCount: this.successCount,
			recentFailures: this.failures.length,
			nextAttempt: this.state === CircuitState.OPEN ? new Date(this.nextAttempt) : null,
		};
	}

	private logInfo(message: string, meta?: Record<string, any>): void {
		if (this.logger) {
			this.logger.info(message, { serviceName: this.options.serviceName, ...meta });
		}
	}

	private logWarn(message: string, meta?: Record<string, any>): void {
		if (this.logger) {
			this.logger.warn(message, { serviceName: this.options.serviceName, ...meta });
		}
	}

	private logError(message: string, meta?: Record<string, any>): void {
		if (this.logger) {
			this.logger.error(message, { serviceName: this.options.serviceName, ...meta });
		}
	}
}

/**
 * Circuit Breaker Manager - manages multiple circuit breakers for different services
 */
export class CircuitBreakerManager {
	private breakers = new Map<string, CircuitBreaker>();

	/**
	 * Get or create a circuit breaker for a service
	 */
	getBreaker(serviceName: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
		if (!this.breakers.has(serviceName)) {
			const defaultOptions: CircuitBreakerOptions = {
				failureThreshold: 5,
				successThreshold: 2,
				timeout: 60000, // 1 minute
				windowSize: 120000, // 2 minutes
				serviceName,
				...options,
			};

			this.breakers.set(serviceName, new CircuitBreaker(defaultOptions));
		}

		return this.breakers.get(serviceName)!;
	}

	/**
	 * Get all circuit breaker stats
	 */
	getAllStats() {
		const stats: Record<string, any> = {};
		this.breakers.forEach((breaker, name) => {
			stats[name] = breaker.getStats();
		});
		return stats;
	}

	/**
	 * Reset all circuit breakers
	 */
	resetAll(): void {
		this.breakers.forEach((breaker) => breaker.reset());
	}
}
