import { DataSource, Repository, EnvironmentCredentialEntity } from '@n8n/db';
import { Service } from '@n8n/di';

@Service()
export class EnvironmentCredentialRepository extends Repository<EnvironmentCredentialEntity> {
	constructor(dataSource: DataSource) {
		super(EnvironmentCredentialEntity, dataSource.manager);
	}

	async create(data: {
		environmentId: string;
		credentialId: string;
		encryptedData: string;
		isActive: boolean;
		metadata: Record<string, unknown>;
		createdBy: string;
	}): Promise<EnvironmentCredentialEntity> {
		const envCredential = this.manager.create(EnvironmentCredentialEntity, data);
		return await this.save(envCredential);
	}

	async findByEnvironment(
		environmentId: string,
		includeInactive: boolean = false,
	): Promise<EnvironmentCredentialEntity[]> {
		const where: Record<string, unknown> = { environmentId };

		if (!includeInactive) {
			where.isActive = true;
		}

		return await this.find({
			where,
			relations: ['credential'],
		});
	}

	async findByEnvironmentAndCredential(
		environmentId: string,
		credentialId: string,
	): Promise<EnvironmentCredentialEntity | null> {
		return await this.findOne({
			where: {
				environmentId,
				credentialId,
			},
			relations: ['credential'],
		});
	}

	async update(
		id: string,
		updates: {
			encryptedData?: string;
			isActive?: boolean;
			metadata?: Record<string, unknown>;
		},
	): Promise<EnvironmentCredentialEntity> {
		await this.manager.update(EnvironmentCredentialEntity, id, {
			...updates,
			updatedAt: new Date(),
		});
		const updated = await this.findOne({ where: { id } });
		if (!updated) {
			throw new Error('Environment credential not found after update');
		}
		return updated;
	}

	async deleteByEnvironment(environmentId: string): Promise<void> {
		await this.delete({ environmentId });
	}

	async delete(id: string): Promise<void> {
		await this.manager.delete(EnvironmentCredentialEntity, id);
	}
}
