import { createConnection, getConnection, Connection } from 'typeorm';
import { Container } from 'typedi';
import config from '@/config';

import { CustomNode } from '@/databases/entities/CustomNode';
import { CustomNodeDeployment } from '@/databases/entities/CustomNodeDeployment';
import { User } from '@/databases/entities/User';

let testConnection: Connection;

/**
 * Setup test database connection
 */
export async function setupTestDb(): Promise<Connection> {
	if (testConnection) {
		return testConnection;
	}

	const dbConfig = {
		type: 'sqlite' as const,
		database: ':memory:', // Use in-memory database for tests
		entities: [CustomNode, CustomNodeDeployment, User],
		synchronize: true, // Auto-create schema
		logging: false, // Disable logging during tests
		dropSchema: true, // Drop schema before creating
	};

	testConnection = await createConnection(dbConfig);

	// Register connection with Container for dependency injection
	Container.set('connection', testConnection);

	return testConnection;
}

/**
 * Teardown test database connection
 */
export async function teardownTestDb(): Promise<void> {
	if (testConnection && testConnection.isConnected) {
		await testConnection.close();
	}
}

/**
 * Clean database tables between tests
 */
export async function cleanDatabase(): Promise<void> {
	if (!testConnection) {
		return;
	}

	const entities = testConnection.entityMetadatas;

	for (const entity of entities) {
		const repository = testConnection.getRepository(entity.name);
		await repository.clear();
	}
}

/**
 * Create test data fixtures
 */
export async function createTestFixtures(): Promise<{
	testUser: User;
	testNodes: CustomNode[];
}> {
	const connection = getConnection();
	const userRepository = connection.getRepository(User);
	const nodeRepository = connection.getRepository(CustomNode);

	// Create test user
	const testUser = userRepository.create({
		id: 'test-user-id',
		email: 'test@example.com',
		firstName: 'Test',
		lastName: 'User',
		password: 'hashed-password',
		role: 'owner',
		createdAt: new Date(),
		updatedAt: new Date(),
	});
	await userRepository.save(testUser);

	// Create test nodes
	const testNodes = [
		nodeRepository.create({
			id: 'test-node-1',
			name: 'Test Node 1',
			description: 'First test node',
			filePath: '/tmp/test-node-1.zip',
			fileHash: 'hash1',
			fileSize: 1024,
			status: 'uploaded',
			metadata: {
				author: 'Test Author',
				version: '1.0.0',
				category: 'test',
				tags: ['test', 'integration'],
			},
			uploadedBy: testUser.id,
			createdAt: new Date(),
			updatedAt: new Date(),
		}),
		nodeRepository.create({
			id: 'test-node-2',
			name: 'Test Node 2',
			description: 'Second test node',
			filePath: '/tmp/test-node-2.zip',
			fileHash: 'hash2',
			fileSize: 2048,
			status: 'validated',
			metadata: {
				author: 'Test Author',
				version: '1.1.0',
				category: 'test',
				tags: ['test'],
			},
			uploadedBy: testUser.id,
			createdAt: new Date(),
			updatedAt: new Date(),
		}),
	];

	await nodeRepository.save(testNodes);

	return { testUser, testNodes };
}

/**
 * Execute raw SQL query for test setup
 */
export async function executeQuery(query: string, parameters?: any[]): Promise<any> {
	const connection = getConnection();
	return connection.query(query, parameters);
}

/**
 * Get repository for testing
 */
export function getTestRepository<T>(entity: new () => T) {
	const connection = getConnection();
	return connection.getRepository(entity);
}
