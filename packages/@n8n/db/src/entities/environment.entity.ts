import { Column, Entity, Index, OneToMany } from '@n8n/typeorm';
import { Length } from 'class-validator';

import { WithTimestampsAndStringId } from './abstract-entity';
import type { EnvironmentCredentialEntity } from './environment-credential.entity';
import type { EnvironmentVariableEntity } from './environment-variable.entity';

export type EnvironmentType = 'development' | 'staging' | 'production' | 'testing' | 'custom';
export type EnvironmentStatus = 'active' | 'inactive' | 'maintenance' | 'archived';

@Entity({ name: 'environment' })
export class EnvironmentEntity extends WithTimestampsAndStringId {
	@Index({ unique: true })
	@Length(1, 128, {
		message: 'Environment name must be $constraint1 to $constraint2 characters long.',
	})
	@Column({ length: 128 })
	name: string;

	@Column({
		type: 'varchar',
		length: 50,
	})
	type: EnvironmentType;

	@Column({ type: 'text', nullable: true })
	description?: string;

	@Column({
		type: 'varchar',
		length: 50,
		default: 'active',
	})
	status: EnvironmentStatus;

	@Column({ type: 'simple-json', nullable: true })
	config: Record<string, any>;

	@Column({ type: 'simple-json', nullable: true })
	metadata: Record<string, any>;

	@Column({ type: 'varchar', length: 36 })
	createdBy: string;

	@Column({ type: 'varchar', length: 36, nullable: true })
	updatedBy?: string;

	@OneToMany('EnvironmentCredentialEntity', 'environment')
	credentials: EnvironmentCredentialEntity[];

	@OneToMany('EnvironmentVariableEntity', 'environment')
	variables: EnvironmentVariableEntity[];
}
