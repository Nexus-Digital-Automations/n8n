import { Service } from '@n8n/di';
import { DataSource, Repository, WorkflowBackupEntity } from '@n8n/db';

import type { WorkflowBackup } from '../types';

@Service()
export class WorkflowBackupRepository extends Repository<WorkflowBackupEntity> {
	constructor(dataSource: DataSource) {
		super(WorkflowBackupEntity, dataSource.manager);
	}

	async create(data: {
		workflowId: string;
		environmentId: string;
		workflowData: unknown;
		metadata: Record<string, unknown>;
		createdBy: string;
	}): Promise<WorkflowBackupEntity> {
		const backup = this.manager.create(WorkflowBackupEntity, data);
		return await this.save(backup);
	}

	async findById(id: string): Promise<WorkflowBackup | null> {
		const entity = await this.findOne({
			where: { id },
		});

		if (!entity) {
			return null;
		}

		return this.toWorkflowBackup(entity);
	}

	async findByWorkflow(workflowId: string, limit: number = 10): Promise<WorkflowBackup[]> {
		const backups = await this.find({
			where: { workflowId },
			order: { createdAt: 'DESC' },
			take: limit,
		});

		return backups.map(this.toWorkflowBackup);
	}

	async findByEnvironment(environmentId: string, limit: number = 10): Promise<WorkflowBackup[]> {
		const backups = await this.find({
			where: { environmentId },
			order: { createdAt: 'DESC' },
			take: limit,
		});

		return backups.map(this.toWorkflowBackup);
	}

	async deleteOldBackups(retentionDays: number): Promise<number> {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

		const result = await this.createQueryBuilder()
			.delete()
			.where('createdAt < :cutoffDate', { cutoffDate })
			.execute();

		return result.affected || 0;
	}

	private toWorkflowBackup(entity: WorkflowBackupEntity): WorkflowBackup {
		return {
			id: entity.id,
			workflowId: entity.workflowId,
			environmentId: entity.environmentId,
			workflowData: entity.workflowData,
			metadata: entity.metadata || {},
			createdAt: entity.createdAt,
			createdBy: entity.createdBy,
		};
	}
}
