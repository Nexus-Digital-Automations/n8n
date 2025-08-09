import type { MigrationContext, ReversibleMigration } from '@n8n/typeorm';

export class CreateCustomNodesSchema1754714580000 implements ReversibleMigration {
	async up({ queryRunner, tablePrefix }: MigrationContext) {
		// Create custom_node table
		await queryRunner.query(`
			CREATE TABLE ${tablePrefix}custom_node (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				name VARCHAR(255) NOT NULL,
				version VARCHAR(50) NOT NULL,
				description TEXT,
				category VARCHAR(100),
				tags TEXT,
				status VARCHAR(50) DEFAULT 'uploaded' NOT NULL,
				file_path TEXT NOT NULL,
				file_size BIGINT NOT NULL,
				node_types JSONB,
				metadata JSONB DEFAULT '{}' NOT NULL,
				validation_results JSONB,
				author_id UUID NOT NULL,
				validated_at TIMESTAMP,
				deployed_at TIMESTAMP,
				is_active BOOLEAN DEFAULT true NOT NULL,
				deleted_at TIMESTAMP,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
				updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
				CONSTRAINT FK_custom_node_author FOREIGN KEY (author_id) REFERENCES ${tablePrefix}user(id) ON DELETE CASCADE,
				CONSTRAINT UQ_custom_node_name_version UNIQUE (name, version)
			);
		`);

		// Create indexes for custom_node table
		await queryRunner.query(`
			CREATE INDEX IDX_custom_node_status ON ${tablePrefix}custom_node(status);
		`);
		await queryRunner.query(`
			CREATE INDEX IDX_custom_node_author ON ${tablePrefix}custom_node(author_id);
		`);
		await queryRunner.query(`
			CREATE INDEX IDX_custom_node_category ON ${tablePrefix}custom_node(category);
		`);
		await queryRunner.query(`
			CREATE INDEX IDX_custom_node_name ON ${tablePrefix}custom_node(name);
		`);
		await queryRunner.query(`
			CREATE INDEX IDX_custom_node_active ON ${tablePrefix}custom_node(is_active);
		`);

		// Create custom_node_deployment table
		await queryRunner.query(`
			CREATE TABLE ${tablePrefix}custom_node_deployment (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				custom_node_id UUID NOT NULL,
				version VARCHAR(50) NOT NULL,
				environment VARCHAR(50) DEFAULT 'production' NOT NULL,
				status VARCHAR(50) DEFAULT 'queued' NOT NULL,
				deployed_by UUID NOT NULL,
				deployed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
				rollback_available BOOLEAN DEFAULT false NOT NULL,
				deployment_config JSONB DEFAULT '{}' NOT NULL,
				error_message TEXT,
				completed_at TIMESTAMP,
				duration INTEGER,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
				updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
				CONSTRAINT FK_deployment_custom_node FOREIGN KEY (custom_node_id) REFERENCES ${tablePrefix}custom_node(id) ON DELETE CASCADE,
				CONSTRAINT FK_deployment_deployer FOREIGN KEY (deployed_by) REFERENCES ${tablePrefix}user(id) ON DELETE CASCADE
			);
		`);

		// Create indexes for custom_node_deployment table
		await queryRunner.query(`
			CREATE INDEX IDX_deployment_node ON ${tablePrefix}custom_node_deployment(custom_node_id);
		`);
		await queryRunner.query(`
			CREATE INDEX IDX_deployment_status ON ${tablePrefix}custom_node_deployment(status);
		`);
		await queryRunner.query(`
			CREATE INDEX IDX_deployment_environment ON ${tablePrefix}custom_node_deployment(environment);
		`);
		await queryRunner.query(`
			CREATE INDEX IDX_deployment_deployer ON ${tablePrefix}custom_node_deployment(deployed_by);
		`);
	}

	async down({ queryRunner, tablePrefix }: MigrationContext) {
		// Drop tables in reverse order due to foreign key constraints
		await queryRunner.query(`DROP TABLE IF EXISTS ${tablePrefix}custom_node_deployment`);
		await queryRunner.query(`DROP TABLE IF EXISTS ${tablePrefix}custom_node`);
	}
}
