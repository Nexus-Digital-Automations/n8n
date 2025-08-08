/**
 * Rate limiting service for notification system
 */

import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import { GlobalConfig } from '@n8n/config';

import type { RateLimitConfig } from '../interfaces/notification-channel.interface';
import { NotificationRepository } from '../repositories/notification.repository';
import { RateLimitExceededError, RateLimitServiceError } from '../errors/notification-errors';

@Service()
export class RateLimitService {
	private readonly rateLimitCache = new Map<string, RateLimitWindow>();

	constructor(
		private readonly globalConfig: GlobalConfig,
		private readonly logger: Logger,
		private readonly notificationRepository: NotificationRepository,
	) {}

	/**
	 * Check if request is within rate limits
	 */
	async checkLimit(
		resourceId: string,
		rateLimitConfig?: RateLimitConfig,
		resourceType: 'channel' | 'rule' | 'global' = 'channel',
	): Promise<RateLimitResult> {
		try {
			if (!rateLimitConfig?.maxNotifications) {
				// No rate limit configured
				return { allowed: true, current: 0, limit: 0, resetAt: null };
			}

			const windowKey = `${resourceType}:${resourceId}:${rateLimitConfig.windowSeconds}`;
			const now = Date.now();
			
			// Get or create rate limit window
			let window = this.rateLimitCache.get(windowKey);
			if (!window || this.isWindowExpired(window, rateLimitConfig.windowSeconds)) {
				window = this.createNewWindow(now, rateLimitConfig);
				this.rateLimitCache.set(windowKey, window);
			}

			// Apply rate limit strategy
			const result = this.applyRateLimitStrategy(window, rateLimitConfig, now);
			
			// Update window if request is allowed
			if (result.allowed) {
				this.updateWindow(window, rateLimitConfig.strategy, now);
			}

			// Log rate limit status
			this.logger.debug('Rate limit check completed', {
				resourceId,
				resourceType,
				allowed: result.allowed,
				current: result.current,
				limit: result.limit,
				strategy: rateLimitConfig.strategy,
			});

			return result;

		} catch (error) {
			this.logger.error('Rate limit check failed', {
				resourceId,
				resourceType,
				error: error as Error,
			});

			// In case of error, allow the request but log the failure
			return { allowed: true, current: 0, limit: 0, resetAt: null };
		}
	}

	/**
	 * Record usage for rate limiting
	 */
	async recordUsage(resourceId: string, resourceType: 'channel' | 'rule' | 'global' = 'channel'): Promise<void> {
		try {
			// Update persistent storage for long-term tracking
			if (resourceType === 'channel') {
				await this.notificationRepository.updateRateLimitCounter(
					resourceId,
					3600, // 1 hour window for persistent storage
					1000, // Default limit
				);
			}

		} catch (error) {
			this.logger.error('Failed to record rate limit usage', {
				resourceId,
				resourceType,
				error: error as Error,
			});
			// Don't throw - usage recording failure shouldn't break notifications
		}
	}

	/**
	 * Get current rate limit status
	 */
	async getRateLimitStatus(
		resourceId: string,
		rateLimitConfig: RateLimitConfig,
		resourceType: 'channel' | 'rule' | 'global' = 'channel',
	): Promise<RateLimitStatus> {
		const windowKey = `${resourceType}:${resourceId}:${rateLimitConfig.windowSeconds}`;
		const window = this.rateLimitCache.get(windowKey);
		
		if (!window) {
			return {
				current: 0,
				limit: rateLimitConfig.maxNotifications,
				remaining: rateLimitConfig.maxNotifications,
				resetAt: null,
				windowStart: null,
			};
		}

		const remaining = Math.max(0, rateLimitConfig.maxNotifications - window.count);
		const resetAt = new Date(window.windowStart + (rateLimitConfig.windowSeconds * 1000));

		return {
			current: window.count,
			limit: rateLimitConfig.maxNotifications,
			remaining,
			resetAt: resetAt > new Date() ? resetAt : null,
			windowStart: new Date(window.windowStart),
		};
	}

	/**
	 * Reset rate limits for a resource (admin function)
	 */
	async resetRateLimit(
		resourceId: string,
		resourceType: 'channel' | 'rule' | 'global' = 'channel',
	): Promise<void> {
		const cacheKeys = Array.from(this.rateLimitCache.keys()).filter(key =>
			key.startsWith(`${resourceType}:${resourceId}:`),
		);

		for (const key of cacheKeys) {
			this.rateLimitCache.delete(key);
		}

		this.logger.info('Rate limits reset', {
			resourceId,
			resourceType,
			keysCleared: cacheKeys.length,
		});
	}

	/**
	 * Get global rate limit statistics
	 */
	getGlobalStatistics(): GlobalRateLimitStats {
		const stats: GlobalRateLimitStats = {
			totalWindows: this.rateLimitCache.size,
			activeWindows: 0,
			totalRequests: 0,
			blockedRequests: 0,
			byStrategy: {
				'fixed-window': 0,
				'sliding-window': 0,
				'token-bucket': 0,
			},
		};

		const now = Date.now();
		
		for (const [key, window] of this.rateLimitCache.entries()) {
			const isActive = now - window.windowStart < window.windowDuration;
			
			if (isActive) {
				stats.activeWindows++;
				stats.totalRequests += window.count;
				
				// Estimate blocked requests (simplified)
				const maxAllowed = window.maxNotifications || 0;
				if (window.count > maxAllowed) {
					stats.blockedRequests += window.count - maxAllowed;
				}
			}
		}

		return stats;
	}

	/**
	 * Clean up expired rate limit windows
	 */
	cleanupExpiredWindows(): void {
		const now = Date.now();
		const keysToDelete: string[] = [];

		for (const [key, window] of this.rateLimitCache.entries()) {
			if (now - window.windowStart > window.windowDuration) {
				keysToDelete.push(key);
			}
		}

		for (const key of keysToDelete) {
			this.rateLimitCache.delete(key);
		}

		if (keysToDelete.length > 0) {
			this.logger.debug('Cleaned up expired rate limit windows', {
				expiredWindows: keysToDelete.length,
				remainingWindows: this.rateLimitCache.size,
			});
		}
	}

	/**
	 * Create a new rate limit window
	 */
	private createNewWindow(now: number, config: RateLimitConfig): RateLimitWindow {
		return {
			windowStart: this.getWindowStart(now, config.strategy, config.windowSeconds),
			windowDuration: config.windowSeconds * 1000,
			count: 0,
			maxNotifications: config.maxNotifications,
			strategy: config.strategy,
			tokens: config.strategy === 'token-bucket' ? config.burstSize || config.maxNotifications : undefined,
			lastRefill: config.strategy === 'token-bucket' ? now : undefined,
		};
	}

	/**
	 * Get window start time based on strategy
	 */
	private getWindowStart(now: number, strategy: string, windowSeconds: number): number {
		switch (strategy) {
			case 'fixed-window':
				// Align to fixed time boundaries
				return Math.floor(now / (windowSeconds * 1000)) * (windowSeconds * 1000);
			case 'sliding-window':
			case 'token-bucket':
			default:
				return now;
		}
	}

	/**
	 * Check if window has expired
	 */
	private isWindowExpired(window: RateLimitWindow, windowSeconds: number): boolean {
		const now = Date.now();
		
		switch (window.strategy) {
			case 'fixed-window':
				return now - window.windowStart >= window.windowDuration;
			case 'sliding-window':
				return now - window.windowStart >= window.windowDuration;
			case 'token-bucket':
				return false; // Token bucket windows don't expire, they refill
			default:
				return now - window.windowStart >= window.windowDuration;
		}
	}

	/**
	 * Apply rate limit strategy and determine if request is allowed
	 */
	private applyRateLimitStrategy(
		window: RateLimitWindow,
		config: RateLimitConfig,
		now: number,
	): RateLimitResult {
		switch (config.strategy) {
			case 'fixed-window':
				return this.applyFixedWindow(window, config);
			case 'sliding-window':
				return this.applySlidingWindow(window, config, now);
			case 'token-bucket':
				return this.applyTokenBucket(window, config, now);
			default:
				return this.applyFixedWindow(window, config);
		}
	}

	/**
	 * Apply fixed window rate limiting
	 */
	private applyFixedWindow(window: RateLimitWindow, config: RateLimitConfig): RateLimitResult {
		const allowed = window.count < config.maxNotifications;
		const resetAt = new Date(window.windowStart + (config.windowSeconds * 1000));

		return {
			allowed,
			current: window.count,
			limit: config.maxNotifications,
			resetAt: resetAt > new Date() ? resetAt : null,
		};
	}

	/**
	 * Apply sliding window rate limiting
	 */
	private applySlidingWindow(
		window: RateLimitWindow,
		config: RateLimitConfig,
		now: number,
	): RateLimitResult {
		// For sliding window, we need to track requests over time
		// This is a simplified implementation - a full implementation would track individual request timestamps
		const windowAge = now - window.windowStart;
		const windowDuration = config.windowSeconds * 1000;
		
		if (windowAge >= windowDuration) {
			// Window has fully slid, reset count
			window.count = 0;
			window.windowStart = now;
		} else {
			// Partially slide the window (simplified approach)
			const slideRatio = windowAge / windowDuration;
			const remainingRatio = 1 - slideRatio;
			window.count = Math.floor(window.count * remainingRatio);
		}

		const allowed = window.count < config.maxNotifications;
		const resetAt = new Date(now + windowDuration);

		return {
			allowed,
			current: window.count,
			limit: config.maxNotifications,
			resetAt,
		};
	}

	/**
	 * Apply token bucket rate limiting
	 */
	private applyTokenBucket(
		window: RateLimitWindow,
		config: RateLimitConfig,
		now: number,
	): RateLimitResult {
		const burstSize = config.burstSize || config.maxNotifications;
		const refillRate = config.maxNotifications / config.windowSeconds; // tokens per second
		
		// Refill tokens based on time passed
		if (window.lastRefill) {
			const timePassed = (now - window.lastRefill) / 1000; // seconds
			const tokensToAdd = Math.floor(timePassed * refillRate);
			
			if (tokensToAdd > 0) {
				window.tokens = Math.min(burstSize, (window.tokens || 0) + tokensToAdd);
				window.lastRefill = now;
			}
		} else {
			window.tokens = burstSize;
			window.lastRefill = now;
		}

		const allowed = (window.tokens || 0) > 0;
		
		// Next refill time (when at least one token will be available)
		const nextRefillTime = allowed ? null : new Date(now + (1000 / refillRate));

		return {
			allowed,
			current: burstSize - (window.tokens || 0),
			limit: burstSize,
			resetAt: nextRefillTime,
		};
	}

	/**
	 * Update window after successful request
	 */
	private updateWindow(window: RateLimitWindow, strategy: string, now: number): void {
		switch (strategy) {
			case 'fixed-window':
			case 'sliding-window':
				window.count++;
				break;
			case 'token-bucket':
				if (window.tokens !== undefined) {
					window.tokens = Math.max(0, window.tokens - 1);
				}
				break;
		}
	}
}

/**
 * Supporting interfaces
 */
interface RateLimitWindow {
	windowStart: number;
	windowDuration: number;
	count: number;
	maxNotifications: number;
	strategy: string;
	tokens?: number; // For token bucket
	lastRefill?: number; // For token bucket
}

export interface RateLimitResult {
	allowed: boolean;
	current: number;
	limit: number;
	resetAt: Date | null;
}

export interface RateLimitStatus {
	current: number;
	limit: number;
	remaining: number;
	resetAt: Date | null;
	windowStart: Date | null;
}

export interface GlobalRateLimitStats {
	totalWindows: number;
	activeWindows: number;
	totalRequests: number;
	blockedRequests: number;
	byStrategy: Record<string, number>;
}