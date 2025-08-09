import { Container } from 'typedi';
import request from 'supertest';
import { getConnection } from 'typeorm';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

import { CustomNodesController } from '@/controllers/custom-nodes.controller';
import { CustomNode } from '@/databases/entities/CustomNode';
import { CustomNodeDeployment } from '@/databases/entities/CustomNodeDeployment';
import { CustomNodeStorageService } from '@/services/custom-node-storage.service';
import { CustomNodeValidationService } from '@/services/custom-node-validation.service';
import { CustomNodeDeploymentService } from '@/services/custom-node-deployment.service';
import { CustomNodeRuntimeService } from '@/services/custom-node-runtime.service';
import { setupTestDb, teardownTestDb } from './helpers/test-database';
import { createTestApp } from './helpers/test-app';
import { createMockUser } from './helpers/test-user';
import type { User } from '@/databases/entities/User';

/**
 * Integration tests for Custom Node API workflow
 * Tests the complete cycle: upload → validate → deploy → monitor → undeploy
 */
describe('Custom Nodes API Workflow Integration', () => {
	let app: any;
	let testUser: User;
	let controller: CustomNodesController;
	let storageService: CustomNodeStorageService;
	let validationService: CustomNodeValidationService;
	let deploymentService: CustomNodeDeploymentService;
	let runtimeService: CustomNodeRuntimeService;

	const testNodePath = path.join(__dirname, 'fixtures', 'test-node.zip');
	const testNodeContent = `
const { NodeOperationError } = require('n8n-core');

class TestNode {
	description = {
		displayName: 'Test Node',
		name: 'testNode',
		group: ['trigger'],
		version: 1,
		description: 'A test node for integration testing',
		defaults: {
			name: 'Test Node',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				default: 'Hello World',
				description: 'The message to return',
			},
		],
	};

	async execute() {
		const items = this.getInputData();
		const message = this.getNodeParameter('message', 0, 'Hello World');

		return this.prepareOutputData([
			{
				json: { message },
			},
		]);
	}
}

module.exports = { nodeClass: TestNode };
	`;

	beforeAll(async () => {
		await setupTestDb();
		app = await createTestApp();
		testUser = await createMockUser();

		// Get service instances
		controller = Container.get(CustomNodesController);
		storageService = Container.get(CustomNodeStorageService);
		validationService = Container.get(CustomNodeValidationService);
		deploymentService = Container.get(CustomNodeDeploymentService);
		runtimeService = Container.get(CustomNodeRuntimeService);

		// Create test node file
		await fs.mkdir(path.dirname(testNodePath), { recursive: true });
		await fs.writeFile(testNodePath, testNodeContent);
	});

	afterAll(async () => {
		await teardownTestDb();
		try {
			await fs.unlink(testNodePath);
		} catch {
			// Ignore if file doesn't exist
		}
	});

	beforeEach(async () => {
		// Clean up any existing test data
		const connection = getConnection();
		await connection.query('DELETE FROM custom_node_deployment WHERE 1=1');
		await connection.query('DELETE FROM custom_node WHERE 1=1');
	});

	describe('Complete Workflow - Upload to Deploy', () => {
		it('should complete full workflow: upload → validate → deploy → monitor → undeploy', async () => {
			let nodeId: string;
			let deploymentId: string;

			// Step 1: Upload custom node
			const uploadResponse = await request(app)
				.post('/rest/custom-nodes')
				.attach('file', testNodePath)
				.field('name', 'Integration Test Node')
				.field('description', 'Node created during integration testing')
				.field('author', 'Test Suite')
				.field('category', 'test')
				.field('version', '1.0.0')
				.field('tags', JSON.stringify(['test', 'integration']))
				.field('autoValidate', 'true')
				.expect(201);

			expect(uploadResponse.body).toMatchObject({
				id: expect.any(String),
				name: 'Integration Test Node',
				status: 'uploaded',
				metadata: {
					author: 'Test Suite',
					category: 'test',
					version: '1.0.0',
					tags: ['test', 'integration'],
				},
			});

			nodeId = uploadResponse.body.id;

			// Verify node was stored in database
			const connection = getConnection();
			const storedNode = await connection
				.getRepository(CustomNode)
				.findOne({ where: { id: nodeId } });

			expect(storedNode).toBeDefined();
			expect(storedNode!.name).toBe('Integration Test Node');
			expect(storedNode!.status).toBe('uploaded');

			// Step 2: Wait for auto-validation (since autoValidate was true)
			// Poll validation status
			let validationComplete = false;
			let attempts = 0;
			const maxAttempts = 10;

			while (!validationComplete && attempts < maxAttempts) {
				await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second

				const statusResponse = await request(app).get(`/rest/custom-nodes/${nodeId}`).expect(200);

				if (statusResponse.body.status === 'validated' || statusResponse.body.status === 'failed') {
					validationComplete = true;
				}
				attempts++;
			}

			expect(validationComplete).toBe(true);

			// Get updated node status
			const validatedNodeResponse = await request(app)
				.get(`/rest/custom-nodes/${nodeId}`)
				.expect(200);

			expect(validatedNodeResponse.body.status).toBe('validated');
			expect(validatedNodeResponse.body.validation_results).toBeDefined();
			expect(validatedNodeResponse.body.validation_results.passed).toBe(true);

			// Step 3: Deploy the validated node
			const deployResponse = await request(app)
				.post(`/rest/custom-nodes/${nodeId}/deploy`)
				.send({
					environment: 'development',
					config: {
						enableHotReload: true,
						logLevel: 'debug',
					},
				})
				.expect(200);

			expect(deployResponse.body).toMatchObject({
				deploymentId: expect.any(String),
				status: 'deployed',
				message: expect.any(String),
			});

			deploymentId = deployResponse.body.deploymentId;

			// Verify deployment was created in database
			const deployment = await connection
				.getRepository(CustomNodeDeployment)
				.findOne({ where: { id: deploymentId } });

			expect(deployment).toBeDefined();
			expect(deployment!.status).toBe('deployed');
			expect(deployment!.customNodeId).toBe(nodeId);

			// Step 4: Monitor node health
			const healthResponse = await request(app)
				.get(`/rest/custom-nodes/${nodeId}/health`)
				.expect(200);

			expect(healthResponse.body).toMatchObject({
				status: 'healthy',
				uptime: expect.any(Number),
				lastCheck: expect.any(String),
				metrics: {
					memoryUsage: expect.any(Number),
					executionCount: expect.any(Number),
				},
			});

			// Step 5: Test node execution (if supported)
			const executionResponse = await request(app)
				.post(`/rest/custom-nodes/${nodeId}/test`)
				.send({
					input: { message: 'Integration Test' },
				})
				.expect(200);

			expect(executionResponse.body).toMatchObject({
				success: true,
				output: {
					message: 'Integration Test',
				},
			});

			// Step 6: Get deployment logs
			const logsResponse = await request(app)
				.get(`/rest/custom-nodes/${nodeId}/deployments/${deploymentId}/logs`)
				.expect(200);

			expect(logsResponse.body).toMatchObject({
				logs: expect.any(Array),
				pagination: {
					limit: expect.any(Number),
					offset: expect.any(Number),
					total: expect.any(Number),
				},
			});

			expect(logsResponse.body.logs.length).toBeGreaterThan(0);
			expect(logsResponse.body.logs[0]).toMatchObject({
				timestamp: expect.any(String),
				level: expect.stringMatching(/info|debug|warn|error/),
				message: expect.any(String),
			});

			// Step 7: Undeploy the node
			const undeployResponse = await request(app)
				.delete(`/rest/custom-nodes/${nodeId}/deploy`)
				.expect(200);

			expect(undeployResponse.body).toMatchObject({
				message: expect.stringContaining('undeployed'),
				status: 'undeployed',
			});

			// Verify node status updated
			const finalStatusResponse = await request(app)
				.get(`/rest/custom-nodes/${nodeId}`)
				.expect(200);

			expect(finalStatusResponse.body.status).toBe('validated'); // Back to validated after undeploy

			// Verify deployment status updated
			const updatedDeployment = await connection
				.getRepository(CustomNodeDeployment)
				.findOne({ where: { id: deploymentId } });

			expect(updatedDeployment!.status).toBe('undeployed');
			expect(updatedDeployment!.undeployedAt).toBeDefined();
		});

		it('should handle validation failure in workflow', async () => {
			// Create a malformed node file
			const malformedNodePath = path.join(__dirname, 'fixtures', 'malformed-node.js');
			const malformedContent = `
// This is intentionally malformed JavaScript
class TestNode {
	description = {
		displayName: 'Malformed Node',
		// Missing required properties
	};
	
	async execute() {
		// Syntax error
		const x = ;
		return x;
	}
// Missing closing brace
			`;

			await fs.writeFile(malformedNodePath, malformedContent);

			try {
				// Upload malformed node
				const uploadResponse = await request(app)
					.post('/rest/custom-nodes')
					.attach('file', malformedNodePath)
					.field('name', 'Malformed Test Node')
					.field('description', 'This should fail validation')
					.field('author', 'Test Suite')
					.field('autoValidate', 'true')
					.expect(201);

				const nodeId = uploadResponse.body.id;

				// Wait for validation to complete (should fail)
				let validationComplete = false;
				let attempts = 0;
				const maxAttempts = 10;

				while (!validationComplete && attempts < maxAttempts) {
					await new Promise((resolve) => setTimeout(resolve, 1000));

					const statusResponse = await request(app).get(`/rest/custom-nodes/${nodeId}`).expect(200);

					if (statusResponse.body.status === 'failed') {
						validationComplete = true;
					}
					attempts++;
				}

				expect(validationComplete).toBe(true);

				// Try to deploy failed node (should fail)
				await request(app)
					.post(`/rest/custom-nodes/${nodeId}/deploy`)
					.send({ environment: 'development' })
					.expect(400);
			} finally {
				await fs.unlink(malformedNodePath);
			}
		});
	});

	describe('Workflow Error Handling', () => {
		it('should handle upload errors gracefully', async () => {
			// Test with invalid file type
			const invalidFilePath = path.join(__dirname, 'fixtures', 'invalid.txt');
			await fs.writeFile(invalidFilePath, 'This is not a valid node file');

			try {
				await request(app)
					.post('/rest/custom-nodes')
					.attach('file', invalidFilePath)
					.field('name', 'Invalid Node')
					.field('author', 'Test Suite')
					.expect(400);
			} finally {
				await fs.unlink(invalidFilePath);
			}
		});

		it('should handle deployment errors gracefully', async () => {
			// Upload a valid node
			const uploadResponse = await request(app)
				.post('/rest/custom-nodes')
				.attach('file', testNodePath)
				.field('name', 'Error Test Node')
				.field('author', 'Test Suite')
				.field('autoValidate', 'false')
				.expect(201);

			const nodeId = uploadResponse.body.id;

			// Try to deploy without validation (should fail)
			await request(app)
				.post(`/rest/custom-nodes/${nodeId}/deploy`)
				.send({ environment: 'development' })
				.expect(400);
		});

		it('should handle concurrent operations correctly', async () => {
			// Upload a node
			const uploadResponse = await request(app)
				.post('/rest/custom-nodes')
				.attach('file', testNodePath)
				.field('name', 'Concurrent Test Node')
				.field('author', 'Test Suite')
				.field('autoValidate', 'true')
				.expect(201);

			const nodeId = uploadResponse.body.id;

			// Wait for validation
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// Try multiple concurrent deployments (should handle gracefully)
			const deploymentPromises = [
				request(app)
					.post(`/rest/custom-nodes/${nodeId}/deploy`)
					.send({ environment: 'development' }),
				request(app)
					.post(`/rest/custom-nodes/${nodeId}/deploy`)
					.send({ environment: 'development' }),
				request(app)
					.post(`/rest/custom-nodes/${nodeId}/deploy`)
					.send({ environment: 'development' }),
			];

			const results = await Promise.allSettled(deploymentPromises);

			// Only one should succeed, others should fail with appropriate error
			const successful = results.filter((r) => r.status === 'fulfilled').length;
			expect(successful).toBe(1);
		});
	});

	describe('Workflow State Management', () => {
		it('should maintain consistent state throughout workflow', async () => {
			// Upload node
			const uploadResponse = await request(app)
				.post('/rest/custom-nodes')
				.attach('file', testNodePath)
				.field('name', 'State Test Node')
				.field('author', 'Test Suite')
				.field('autoValidate', 'false')
				.expect(201);

			const nodeId = uploadResponse.body.id;

			// Verify initial state
			let nodeStatus = await request(app).get(`/rest/custom-nodes/${nodeId}`).expect(200);
			expect(nodeStatus.body.status).toBe('uploaded');

			// Manually trigger validation
			await request(app).post(`/rest/custom-nodes/${nodeId}/validate`).expect(200);

			// Wait for validation to complete
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// Verify validated state
			nodeStatus = await request(app).get(`/rest/custom-nodes/${nodeId}`).expect(200);
			expect(nodeStatus.body.status).toBe('validated');

			// Deploy
			const deployResponse = await request(app)
				.post(`/rest/custom-nodes/${nodeId}/deploy`)
				.send({ environment: 'development' })
				.expect(200);

			// Verify deployed state
			nodeStatus = await request(app).get(`/rest/custom-nodes/${nodeId}`).expect(200);
			expect(nodeStatus.body.status).toBe('deployed');

			// Hot reload
			await request(app).post(`/rest/custom-nodes/${nodeId}/hot-reload`).expect(200);

			// Should still be deployed
			nodeStatus = await request(app).get(`/rest/custom-nodes/${nodeId}`).expect(200);
			expect(nodeStatus.body.status).toBe('deployed');

			// Undeploy
			await request(app).delete(`/rest/custom-nodes/${nodeId}/deploy`).expect(200);

			// Should be back to validated
			nodeStatus = await request(app).get(`/rest/custom-nodes/${nodeId}`).expect(200);
			expect(nodeStatus.body.status).toBe('validated');
		});
	});

	describe('Batch Operations', () => {
		it('should handle batch upload and deployment', async () => {
			// Create multiple test nodes
			const node1Path = path.join(__dirname, 'fixtures', 'test-node-1.js');
			const node2Path = path.join(__dirname, 'fixtures', 'test-node-2.js');

			await fs.writeFile(node1Path, testNodeContent.replace('Test Node', 'Test Node 1'));
			await fs.writeFile(node2Path, testNodeContent.replace('Test Node', 'Test Node 2'));

			try {
				// Upload multiple nodes
				const upload1 = await request(app)
					.post('/rest/custom-nodes')
					.attach('file', node1Path)
					.field('name', 'Batch Test Node 1')
					.field('author', 'Test Suite')
					.field('autoValidate', 'true')
					.expect(201);

				const upload2 = await request(app)
					.post('/rest/custom-nodes')
					.attach('file', node2Path)
					.field('name', 'Batch Test Node 2')
					.field('author', 'Test Suite')
					.field('autoValidate', 'true')
					.expect(201);

				const nodeIds = [upload1.body.id, upload2.body.id];

				// Wait for validations
				await new Promise((resolve) => setTimeout(resolve, 3000));

				// Batch deploy
				const batchDeployResponse = await request(app)
					.post('/rest/custom-nodes/batch/deploy')
					.send({
						nodeIds,
						environment: 'development',
					})
					.expect(200);

				expect(batchDeployResponse.body.results).toHaveLength(2);
				expect(batchDeployResponse.body.successful).toBe(2);
				expect(batchDeployResponse.body.failed).toBe(0);

				// Verify all nodes are deployed
				for (const nodeId of nodeIds) {
					const nodeStatus = await request(app).get(`/rest/custom-nodes/${nodeId}`).expect(200);
					expect(nodeStatus.body.status).toBe('deployed');
				}

				// Batch undeploy
				const batchUndeployResponse = await request(app)
					.delete('/rest/custom-nodes/batch/deploy')
					.send({ nodeIds })
					.expect(200);

				expect(batchUndeployResponse.body.successful).toBe(2);
			} finally {
				await fs.unlink(node1Path);
				await fs.unlink(node2Path);
			}
		});
	});

	describe('File Management Integration', () => {
		it('should properly manage files throughout workflow', async () => {
			// Upload node
			const uploadResponse = await request(app)
				.post('/rest/custom-nodes')
				.attach('file', testNodePath)
				.field('name', 'File Management Test')
				.field('author', 'Test Suite')
				.field('autoValidate', 'true')
				.expect(201);

			const nodeId = uploadResponse.body.id;

			// Verify file was stored
			const fileInfo = await storageService.getFileInfo(nodeId);
			expect(fileInfo).toBeDefined();
			expect(fileInfo.exists).toBe(true);

			// Wait for validation and deploy
			await new Promise((resolve) => setTimeout(resolve, 3000));

			await request(app)
				.post(`/rest/custom-nodes/${nodeId}/deploy`)
				.send({ environment: 'development' })
				.expect(200);

			// File should still exist
			const fileInfoAfterDeploy = await storageService.getFileInfo(nodeId);
			expect(fileInfoAfterDeploy.exists).toBe(true);

			// Delete node
			await request(app).delete(`/rest/custom-nodes/${nodeId}`).expect(200);

			// File should be cleaned up
			const fileInfoAfterDelete = await storageService.getFileInfo(nodeId);
			expect(fileInfoAfterDelete.exists).toBe(false);
		});
	});
});
