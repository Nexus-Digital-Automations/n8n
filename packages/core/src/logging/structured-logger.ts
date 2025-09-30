import type { Logger } from '@n8n/backend-common';
import type { Span, Tracer } from '@opentelemetry/api';

export const enum LogLevel {
	DEBUG = 'debug',
	INFO = 'info',
	WARN = 'warn',
	ERROR = 'error',
}

export interface LogContext {
	/** Operation or function name */
	operation?: string;
	/** Execution ID for workflow tracking */
	executionId?: string;
	/** Workflow ID */
	workflowId?: string;
	/** Node ID within workflow */
	nodeId?: string;
	/** User ID */
	userId?: string;
	/** Request ID for API calls */
	requestId?: string;
	/** Duration in milliseconds */
	duration?: number;
	/** Additional custom fields */
	[key: string]: unknown;
}

export interface PerformanceMetric {
	name: string;
	value: number;
	unit: string;
	tags?: Record<string, string>;
	timestamp: Date;
}

export interface SecurityEvent {
	type: 'authentication' | 'authorization' | 'access' | 'data_access' | 'configuration_change';
	action: string;
	userId?: string;
	resource?: string;
	success: boolean;
	reason?: string;
	ipAddress?: string;
	userAgent?: string;
	timestamp: Date;
}

/**
 * Structured Logger with OpenTelemetry support
 *
 * Provides comprehensive logging with:
 * - Structured JSON output
 * - Distributed tracing integration
 * - Performance metrics tracking
 * - Security event logging
 * - Context propagation
 */
export class StructuredLogger {
	private tracer?: Tracer;
	private currentSpan?: Span;
	private context: LogContext = {};

	constructor(
		private readonly logger: Logger,
		private readonly serviceName: string,
		tracer?: Tracer,
	) {
		this.tracer = tracer;
	}

	/**
	 * Set persistent context for all logs
	 */
	setContext(context: LogContext): void {
		this.context = { ...this.context, ...context };
	}

	/**
	 * Clear context
	 */
	clearContext(): void {
		this.context = {};
	}

	/**
	 * Log debug message
	 */
	debug(message: string, context?: LogContext): void {
		this.log(LogLevel.DEBUG, message, context);
	}

	/**
	 * Log info message
	 */
	info(message: string, context?: LogContext): void {
		this.log(LogLevel.INFO, message, context);
	}

	/**
	 * Log warning message
	 */
	warn(message: string, context?: LogContext): void {
		this.log(LogLevel.WARN, message, context);
	}

	/**
	 * Log error message
	 */
	error(message: string, error?: Error, context?: LogContext): void {
		const errorContext = error
			? {
					error: {
						message: error.message,
						name: error.name,
						stack: error.stack,
					},
					...context,
				}
			: context;

		this.log(LogLevel.ERROR, message, errorContext);

		// Add error to current span if available
		if (this.currentSpan && error) {
			this.currentSpan.recordException(error);
			this.currentSpan.setStatus({ code: 2, message: error.message }); // SpanStatusCode.ERROR = 2
		}
	}

	/**
	 * Base log method
	 */
	private log(level: LogLevel, message: string, context?: LogContext): void {
		const logData = {
			timestamp: new Date().toISOString(),
			level,
			message,
			service: this.serviceName,
			...this.context,
			...context,
			// Add trace context if available
			...(this.currentSpan && {
				trace: {
					traceId: this.currentSpan.spanContext().traceId,
					spanId: this.currentSpan.spanContext().spanId,
				},
			}),
		};

		// Call underlying logger
		switch (level) {
			case LogLevel.DEBUG:
				this.logger.debug(message, logData);
				break;
			case LogLevel.INFO:
				this.logger.info(message, logData);
				break;
			case LogLevel.WARN:
				this.logger.warn(message, logData);
				break;
			case LogLevel.ERROR:
				this.logger.error(message, logData);
				break;
		}

		// Add event to current span if available
		if (this.currentSpan) {
			this.currentSpan.addEvent(message, logData);
		}
	}

	/**
	 * Track performance metric
	 */
	metric(metric: PerformanceMetric): void {
		this.info(`Metric: ${metric.name}`, {
			metric: {
				name: metric.name,
				value: metric.value,
				unit: metric.unit,
				tags: metric.tags,
				timestamp: metric.timestamp.toISOString(),
			},
		});

		// Record as span attribute if available
		if (this.currentSpan) {
			this.currentSpan.setAttribute(`metric.${metric.name}`, metric.value);
			if (metric.tags) {
				Object.entries(metric.tags).forEach(([key, value]) => {
					this.currentSpan?.setAttribute(`metric.${metric.name}.${key}`, value);
				});
			}
		}
	}

	/**
	 * Log security event
	 */
	security(event: SecurityEvent): void {
		const severity = event.success ? LogLevel.INFO : LogLevel.WARN;

		this.log(severity, `Security Event: ${event.type} - ${event.action}`, {
			security: {
				type: event.type,
				action: event.action,
				userId: event.userId,
				resource: event.resource,
				success: event.success,
				reason: event.reason,
				ipAddress: event.ipAddress,
				userAgent: event.userAgent,
				timestamp: event.timestamp.toISOString(),
			},
		});
	}

	/**
	 * Start a new span for distributed tracing
	 */
	startSpan(name: string, attributes?: Record<string, unknown>): Span | undefined {
		if (!this.tracer) return undefined;

		this.currentSpan = this.tracer.startSpan(name, {
			attributes: {
				service: this.serviceName,
				...attributes,
			},
		});

		return this.currentSpan;
	}

	/**
	 * End current span
	 */
	endSpan(): void {
		if (this.currentSpan) {
			this.currentSpan.end();
			this.currentSpan = undefined;
		}
	}

	/**
	 * Execute function with automatic span creation and timing
	 */
	async traced<T>(
		spanName: string,
		fn: () => Promise<T>,
		attributes?: Record<string, unknown>,
	): Promise<T> {
		const startTime = Date.now();
		const span = this.startSpan(spanName, attributes);

		try {
			const result = await fn();
			const duration = Date.now() - startTime;

			this.metric({
				name: `${spanName}.duration`,
				value: duration,
				unit: 'ms',
				timestamp: new Date(),
			});

			span?.setStatus({ code: 1 }); // SpanStatusCode.OK = 1
			return result;
		} catch (error) {
			const duration = Date.now() - startTime;

			this.error(`${spanName} failed`, error as Error, {
				duration,
			});

			span?.setStatus({
				code: 2, // SpanStatusCode.ERROR = 2
				message: (error as Error).message,
			});

			throw error;
		} finally {
			this.endSpan();
		}
	}

	/**
	 * Log function entry with parameters
	 */
	functionEntry(functionName: string, params?: Record<string, unknown>): void {
		this.debug(`→ ${functionName}`, {
			function: functionName,
			params: this.sanitizeParams(params),
			type: 'function_entry',
		});
	}

	/**
	 * Log function exit with result
	 */
	functionExit(functionName: string, duration: number, result?: unknown): void {
		this.debug(`← ${functionName}`, {
			function: functionName,
			duration,
			hasResult: result !== undefined,
			type: 'function_exit',
		});

		this.metric({
			name: `function.${functionName}.duration`,
			value: duration,
			unit: 'ms',
			timestamp: new Date(),
		});
	}

	/**
	 * Sanitize sensitive parameters before logging
	 */
	private sanitizeParams(params?: Record<string, unknown>): Record<string, unknown> | undefined {
		if (!params) return undefined;

		const sensitiveKeys = [
			'password',
			'token',
			'secret',
			'apiKey',
			'api_key',
			'auth',
			'authorization',
		];
		const sanitized: Record<string, unknown> = {};

		Object.entries(params).forEach(([key, value]) => {
			if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
				sanitized[key] = '[REDACTED]';
			} else {
				sanitized[key] = value;
			}
		});

		return sanitized;
	}
}

/**
 * Create structured logger with function timing wrapper
 */
export function createStructuredLogger(
	logger: Logger,
	serviceName: string,
	tracer?: Tracer,
): StructuredLogger {
	return new StructuredLogger(logger, serviceName, tracer);
}

/**
 * Decorator for automatic function logging
 */
export function Logged(target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
	const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;

	descriptor.value = async function loggedWrapper(
		this: { logger?: StructuredLogger },
		...args: unknown[]
	) {
		const logger = this.logger;
		if (!logger) {
			return await originalMethod.apply(this, args);
		}

		const startTime = Date.now();
		logger.functionEntry(propertyKey, { argsCount: args.length });

		try {
			const result = await originalMethod.apply(this, args);
			const duration = Date.now() - startTime;
			logger.functionExit(propertyKey, duration, result);
			return result;
		} catch (error) {
			const duration = Date.now() - startTime;
			logger.error(`Function ${propertyKey} failed`, error as Error, { duration });
			throw error;
		}
	};

	return descriptor;
}
