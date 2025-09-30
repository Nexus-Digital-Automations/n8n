import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import { CredentialsRepository } from '@n8n/db';
import { EventService } from '@/events/event.service';

export interface SecretRotationPolicy {
	credentialId: string;
	rotationIntervalDays: number;
	autoRotate: boolean;
	lastRotated?: Date;
	nextRotation?: Date;
	notificationDays?: number; // Days before rotation to notify
}

export interface SecretRotationEvent {
	id: string;
	credentialId: string;
	credentialName: string;
	type: 'manual' | 'automatic' | 'scheduled';
	status: 'success' | 'failed' | 'pending';
	timestamp: Date;
	initiatedBy?: string;
	error?: string;
}

export interface RotationSchedule {
	credentialId: string;
	credentialName: string;
	currentAge: number; // days
	rotationDue: boolean;
	daysUntilRotation: number;
	lastRotated?: Date;
	nextRotation?: Date;
}

@Service()
export class SecretRotationService {
	private rotationPolicies: Map<string, SecretRotationPolicy> = new Map();
	private rotationHistory: SecretRotationEvent[] = [];

	constructor(
		private readonly logger: Logger,
		private readonly credentialsRepository: CredentialsRepository,
		private readonly eventService: EventService,
	) {
		this.logger = this.logger.scoped('secret-rotation');
	}

	/**
	 * Set rotation policy for a credential
	 */
	async setRotationPolicy(policy: SecretRotationPolicy): Promise<void> {
		this.logger.info('Setting rotation policy', {
			credentialId: policy.credentialId,
			rotationIntervalDays: policy.rotationIntervalDays,
			autoRotate: policy.autoRotate,
		});

		// Calculate next rotation date
		const lastRotated = policy.lastRotated || new Date();
		const nextRotation = new Date(lastRotated);
		nextRotation.setDate(nextRotation.getDate() + policy.rotationIntervalDays);

		const fullPolicy: SecretRotationPolicy = {
			...policy,
			lastRotated,
			nextRotation,
			notificationDays: policy.notificationDays || 7,
		};

		this.rotationPolicies.set(policy.credentialId, fullPolicy);

		this.eventService.emit('secret-rotation-policy-set', {
			credentialId: policy.credentialId,
			policy: fullPolicy,
		});
	}

	/**
	 * Get rotation policy for a credential
	 */
	getRotationPolicy(credentialId: string): SecretRotationPolicy | undefined {
		return this.rotationPolicies.get(credentialId);
	}

	/**
	 * Remove rotation policy for a credential
	 */
	removeRotationPolicy(credentialId: string): void {
		this.logger.info('Removing rotation policy', { credentialId });
		this.rotationPolicies.delete(credentialId);

		this.eventService.emit('secret-rotation-policy-removed', {
			credentialId,
		});
	}

	/**
	 * Mark a credential as rotated
	 */
	async markAsRotated(
		credentialId: string,
		type: 'manual' | 'automatic' = 'manual',
		initiatedBy?: string,
	): Promise<void> {
		this.logger.info('Marking credential as rotated', {
			credentialId,
			type,
			initiatedBy,
		});

		const credential = await this.credentialsRepository.findOneBy({ id: credentialId });
		if (!credential) {
			throw new Error(`Credential ${credentialId} not found`);
		}

		const policy = this.rotationPolicies.get(credentialId);
		if (policy) {
			const now = new Date();
			const nextRotation = new Date(now);
			nextRotation.setDate(nextRotation.getDate() + policy.rotationIntervalDays);

			policy.lastRotated = now;
			policy.nextRotation = nextRotation;
			this.rotationPolicies.set(credentialId, policy);
		}

		const event: SecretRotationEvent = {
			id: `rotation_${Date.now()}_${credentialId}`,
			credentialId,
			credentialName: credential.name,
			type,
			status: 'success',
			timestamp: new Date(),
			initiatedBy,
		};

		this.rotationHistory.push(event);
		this.pruneHistory();

		this.eventService.emit('secret-rotated', {
			credentialId,
			credentialName: credential.name,
			type,
			timestamp: event.timestamp,
		});
	}

	/**
	 * Get rotation schedule for all credentials with policies
	 */
	async getRotationSchedule(): Promise<RotationSchedule[]> {
		const schedule: RotationSchedule[] = [];

		for (const [credentialId, policy] of this.rotationPolicies.entries()) {
			try {
				const credential = await this.credentialsRepository.findOneBy({ id: credentialId });
				if (!credential) {
					this.logger.warn('Credential not found for policy', { credentialId });
					continue;
				}

				const now = new Date();
				const lastRotated = policy.lastRotated || credential.updatedAt;
				const currentAge = Math.floor(
					(now.getTime() - lastRotated.getTime()) / (1000 * 60 * 60 * 24),
				);
				const nextRotation =
					policy.nextRotation ||
					new Date(lastRotated.getTime() + policy.rotationIntervalDays * 24 * 60 * 60 * 1000);
				const daysUntilRotation = Math.floor(
					(nextRotation.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
				);

				schedule.push({
					credentialId,
					credentialName: credential.name,
					currentAge,
					rotationDue: daysUntilRotation <= 0,
					daysUntilRotation,
					lastRotated,
					nextRotation,
				});
			} catch (error) {
				this.logger.error('Error calculating rotation schedule', {
					credentialId,
					error: error instanceof Error ? error.message : 'Unknown error',
					stack: error instanceof Error ? error.stack : undefined,
				});
			}
		}

		return schedule.sort((a, b) => a.daysUntilRotation - b.daysUntilRotation);
	}

	/**
	 * Get credentials that need rotation
	 */
	async getCredentialsDueForRotation(): Promise<RotationSchedule[]> {
		const schedule = await this.getRotationSchedule();
		return schedule.filter((item) => item.rotationDue);
	}

	/**
	 * Get credentials approaching rotation
	 */
	async getCredentialsApproachingRotation(withinDays: number = 7): Promise<RotationSchedule[]> {
		const schedule = await this.getRotationSchedule();
		return schedule.filter(
			(item) =>
				!item.rotationDue && item.daysUntilRotation <= withinDays && item.daysUntilRotation > 0,
		);
	}

	/**
	 * Check all credentials and trigger rotation notifications
	 */
	async checkRotationStatus(): Promise<void> {
		this.logger.info('Checking rotation status for all credentials');

		const dueCredentials = await this.getCredentialsDueForRotation();
		const approachingCredentials = await this.getCredentialsApproachingRotation();

		if (dueCredentials.length > 0) {
			this.logger.warn('Credentials due for rotation', {
				count: dueCredentials.length,
				credentials: dueCredentials.map((c) => ({
					id: c.credentialId,
					name: c.credentialName,
					overdueDays: Math.abs(c.daysUntilRotation),
				})),
			});

			this.eventService.emit('credentials-rotation-overdue', {
				credentials: dueCredentials,
			});
		}

		if (approachingCredentials.length > 0) {
			this.logger.info('Credentials approaching rotation', {
				count: approachingCredentials.length,
				credentials: approachingCredentials.map((c) => ({
					id: c.credentialId,
					name: c.credentialName,
					daysUntil: c.daysUntilRotation,
				})),
			});

			this.eventService.emit('credentials-rotation-upcoming', {
				credentials: approachingCredentials,
			});
		}
	}

	/**
	 * Get rotation history
	 */
	getRotationHistory(limit: number = 100): SecretRotationEvent[] {
		return this.rotationHistory
			.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
			.slice(0, limit);
	}

	/**
	 * Get rotation statistics
	 */
	async getRotationStatistics(): Promise<{
		totalPolicies: number;
		credentialsDue: number;
		credentialsApproaching: number;
		averageRotationAge: number;
		recentRotations: number;
	}> {
		const schedule = await this.getRotationSchedule();
		const dueCredentials = schedule.filter((c) => c.rotationDue);
		const approachingCredentials = schedule.filter(
			(c) => !c.rotationDue && c.daysUntilRotation <= 7,
		);

		const averageAge =
			schedule.length > 0
				? schedule.reduce((sum, c) => sum + c.currentAge, 0) / schedule.length
				: 0;

		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
		const recentRotations = this.rotationHistory.filter(
			(event) => event.timestamp >= thirtyDaysAgo && event.status === 'success',
		).length;

		return {
			totalPolicies: this.rotationPolicies.size,
			credentialsDue: dueCredentials.length,
			credentialsApproaching: approachingCredentials.length,
			averageRotationAge: Math.round(averageAge),
			recentRotations,
		};
	}

	/**
	 * Prune old rotation history (keep last 1000 events)
	 */
	private pruneHistory(): void {
		const maxHistory = 1000;
		if (this.rotationHistory.length > maxHistory) {
			this.rotationHistory = this.rotationHistory
				.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
				.slice(0, maxHistory);
		}
	}

	/**
	 * Export rotation policies (for backup/restore)
	 */
	exportPolicies(): SecretRotationPolicy[] {
		return Array.from(this.rotationPolicies.values());
	}

	/**
	 * Import rotation policies (for backup/restore)
	 */
	importPolicies(policies: SecretRotationPolicy[]): void {
		this.logger.info('Importing rotation policies', { count: policies.length });

		for (const policy of policies) {
			this.rotationPolicies.set(policy.credentialId, policy);
		}
	}
}
