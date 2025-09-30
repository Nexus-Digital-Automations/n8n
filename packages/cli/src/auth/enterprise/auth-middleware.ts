import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import type { AuthenticatedRequest, User } from '@n8n/db';
import { Service } from '@n8n/di';
import type { NextFunction, Response, RequestHandler } from 'express';
import { createHash } from 'crypto';

import { AuthService } from '@/auth/auth.service';
import { AuthError } from '@/errors/response-errors/auth.error';
import { ForbiddenError } from '@/errors/response-errors/forbidden.error';
import type { RBACManager } from './rbac-manager';
import type { SSOProvider } from './sso-provider';
import type { LDAPConnector } from './ldap-connector';

interface AuthMiddlewareConfig {
	enableSSO?: boolean;
	enableLDAP?: boolean;
	enableRBAC?: boolean;
	sessionTimeout?: number; // in minutes
	maxConcurrentSessions?: number;
	enableSessionTracking?: boolean;
	enableAuditLogging?: boolean;
	ipWhitelist?: string[];
	ipBlacklist?: string[];
}

interface SessionInfo {
	userId: string;
	sessionId: string;
	createdAt: Date;
	lastActiveAt: Date;
	ip: string;
	userAgent: string;
	metadata?: Record<string, unknown>;
}

interface AuditLogEntry {
	timestamp: Date;
	userId: string;
	action: string;
	resource?: string;
	resourceId?: string;
	ip: string;
	userAgent: string;
	success: boolean;
	error?: string;
	duration?: number;
	metadata?: Record<string, unknown>;
}

@Service()
export class EnterpriseAuthMiddleware {
	private sessions = new Map<string, SessionInfo[]>(); // userId -> sessions
	private auditLog: AuditLogEntry[] = [];
	private config: AuthMiddlewareConfig = {};

	constructor(
		private readonly logger: Logger,
		private readonly globalConfig: GlobalConfig,
		private readonly authService: AuthService,
		private rbacManager?: RBACManager,
		private ssoProvider?: SSOProvider,
		private ldapConnector?: LDAPConnector,
	) {}

	initialize(config: AuthMiddlewareConfig): void {
		this.logger.info('Initializing enterprise auth middleware', config);
		this.config = config;
	}

	/**
	 * Main authentication middleware with enterprise features
	 */
	createAuthMiddleware(
		options: {
			allowSkipMFA?: boolean;
			requireSSO?: boolean;
			requireLDAP?: boolean;
			resourceType?: string;
			action?: string;
		} = {},
	): RequestHandler {
		return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
			const startTime = Date.now();
			const ip = this.getClientIp(req);
			const userAgent = req.headers['user-agent'] ?? 'unknown';

			this.logger.debug('Enterprise auth middleware triggered', {
				path: req.path,
				method: req.method,
				ip,
			});

			try {
				// IP filtering
				if (!this.checkIpRestrictions(ip)) {
					this.logAudit({
						timestamp: new Date(),
						userId: 'unknown',
						action: 'access_denied',
						ip,
						userAgent,
						success: false,
						error: 'IP address not allowed',
						duration: Date.now() - startTime,
					});
					throw new ForbiddenError('Access denied from this IP address');
				}

				// Standard authentication
				let user: User | undefined;

				// Try SSO authentication if enabled and required
				if (this.config.enableSSO && options.requireSSO && this.ssoProvider) {
					user = await this.authenticateWithSSO(req);
				}

				// Try LDAP authentication if enabled and required
				else if (this.config.enableLDAP && options.requireLDAP && this.ldapConnector) {
					user = await this.authenticateWithLDAP(req);
				}

				// Fall back to standard authentication
				else {
					user = await this.standardAuthentication(req, res, options);
				}

				if (!user) {
					throw new AuthError('Authentication failed');
				}

				// Check session limits
				if (this.config.enableSessionTracking) {
					await this.checkSessionLimits(user.id, req);
				}

				// Track session
				if (this.config.enableSessionTracking) {
					this.trackSession(user.id, req);
				}

				// Check RBAC permissions if enabled
				if (this.config.enableRBAC && options.resourceType && options.action) {
					const hasPermission = await this.checkPermission(
						user.id,
						options.resourceType,
						options.action,
						req,
					);

					if (!hasPermission) {
						this.logAudit({
							timestamp: new Date(),
							userId: user.id,
							action: options.action,
							resource: options.resourceType,
							ip,
							userAgent,
							success: false,
							error: 'Insufficient permissions',
							duration: Date.now() - startTime,
						});
						throw new ForbiddenError('Insufficient permissions');
					}
				}

				// Attach user to request
				req.user = user;

				// Log successful authentication
				this.logAudit({
					timestamp: new Date(),
					userId: user.id,
					action: 'authenticate',
					ip,
					userAgent,
					success: true,
					duration: Date.now() - startTime,
				});

				next();
			} catch (error) {
				this.logger.error('Authentication failed', {
					path: req.path,
					error: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
				});

				// Log failed authentication
				this.logAudit({
					timestamp: new Date(),
					userId: 'unknown',
					action: 'authenticate',
					ip,
					userAgent,
					success: false,
					error: error instanceof Error ? error.message : String(error),
					duration: Date.now() - startTime,
				});

				if (error instanceof AuthError || error instanceof ForbiddenError) {
					res.status(error instanceof ForbiddenError ? 403 : 401).json({
						status: 'error',
						message: error.message,
					});
				} else {
					res.status(500).json({
						status: 'error',
						message: 'Internal server error',
					});
				}
			}
		};
	}

	private async standardAuthentication(
		req: AuthenticatedRequest,
		res: Response,
		options: { allowSkipMFA?: boolean },
	): Promise<User | undefined> {
		// Use existing auth service
		return await new Promise((resolve) => {
			const middleware = this.authService.createAuthMiddleware({
				allowSkipMFA: options.allowSkipMFA ?? false,
			});

			void middleware(req, res, (error?: unknown) => {
				if (error) {
					resolve(undefined);
				} else {
					resolve(req.user);
				}
			});
		});
	}

	private async authenticateWithSSO(req: AuthenticatedRequest): Promise<User | undefined> {
		this.logger.debug('Attempting SSO authentication');

		// Implementation would extract SSO token from request
		// and validate with SSO provider
		const ssoToken = req.headers.authorization?.replace('Bearer ', '');
		if (!ssoToken || !this.ssoProvider) {
			return undefined;
		}

		// Validate token with SSO provider
		const user = await this.ssoProvider.validateSSOToken(ssoToken, 'oidc');
		return user ?? undefined;
	}

	private async authenticateWithLDAP(req: AuthenticatedRequest): Promise<User | undefined> {
		this.logger.debug('Attempting LDAP authentication');

		// Extract basic auth credentials
		const authHeader = req.headers.authorization;
		if (!authHeader?.startsWith('Basic ') || !this.ldapConnector) {
			return undefined;
		}

		const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
		const [username, password] = credentials.split(':');

		if (!username || !password) {
			return undefined;
		}

		// Authenticate with LDAP
		const user = await this.ldapConnector.authenticate(username, password);
		return user ?? undefined;
	}

	private async checkPermission(
		userId: string,
		resourceType: string,
		action: string,
		req: AuthenticatedRequest,
	): Promise<boolean> {
		if (!this.rbacManager) {
			return true; // RBAC not enabled
		}

		const decision = await this.rbacManager.checkPermission({
			userId,
			resource: resourceType as never,
			action: action as never,
			context: {
				ip: this.getClientIp(req),
				timestamp: new Date(),
				metadata: {
					method: req.method,
					path: req.path,
				},
			},
		});

		this.logger.debug('Permission check result', {
			userId,
			resourceType,
			action,
			allowed: decision.allowed,
			reason: decision.reason,
		});

		return decision.allowed;
	}

	private checkIpRestrictions(ip: string): boolean {
		// Check IP whitelist
		if (this.config.ipWhitelist && this.config.ipWhitelist.length > 0) {
			if (!this.config.ipWhitelist.includes(ip)) {
				this.logger.warn('IP not in whitelist', { ip });
				return false;
			}
		}

		// Check IP blacklist
		if (this.config.ipBlacklist && this.config.ipBlacklist.length > 0) {
			if (this.config.ipBlacklist.includes(ip)) {
				this.logger.warn('IP in blacklist', { ip });
				return false;
			}
		}

		return true;
	}

	private async checkSessionLimits(userId: string, req: AuthenticatedRequest): Promise<void> {
		const maxSessions = this.config.maxConcurrentSessions ?? 0;
		if (maxSessions === 0) {
			return; // No limit
		}

		const userSessions = this.sessions.get(userId) ?? [];

		// Clean up expired sessions
		const timeout = this.config.sessionTimeout ?? 60; // minutes
		const now = Date.now();
		const validSessions = userSessions.filter((session) => {
			const age = now - session.lastActiveAt.getTime();
			return age < timeout * 60 * 1000;
		});

		if (validSessions.length >= maxSessions) {
			this.logger.warn('Max concurrent sessions reached', {
				userId,
				currentSessions: validSessions.length,
				maxSessions,
			});

			// Remove oldest session
			validSessions.sort((a, b) => a.lastActiveAt.getTime() - b.lastActiveAt.getTime());
			validSessions.shift();

			this.logger.info('Removed oldest session', { userId });
		}

		this.sessions.set(userId, validSessions);
	}

	private trackSession(userId: string, req: AuthenticatedRequest): void {
		const sessionId = this.generateSessionId(req);
		const userSessions = this.sessions.get(userId) ?? [];

		// Find existing session or create new one
		let session = userSessions.find((s) => s.sessionId === sessionId);
		if (session) {
			session.lastActiveAt = new Date();
		} else {
			session = {
				userId,
				sessionId,
				createdAt: new Date(),
				lastActiveAt: new Date(),
				ip: this.getClientIp(req),
				userAgent: req.headers['user-agent'] ?? 'unknown',
			};
			userSessions.push(session);
		}

		this.sessions.set(userId, userSessions);

		this.logger.debug('Session tracked', {
			userId,
			sessionId,
			totalSessions: userSessions.length,
		});
	}

	private generateSessionId(req: AuthenticatedRequest): string {
		const ip = this.getClientIp(req);
		const userAgent = req.headers['user-agent'] ?? 'unknown';
		return createHash('sha256').update(`${ip}:${userAgent}`).digest('hex').substring(0, 32);
	}

	private getClientIp(req: AuthenticatedRequest): string {
		const forwardedFor = req.headers['x-forwarded-for'];
		if (forwardedFor) {
			const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
			return ips.split(',')[0].trim();
		}
		return req.socket.remoteAddress ?? 'unknown';
	}

	private logAudit(entry: AuditLogEntry): void {
		if (!this.config.enableAuditLogging) {
			return;
		}

		this.auditLog.push(entry);

		// Keep only last 10000 entries
		if (this.auditLog.length > 10000) {
			this.auditLog = this.auditLog.slice(-10000);
		}

		this.logger.info('Audit log entry', {
			userId: entry.userId,
			action: entry.action,
			resource: entry.resource,
			success: entry.success,
			duration: entry.duration,
		});
	}

	/**
	 * Middleware to require specific permission
	 */
	requirePermission(resourceType: string, action: string): RequestHandler {
		return this.createAuthMiddleware({
			resourceType,
			action,
		});
	}

	/**
	 * Middleware to require SSO authentication
	 */
	requireSSO(): RequestHandler {
		return this.createAuthMiddleware({
			requireSSO: true,
		});
	}

	/**
	 * Middleware to require LDAP authentication
	 */
	requireLDAP(): RequestHandler {
		return this.createAuthMiddleware({
			requireLDAP: true,
		});
	}

	/**
	 * Get active sessions for a user
	 */
	getUserSessions(userId: string): SessionInfo[] {
		return this.sessions.get(userId) ?? [];
	}

	/**
	 * Revoke a specific session
	 */
	revokeSession(userId: string, sessionId: string): void {
		const userSessions = this.sessions.get(userId);
		if (!userSessions) {
			return;
		}

		const filtered = userSessions.filter((s) => s.sessionId !== sessionId);
		this.sessions.set(userId, filtered);

		this.logger.info('Session revoked', { userId, sessionId });
	}

	/**
	 * Revoke all sessions for a user
	 */
	revokeAllSessions(userId: string): void {
		this.sessions.delete(userId);
		this.logger.info('All sessions revoked', { userId });
	}

	/**
	 * Get audit log entries
	 */
	getAuditLog(filters?: {
		userId?: string;
		action?: string;
		startDate?: Date;
		endDate?: Date;
		limit?: number;
	}): AuditLogEntry[] {
		let entries = [...this.auditLog];

		if (filters?.userId) {
			entries = entries.filter((e) => e.userId === filters.userId);
		}

		if (filters?.action) {
			entries = entries.filter((e) => e.action === filters.action);
		}

		if (filters?.startDate) {
			entries = entries.filter((e) => e.timestamp >= filters.startDate!);
		}

		if (filters?.endDate) {
			entries = entries.filter((e) => e.timestamp <= filters.endDate!);
		}

		// Sort by timestamp descending
		entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

		if (filters?.limit) {
			entries = entries.slice(0, filters.limit);
		}

		return entries;
	}

	/**
	 * Clear audit log
	 */
	clearAuditLog(): void {
		this.auditLog = [];
		this.logger.info('Audit log cleared');
	}

	/**
	 * Get statistics
	 */
	getStats(): {
		totalSessions: number;
		activeUsers: number;
		auditLogEntries: number;
		failedAttempts: number;
	} {
		const totalSessions = Array.from(this.sessions.values()).reduce(
			(sum, sessions) => sum + sessions.length,
			0,
		);

		const activeUsers = this.sessions.size;

		const failedAttempts = this.auditLog.filter((entry) => !entry.success).length;

		return {
			totalSessions,
			activeUsers,
			auditLogEntries: this.auditLog.length,
			failedAttempts,
		};
	}
}
