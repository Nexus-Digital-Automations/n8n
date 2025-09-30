import type { MigrationContext, ReversibleMigration } from '@/databases/types';

/**
 * Migration to add environment management tables.
 *
 * This migration creates the following tables:
 * - environment: Core environment configuration
 * - environment_config: Environment-specific settings
 * - environment_credential: Environment-specific credentials with encryption
 * - environment_variable: Environment variables with encryption support
 * - workflow_promotion: Workflow promotion history and tracking
 * - workflow_backup: Workflow backups for rollback support
 */
export class AddEnvironmentManagement1740000000000 implements ReversibleMigration {
	async up({ schemaBuilder, tablePrefix, isMysql, isPostgres }: MigrationContext): Promise<void> {
		// Create environment table
		await schemaBuilder.createTable(`${tablePrefix}environment`, (table) => {
			table
				.string('id', 36)
				.primary()
				.notNullable()
				.defaultTo(isMysql ? '(UUID())' : isPostgres ? 'gen_random_uuid()' : "('')");
			table.string('name', 128).notNullable().unique();
			table.string('type', 50).notNullable();
			table.text('description').nullable();
			table.string('status', 50).notNullable().defaultTo('active');
			table.json('config').nullable();
			table.json('metadata').nullable();
			table.string('createdBy', 36).notNullable();
			table.string('updatedBy', 36).nullable();
			table.timestamp('createdAt').notNullable().defaultTo(schemaBuilder.fn.now());
			table.timestamp('updatedAt').notNullable().defaultTo(schemaBuilder.fn.now());

			// Indexes
			table.index(['type'], `${tablePrefix}idx_environment_type`);
			table.index(['status'], `${tablePrefix}idx_environment_status`);
		});

		// Create environment_config table
		await schemaBuilder.createTable(`${tablePrefix}environment_config`, (table) => {
			table
				.string('id', 36)
				.primary()
				.notNullable()
				.defaultTo(isMysql ? '(UUID())' : isPostgres ? 'gen_random_uuid()' : "('')");
			table.string('environmentId', 36).notNullable().unique();
			table.json('config').notNullable();
			table.integer('version').notNullable().defaultTo(1);
			table.string('updatedBy', 36).nullable();
			table.timestamp('createdAt').notNullable().defaultTo(schemaBuilder.fn.now());
			table.timestamp('updatedAt').notNullable().defaultTo(schemaBuilder.fn.now());

			// Foreign key
			table
				.foreign('environmentId')
				.references('id')
				.inTable(`${tablePrefix}environment`)
				.onDelete('CASCADE');
		});

		// Create environment_credential table
		await schemaBuilder.createTable(`${tablePrefix}environment_credential`, (table) => {
			table
				.string('id', 36)
				.primary()
				.notNullable()
				.defaultTo(isMysql ? '(UUID())' : isPostgres ? 'gen_random_uuid()' : "('')");
			table.string('environmentId', 36).notNullable();
			table.string('credentialId', 36).notNullable();
			table.text('encryptedData').notNullable();
			table.boolean('isActive').notNullable().defaultTo(true);
			table.json('metadata').nullable();
			table.string('createdBy', 36).notNullable();
			table.timestamp('createdAt').notNullable().defaultTo(schemaBuilder.fn.now());
			table.timestamp('updatedAt').notNullable().defaultTo(schemaBuilder.fn.now());

			// Indexes
			table.index(['environmentId'], `${tablePrefix}idx_env_cred_environment`);
			table.index(['credentialId'], `${tablePrefix}idx_env_cred_credential`);
			table.unique(['environmentId', 'credentialId'], `${tablePrefix}idx_env_cred_unique`);

			// Foreign keys
			table
				.foreign('environmentId')
				.references('id')
				.inTable(`${tablePrefix}environment`)
				.onDelete('CASCADE');
			table
				.foreign('credentialId')
				.references('id')
				.inTable(`${tablePrefix}credentials_entity`)
				.onDelete('CASCADE');
		});

		// Create environment_variable table
		await schemaBuilder.createTable(`${tablePrefix}environment_variable`, (table) => {
			table
				.string('id', 36)
				.primary()
				.notNullable()
				.defaultTo(isMysql ? '(UUID())' : isPostgres ? 'gen_random_uuid()' : "('')");
			table.string('environmentId', 36).notNullable();
			table.string('key', 255).notNullable();
			table.text('value').notNullable();
			table.boolean('encrypted').notNullable().defaultTo(false);
			table.text('description').nullable();
			table.json('metadata').nullable();
			table.string('createdBy', 36).notNullable();
			table.timestamp('createdAt').notNullable().defaultTo(schemaBuilder.fn.now());
			table.timestamp('updatedAt').notNullable().defaultTo(schemaBuilder.fn.now());

			// Indexes
			table.index(['environmentId'], `${tablePrefix}idx_env_var_environment`);
			table.unique(['environmentId', 'key'], `${tablePrefix}idx_env_var_unique`);

			// Foreign key
			table
				.foreign('environmentId')
				.references('id')
				.inTable(`${tablePrefix}environment`)
				.onDelete('CASCADE');
		});

		// Create workflow_promotion table
		await schemaBuilder.createTable(`${tablePrefix}workflow_promotion`, (table) => {
			table
				.string('id', 36)
				.primary()
				.notNullable()
				.defaultTo(isMysql ? '(UUID())' : isPostgres ? 'gen_random_uuid()' : "('')");
			table.string('workflowId', 36).notNullable();
			table.string('sourceEnvironmentId', 36).notNullable();
			table.string('targetEnvironmentId', 36).notNullable();
			table.string('status', 50).notNullable().defaultTo('pending');
			table.timestamp('completedAt').nullable();
			table.json('errors').nullable();
			table.string('backupId', 36).nullable();
			table.json('validationResults').nullable();
			table.json('metadata').nullable();
			table.string('performedBy', 36).notNullable();
			table.timestamp('createdAt').notNullable().defaultTo(schemaBuilder.fn.now());
			table.timestamp('updatedAt').notNullable().defaultTo(schemaBuilder.fn.now());

			// Indexes
			table.index(['workflowId'], `${tablePrefix}idx_promotion_workflow`);
			table.index(['sourceEnvironmentId'], `${tablePrefix}idx_promotion_source`);
			table.index(['targetEnvironmentId'], `${tablePrefix}idx_promotion_target`);
			table.index(['status'], `${tablePrefix}idx_promotion_status`);

			// Foreign keys
			table
				.foreign('workflowId')
				.references('id')
				.inTable(`${tablePrefix}workflow_entity`)
				.onDelete('CASCADE');
			table
				.foreign('sourceEnvironmentId')
				.references('id')
				.inTable(`${tablePrefix}environment`)
				.onDelete('CASCADE');
			table
				.foreign('targetEnvironmentId')
				.references('id')
				.inTable(`${tablePrefix}environment`)
				.onDelete('CASCADE');
		});

		// Create workflow_backup table
		await schemaBuilder.createTable(`${tablePrefix}workflow_backup`, (table) => {
			table
				.string('id', 36)
				.primary()
				.notNullable()
				.defaultTo(isMysql ? '(UUID())' : isPostgres ? 'gen_random_uuid()' : "('')");
			table.string('workflowId', 36).notNullable();
			table.string('environmentId', 36).notNullable();
			table.json('workflowData').notNullable();
			table.json('metadata').nullable();
			table.string('createdBy', 36).notNullable();
			table.timestamp('createdAt').notNullable().defaultTo(schemaBuilder.fn.now());
			table.timestamp('updatedAt').notNullable().defaultTo(schemaBuilder.fn.now());

			// Indexes
			table.index(['workflowId'], `${tablePrefix}idx_backup_workflow`);
			table.index(['environmentId'], `${tablePrefix}idx_backup_environment`);

			// Foreign keys
			table
				.foreign('workflowId')
				.references('id')
				.inTable(`${tablePrefix}workflow_entity`)
				.onDelete('CASCADE');
			table
				.foreign('environmentId')
				.references('id')
				.inTable(`${tablePrefix}environment`)
				.onDelete('CASCADE');
		});
	}

	async down({ schemaBuilder, tablePrefix }: MigrationContext): Promise<void> {
		// Drop tables in reverse order to respect foreign key constraints
		await schemaBuilder.dropTable(`${tablePrefix}workflow_backup`);
		await schemaBuilder.dropTable(`${tablePrefix}workflow_promotion`);
		await schemaBuilder.dropTable(`${tablePrefix}environment_variable`);
		await schemaBuilder.dropTable(`${tablePrefix}environment_credential`);
		await schemaBuilder.dropTable(`${tablePrefix}environment_config`);
		await schemaBuilder.dropTable(`${tablePrefix}environment`);
	}
}
