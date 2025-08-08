import { Service } from '@n8n/di';
import { DataSource, Repository } from '@n8n/typeorm';
import { NotificationSettingsEntity } from '../entities/notification-settings.entity';

/**
 * Repository for notification settings operations
 */
@Service()
export class NotificationSettingsRepository extends Repository<NotificationSettingsEntity> {
	constructor(dataSource: DataSource) {
		super(NotificationSettingsEntity, dataSource.manager);
	}

	/**
	 * Find notification settings by workflow ID
	 */
	async findByWorkflowId(workflowId: string): Promise<NotificationSettingsEntity[]> {
		return await this.find({
			where: { workflowId },
			relations: ['user', 'workflow'],
		});
	}

	/**
	 * Find notification settings by user ID
	 */
	async findByUserId(userId: string): Promise<NotificationSettingsEntity[]> {
		return await this.find({
			where: { userId },
			relations: ['user', 'workflow'],
		});
	}

	/**
	 * Find notification settings by workflow and user
	 */
	async findByWorkflowAndUser(
		workflowId: string,
		userId: string,
	): Promise<NotificationSettingsEntity | null> {
		return await this.findOne({
			where: { workflowId, userId },
			relations: ['user', 'workflow'],
		});
	}

	/**
	 * Get all enabled notification settings for a workflow
	 */
	async findEnabledByWorkflowId(workflowId: string): Promise<NotificationSettingsEntity[]> {
		return await this.find({
			where: { workflowId, enabled: true },
			relations: ['user', 'workflow'],
		});
	}

	/**
	 * Create or update notification settings
	 */
	async upsertSettings(
		workflowId: string,
		userId: string,
		settings: Partial<NotificationSettingsEntity>,
	): Promise<NotificationSettingsEntity> {
		const existing = await this.findByWorkflowAndUser(workflowId, userId);
		
		if (existing) {
			Object.assign(existing, settings);
			return await this.save(existing);
		} else {
			const newSettings = this.create({
				workflowId,
				userId,
				...settings,
			});
			return await this.save(newSettings);
		}
	}

	/**
	 * Delete notification settings by workflow ID
	 */
	async deleteByWorkflowId(workflowId: string): Promise<void> {
		await this.delete({ workflowId });
	}

	/**
	 * Delete notification settings by user ID
	 */
	async deleteByUserId(userId: string): Promise<void> {
		await this.delete({ userId });
	}

	/**
	 * Get notification settings count by channel type
	 */
	async getChannelUsageStats(): Promise<Record<string, number>> {
		const settings = await this.find({
			where: { enabled: true },
		});

		const stats: Record<string, number> = {};
		
		settings.forEach(setting => {
			setting.channels.forEach(channel => {
				stats[channel] = (stats[channel] || 0) + 1;
			});
		});

		return stats;
	}

	/**
	 * Get notification settings with batch enabled
	 */
	async findBatchEnabled(): Promise<NotificationSettingsEntity[]> {
		return await this.find({
			where: { enabled: true, batchEnabled: true },
			relations: ['user', 'workflow'],
		});
	}
}