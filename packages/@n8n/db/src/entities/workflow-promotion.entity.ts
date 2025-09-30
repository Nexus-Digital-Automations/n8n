import { Column, Entity, Index, ManyToOne, JoinColumn } from '@n8n/typeorm';

import { WithTimestampsAndStringId } from './abstract-entity';
import type { WorkflowEntity } from './workflow-entity';
import type { EnvironmentEntity } from './environment.entity';

export type PromotionStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';

@Entity({ name: 'workflow_promotion' })
export class WorkflowPromotionEntity extends WithTimestampsAndStringId {
	@Column({ type: 'varchar', length: 36 })
	@Index()
	workflowId: string;

	@ManyToOne('WorkflowEntity', {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'workflowId' })
	workflow: WorkflowEntity;

	@Column({ type: 'varchar', length: 36 })
	@Index()
	sourceEnvironmentId: string;

	@ManyToOne('EnvironmentEntity', {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'sourceEnvironmentId' })
	sourceEnvironment: EnvironmentEntity;

	@Column({ type: 'varchar', length: 36 })
	@Index()
	targetEnvironmentId: string;

	@ManyToOne('EnvironmentEntity', {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'targetEnvironmentId' })
	targetEnvironment: EnvironmentEntity;

	@Column({
		type: 'varchar',
		length: 50,
		default: 'pending',
	})
	status: PromotionStatus;

	@Column({ type: 'timestamp', nullable: true })
	completedAt?: Date;

	@Column({ type: 'simple-json', nullable: true })
	errors?: Array<{
		code: string;
		message: string;
		details?: Record<string, any>;
		timestamp: Date;
	}>;

	@Column({ type: 'varchar', length: 36, nullable: true })
	backupId?: string;

	@Column({ type: 'simple-json', nullable: true })
	validationResults?: Array<{
		check: string;
		passed: boolean;
		message: string;
		severity: 'error' | 'warning' | 'info';
	}>;

	@Column({ type: 'simple-json', nullable: true })
	metadata: Record<string, any>;

	@Column({ type: 'varchar', length: 36 })
	performedBy: string;
}
