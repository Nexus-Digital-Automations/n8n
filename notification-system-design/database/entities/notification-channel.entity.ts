/**
 * Database entities for the notification system
 * Following n8n's TypeORM entity patterns
 */

import { BaseEntity, Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, OneToMany, ManyToOne, JoinColumn } from '@n8n/typeorm';
import type {
	NotificationChannelType,
	NotificationChannelConfig,
	RateLimitConfig,
	RetryConfig,
} from '../../interfaces/notification-channel.interface';

@Entity('notification_channel')
@Index(['enabled', 'type'])
@Index(['projectId', 'enabled'])
export class NotificationChannelEntity extends BaseEntity {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('varchar', { length: 255 })
	name: string;

	@Column('varchar', { length: 50 })
	type: NotificationChannelType;

	@Column('boolean', { default: true })
	enabled: boolean;

	@Column('text', { nullable: true })
	description?: string;

	@Column('json')
	configuration: NotificationChannelConfig;

	@Column('json', { nullable: true })
	rateLimits?: RateLimitConfig;

	@Column('json', { nullable: true })
	retryConfig?: RetryConfig;

	@Column('simple-array', { nullable: true })
	tags?: string[];

	@Column('simple-array', { nullable: true })
	environments?: string[];

	@Column('varchar', { length: 36, nullable: true })
	projectId?: string;

	@Column('varchar', { length: 36 })
	ownerId: string;

	@Column('varchar', { length: 36, nullable: true })
	teamId?: string;

	@CreateDateColumn()
	createdAt: Date;

	@UpdateDateColumn()
	updatedAt: Date;

	@Column('varchar', { length: 36 })
	createdBy: string;

	@Column('varchar', { length: 36 })
	updatedBy: string;

	// Relationships
	@OneToMany(() => NotificationTemplateEntity, template => template.channel)
	templates: NotificationTemplateEntity[];

	@OneToMany(() => NotificationHistoryEntity, notification => notification.channel)
	notifications: NotificationHistoryEntity[];

	@OneToMany(() => AlertRuleActionEntity, action => action.notificationChannel)
	alertRuleActions: AlertRuleActionEntity[];
}

@Entity('notification_template')
@Index(['channelId', 'alertType'])
export class NotificationTemplateEntity extends BaseEntity {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('varchar', { length: 255 })
	name: string;

	@Column('varchar', { length: 50 })
	alertType: string;

	@Column('text')
	subject?: string;

	@Column('text')
	bodyTemplate: string;

	@Column('text', { nullable: true })
	textTemplate?: string;

	@Column('json', { nullable: true })
	variables?: any[];

	@Column('json', { nullable: true })
	conditions?: any[];

	@Column('json', { nullable: true })
	attachments?: any[];

	@Column('boolean', { default: true })
	enabled: boolean;

	@Column('varchar', { length: 36 })
	channelId: string;

	@Column('varchar', { length: 36, nullable: true })
	projectId?: string;

	@CreateDateColumn()
	createdAt: Date;

	@UpdateDateColumn()
	updatedAt: Date;

	@Column('varchar', { length: 36 })
	createdBy: string;

	@Column('varchar', { length: 36 })
	updatedBy: string;

	// Relationships
	@ManyToOne(() => NotificationChannelEntity, channel => channel.templates, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'channelId' })
	channel: NotificationChannelEntity;
}

@Entity('alert_rule')
@Index(['enabled', 'priority'])
@Index(['projectId', 'enabled'])
@Index(['environment', 'enabled'])
export class AlertRuleEntity extends BaseEntity {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('varchar', { length: 255 })
	name: string;

	@Column('text', { nullable: true })
	description?: string;

	@Column('boolean', { default: true })
	enabled: boolean;

	@Column('int', { default: 100 })
	priority: number;

	@Column('json')
	conditions: any[];

	@Column('json')
	actions: any[];

	@Column('varchar', { length: 100, nullable: true })
	category?: string;

	@Column('simple-array', { nullable: true })
	tags?: string[];

	@Column('varchar', { length: 50, nullable: true })
	environment?: string;

	@Column('varchar', { length: 36, nullable: true })
	projectId?: string;

	@Column('json', { nullable: true })
	rateLimits?: any;

	@Column('json', { nullable: true })
	schedule?: any;

	@Column('timestamp', { nullable: true })
	expiresAt?: Date;

	@Column('int', { default: 1 })
	version: number;

	@Column('varchar', { length: 500, nullable: true })
	documentationUrl?: string;

	@CreateDateColumn()
	createdAt: Date;

	@UpdateDateColumn()
	updatedAt: Date;

	@Column('varchar', { length: 36 })
	createdBy: string;

	@Column('varchar', { length: 36 })
	updatedBy: string;

	// Relationships
	@OneToMany(() => AlertRuleActionEntity, action => action.alertRule)
	ruleActions: AlertRuleActionEntity[];

	@OneToMany(() => AlertRuleEvaluationHistoryEntity, evaluation => evaluation.alertRule)
	evaluationHistory: AlertRuleEvaluationHistoryEntity[];
}

@Entity('alert_rule_action')
export class AlertRuleActionEntity extends BaseEntity {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('varchar', { length: 36 })
	alertRuleId: string;

	@Column('varchar', { length: 50 })
	actionType: string;

	@Column('varchar', { length: 50 })
	targetType: string;

	@Column('varchar', { length: 255 })
	targetId: string;

	@Column('json')
	parameters: any;

	@Column('json', { nullable: true })
	conditions?: any[];

	@Column('int', { default: 1 })
	executionOrder: number;

	@Column('boolean', { default: true })
	enabled: boolean;

	@CreateDateColumn()
	createdAt: Date;

	@UpdateDateColumn()
	updatedAt: Date;

	// Relationships
	@ManyToOne(() => AlertRuleEntity, rule => rule.ruleActions, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'alertRuleId' })
	alertRule: AlertRuleEntity;

	@ManyToOne(() => NotificationChannelEntity, channel => channel.alertRuleActions, { nullable: true })
	@JoinColumn({ name: 'targetId' })
	notificationChannel?: NotificationChannelEntity;
}

@Entity('notification_history')
@Index(['alertId'])
@Index(['channelId', 'createdAt'])
@Index(['status', 'createdAt'])
@Index(['projectId', 'createdAt'])
export class NotificationHistoryEntity extends BaseEntity {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('varchar', { length: 255, nullable: true })
	messageId?: string;

	@Column('varchar', { length: 36 })
	alertId: string;

	@Column('varchar', { length: 36 })
	channelId: string;

	@Column('varchar', { length: 50 })
	channelType: string;

	@Column('varchar', { length: 50 })
	status: string;

	@Column('varchar', { length: 50 })
	alertType: string;

	@Column('varchar', { length: 50 })
	alertSeverity: string;

	@Column('varchar', { length: 36, nullable: true })
	projectId?: string;

	@Column('varchar', { length: 36, nullable: true })
	workflowId?: string;

	@Column('varchar', { length: 36, nullable: true })
	executionId?: string;

	@Column('int', { default: 1 })
	attempts: number;

	@Column('timestamp', { nullable: true })
	sentAt?: Date;

	@Column('timestamp', { nullable: true })
	deliveredAt?: Date;

	@Column('timestamp', { nullable: true })
	nextRetryAt?: Date;

	@Column('json', { nullable: true })
	error?: any;

	@Column('json', { nullable: true })
	metadata?: any;

	@Column('int', { nullable: true })
	responseTimeMs?: number;

	@Column('bigint', { nullable: true })
	payloadSizeBytes?: number;

	@CreateDateColumn()
	createdAt: Date;

	@UpdateDateColumn()
	updatedAt: Date;

	// Relationships
	@ManyToOne(() => NotificationChannelEntity, channel => channel.notifications)
	@JoinColumn({ name: 'channelId' })
	channel: NotificationChannelEntity;
}

@Entity('alert_processing_history')
@Index(['alertId'])
@Index(['requestId'])
@Index(['createdAt'])
export class AlertProcessingHistoryEntity extends BaseEntity {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('varchar', { length: 36 })
	alertId: string;

	@Column('varchar', { length: 255 })
	requestId: string;

	@Column('varchar', { length: 50 })
	alertType: string;

	@Column('varchar', { length: 50 })
	alertSeverity: string;

	@Column('varchar', { length: 36, nullable: true })
	projectId?: string;

	@Column('varchar', { length: 36, nullable: true })
	workflowId?: string;

	@Column('varchar', { length: 36, nullable: true })
	executionId?: string;

	@Column('int', { default: 0 })
	matchedRules: number;

	@Column('int', { default: 0 })
	totalNotifications: number;

	@Column('int', { default: 0 })
	successfulNotifications: number;

	@Column('int', { default: 0 })
	failedNotifications: number;

	@Column('int')
	processingTimeMs: number;

	@Column('json', { nullable: true })
	ruleEvaluationResults?: any[];

	@Column('json', { nullable: true })
	error?: any;

	@CreateDateColumn()
	createdAt: Date;
}

@Entity('alert_rule_evaluation_history')
@Index(['alertRuleId', 'createdAt'])
@Index(['matched', 'createdAt'])
export class AlertRuleEvaluationHistoryEntity extends BaseEntity {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('varchar', { length: 36 })
	alertRuleId: string;

	@Column('varchar', { length: 36 })
	alertId: string;

	@Column('varchar', { length: 255 })
	requestId: string;

	@Column('boolean')
	matched: boolean;

	@Column('decimal', { precision: 5, scale: 4 })
	score: number;

	@Column('simple-array', { nullable: true })
	matchingConditions?: string[];

	@Column('int', { default: 0 })
	actionsExecuted: number;

	@Column('int')
	evaluationTimeMs: number;

	@Column('json', { nullable: true })
	evaluationDetails?: any;

	@Column('json', { nullable: true })
	errors?: any[];

	@CreateDateColumn()
	createdAt: Date;

	// Relationships
	@ManyToOne(() => AlertRuleEntity, rule => rule.evaluationHistory, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'alertRuleId' })
	alertRule: AlertRuleEntity;
}

@Entity('notification_rate_limit')
@Index(['channelId', 'windowStart'])
@Index(['ruleId', 'windowStart'])
export class NotificationRateLimitEntity extends BaseEntity {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('varchar', { length: 36, nullable: true })
	channelId?: string;

	@Column('varchar', { length: 36, nullable: true })
	ruleId?: string;

	@Column('varchar', { length: 50 })
	limitType: 'channel' | 'rule' | 'global';

	@Column('timestamp')
	windowStart: Date;

	@Column('int')
	windowDurationSeconds: number;

	@Column('int', { default: 0 })
	notificationCount: number;

	@Column('int')
	maxNotifications: number;

	@Column('timestamp', { nullable: true })
	resetAt?: Date;

	@CreateDateColumn()
	createdAt: Date;

	@UpdateDateColumn()
	updatedAt: Date;
}

@Entity('notification_queue_job')
@Index(['status', 'scheduledAt'])
@Index(['channelId', 'status'])
export class NotificationQueueJobEntity extends BaseEntity {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('varchar', { length: 36 })
	channelId: string;

	@Column('varchar', { length: 36 })
	alertId: string;

	@Column('varchar', { length: 50 })
	status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

	@Column('json')
	payload: any;

	@Column('int', { default: 0 })
	attempts: number;

	@Column('int', { default: 3 })
	maxAttempts: number;

	@Column('timestamp')
	scheduledAt: Date;

	@Column('timestamp', { nullable: true })
	startedAt?: Date;

	@Column('timestamp', { nullable: true })
	completedAt?: Date;

	@Column('json', { nullable: true })
	result?: any;

	@Column('json', { nullable: true })
	error?: any;

	@Column('timestamp', { nullable: true })
	nextRetryAt?: Date;

	@CreateDateColumn()
	createdAt: Date;

	@UpdateDateColumn()
	updatedAt: Date;
}

@Entity('notification_system_metrics')
@Index(['metricType', 'timestamp'])
export class NotificationSystemMetricsEntity extends BaseEntity {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('varchar', { length: 100 })
	metricType: string;

	@Column('varchar', { length: 100 })
	metricName: string;

	@Column('decimal', { precision: 15, scale: 6 })
	value: number;

	@Column('varchar', { length: 50, nullable: true })
	unit?: string;

	@Column('json', { nullable: true })
	tags?: Record<string, string>;

	@Column('timestamp')
	timestamp: Date;

	@CreateDateColumn()
	createdAt: Date;
}