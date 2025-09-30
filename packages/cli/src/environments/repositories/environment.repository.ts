import { Service } from '@n8n/di';
import { DataSource, Repository, EnvironmentEntity } from '@n8n/db';
import type { FindManyOptions, EnvironmentType, EnvironmentStatus } from '@n8n/db';

@Service()
export class EnvironmentRepository extends Repository<EnvironmentEntity> {
	constructor(dataSource: DataSource) {
		super(EnvironmentEntity, dataSource.manager);
	}

	async createEnvironment(data: {
		name: string;
		type: EnvironmentType;
		description?: string;
		status: EnvironmentStatus;
		config: Record<string, unknown>;
		createdBy: string;
		metadata: Record<string, unknown>;
	}): Promise<EnvironmentEntity> {
		const environment = this.create(data);
		return await this.save(environment);
	}

	async updateEnvironment(
		id: string,
		updates: {
			name?: string;
			description?: string;
			status?: EnvironmentStatus;
			config?: Record<string, unknown>;
			metadata?: Record<string, unknown>;
			updatedBy?: string;
		},
	): Promise<EnvironmentEntity> {
		await this.update(id, updates);
		const updated = await this.findById(id);
		if (!updated) {
			throw new Error('Environment not found after update');
		}
		return updated;
	}

	async deleteEnvironment(id: string): Promise<void> {
		await this.delete(id);
	}

	async findById(id: string): Promise<EnvironmentEntity | null> {
		return await this.findOne({
			where: { id },
		});
	}

	async findByName(name: string): Promise<EnvironmentEntity | null> {
		return await this.findOne({
			where: { name },
		});
	}

	async findAll(filters?: {
		type?: EnvironmentType;
		status?: EnvironmentStatus;
	}): Promise<EnvironmentEntity[]> {
		const options: FindManyOptions<EnvironmentEntity> = {};

		if (filters) {
			options.where = {};
			if (filters.type) {
				options.where.type = filters.type;
			}
			if (filters.status) {
				options.where.status = filters.status;
			}
		}

		return await this.find(options);
	}

	async findByType(type: EnvironmentType): Promise<EnvironmentEntity[]> {
		return await this.find({
			where: { type },
		});
	}

	async findByStatus(status: EnvironmentStatus): Promise<EnvironmentEntity[]> {
		return await this.find({
			where: { status },
		});
	}

	async countByType(type: EnvironmentType): Promise<number> {
		return await this.count({
			where: { type },
		});
	}

	async countByStatus(status: EnvironmentStatus): Promise<number> {
		return await this.count({
			where: { status },
		});
	}
}
