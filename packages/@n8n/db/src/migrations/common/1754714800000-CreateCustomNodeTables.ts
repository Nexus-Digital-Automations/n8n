import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class CreateCustomNodeTables1754714800000 implements ReversibleMigration {
	async up({ escape, runQuery, dbType }: MigrationContext) {
		const customNodeTable = escape.tableName('custom_node');
		const deploymentTable = escape.tableName('custom_node_deployment');

		// Create custom_node table
		await runQuery(`
			CREATE TABLE ${customNodeTable} (
				${escape.columnName('id')} ${dbType === 'sqlite' ? 'TEXT PRIMARY KEY' : 'UUID PRIMARY KEY DEFAULT gen_random_uuid()'},
				${escape.columnName('name')} VARCHAR(255) NOT NULL,
				${escape.columnName('version')} VARCHAR(50) NOT NULL,
				${escape.columnName('description')} TEXT,
				${escape.columnName('authorId')} ${dbType === 'sqlite' ? 'TEXT' : 'UUID'},
				${escape.columnName('category')} VARCHAR(100),
				${escape.columnName('tags')} ${dbType === 'postgresdb' ? 'TEXT[]' : 'TEXT'},
				${escape.columnName('status')} VARCHAR(50) DEFAULT 'uploaded',
				${escape.columnName('filePath')} TEXT NOT NULL,
				${escape.columnName('fileSize')} BIGINT,
				${escape.columnName('nodeTypes')} ${dbType === 'postgresdb' ? 'JSONB' : 'TEXT'},
				${escape.columnName('metadata')} ${dbType === 'postgresdb' ? "JSONB DEFAULT '{}'::jsonb" : "TEXT DEFAULT '{}'"},
				${escape.columnName('validationResults')} ${dbType === 'postgresdb' ? 'JSONB' : 'TEXT'},
				${escape.columnName('validatedAt')} TIMESTAMP,
				${escape.columnName('deployedAt')} TIMESTAMP,
				${escape.columnName('isActive')} BOOLEAN DEFAULT FALSE,
				${escape.columnName('createdAt')} TIMESTAMP DEFAULT ${dbType === 'postgresdb' ? 'NOW()' : 'CURRENT_TIMESTAMP'},
				${escape.columnName('updatedAt')} TIMESTAMP DEFAULT ${dbType === 'postgresdb' ? 'NOW()' : 'CURRENT_TIMESTAMP'},
				UNIQUE(${escape.columnName('name')}, ${escape.columnName('version')})
			)
		`);

		// Create custom_node_deployment table
		await runQuery(`
			CREATE TABLE ${deploymentTable} (
				${escape.columnName('id')} ${dbType === 'sqlite' ? 'TEXT PRIMARY KEY' : 'UUID PRIMARY KEY DEFAULT gen_random_uuid()'},
				${escape.columnName('nodeId')} ${dbType === 'sqlite' ? 'TEXT' : 'UUID'} NOT NULL,
				${escape.columnName('version')} VARCHAR(50) NOT NULL,
				${escape.columnName('environment')} VARCHAR(50) DEFAULT 'production',
				${escape.columnName('status')} VARCHAR(50) DEFAULT 'queued',
				${escape.columnName('deployedBy')} ${dbType === 'sqlite' ? 'TEXT' : 'UUID'},
				${escape.columnName('deployedAt')} TIMESTAMP,
				${escape.columnName('rollbackAvailable')} BOOLEAN DEFAULT FALSE,
				${escape.columnName('deploymentConfig')} ${dbType === 'postgresdb' ? "JSONB DEFAULT '{}'::jsonb" : "TEXT DEFAULT '{}'"},
				${escape.columnName('errorMessage')} TEXT,
				${escape.columnName('startedAt')} TIMESTAMP,
				${escape.columnName('completedAt')} TIMESTAMP,
				${escape.columnName('estimatedDuration')} INTEGER,
				${escape.columnName('createdAt')} TIMESTAMP DEFAULT ${dbType === 'postgresdb' ? 'NOW()' : 'CURRENT_TIMESTAMP'},
				${escape.columnName('updatedAt')} TIMESTAMP DEFAULT ${dbType === 'postgresdb' ? 'NOW()' : 'CURRENT_TIMESTAMP'},
				CONSTRAINT ${escape.tableName('fk_custom_node_deployment_node')} 
					FOREIGN KEY (${escape.columnName('nodeId')}) 
					REFERENCES ${customNodeTable}(${escape.columnName('id')}) 
					ON DELETE CASCADE
			)
		`);

		// Create indexes for better performance
		await runQuery(
			`CREATE INDEX ${escape.indexName('idx_custom_node_status')} ON ${customNodeTable}(${escape.columnName('status')})`,
		);
		await runQuery(
			`CREATE INDEX ${escape.indexName('idx_custom_node_author')} ON ${customNodeTable}(${escape.columnName('authorId')})`,
		);
		await runQuery(
			`CREATE INDEX ${escape.indexName('idx_custom_node_category')} ON ${customNodeTable}(${escape.columnName('category')})`,
		);

		if (dbType === 'postgresdb') {
			await runQuery(
				`CREATE INDEX ${escape.indexName('idx_custom_node_tags')} ON ${customNodeTable} USING gin(${escape.columnName('tags')})`,
			);
		}

		await runQuery(
			`CREATE INDEX ${escape.indexName('idx_deployment_node')} ON ${deploymentTable}(${escape.columnName('nodeId')})`,
		);
		await runQuery(
			`CREATE INDEX ${escape.indexName('idx_deployment_status')} ON ${deploymentTable}(${escape.columnName('status')})`,
		);
	}

	async down({ escape, runQuery }: MigrationContext) {
		const customNodeTable = escape.tableName('custom_node');
		const deploymentTable = escape.tableName('custom_node_deployment');

		await runQuery(`DROP TABLE IF EXISTS ${deploymentTable}`);
		await runQuery(`DROP TABLE IF EXISTS ${customNodeTable}`);
	}
}
