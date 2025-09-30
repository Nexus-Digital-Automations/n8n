import { Column, Entity, Index, ManyToOne, JoinColumn } from '@n8n/typeorm';
import { Length } from 'class-validator';

import { WithTimestampsAndStringId } from './abstract-entity';
import type { EnvironmentEntity } from './environment.entity';

@Entity({ name: 'environment_variable' })
@Index(['environmentId', 'key'], { unique: true })
export class EnvironmentVariableEntity extends WithTimestampsAndStringId {
	@Column({ type: 'varchar', length: 36 })
	@Index()
	environmentId: string;

	@ManyToOne('EnvironmentEntity', 'variables', {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'environmentId' })
	environment: EnvironmentEntity;

	@Length(1, 255, {
		message: 'Variable key must be $constraint1 to $constraint2 characters long.',
	})
	@Column({ length: 255 })
	key: string;

	@Column({ type: 'text' })
	value: string;

	@Column({ type: 'boolean', default: false })
	encrypted: boolean;

	@Column({ type: 'text', nullable: true })
	description?: string;

	@Column({ type: 'simple-json', nullable: true })
	metadata: Record<string, any>;

	@Column({ type: 'varchar', length: 36 })
	createdBy: string;
}
