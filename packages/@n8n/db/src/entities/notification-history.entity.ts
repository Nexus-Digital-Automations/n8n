import {
	BeforeUpdate,
	Column,
	Entity,
	Generated,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryColumn,
	RelationId,
} from '@n8n/typeorm';
import { User } from './user';
import { WorkflowEntity } from './workflow-entity';
import { ExecutionEntity } from './execution-entity';
import { WithTimestampsAndStringId, jsonColumnType, DateTimeColumn } from './abstract-entity';

export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'retrying';

export interface NotificationMetadata {
	/** Original notification payload */
	payload?: Record<string, unknown>;
	/** Error details if notification failed */
	errorDetails?: {
		code?: string;
		message?: string;
		stack?: string;
		timestamp: string;
	};
	/** Response from notification channel */
	response?: Record<string, unknown>;
	/** Delivery attempt timestamps */
	attempts?: string[];
	/** Additional channel-specific metadata */
	channelMetadata?: Record<string, unknown>;
}

/**
 * Entity for tracking notification delivery history and status
 */
@Entity('notification_history')
@Index(['workflowId'])
@Index(['executionId'])
@Index(['userId'])
@Index(['status'])
@Index(['nextRetryAt'])
export class NotificationHistoryEntity extends WithTimestampsAndStringId {
	@Generated('uuid')
	@PrimaryColumn('uuid')
	id: string;

	@Column('uuid')
	@RelationId((notificationHistory: NotificationHistoryEntity) => notificationHistory.workflow)
	workflowId: string;

	@Column('uuid')
	@RelationId((notificationHistory: NotificationHistoryEntity) => notificationHistory.execution)
	executionId: string;

	@Column('uuid')
	@RelationId((notificationHistory: NotificationHistoryEntity) => notificationHistory.user)
	userId: string;

	@Column({ type: 'varchar', length: 50 })
	channel: string;

	@Column({ type: 'varchar', length: 20, default: 'pending' })
	status: NotificationStatus;

	@Column({ type: 'text', nullable: true })
	error: string | null;

	@DateTimeColumn({ nullable: true })
	sentAt: Date | null;

	@Column({ type: 'int', default: 0 })
	retryCount: number;

	@DateTimeColumn({ nullable: true })
	nextRetryAt: Date | null;

	@Column({ type: jsonColumnType, default: '{}' })
	metadata: NotificationMetadata;

	@ManyToOne(() => WorkflowEntity, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'workflowId' })
	workflow: WorkflowEntity;

	@ManyToOne(() => ExecutionEntity, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'executionId' })
	execution: ExecutionEntity;

	@ManyToOne(() => User, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'userId' })
	user: User;

	@BeforeUpdate()
	setUpdateDate(): void {
		this.updatedAt = new Date();
	}

	/**
	 * Mark notification as sent successfully
	 */
	markAsSent(response?: Record<string, unknown>): void {
		this.status = 'sent';
		this.sentAt = new Date();
		this.error = null;
		if (response) {
			this.metadata = {
				...this.metadata,
				response,
			};
		}
	}

	/**
	 * Mark notification as failed and schedule retry if applicable
	 */
	markAsFailed(error: string, nextRetryAt?: Date): void {
		this.status = nextRetryAt ? 'retrying' : 'failed';
		this.error = error;
		this.retryCount += 1;
		this.nextRetryAt = nextRetryAt || null;
		
		// Add error details to metadata
		this.metadata = {
			...this.metadata,
			errorDetails: {
				message: error,
				timestamp: new Date().toISOString(),
			},
			attempts: [
				...(this.metadata.attempts || []),
				new Date().toISOString(),
			],
		};
	}

	/**
	 * Check if notification can be retried
	 */
	canRetry(maxRetries: number): boolean {
		return this.retryCount < maxRetries && this.status !== 'sent';
	}

	/**
	 * Check if notification is ready for retry
	 */
	isReadyForRetry(): boolean {
		return (
			this.status === 'retrying' &&
			this.nextRetryAt !== null &&
			this.nextRetryAt <= new Date()
		);
	}
}