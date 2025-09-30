import { Column, Entity, Index, ManyToOne, JoinColumn } from '@n8n/typeorm';

import { WithTimestampsAndStringId } from './abstract-entity';
import type { WorkflowEntity } from './workflow-entity';
import type { EnvironmentEntity } from './environment.entity';

@Entity({ name: 'workflow_backup' })
export class WorkflowBackupEntity extends WithTimestampsAndStringId {
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
	environmentId: string;

	@ManyToOne('EnvironmentEntity', {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'environmentId' })
	environment: EnvironmentEntity;

	@Column({ type: 'simple-json' })
	workflowData: {
		nodes: any[];
		connections: any;
		settings?: any;
		staticData?: any;
	};

	@Column({ type: 'simple-json', nullable: true })
	metadata: Record<string, any>;

	@Column({ type: 'varchar', length: 36 })
	createdBy: string;
}
