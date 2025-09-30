import { DataSource, Repository, EnvironmentConfigEntity } from '@n8n/db';
import { Service } from '@n8n/di';

@Service()
export class EnvironmentConfigRepository extends Repository<EnvironmentConfigEntity> {
	constructor(dataSource: DataSource) {
		super(EnvironmentConfigEntity, dataSource.manager);
	}

	async setConfiguration(
		environmentId: string,
		config: Record<string, unknown>,
		updatedBy?: string,
	): Promise<EnvironmentConfigEntity> {
		// Check if configuration already exists
		const existing = await this.findOne({
			where: { environmentId },
		});

		if (existing) {
			// Update existing configuration
			existing.config = config;
			existing.version = existing.version + 1;
			existing.updatedBy = updatedBy;
			existing.updatedAt = new Date();
			return await this.save(existing);
		} else {
			// Create new configuration
			const newConfig = this.create({
				environmentId,
				config,
				version: 1,
				updatedBy,
			});
			return await this.save(newConfig);
		}
	}

	async getConfiguration(environmentId: string): Promise<Record<string, unknown> | null> {
		const configEntity = await this.findOne({
			where: { environmentId },
		});

		return configEntity ? (configEntity.config as Record<string, unknown>) : null;
	}

	async deleteConfiguration(environmentId: string): Promise<void> {
		await this.delete({ environmentId });
	}

	async getConfigurationHistory(
		environmentId: string,
		limit: number = 10,
	): Promise<Array<{ timestamp: Date; config: Record<string, unknown>; changedBy?: string }>> {
		// This is a simplified implementation
		// In a production system, you would maintain a separate history table
		const current = await this.findOne({
			where: { environmentId },
		});

		if (!current) {
			return [];
		}

		return [
			{
				timestamp: current.updatedAt,
				config: current.config as Record<string, unknown>,
				changedBy: current.updatedBy,
			},
		];
	}
}
