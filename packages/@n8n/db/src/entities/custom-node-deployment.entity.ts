import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from '@n8n/typeorm';

import { WithTimestamps } from './abstract-entity';
import type { CustomNode } from './custom-node';

export type DeploymentStatus = 'queued' | 'deploying' | 'deployed' | 'failed' | 'rolled-back';
export type DeploymentEnvironment = 'staging' | 'production';

export interface DeploymentConfig {
	restartWorkflows?: boolean;
	gracefulShutdown?: boolean;
	timeout?: number;
	[key: string]: any;
}

@Entity()
export class CustomNodeDeployment extends WithTimestamps {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column()
	nodeId: string;

	@Column()
	version: string;

	@Column({ type: 'varchar', length: 50, default: 'production' })
	environment: DeploymentEnvironment;

	@Column({ type: 'varchar', length: 50, default: 'queued' })
	status: DeploymentStatus;

	@Column({ nullable: true })
	deployedBy?: string;

	@Column({ nullable: true })
	deployedAt?: Date;

	@Column({ default: false })
	rollbackAvailable: boolean;

	@Column('json', { default: '{}' })
	deploymentConfig: DeploymentConfig;

	@Column({ nullable: true })
	errorMessage?: string;

	@Column({ nullable: true })
	startedAt?: Date;

	@Column({ nullable: true })
	completedAt?: Date;

	@Column({ nullable: true })
	estimatedDuration?: number;

	@ManyToOne('CustomNode', 'deployments')
	@JoinColumn({ name: 'nodeId', referencedColumnName: 'id' })
	node: CustomNode;
}
