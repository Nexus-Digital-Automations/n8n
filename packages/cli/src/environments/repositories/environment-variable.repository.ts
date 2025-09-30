import { DataSource, Repository, EnvironmentVariableEntity } from '@n8n/db';
import { Service } from '@n8n/di';

@Service()
export class EnvironmentVariableRepository extends Repository<EnvironmentVariableEntity> {
	constructor(dataSource: DataSource) {
		super(EnvironmentVariableEntity, dataSource.manager);
	}

	async create(data: {
		environmentId: string;
		key: string;
		value: string;
		encrypted: boolean;
		description?: string;
		metadata: Record<string, unknown>;
		createdBy: string;
	}): Promise<EnvironmentVariableEntity> {
		const variable = this.manager.create(EnvironmentVariableEntity, data);
		return await this.save(variable);
	}

	async findByEnvironment(environmentId: string): Promise<EnvironmentVariableEntity[]> {
		return await this.find({
			where: { environmentId },
			order: { key: 'ASC' },
		});
	}

	async findByKey(environmentId: string, key: string): Promise<EnvironmentVariableEntity | null> {
		return await this.findOne({
			where: {
				environmentId,
				key,
			},
		});
	}

	async update(
		id: string,
		updates: {
			value?: string;
			encrypted?: boolean;
			description?: string;
			metadata?: Record<string, unknown>;
		},
	): Promise<EnvironmentVariableEntity> {
		await this.manager.update(EnvironmentVariableEntity, id, {
			...updates,
			updatedAt: new Date(),
		});
		const updated = await this.findOne({ where: { id } });
		if (!updated) {
			throw new Error('Environment variable not found after update');
		}
		return updated;
	}

	async deleteByEnvironment(environmentId: string): Promise<void> {
		await this.delete({ environmentId });
	}

	async delete(id: string): Promise<void> {
		await this.manager.delete(EnvironmentVariableEntity, id);
	}

	async countByEnvironment(environmentId: string): Promise<number> {
		return await this.count({
			where: { environmentId },
		});
	}
}
