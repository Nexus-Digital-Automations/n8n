import {
	BeforeUpdate,
	Column,
	Entity,
	Generated,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryColumn,
	RelationId,
} from '@n8n/typeorm';

import { WithTimestampsAndStringId, jsonColumnType } from './abstract-entity';
import { User } from './user';
import { WorkflowEntity } from './workflow-entity';

export interface NotificationChannelConfig {
	email?: {
		recipients: string[];
		subject?: string;
		template?: string;
	};
	webhook?: {
		url: string;
		secret?: string;
		headers?: Record<string, string>;
	};
	slack?: {
		webhookUrl: string;
		channel: string;
		username?: string;
		iconEmoji?: string;
	};
	teams?: {
		webhookUrl: string;
	};
	discord?: {
		webhookUrl: string;
	};
	pagerduty?: {
		routingKey: string;
		severity: 'critical' | 'error' | 'warning' | 'info';
	};
}

/**
 * Entity for storing notification settings per workflow and user
 */
@Entity('notification_settings')
@Index(['workflowId', 'userId'], { unique: true })
export class NotificationSettingsEntity extends WithTimestampsAndStringId {
	@Generated('uuid')
	@PrimaryColumn('uuid')
	id: string;

	@Column('uuid')
	@RelationId((notificationSettings: NotificationSettingsEntity) => notificationSettings.workflow)
	workflowId: string;

	@Column('uuid')
	@RelationId((notificationSettings: NotificationSettingsEntity) => notificationSettings.user)
	userId: string;

	@Column({ type: 'boolean', default: true })
	enabled: boolean;

	@Column({ type: jsonColumnType, default: '[]' })
	channels: string[];

	@Column({ type: 'int', default: 5 })
	rateLimitPerMinute: number;

	@Column({ type: 'boolean', default: false })
	batchEnabled: boolean;

	@Column({ type: 'int', default: 300 })
	batchInterval: number;

	@Column({ type: jsonColumnType, default: '{}' })
	config: NotificationChannelConfig;

	@ManyToOne(() => WorkflowEntity, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'workflowId' })
	workflow: WorkflowEntity;

	@ManyToOne(() => User, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'userId' })
	user: User;

	@BeforeUpdate()
	setUpdateDate(): void {
		this.updatedAt = new Date();
	}
}