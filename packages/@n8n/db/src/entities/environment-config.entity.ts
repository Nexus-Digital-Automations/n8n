import { Column, Entity, Index, ManyToOne, JoinColumn } from '@n8n/typeorm';

import { WithTimestampsAndStringId } from './abstract-entity';
import type { EnvironmentEntity } from './environment.entity';

@Entity({ name: 'environment_config' })
export class EnvironmentConfigEntity extends WithTimestampsAndStringId {
	@Column({ type: 'varchar', length: 36 })
	@Index({ unique: true })
	environmentId: string;

	@ManyToOne('EnvironmentEntity', {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'environmentId' })
	environment: EnvironmentEntity;

	@Column({ type: 'simple-json' })
	config: Record<string, any>;

	@Column({ type: 'int', default: 1 })
	version: number;

	@Column({ type: 'varchar', length: 36, nullable: true })
	updatedBy?: string;
}
