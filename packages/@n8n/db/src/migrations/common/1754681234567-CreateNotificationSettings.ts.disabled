import type { MigrationContext, ReversibleMigration } from '../migration-types';

/**
 * Migration to create notification settings table for workflow failure notifications
 */
export class CreateNotificationSettings1754681234567 implements ReversibleMigration {
	async up({
		schemaBuilder: { createTable, column },
	}: MigrationContext) {
		await createTable('notification_settings')
			.withColumns(
				column('id').uuid.primary.generated,
				column('workflowId').uuid.notNull,
				column('userId').uuid.notNull,
				column('enabled').boolean.notNull.default(true),
				column('channels').json.notNull.default("[]"),
				column('rateLimitPerMinute').int.notNull.default(5),
				column('batchEnabled').boolean.notNull.default(false),
				column('batchInterval').int.notNull.default(300),
				column('config').json.notNull.default("{}"),
			)
			.withForeignKey('workflowId', {
				tableName: 'workflow_entity',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('userId', {
				tableName: 'user',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withIndexOn(['workflowId'])
			.withIndexOn(['userId'])
			.withIndexOn(['workflowId', 'userId'], true)
			.withTimestamps;

		await createTable('notification_history')
			.withColumns(
				column('id').uuid.primary.generated,
				column('workflowId').uuid.notNull,
				column('executionId').uuid.notNull,
				column('userId').uuid.notNull,
				column('channel').varchar(50).notNull,
				column('status').varchar(20).notNull.default('pending'),
				column('error').text,
				column('sentAt').timestamp,
				column('retryCount').int.notNull.default(0),
				column('nextRetryAt').timestamp,
				column('metadata').json.notNull.default("{}"),
			)
			.withForeignKey('workflowId', {
				tableName: 'workflow_entity',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('executionId', {
				tableName: 'execution_entity',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('userId', {
				tableName: 'user',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withIndexOn(['workflowId'])
			.withIndexOn(['executionId'])
			.withIndexOn(['userId'])
			.withIndexOn(['status'])
			.withIndexOn(['nextRetryAt'])
			.withTimestamps;
	}

	async down({
		schemaBuilder: { dropTable },
	}: MigrationContext) {
		await dropTable('notification_history');
		await dropTable('notification_settings');
	}
}