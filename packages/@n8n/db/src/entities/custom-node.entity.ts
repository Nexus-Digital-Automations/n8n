import { Column, Entity, JoinColumn, OneToMany, PrimaryGeneratedColumn } from '@n8n/typeorm';

import { WithTimestamps } from './abstract-entity';
import type { CustomNodeDeployment } from './custom-node-deployment';

export type CustomNodeStatus = 'uploaded' | 'validating' | 'validated' | 'failed' | 'deployed';

export interface ValidationResults {
	syntax: boolean;
	dependencies: boolean;
	security: boolean;
	tests: boolean;
	warnings: string[];
	errors: string[];
}

export interface NodeMetadata {
	nodeTypes: string[];
	author: string;
	license: string;
	fileSize: string;
	dependencies: string[];
	[key: string]: any;
}

@Entity()
export class CustomNode extends WithTimestamps {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column()
	name: string;

	@Column()
	version: string;

	@Column({ nullable: true })
	description?: string;

	@Column({ nullable: true })
	authorId?: string;

	@Column({ nullable: true })
	category?: string;

	@Column('simple-array', { nullable: true })
	tags?: string[];

	@Column({ type: 'varchar', length: 50, default: 'uploaded' })
	status: CustomNodeStatus;

	@Column()
	filePath: string;

	@Column({ type: 'bigint', nullable: true })
	fileSize?: number;

	@Column('json', { nullable: true })
	nodeTypes?: string[];

	@Column('json', { default: '{}' })
	metadata: NodeMetadata;

	@Column('json', { nullable: true })
	validationResults?: ValidationResults;

	@Column({ nullable: true })
	validatedAt?: Date;

	@Column({ nullable: true })
	deployedAt?: Date;

	@Column({ default: false })
	isActive: boolean;

	@OneToMany('CustomNodeDeployment', 'node')
	@JoinColumn({ referencedColumnName: 'id' })
	deployments?: CustomNodeDeployment[];
}
