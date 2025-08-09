import { Container } from 'typedi';
import request from 'supertest';
import fs from 'fs/promises';
import path from 'path';
import { performance } from 'perf_hooks';
import { Worker } from 'worker_threads';

import { CustomNodesController } from '@/controllers/custom-nodes.controller';
import { CustomNodeStorageService } from '@/services/custom-node-storage.service';
import { CustomNodeValidationService } from '@/services/custom-node-validation.service';
import { CustomNodeDeploymentService } from '@/services/custom-node-deployment.service';
import { setupTestDb, teardownTestDb } from '../integration/helpers/test-database';
import { createTestApp } from '../integration/helpers/test-app';
import { createMockUser } from '../integration/helpers/test-user';
import type { User } from '@/databases/entities/User';

/**
 * Performance tests for Custom Nodes system
 * Tests file upload limits, concurrent operations, and memory usage
 */
describe('Custom Nodes Performance Tests', () => {
	let app: any;
	let testUser: User;
	let controller: CustomNodesController;
	let storageService: CustomNodeStorageService;
	let validationService: CustomNodeValidationService;
	let deploymentService: CustomNodeDeploymentService;

	const PERFORMANCE_THRESHOLDS = {
		UPLOAD_TIME_MS: 5000, // 5 seconds max for upload
		VALIDATION_TIME_MS: 10000, // 10 seconds max for validation
		DEPLOYMENT_TIME_MS: 15000, // 15 seconds max for deployment
		MEMORY_LIMIT_MB: 512, // 512 MB max memory usage
		CONCURRENT_OPERATIONS: 10, // Max concurrent operations to test
		MAX_FILE_SIZE_MB: 50, // Maximum file size limit
	};

	beforeAll(async () => {
		await setupTestDb();
		testUser = await createMockUser();
		app = await createTestApp(testUser);

		controller = Container.get(CustomNodesController);
		storageService = Container.get(CustomNodeStorageService);
		validationService = Container.get(CustomNodeValidationService);
		deploymentService = Container.get(CustomNodeDeploymentService);

		// Set up performance monitoring
		if (global.gc) {
			global.gc(); // Force garbage collection before tests
		}
	});

	afterAll(async () => {
		await teardownTestDb();
	});

	beforeEach(() => {
		// Clear any lingering timers or intervals
		jest.clearAllTimers();
	});

	describe('File Upload Performance', () => {
		it('should handle large file uploads within time limits', async () => {
			// Create a large test file (approaching the 50MB limit)
			const largeFileSize = 45 * 1024 * 1024; // 45MB
			const largeFilePath = path.join(__dirname, 'fixtures', 'large-test-node.zip');

			console.log(`Creating ${largeFileSize / (1024 * 1024)}MB test file...`);
			const largeContent = Buffer.alloc(largeFileSize, 'A');
			await fs.writeFile(largeFilePath, largeContent);

			try {
				const startTime = performance.now();

				const uploadResponse = await request(app)
					.post('/rest/custom-nodes')
					.attach('file', largeFilePath)
					.field('name', 'Large File Test Node')
					.field('description', 'Testing large file upload performance')
					.field('author', 'Performance Test')
					.field('autoValidate', 'false') // Skip validation for pure upload test
					.timeout(PERFORMANCE_THRESHOLDS.UPLOAD_TIME_MS + 5000);

				const uploadTime = performance.now() - startTime;

				expect(uploadResponse.status).toBe(201);
				expect(uploadTime).toBeLessThan(PERFORMANCE_THRESHOLDS.UPLOAD_TIME_MS);

				console.log(`Large file upload completed in ${uploadTime.toFixed(2)}ms`);

				// Clean up
				await request(app).delete(`/rest/custom-nodes/${uploadResponse.body.id}`).expect(200);
			} finally {
				await fs.unlink(largeFilePath);
			}
		});

		it('should reject files exceeding size limits quickly', async () => {
			// Create a file just over the limit
			const oversizeFileSize = 51 * 1024 * 1024; // 51MB
			const oversizeFilePath = path.join(__dirname, 'fixtures', 'oversize-node.zip');

			const oversizeContent = Buffer.alloc(oversizeFileSize, 'B');
			await fs.writeFile(oversizeFilePath, oversizeContent);

			try {
				const startTime = performance.now();

				await request(app)
					.post('/rest/custom-nodes')
					.attach('file', oversizeFilePath)
					.field('name', 'Oversize Test Node')
					.field('author', 'Performance Test')
					.expect(413); // Payload Too Large

				const rejectionTime = performance.now() - startTime;

				// Should reject quickly without processing the entire file
				expect(rejectionTime).toBeLessThan(1000); // Should reject within 1 second

				console.log(`Oversize file rejected in ${rejectionTime.toFixed(2)}ms`);
			} finally {
				await fs.unlink(oversizeFilePath);
			}
		});

		it('should handle multiple simultaneous uploads efficiently', async () => {
			const concurrentUploads = 5;
			const testFileSize = 5 * 1024 * 1024; // 5MB each
			const uploadPromises: Promise<any>[] = [];

			// Create test files
			const testFiles: string[] = [];
			for (let i = 0; i < concurrentUploads; i++) {
				const filePath = path.join(__dirname, 'fixtures', `concurrent-upload-${i}.zip`);
				const content = Buffer.alloc(testFileSize, `${i}`);
				await fs.writeFile(filePath, content);
				testFiles.push(filePath);
			}

			try {
				const startTime = performance.now();

				// Start concurrent uploads
				for (let i = 0; i < concurrentUploads; i++) {
					const uploadPromise = request(app)
						.post('/rest/custom-nodes')
						.attach('file', testFiles[i])
						.field('name', `Concurrent Upload Test ${i}`)
						.field('author', 'Performance Test')
						.field('autoValidate', 'false');

					uploadPromises.push(uploadPromise);
				}

				const results = await Promise.allSettled(uploadPromises);
				const totalTime = performance.now() - startTime;

				// All uploads should succeed
				const successful = results.filter((r) => r.status === 'fulfilled').length;
				expect(successful).toBe(concurrentUploads);

				// Should complete within reasonable time (not much slower than single upload)
				const expectedMaxTime = PERFORMANCE_THRESHOLDS.UPLOAD_TIME_MS * 2; // Allow 2x single upload time
				expect(totalTime).toBeLessThan(expectedMaxTime);

				console.log(
					`${concurrentUploads} concurrent uploads completed in ${totalTime.toFixed(2)}ms`,
				);

				// Clean up uploaded nodes
				for (const result of results) {
					if (result.status === 'fulfilled' && result.value.body.id) {
						await request(app).delete(`/rest/custom-nodes/${result.value.body.id}`).expect(200);
					}
				}
			} finally {
				// Clean up test files
				for (const filePath of testFiles) {
					await fs.unlink(filePath);
				}
			}
		});
	});

	describe('Validation Performance', () => {
		it('should validate complex nodes within time limits', async () => {
			// Create a complex but valid node
			const complexNodeCode = `
				const fs = require('fs');
				const path = require('path');
				const crypto = require('crypto');
				
				class ComplexTestNode {
					description = {
						displayName: 'Complex Test Node',
						name: 'complexTestNode',
						group: ['transform'],
						version: 1,
						description: 'A complex node for performance testing',
						defaults: {
							name: 'Complex Test Node',
						},
						inputs: ['main'],
						outputs: ['main'],
						properties: [
							{
								displayName: 'Operation',
								name: 'operation',
								type: 'options',
								options: [
									{ name: 'Transform', value: 'transform' },
									{ name: 'Validate', value: 'validate' },
									{ name: 'Process', value: 'process' },
								],
								default: 'transform',
							},
							{
								displayName: 'Input Data',
								name: 'inputData',
								type: 'json',
								default: '{}',
							},
							{
								displayName: 'Iterations',
								name: 'iterations',
								type: 'number',
								default: 1000,
								description: 'Number of processing iterations',
							},
						],
					};

					async execute() {
						const items = this.getInputData();
						const operation = this.getNodeParameter('operation', 0, 'transform');
						const inputData = this.getNodeParameter('inputData', 0, {});
						const iterations = this.getNodeParameter('iterations', 0, 1000);

						const results = [];

						for (const [index, item] of items.entries()) {
							let processedData = { ...item.json };

							// Simulate complex processing
							for (let i = 0; i < Math.min(iterations, 1000); i++) {
								switch (operation) {
									case 'transform':
										processedData = this.transformData(processedData);
										break;
									case 'validate':
										processedData = this.validateData(processedData);
										break;
									case 'process':
										processedData = this.processData(processedData, inputData);
										break;
								}
							}

							results.push({
								json: processedData,
							});
						}

						return this.prepareOutputData(results);
					}

					transformData(data) {
						// Complex transformation logic
						const transformed = {};
						for (const [key, value] of Object.entries(data)) {
							if (typeof value === 'string') {
								transformed[key] = crypto.createHash('md5').update(value).digest('hex');
							} else if (typeof value === 'number') {
								transformed[key] = value * Math.PI;
							} else {
								transformed[key] = JSON.stringify(value);
							}
						}
						return { ...data, transformed };
					}

					validateData(data) {
						// Complex validation logic
						const validation = {
							hasStringFields: Object.values(data).some(v => typeof v === 'string'),
							hasNumberFields: Object.values(data).some(v => typeof v === 'number'),
							fieldCount: Object.keys(data).length,
							checksum: crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex'),
						};
						return { ...data, validation };
					}

					processData(data, config) {
						// Complex processing with configuration
						const processed = { ...data };
						
						if (config.sortKeys) {
							const sortedEntries = Object.entries(processed).sort(([a], [b]) => a.localeCompare(b));
							return Object.fromEntries(sortedEntries);
						}
						
						if (config.addTimestamp) {
							processed.processedAt = Date.now();
						}
						
						if (config.addId) {
							processed.id = crypto.randomUUID();
						}
						
						return processed;
					}
				}

				module.exports = { nodeClass: ComplexTestNode };
			`;

			const complexFilePath = path.join(__dirname, 'fixtures', 'complex-node.js');
			await fs.writeFile(complexFilePath, complexNodeCode);

			try {
				const uploadResponse = await request(app)
					.post('/rest/custom-nodes')
					.attach('file', complexFilePath)
					.field('name', 'Complex Performance Test Node')
					.field('description', 'Testing validation performance with complex node')
					.field('author', 'Performance Test')
					.field('autoValidate', 'true')
					.expect(201);

				const nodeId = uploadResponse.body.id;
				const startTime = performance.now();

				// Poll for validation completion
				let validationComplete = false;
				let attempts = 0;
				const maxAttempts = 20;

				while (!validationComplete && attempts < maxAttempts) {
					await new Promise((resolve) => setTimeout(resolve, 1000));

					const statusResponse = await request(app).get(`/rest/custom-nodes/${nodeId}`).expect(200);

					if (statusResponse.body.status !== 'validating') {
						validationComplete = true;
						const validationTime = performance.now() - startTime;

						expect(validationTime).toBeLessThan(PERFORMANCE_THRESHOLDS.VALIDATION_TIME_MS);
						expect(statusResponse.body.status).toBe('validated');

						console.log(`Complex node validation completed in ${validationTime.toFixed(2)}ms`);

						// Clean up
						await request(app).delete(`/rest/custom-nodes/${nodeId}`).expect(200);
						break;
					}
					attempts++;
				}

				expect(validationComplete).toBe(true);
			} finally {
				await fs.unlink(complexFilePath);
			}
		});

		it('should handle concurrent validation requests efficiently', async () => {
			const concurrentValidations = 3;
			const nodeIds: string[] = [];

			// Upload multiple nodes first
			for (let i = 0; i < concurrentValidations; i++) {
				const simpleNodeCode = `
					class ConcurrentTestNode${i} {
						description = { displayName: 'Concurrent Test ${i}', name: 'concurrentTest${i}' };
						async execute() { return [{ json: { message: 'test ${i}' } }]; }
					}
					module.exports = { nodeClass: ConcurrentTestNode${i} };
				`;

				const filePath = path.join(__dirname, 'fixtures', `concurrent-validation-${i}.js`);
				await fs.writeFile(filePath, simpleNodeCode);

				try {
					const uploadResponse = await request(app)
						.post('/rest/custom-nodes')
						.attach('file', filePath)
						.field('name', `Concurrent Validation Test ${i}`)
						.field('author', 'Performance Test')
						.field('autoValidate', 'false')
						.expect(201);

					nodeIds.push(uploadResponse.body.id);
				} finally {
					await fs.unlink(filePath);
				}
			}

			try {
				const startTime = performance.now();

				// Start concurrent validations
				const validationPromises = nodeIds.map((nodeId) =>
					request(app).post(`/rest/custom-nodes/${nodeId}/validate`).expect(200),
				);

				await Promise.all(validationPromises);
				const totalTime = performance.now() - startTime;

				// Should complete within reasonable time
				expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.VALIDATION_TIME_MS * 2);

				console.log(
					`${concurrentValidations} concurrent validations completed in ${totalTime.toFixed(2)}ms`,
				);

				// Wait for all validations to complete
				await new Promise((resolve) => setTimeout(resolve, 2000));
			} finally {
				// Clean up
				for (const nodeId of nodeIds) {
					await request(app).delete(`/rest/custom-nodes/${nodeId}`).expect(200);
				}
			}
		});
	});

	describe('Deployment Performance', () => {
		it('should deploy nodes within time limits', async () => {
			// Create and upload a test node
			const deployNodeCode = `
				class DeploymentTestNode {
					description = { displayName: 'Deployment Test', name: 'deploymentTest' };
					async execute() { return [{ json: { message: 'deployed' } }]; }
				}
				module.exports = { nodeClass: DeploymentTestNode };
			`;

			const filePath = path.join(__dirname, 'fixtures', 'deployment-test.js');
			await fs.writeFile(filePath, deployNodeCode);

			try {
				const uploadResponse = await request(app)
					.post('/rest/custom-nodes')
					.attach('file', filePath)
					.field('name', 'Deployment Performance Test')
					.field('author', 'Performance Test')
					.field('autoValidate', 'true')
					.expect(201);

				const nodeId = uploadResponse.body.id;

				// Wait for validation
				await new Promise((resolve) => setTimeout(resolve, 3000));

				const startTime = performance.now();

				const deployResponse = await request(app)
					.post(`/rest/custom-nodes/${nodeId}/deploy`)
					.send({
						environment: 'development',
						config: { enableHotReload: true },
					})
					.expect(200);

				const deploymentTime = performance.now() - startTime;

				expect(deploymentTime).toBeLessThan(PERFORMANCE_THRESHOLDS.DEPLOYMENT_TIME_MS);
				expect(deployResponse.body.status).toBe('deployed');

				console.log(`Node deployment completed in ${deploymentTime.toFixed(2)}ms`);

				// Clean up
				await request(app).delete(`/rest/custom-nodes/${nodeId}/deploy`).expect(200);
				await request(app).delete(`/rest/custom-nodes/${nodeId}`).expect(200);
			} finally {
				await fs.unlink(filePath);
			}
		});

		it('should handle hot reload operations efficiently', async () => {
			// Deploy a node first
			const reloadNodeCode = `
				class HotReloadTestNode {
					description = { displayName: 'Hot Reload Test', name: 'hotReloadTest' };
					async execute() { return [{ json: { message: 'reloadable', timestamp: Date.now() } }]; }
				}
				module.exports = { nodeClass: HotReloadTestNode };
			`;

			const filePath = path.join(__dirname, 'fixtures', 'hot-reload-test.js');
			await fs.writeFile(filePath, reloadNodeCode);

			try {
				const uploadResponse = await request(app)
					.post('/rest/custom-nodes')
					.attach('file', filePath)
					.field('name', 'Hot Reload Performance Test')
					.field('author', 'Performance Test')
					.field('autoValidate', 'true')
					.expect(201);

				const nodeId = uploadResponse.body.id;
				await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait for validation

				await request(app)
					.post(`/rest/custom-nodes/${nodeId}/deploy`)
					.send({ environment: 'development' })
					.expect(200);

				// Test hot reload performance
				const reloadPromises = [];
				const reloadCount = 5;

				const startTime = performance.now();

				for (let i = 0; i < reloadCount; i++) {
					reloadPromises.push(
						request(app).post(`/rest/custom-nodes/${nodeId}/hot-reload`).expect(200),
					);
				}

				await Promise.all(reloadPromises);
				const totalReloadTime = performance.now() - startTime;

				const averageReloadTime = totalReloadTime / reloadCount;
				expect(averageReloadTime).toBeLessThan(2000); // Should reload within 2 seconds on average

				console.log(`Hot reload average time: ${averageReloadTime.toFixed(2)}ms`);

				// Clean up
				await request(app).delete(`/rest/custom-nodes/${nodeId}`).expect(200);
			} finally {
				await fs.unlink(filePath);
			}
		});
	});

	describe('Memory Usage Performance', () => {
		it('should not exceed memory limits during operations', async () => {
			const initialMemory = process.memoryUsage().heapUsed;
			console.log(`Initial memory usage: ${(initialMemory / 1024 / 1024).toFixed(2)}MB`);

			// Perform memory-intensive operations
			const operations = 10;
			const nodeIds: string[] = [];

			for (let i = 0; i < operations; i++) {
				const nodeCode = `
					class MemoryTestNode${i} {
						description = { displayName: 'Memory Test ${i}', name: 'memoryTest${i}' };
						async execute() {
							// Create some data to consume memory
							const data = new Array(1000).fill(0).map((_, index) => ({
								id: index,
								data: 'test-data-'.repeat(100),
								timestamp: Date.now(),
							}));
							return [{ json: { results: data } }];
						}
					}
					module.exports = { nodeClass: MemoryTestNode${i} };
				`;

				const filePath = path.join(__dirname, 'fixtures', `memory-test-${i}.js`);
				await fs.writeFile(filePath, nodeCode);

				try {
					const uploadResponse = await request(app)
						.post('/rest/custom-nodes')
						.attach('file', filePath)
						.field('name', `Memory Test Node ${i}`)
						.field('author', 'Performance Test')
						.field('autoValidate', 'true')
						.expect(201);

					nodeIds.push(uploadResponse.body.id);
				} finally {
					await fs.unlink(filePath);
				}
			}

			// Wait for all operations to complete
			await new Promise((resolve) => setTimeout(resolve, 5000));

			// Force garbage collection if available
			if (global.gc) {
				global.gc();
			}

			const finalMemory = process.memoryUsage().heapUsed;
			const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;

			console.log(`Final memory usage: ${(finalMemory / 1024 / 1024).toFixed(2)}MB`);
			console.log(`Memory increase: ${memoryIncrease.toFixed(2)}MB`);

			// Should not exceed reasonable memory increase
			expect(memoryIncrease).toBeLessThan(PERFORMANCE_THRESHOLDS.MEMORY_LIMIT_MB);

			// Clean up
			for (const nodeId of nodeIds) {
				await request(app).delete(`/rest/custom-nodes/${nodeId}`).expect(200);
			}
		});

		it('should handle garbage collection efficiently', async () => {
			if (!global.gc) {
				console.log('Garbage collection not available, skipping test');
				return;
			}

			// Create and delete many nodes to test garbage collection
			const cycles = 5;
			const nodesPerCycle = 5;

			for (let cycle = 0; cycle < cycles; cycle++) {
				console.log(`GC test cycle ${cycle + 1}/${cycles}`);

				const nodeIds: string[] = [];

				// Create nodes
				for (let i = 0; i < nodesPerCycle; i++) {
					const nodeCode = `
						class GCTestNode${cycle}_${i} {
							description = { displayName: 'GC Test ${cycle}_${i}', name: 'gcTest${cycle}_${i}' };
							async execute() { return [{ json: { cycle: ${cycle}, index: ${i} } }]; }
						}
						module.exports = { nodeClass: GCTestNode${cycle}_${i} };
					`;

					const filePath = path.join(__dirname, 'fixtures', `gc-test-${cycle}-${i}.js`);
					await fs.writeFile(filePath, nodeCode);

					try {
						const uploadResponse = await request(app)
							.post('/rest/custom-nodes')
							.attach('file', filePath)
							.field('name', `GC Test Node ${cycle}_${i}`)
							.field('author', 'Performance Test')
							.field('autoValidate', 'false')
							.expect(201);

						nodeIds.push(uploadResponse.body.id);
					} finally {
						await fs.unlink(filePath);
					}
				}

				// Delete all nodes in this cycle
				for (const nodeId of nodeIds) {
					await request(app).delete(`/rest/custom-nodes/${nodeId}`).expect(200);
				}

				// Force garbage collection
				global.gc();

				const memoryUsage = process.memoryUsage();
				console.log(
					`After cycle ${cycle + 1}: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
				);
			}

			// Final memory should be reasonable
			const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
			expect(finalMemory).toBeLessThan(PERFORMANCE_THRESHOLDS.MEMORY_LIMIT_MB);
		});
	});

	describe('Concurrent Operations Stress Test', () => {
		it('should handle high concurrent load without degradation', async () => {
			const concurrentOperations = PERFORMANCE_THRESHOLDS.CONCURRENT_OPERATIONS;
			console.log(`Starting stress test with ${concurrentOperations} concurrent operations`);

			const operations: Promise<any>[] = [];
			const results: any[] = [];

			const startTime = performance.now();

			// Mix of different operations running concurrently
			for (let i = 0; i < concurrentOperations; i++) {
				const operationType = i % 4;

				switch (operationType) {
					case 0: // Upload operation
						operations.push(performUploadOperation(i));
						break;
					case 1: // List operation
						operations.push(performListOperation());
						break;
					case 2: // Statistics operation
						operations.push(performStatsOperation());
						break;
					case 3: // Search operation
						operations.push(performSearchOperation(`test-${i}`));
						break;
				}
			}

			const operationResults = await Promise.allSettled(operations);
			const totalTime = performance.now() - startTime;

			// Analyze results
			const successful = operationResults.filter((r) => r.status === 'fulfilled').length;
			const failed = operationResults.filter((r) => r.status === 'rejected').length;

			console.log(`Stress test completed in ${totalTime.toFixed(2)}ms`);
			console.log(`Successful operations: ${successful}/${concurrentOperations}`);
			console.log(`Failed operations: ${failed}/${concurrentOperations}`);

			// Should have high success rate
			expect(successful / concurrentOperations).toBeGreaterThan(0.8); // 80% success rate minimum

			// Should complete within reasonable time
			expect(totalTime).toBeLessThan(30000); // 30 seconds maximum

			// Clean up any uploaded nodes
			for (const result of operationResults) {
				if (result.status === 'fulfilled' && result.value?.nodeId) {
					try {
						await request(app).delete(`/rest/custom-nodes/${result.value.nodeId}`).expect(200);
					} catch {
						// Ignore cleanup errors
					}
				}
			}
		});

		// Helper functions for stress test operations
		async function performUploadOperation(index: number) {
			const nodeCode = `
				class StressTestNode${index} {
					description = { displayName: 'Stress Test ${index}', name: 'stressTest${index}' };
					async execute() { return [{ json: { index: ${index} } }]; }
				}
				module.exports = { nodeClass: StressTestNode${index} };
			`;

			const filePath = path.join(__dirname, 'fixtures', `stress-test-${index}.js`);
			await fs.writeFile(filePath, nodeCode);

			try {
				const response = await request(app)
					.post('/rest/custom-nodes')
					.attach('file', filePath)
					.field('name', `Stress Test Node ${index}`)
					.field('author', 'Stress Test')
					.field('autoValidate', 'false')
					.timeout(10000);

				return { operation: 'upload', success: true, nodeId: response.body.id };
			} finally {
				await fs.unlink(filePath);
			}
		}

		async function performListOperation() {
			const response = await request(app).get('/rest/custom-nodes').timeout(5000);

			return { operation: 'list', success: response.status === 200 };
		}

		async function performStatsOperation() {
			const response = await request(app).get('/rest/custom-nodes/statistics').timeout(5000);

			return { operation: 'stats', success: response.status === 200 };
		}

		async function performSearchOperation(query: string) {
			const response = await request(app)
				.get('/rest/custom-nodes')
				.query({ search: query })
				.timeout(5000);

			return { operation: 'search', success: response.status === 200 };
		}
	});
});
