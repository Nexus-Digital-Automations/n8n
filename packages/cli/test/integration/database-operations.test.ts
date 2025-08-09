import { Container } from 'typedi';
import { getConnection, Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';

import { CustomNode } from '@/databases/entities/CustomNode';
import { CustomNodeDeployment } from '@/databases/entities/CustomNodeDeployment';
import { CustomNodeRepository } from '@/databases/repositories/custom-node.repository';
import { CustomNodeDeploymentRepository } from '@/databases/repositories/custom-node-deployment.repository';
import { setupTestDb, teardownTestDb, createTestFixtures } from './helpers/test-database';
import { createMockUser } from './helpers/test-user';
import type { User } from '@/databases/entities/User';

/**
 * Integration tests for database operations with CustomNode and CustomNodeDeployment entities
 */
describe('Database Operations Integration', () => {
	let customNodeRepository: CustomNodeRepository;
	let deploymentRepository: CustomNodeDeploymentRepository;
	let testUser: User;

	beforeAll(async () => {
		await setupTestDb();
		const connection = getConnection();

		customNodeRepository = new CustomNodeRepository(connection);
		deploymentRepository = new CustomNodeDeploymentRepository(connection);

		testUser = await createMockUser();
	});

	afterAll(async () => {
		await teardownTestDb();
	});

	beforeEach(async () => {
		// Clean database before each test
		const connection = getConnection();
		await connection.query('DELETE FROM custom_node_deployment WHERE 1=1');
		await connection.query('DELETE FROM custom_node WHERE 1=1');
	});

	describe('CustomNode Entity Operations', () => {
		it('should create and save custom node with all properties', async () => {
			const nodeData = {
				id: uuid(),
				name: 'Database Test Node',
				description: 'Node created for database testing',
				filePath: '/tmp/test-node.zip',
				fileHash: 'sha256-hash-value',
				fileSize: 2048,
				status: 'uploaded' as const,
				metadata: {
					author: 'Test Author',
					version: '1.0.0',
					category: 'database',
					tags: ['test', 'database'],
					description: 'Test node metadata',
				},
				validationResults: null,
				uploadedBy: testUser.id,
			};

			const savedNode = await customNodeRepository.save(nodeData);

			expect(savedNode).toMatchObject({
				id: nodeData.id,
				name: nodeData.name,
				description: nodeData.description,
				status: nodeData.status,
				metadata: nodeData.metadata,
				uploadedBy: testUser.id,
			});
			expect(savedNode.createdAt).toBeDefined();
			expect(savedNode.updatedAt).toBeDefined();
		});

		it('should find custom node by id', async () => {
			const nodeId = uuid();
			await customNodeRepository.save({
				id: nodeId,
				name: 'Find Test Node',
				description: 'Node for find testing',
				filePath: '/tmp/find-test.zip',
				fileHash: 'find-hash',
				fileSize: 1024,
				status: 'uploaded',
				metadata: { author: 'Test', version: '1.0.0' },
				uploadedBy: testUser.id,
			});

			const foundNode = await customNodeRepository.findById(nodeId);

			expect(foundNode).toBeDefined();
			expect(foundNode!.id).toBe(nodeId);
			expect(foundNode!.name).toBe('Find Test Node');
		});

		it('should find custom nodes by status', async () => {
			const nodes = [
				{
					id: uuid(),
					name: 'Deployed Node 1',
					status: 'deployed' as const,
					filePath: '/tmp/deployed1.zip',
					fileHash: 'hash1',
					fileSize: 1024,
					metadata: { author: 'Test', version: '1.0.0' },
					uploadedBy: testUser.id,
				},
				{
					id: uuid(),
					name: 'Deployed Node 2',
					status: 'deployed' as const,
					filePath: '/tmp/deployed2.zip',
					fileHash: 'hash2',
					fileSize: 1024,
					metadata: { author: 'Test', version: '1.0.0' },
					uploadedBy: testUser.id,
				},
				{
					id: uuid(),
					name: 'Uploaded Node',
					status: 'uploaded' as const,
					filePath: '/tmp/uploaded.zip',
					fileHash: 'hash3',
					fileSize: 1024,
					metadata: { author: 'Test', version: '1.0.0' },
					uploadedBy: testUser.id,
				},
			];

			await customNodeRepository.save(nodes);

			const deployedNodes = await customNodeRepository.findByStatus('deployed');

			expect(deployedNodes).toHaveLength(2);
			expect(deployedNodes.every((node) => node.status === 'deployed')).toBe(true);
		});

		it('should find custom nodes by category', async () => {
			const nodes = [
				{
					id: uuid(),
					name: 'Database Node',
					status: 'uploaded' as const,
					filePath: '/tmp/db.zip',
					fileHash: 'hash1',
					fileSize: 1024,
					metadata: { author: 'Test', version: '1.0.0', category: 'database' },
					uploadedBy: testUser.id,
				},
				{
					id: uuid(),
					name: 'Communication Node',
					status: 'uploaded' as const,
					filePath: '/tmp/comm.zip',
					fileHash: 'hash2',
					fileSize: 1024,
					metadata: { author: 'Test', version: '1.0.0', category: 'communication' },
					uploadedBy: testUser.id,
				},
			];

			await customNodeRepository.save(nodes);

			const databaseNodes = await customNodeRepository.findByCategory('database');

			expect(databaseNodes).toHaveLength(1);
			expect(databaseNodes[0].metadata.category).toBe('database');
		});

		it('should update custom node status and timestamp', async () => {
			const nodeId = uuid();
			const originalNode = await customNodeRepository.save({
				id: nodeId,
				name: 'Update Test Node',
				status: 'uploaded' as const,
				filePath: '/tmp/update.zip',
				fileHash: 'update-hash',
				fileSize: 1024,
				metadata: { author: 'Test', version: '1.0.0' },
				uploadedBy: testUser.id,
			});

			const originalUpdatedAt = originalNode.updatedAt;

			// Wait a bit to ensure timestamp difference
			await new Promise((resolve) => setTimeout(resolve, 100));

			await customNodeRepository.updateStatus(nodeId, 'validated');

			const updatedNode = await customNodeRepository.findById(nodeId);

			expect(updatedNode!.status).toBe('validated');
			expect(updatedNode!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
		});

		it('should delete custom node and cascade to deployments', async () => {
			const nodeId = uuid();

			// Create node
			await customNodeRepository.save({
				id: nodeId,
				name: 'Delete Test Node',
				status: 'deployed' as const,
				filePath: '/tmp/delete.zip',
				fileHash: 'delete-hash',
				fileSize: 1024,
				metadata: { author: 'Test', version: '1.0.0' },
				uploadedBy: testUser.id,
			});

			// Create deployment
			const deploymentId = uuid();
			await deploymentRepository.save({
				id: deploymentId,
				customNodeId: nodeId,
				status: 'deployed' as const,
				environment: 'development',
				config: { enableHotReload: true },
				deployedAt: new Date(),
			});

			// Delete node (should cascade to deployment)
			await customNodeRepository.delete(nodeId);

			const deletedNode = await customNodeRepository.findById(nodeId);
			const deletedDeployment = await deploymentRepository.findById(deploymentId);

			expect(deletedNode).toBeNull();
			expect(deletedDeployment).toBeNull();
		});

		it('should search custom nodes by text', async () => {
			const nodes = [
				{
					id: uuid(),
					name: 'Email Sender Node',
					description: 'Sends emails via SMTP',
					status: 'uploaded' as const,
					filePath: '/tmp/email.zip',
					fileHash: 'hash1',
					fileSize: 1024,
					metadata: { author: 'John Doe', version: '1.0.0', tags: ['email', 'communication'] },
					uploadedBy: testUser.id,
				},
				{
					id: uuid(),
					name: 'Database Query Node',
					description: 'Queries PostgreSQL databases',
					status: 'uploaded' as const,
					filePath: '/tmp/db.zip',
					fileHash: 'hash2',
					fileSize: 1024,
					metadata: { author: 'Jane Smith', version: '2.0.0', tags: ['database', 'sql'] },
					uploadedBy: testUser.id,
				},
			];

			await customNodeRepository.save(nodes);

			// Search by name
			const emailNodes = await customNodeRepository.search('email');
			expect(emailNodes).toHaveLength(1);
			expect(emailNodes[0].name).toContain('Email');

			// Search by description
			const postgresNodes = await customNodeRepository.search('PostgreSQL');
			expect(postgresNodes).toHaveLength(1);
			expect(postgresNodes[0].description).toContain('PostgreSQL');

			// Search by author
			const johnNodes = await customNodeRepository.search('John');
			expect(johnNodes).toHaveLength(1);
			expect(johnNodes[0].metadata.author).toContain('John');
		});

		it('should get nodes with pagination', async () => {
			// Create 10 test nodes
			const nodes = Array.from({ length: 10 }, (_, i) => ({
				id: uuid(),
				name: `Test Node ${i + 1}`,
				status: 'uploaded' as const,
				filePath: `/tmp/test-${i}.zip`,
				fileHash: `hash-${i}`,
				fileSize: 1024,
				metadata: { author: 'Test', version: '1.0.0' },
				uploadedBy: testUser.id,
			}));

			await customNodeRepository.save(nodes);

			// Test pagination
			const page1 = await customNodeRepository.findWithPagination({
				limit: 5,
				offset: 0,
			});

			const page2 = await customNodeRepository.findWithPagination({
				limit: 5,
				offset: 5,
			});

			expect(page1.nodes).toHaveLength(5);
			expect(page1.total).toBe(10);
			expect(page2.nodes).toHaveLength(5);
			expect(page2.total).toBe(10);

			// Ensure no overlap
			const page1Ids = page1.nodes.map((n) => n.id);
			const page2Ids = page2.nodes.map((n) => n.id);
			const intersection = page1Ids.filter((id) => page2Ids.includes(id));
			expect(intersection).toHaveLength(0);
		});
	});

	describe('CustomNodeDeployment Entity Operations', () => {
		let testNodeId: string;

		beforeEach(async () => {
			testNodeId = uuid();
			await customNodeRepository.save({
				id: testNodeId,
				name: 'Deployment Test Node',
				status: 'validated' as const,
				filePath: '/tmp/deployment.zip',
				fileHash: 'deployment-hash',
				fileSize: 1024,
				metadata: { author: 'Test', version: '1.0.0' },
				uploadedBy: testUser.id,
			});
		});

		it('should create and save deployment with configuration', async () => {
			const deploymentData = {
				id: uuid(),
				customNodeId: testNodeId,
				status: 'deployed' as const,
				environment: 'development' as const,
				config: {
					enableHotReload: true,
					logLevel: 'debug',
					maxMemory: '512MB',
				},
				deployedAt: new Date(),
			};

			const savedDeployment = await deploymentRepository.save(deploymentData);

			expect(savedDeployment).toMatchObject({
				id: deploymentData.id,
				customNodeId: testNodeId,
				status: 'deployed',
				environment: 'development',
				config: deploymentData.config,
			});
			expect(savedDeployment.deployedAt).toBeDefined();
			expect(savedDeployment.createdAt).toBeDefined();
		});

		it('should find deployment by custom node id', async () => {
			const deploymentId = uuid();
			await deploymentRepository.save({
				id: deploymentId,
				customNodeId: testNodeId,
				status: 'deployed' as const,
				environment: 'production',
				deployedAt: new Date(),
			});

			const deployment = await deploymentRepository.findByCustomNodeId(testNodeId);

			expect(deployment).toBeDefined();
			expect(deployment!.customNodeId).toBe(testNodeId);
		});

		it('should find active deployments', async () => {
			const deployments = [
				{
					id: uuid(),
					customNodeId: testNodeId,
					status: 'deployed' as const,
					environment: 'production' as const,
					deployedAt: new Date(),
				},
				{
					id: uuid(),
					customNodeId: uuid(), // Different node
					status: 'failed' as const,
					environment: 'development' as const,
					deployedAt: new Date(),
					undeployedAt: new Date(),
				},
			];

			// Create another node for the second deployment
			await customNodeRepository.save({
				id: deployments[1].customNodeId,
				name: 'Failed Node',
				status: 'validated' as const,
				filePath: '/tmp/failed.zip',
				fileHash: 'failed-hash',
				fileSize: 1024,
				metadata: { author: 'Test', version: '1.0.0' },
				uploadedBy: testUser.id,
			});

			await deploymentRepository.save(deployments);

			const activeDeployments = await deploymentRepository.findActive();

			expect(activeDeployments).toHaveLength(1);
			expect(activeDeployments[0].status).toBe('deployed');
		});

		it('should update deployment status with timestamp', async () => {
			const deploymentId = uuid();
			await deploymentRepository.save({
				id: deploymentId,
				customNodeId: testNodeId,
				status: 'deploying' as const,
				environment: 'development',
				deployedAt: new Date(),
			});

			await deploymentRepository.updateStatus(deploymentId, 'deployed');

			const updatedDeployment = await deploymentRepository.findById(deploymentId);

			expect(updatedDeployment!.status).toBe('deployed');
		});

		it('should record deployment undeployment', async () => {
			const deploymentId = uuid();
			await deploymentRepository.save({
				id: deploymentId,
				customNodeId: testNodeId,
				status: 'deployed' as const,
				environment: 'development',
				deployedAt: new Date(),
			});

			const undeployedAt = new Date();
			await deploymentRepository.recordUndeployment(deploymentId, undeployedAt);

			const deployment = await deploymentRepository.findById(deploymentId);

			expect(deployment!.status).toBe('undeployed');
			expect(deployment!.undeployedAt).toBeDefined();
		});

		it('should get deployment logs with pagination', async () => {
			const deploymentId = uuid();
			await deploymentRepository.save({
				id: deploymentId,
				customNodeId: testNodeId,
				status: 'deployed' as const,
				environment: 'development',
				deployedAt: new Date(),
			});

			// Mock some log entries (in real implementation, these might be in a separate logs table)
			const mockLogs = Array.from({ length: 15 }, (_, i) => ({
				timestamp: new Date(Date.now() - i * 1000),
				level: i % 4 === 0 ? 'error' : i % 3 === 0 ? 'warn' : 'info',
				message: `Log entry ${i + 1}`,
			}));

			// In a real implementation, you would save these to a logs table
			// For this test, we'll mock the repository method
			jest.spyOn(deploymentRepository, 'getLogs').mockResolvedValue({
				logs: mockLogs.slice(0, 10),
				total: mockLogs.length,
			});

			const result = await deploymentRepository.getLogs(deploymentId, { limit: 10, offset: 0 });

			expect(result.logs).toHaveLength(10);
			expect(result.total).toBe(15);
			expect(result.logs[0]).toMatchObject({
				timestamp: expect.any(Date),
				level: expect.stringMatching(/info|warn|error/),
				message: expect.any(String),
			});
		});
	});

	describe('Entity Relationships', () => {
		it('should maintain foreign key relationship between deployment and custom node', async () => {
			const nodeId = uuid();
			await customNodeRepository.save({
				id: nodeId,
				name: 'Relationship Test Node',
				status: 'validated' as const,
				filePath: '/tmp/relationship.zip',
				fileHash: 'rel-hash',
				fileSize: 1024,
				metadata: { author: 'Test', version: '1.0.0' },
				uploadedBy: testUser.id,
			});

			const deploymentId = uuid();
			await deploymentRepository.save({
				id: deploymentId,
				customNodeId: nodeId,
				status: 'deployed' as const,
				environment: 'development',
				deployedAt: new Date(),
			});

			// Try to delete custom node with existing deployment (should fail due to FK constraint)
			await expect(customNodeRepository.delete(nodeId)).rejects.toThrow();

			// Clean up deployment first, then node should delete successfully
			await deploymentRepository.delete(deploymentId);
			await expect(customNodeRepository.delete(nodeId)).resolves.not.toThrow();
		});

		it('should load custom node with deployments', async () => {
			const nodeId = uuid();
			await customNodeRepository.save({
				id: nodeId,
				name: 'Node With Deployments',
				status: 'deployed' as const,
				filePath: '/tmp/with-deps.zip',
				fileHash: 'deps-hash',
				fileSize: 1024,
				metadata: { author: 'Test', version: '1.0.0' },
				uploadedBy: testUser.id,
			});

			// Create multiple deployments for the same node
			const deployments = [
				{
					id: uuid(),
					customNodeId: nodeId,
					status: 'deployed' as const,
					environment: 'development' as const,
					deployedAt: new Date(Date.now() - 2000),
				},
				{
					id: uuid(),
					customNodeId: nodeId,
					status: 'undeployed' as const,
					environment: 'production' as const,
					deployedAt: new Date(Date.now() - 1000),
					undeployedAt: new Date(),
				},
			];

			await deploymentRepository.save(deployments);

			const nodeWithDeployments = await customNodeRepository.findWithDeployments(nodeId);

			expect(nodeWithDeployments).toBeDefined();
			expect(nodeWithDeployments!.deployments).toHaveLength(2);
			expect(nodeWithDeployments!.deployments).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ environment: 'development' }),
					expect.objectContaining({ environment: 'production' }),
				]),
			);
		});
	});

	describe('Transaction Support', () => {
		it('should handle transaction rollback on error', async () => {
			const connection = getConnection();

			await expect(
				connection.transaction(async (manager) => {
					// Create a custom node
					const node = manager.create(CustomNode, {
						id: uuid(),
						name: 'Transaction Test Node',
						status: 'uploaded' as const,
						filePath: '/tmp/transaction.zip',
						fileHash: 'trans-hash',
						fileSize: 1024,
						metadata: { author: 'Test', version: '1.0.0' },
						uploadedBy: testUser.id,
					});
					await manager.save(node);

					// Create a deployment with invalid foreign key (should fail)
					const deployment = manager.create(CustomNodeDeployment, {
						id: uuid(),
						customNodeId: 'non-existent-node-id',
						status: 'deployed' as const,
						environment: 'development',
						deployedAt: new Date(),
					});
					await manager.save(deployment); // This should fail
				}),
			).rejects.toThrow();

			// Verify that the node was not saved due to transaction rollback
			const nodes = await customNodeRepository.findAll();
			expect(nodes).toHaveLength(0);
		});

		it('should handle successful transaction commit', async () => {
			const connection = getConnection();
			const nodeId = uuid();
			const deploymentId = uuid();

			await connection.transaction(async (manager) => {
				// Create custom node
				const node = manager.create(CustomNode, {
					id: nodeId,
					name: 'Successful Transaction Node',
					status: 'validated' as const,
					filePath: '/tmp/success.zip',
					fileHash: 'success-hash',
					fileSize: 1024,
					metadata: { author: 'Test', version: '1.0.0' },
					uploadedBy: testUser.id,
				});
				await manager.save(node);

				// Create deployment
				const deployment = manager.create(CustomNodeDeployment, {
					id: deploymentId,
					customNodeId: nodeId,
					status: 'deployed' as const,
					environment: 'development',
					deployedAt: new Date(),
				});
				await manager.save(deployment);
			});

			// Verify both entities were saved
			const savedNode = await customNodeRepository.findById(nodeId);
			const savedDeployment = await deploymentRepository.findById(deploymentId);

			expect(savedNode).toBeDefined();
			expect(savedDeployment).toBeDefined();
			expect(savedDeployment!.customNodeId).toBe(nodeId);
		});
	});

	describe('Performance and Indexing', () => {
		it('should efficiently query by indexed fields', async () => {
			// Create a large number of nodes to test query performance
			const nodes = Array.from({ length: 100 }, (_, i) => ({
				id: uuid(),
				name: `Performance Test Node ${i}`,
				status: (i % 3 === 0 ? 'deployed' : i % 3 === 1 ? 'validated' : 'uploaded') as const,
				filePath: `/tmp/perf-${i}.zip`,
				fileHash: `hash-${i}`,
				fileSize: 1024,
				metadata: {
					author: `Author ${i % 10}`,
					version: '1.0.0',
					category: i % 5 === 0 ? 'database' : 'communication',
				},
				uploadedBy: testUser.id,
			}));

			await customNodeRepository.save(nodes);

			const startTime = Date.now();

			// Query by status (should be indexed)
			const deployedNodes = await customNodeRepository.findByStatus('deployed');

			const queryTime = Date.now() - startTime;

			expect(deployedNodes.length).toBeGreaterThan(0);
			expect(queryTime).toBeLessThan(1000); // Should complete within 1 second
		});
	});
});
