import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import { CredentialsRepository, WorkflowRepository } from '@n8n/db';
import { EventService } from '@/events/event.service';

export interface SecretAccessEvent {
	id: string;
	credentialId: string;
	credentialName: string;
	credentialType: string;
	action: 'read' | 'create' | 'update' | 'delete' | 'execute';
	userId?: string;
	userName?: string;
	workflowId?: string;
	workflowName?: string;
	timestamp: Date;
	ipAddress?: string;
	userAgent?: string;
	success: boolean;
	metadata?: Record<string, any>;
}

export interface SecretUsageReport {
	credentialId: string;
	credentialName: string;
	totalAccess: number;
	lastAccessed?: Date;
	accessByAction: {
		read: number;
		create: number;
		update: number;
		delete: number;
		execute: number;
	};
	accessByUser: Array<{
		userId: string;
		userName: string;
		count: number;
	}>;
	accessByWorkflow: Array<{
		workflowId: string;
		workflowName: string;
		count: number;
	}>;
	unusedDays?: number;
}

export interface AuditQuery {
	credentialId?: string;
	userId?: string;
	workflowId?: string;
	action?: SecretAccessEvent['action'];
	startDate?: Date;
	endDate?: Date;
	limit?: number;
}

@Service()
export class SecretAuditingService {
	private accessLog: SecretAccessEvent[] = [];
	private readonly maxLogSize = 10000;

	constructor(
		private readonly logger: Logger,
		private readonly credentialsRepository: CredentialsRepository,
		private readonly workflowRepository: WorkflowRepository,
		private readonly eventService: EventService,
	) {
		this.logger = this.logger.scoped('secret-auditing');
	}

	/**
	 * Log a secret access event
	 */
	logAccess(event: Omit<SecretAccessEvent, 'id' | 'timestamp'>): void {
		const fullEvent: SecretAccessEvent = {
			...event,
			id: `access_${Date.now()}_${Math.random().toString(36).substring(7)}`,
			timestamp: new Date(),
		};

		this.accessLog.push(fullEvent);
		this.pruneLog();

		this.logger.info('Secret access logged', {
			eventId: fullEvent.id,
			credentialId: fullEvent.credentialId,
			action: fullEvent.action,
			userId: fullEvent.userId,
			success: fullEvent.success,
		});

		// Emit event for real-time monitoring
		this.eventService.emit('secret-accessed', fullEvent);

		// Check for suspicious patterns
		this.checkForSuspiciousActivity(fullEvent);
	}

	/**
	 * Query audit log
	 */
	queryAuditLog(query: AuditQuery): SecretAccessEvent[] {
		let results = [...this.accessLog];

		if (query.credentialId) {
			results = results.filter((event) => event.credentialId === query.credentialId);
		}

		if (query.userId) {
			results = results.filter((event) => event.userId === query.userId);
		}

		if (query.workflowId) {
			results = results.filter((event) => event.workflowId === query.workflowId);
		}

		if (query.action) {
			results = results.filter((event) => event.action === query.action);
		}

		if (query.startDate) {
			results = results.filter((event) => event.timestamp >= query.startDate!);
		}

		if (query.endDate) {
			results = results.filter((event) => event.timestamp <= query.endDate!);
		}

		// Sort by timestamp descending
		results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

		// Apply limit
		if (query.limit) {
			results = results.slice(0, query.limit);
		}

		return results;
	}

	/**
	 * Get usage report for a specific credential
	 */
	async getCredentialUsageReport(credentialId: string): Promise<SecretUsageReport | null> {
		const credential = await this.credentialsRepository.findOneBy({ id: credentialId });
		if (!credential) {
			return null;
		}

		const events = this.queryAuditLog({ credentialId });

		if (events.length === 0) {
			const daysSinceCreation = Math.floor(
				(Date.now() - credential.createdAt.getTime()) / (1000 * 60 * 60 * 24),
			);

			return {
				credentialId,
				credentialName: credential.name,
				totalAccess: 0,
				accessByAction: {
					read: 0,
					create: 0,
					update: 0,
					delete: 0,
					execute: 0,
				},
				accessByUser: [],
				accessByWorkflow: [],
				unusedDays: daysSinceCreation,
			};
		}

		const accessByAction = {
			read: events.filter((e) => e.action === 'read').length,
			create: events.filter((e) => e.action === 'create').length,
			update: events.filter((e) => e.action === 'update').length,
			delete: events.filter((e) => e.action === 'delete').length,
			execute: events.filter((e) => e.action === 'execute').length,
		};

		// Count by user
		const userCounts = new Map<string, { userName: string; count: number }>();
		for (const event of events) {
			if (event.userId) {
				const existing = userCounts.get(event.userId);
				if (existing) {
					existing.count++;
				} else {
					userCounts.set(event.userId, {
						userName: event.userName || 'Unknown',
						count: 1,
					});
				}
			}
		}

		const accessByUser = Array.from(userCounts.entries()).map(([userId, data]) => ({
			userId,
			userName: data.userName,
			count: data.count,
		}));

		// Count by workflow
		const workflowCounts = new Map<string, { workflowName: string; count: number }>();
		for (const event of events) {
			if (event.workflowId) {
				const existing = workflowCounts.get(event.workflowId);
				if (existing) {
					existing.count++;
				} else {
					workflowCounts.set(event.workflowId, {
						workflowName: event.workflowName || 'Unknown',
						count: 1,
					});
				}
			}
		}

		const accessByWorkflow = Array.from(workflowCounts.entries()).map(([workflowId, data]) => ({
			workflowId,
			workflowName: data.workflowName,
			count: data.count,
		}));

		const lastAccessed = events[0].timestamp;
		const unusedDays = Math.floor((Date.now() - lastAccessed.getTime()) / (1000 * 60 * 60 * 24));

		return {
			credentialId,
			credentialName: credential.name,
			totalAccess: events.length,
			lastAccessed,
			accessByAction,
			accessByUser,
			accessByWorkflow,
			unusedDays,
		};
	}

	/**
	 * Get usage report for all credentials
	 */
	async getAllCredentialUsageReports(): Promise<SecretUsageReport[]> {
		const credentials = await this.credentialsRepository.find({
			select: ['id'],
		});

		const reports: SecretUsageReport[] = [];

		for (const credential of credentials) {
			const report = await this.getCredentialUsageReport(credential.id);
			if (report) {
				reports.push(report);
			}
		}

		return reports.sort((a, b) => b.totalAccess - a.totalAccess);
	}

	/**
	 * Get unused credentials (no access in N days)
	 */
	async getUnusedCredentials(unusedDays: number = 90): Promise<SecretUsageReport[]> {
		const allReports = await this.getAllCredentialUsageReports();
		return allReports.filter(
			(report) => report.unusedDays !== undefined && report.unusedDays >= unusedDays,
		);
	}

	/**
	 * Get most accessed credentials
	 */
	async getMostAccessedCredentials(limit: number = 10): Promise<SecretUsageReport[]> {
		const allReports = await this.getAllCredentialUsageReports();
		return allReports.slice(0, limit);
	}

	/**
	 * Get audit statistics
	 */
	getAuditStatistics(): {
		totalEvents: number;
		eventsByAction: Record<SecretAccessEvent['action'], number>;
		successRate: number;
		uniqueCredentials: number;
		uniqueUsers: number;
		recentEvents: number;
	} {
		const eventsByAction = {
			read: this.accessLog.filter((e) => e.action === 'read').length,
			create: this.accessLog.filter((e) => e.action === 'create').length,
			update: this.accessLog.filter((e) => e.action === 'update').length,
			delete: this.accessLog.filter((e) => e.action === 'delete').length,
			execute: this.accessLog.filter((e) => e.action === 'execute').length,
		};

		const successfulEvents = this.accessLog.filter((e) => e.success).length;
		const successRate = this.accessLog.length > 0 ? successfulEvents / this.accessLog.length : 0;

		const uniqueCredentials = new Set(this.accessLog.map((e) => e.credentialId)).size;
		const uniqueUsers = new Set(this.accessLog.filter((e) => e.userId).map((e) => e.userId)).size;

		const twentyFourHoursAgo = new Date();
		twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
		const recentEvents = this.accessLog.filter((e) => e.timestamp >= twentyFourHoursAgo).length;

		return {
			totalEvents: this.accessLog.length,
			eventsByAction,
			successRate,
			uniqueCredentials,
			uniqueUsers,
			recentEvents,
		};
	}

	/**
	 * Check for suspicious activity patterns
	 */
	private checkForSuspiciousActivity(event: SecretAccessEvent): void {
		// Check for high-frequency access (potential brute force)
		const recentEvents = this.queryAuditLog({
			credentialId: event.credentialId,
			userId: event.userId,
			startDate: new Date(Date.now() - 60 * 1000), // Last minute
		});

		if (recentEvents.length > 10) {
			this.logger.warn('High-frequency credential access detected', {
				credentialId: event.credentialId,
				userId: event.userId,
				count: recentEvents.length,
			});

			this.eventService.emit('suspicious-activity-detected', {
				type: 'high-frequency-access',
				credentialId: event.credentialId,
				userId: event.userId,
				count: recentEvents.length,
			});
		}

		// Check for failed access attempts
		const recentFailedAttempts = this.queryAuditLog({
			credentialId: event.credentialId,
			userId: event.userId,
			startDate: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
		}).filter((e) => !e.success);

		if (recentFailedAttempts.length >= 3) {
			this.logger.warn('Multiple failed access attempts detected', {
				credentialId: event.credentialId,
				userId: event.userId,
				count: recentFailedAttempts.length,
			});

			this.eventService.emit('suspicious-activity-detected', {
				type: 'multiple-failed-attempts',
				credentialId: event.credentialId,
				userId: event.userId,
				count: recentFailedAttempts.length,
			});
		}
	}

	/**
	 * Prune old log entries
	 */
	private pruneLog(): void {
		if (this.accessLog.length > this.maxLogSize) {
			this.accessLog = this.accessLog
				.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
				.slice(0, this.maxLogSize);
		}
	}

	/**
	 * Export audit log (for backup/reporting)
	 */
	exportAuditLog(): SecretAccessEvent[] {
		return [...this.accessLog];
	}

	/**
	 * Clear audit log (use with caution)
	 */
	clearAuditLog(): void {
		this.logger.warn('Audit log cleared');
		this.accessLog = [];
	}
}
