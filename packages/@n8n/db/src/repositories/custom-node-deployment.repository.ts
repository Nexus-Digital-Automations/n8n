import { Service } from '@n8n/di';
import type { FindManyOptions } from '@n8n/typeorm';
import { DataSource, Repository } from '@n8n/typeorm';

import { CustomNodeDeployment } from '../entities/custom-node-deployment.entity';
import type {
	DeploymentStatus,
	DeploymentEnvironment,
} from '../entities/custom-node-deployment.entity';

@Service()
export class CustomNodeDeploymentRepository extends Repository<CustomNodeDeployment> {
	constructor(dataSource: DataSource) {
		super(CustomNodeDeployment, dataSource.manager);
	}

	async findByNodeId(
		nodeId: string,
		options?: FindManyOptions<CustomNodeDeployment>,
	): Promise<CustomNodeDeployment[]> {
		return await this.find({
			...options,
			where: { ...options?.where, nodeId },
			relations: ['node'],
			order: { createdAt: 'DESC' },
		});
	}

	async findLatestByNodeId(nodeId: string): Promise<CustomNodeDeployment | null> {
		return await this.findOne({
			where: { nodeId },
			relations: ['node'],
			order: { createdAt: 'DESC' },
		});
	}

	async findByStatus(
		status: DeploymentStatus,
		options?: FindManyOptions<CustomNodeDeployment>,
	): Promise<CustomNodeDeployment[]> {
		return await this.find({
			...options,
			where: { ...options?.where, status },
			relations: ['node'],
		});
	}

	async findByEnvironment(
		environment: DeploymentEnvironment,
		options?: FindManyOptions<CustomNodeDeployment>,
	): Promise<CustomNodeDeployment[]> {
		return await this.find({
			...options,
			where: { ...options?.where, environment },
			relations: ['node'],
		});
	}

	async updateStatus(id: string, status: DeploymentStatus, errorMessage?: string): Promise<void> {
		const updateData: Partial<CustomNodeDeployment> = {
			status,
			...(status === 'deployed' && { completedAt: new Date() }),
			...(status === 'failed' && { errorMessage, completedAt: new Date() }),
		};

		await this.update(id, updateData);
	}

	async markAsStarted(id: string): Promise<void> {
		await this.update(id, {
			status: 'deploying',
			startedAt: new Date(),
		});
	}

	async getActiveDeployments(): Promise<CustomNodeDeployment[]> {
		return await this.find({
			where: { status: 'deployed' },
			relations: ['node'],
			order: { deployedAt: 'DESC' },
		});
	}

	async getDeploymentHistory(nodeId: string, limit = 10): Promise<CustomNodeDeployment[]> {
		return await this.find({
			where: { nodeId },
			relations: ['node'],
			order: { createdAt: 'DESC' },
			take: limit,
		});
	}
}
