import { Column, Entity, Index, ManyToOne, JoinColumn } from '@n8n/typeorm';

import { WithTimestampsAndStringId } from './abstract-entity';
import type { EnvironmentEntity } from './environment.entity';
import type { CredentialsEntity } from './credentials-entity';

@Entity({ name: 'environment_credential' })
@Index(['environmentId', 'credentialId'], { unique: true })
export class EnvironmentCredentialEntity extends WithTimestampsAndStringId {
	@Column({ type: 'varchar', length: 36 })
	@Index()
	environmentId: string;

	@ManyToOne('EnvironmentEntity', 'credentials', {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'environmentId' })
	environment: EnvironmentEntity;

	@Column({ type: 'varchar', length: 36 })
	@Index()
	credentialId: string;

	@ManyToOne('CredentialsEntity', {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'credentialId' })
	credential: CredentialsEntity;

	@Column({ type: 'text' })
	encryptedData: string;

	@Column({ type: 'boolean', default: true })
	isActive: boolean;

	@Column({ type: 'simple-json', nullable: true })
	metadata: Record<string, any>;

	@Column({ type: 'varchar', length: 36 })
	createdBy: string;
}
