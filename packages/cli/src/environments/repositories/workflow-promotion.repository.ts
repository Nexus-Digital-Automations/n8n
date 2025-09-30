import { Service } from '@n8n/di';
import { DataSource, Repository, WorkflowPromotionEntity } from '@n8n/db';

import type { PromotionStatus } from '@n8n/db';
import type { WorkflowPromotionResult } from '../types';

@Service()
export class WorkflowPromotionRepository extends Repository<WorkflowPromotionEntity> {
	constructor(dataSource: DataSource) {
		super(WorkflowPromotionEntity, dataSource.manager);
	}

	async create(data: {
		workflowId: string;
		sourceEnvironmentId: string;
		targetEnvironmentId: string;
		status: PromotionStatus;
		metadata: Record<string, unknown>;
		performedBy: string;
	}): Promise<WorkflowPromotionEntity> {
		const promotion = this.manager.create(WorkflowPromotionEntity, data);
		return await this.save(promotion);
	}

	async findById(id: string): Promise<WorkflowPromotionEntity | null> {
		return await this.findOne({
			where: { id },
		});
	}

	async findByWorkflow(workflowId: string, limit: number = 10): Promise<WorkflowPromotionResult[]> {
		const promotions = await this.find({
			where: { workflowId },
			order: { createdAt: 'DESC' },
			take: limit,
		});

		return promotions.map(this.toPromotionResult);
	}

	async findBySourceEnvironment(environmentId: string): Promise<WorkflowPromotionResult[]> {
		const promotions = await this.find({
			where: { sourceEnvironmentId: environmentId },
			order: { createdAt: 'DESC' },
		});

		return promotions.map(this.toPromotionResult);
	}

	async findByTargetEnvironment(environmentId: string): Promise<WorkflowPromotionResult[]> {
		const promotions = await this.find({
			where: { targetEnvironmentId: environmentId },
			order: { createdAt: 'DESC' },
		});

		return promotions.map(this.toPromotionResult);
	}

	async update(
		id: string,
		updates: {
			status?: PromotionStatus;
			completedAt?: Date;
			errors?: Array<unknown>;
			backupId?: string;
			validationResults?: Array<unknown>;
		},
	): Promise<WorkflowPromotionEntity> {
		await this.manager.update(WorkflowPromotionEntity, id, {
			...updates,
			updatedAt: new Date(),
		});
		const updated = await this.findOne({ where: { id } });
		if (!updated) {
			throw new Error('Workflow promotion not found after update');
		}
		return updated;
	}

	async updateStatus(id: string, status: PromotionStatus): Promise<void> {
		await this.update(id, { status });
	}

	private toPromotionResult(entity: WorkflowPromotionEntity): WorkflowPromotionResult {
		return {
			id: entity.id,
			workflowId: entity.workflowId,
			sourceEnvironmentId: entity.sourceEnvironmentId,
			targetEnvironmentId: entity.targetEnvironmentId,
			status: entity.status,
			startedAt: entity.createdAt,
			completedAt: entity.completedAt,
			errors: entity.errors,
			backupId: entity.backupId,
			validationResults: entity.validationResults,
			metadata: entity.metadata || {},
			performedBy: entity.performedBy,
		};
	}
}
