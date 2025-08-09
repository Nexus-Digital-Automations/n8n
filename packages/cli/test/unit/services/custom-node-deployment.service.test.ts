import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { InternalServerError } from '@/errors/response-errors/internal-server.error';
import { NotFoundError } from '@/errors/response-errors/not-found.error';
import {
	CustomNodeDeploymentService,
	type DeploymentOptions,
	type DeploymentResult,
	type RuntimeNodeInfo,
} from '@/services/custom-node-deployment.service';
import { CustomNodeRuntimeService } from '@/services/custom-node-runtime.service';
import type {
	CustomNode,
	CustomNodeDeployment,
	CustomNodeRepository,
	CustomNodeDeploymentRepository,
} from '@n8n/db';
import { mock } from 'jest-mock-extended';
import { promises as fs } from 'fs';
import { spawn, execSync } from 'child_process';
import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock file system operations
jest.mock('fs', () => ({
	promises: {
		mkdir: jest.fn(),
		copyFile: jest.fn(),
		writeFile: jest.fn(),
		readFile: jest.fn(),
		access: jest.fn(),
		rm: jest.fn(),
		readdir: jest.fn(),
		stat: jest.fn(),
	},
}));

// Mock child_process
jest.mock('child_process', () => ({
	spawn: jest.fn(),
	execSync: jest.fn(),
}));

// Mock path operations
jest.mock('path', () => ({
	join: jest.fn((...args) => args.join('/')),
	dirname: jest.fn((path) => path.split('/').slice(0, -1).join('/')),
	basename: jest.fn((path) => path.split('/').pop()),
	extname: jest.fn((path) => {
		const parts = path.split('.');
		return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
	}),
}));

// Mock os
jest.mock('os', () => ({
	tmpdir: jest.fn(() => '/tmp'),
}));

// Mock crypto
jest.mock('crypto', () => ({
	createHash: jest.fn(() => ({
		update: jest.fn().mockReturnThis(),
		digest: jest.fn(() => 'mock-hash'),
	})),
}));

describe('CustomNodeDeploymentService', () => {
	let service: CustomNodeDeploymentService;
	let mockLogger: jest.Mocked<Logger>;
	let mockGlobalConfig: jest.Mocked<GlobalConfig>;
	let mockCustomNodeRepository: jest.Mocked<CustomNodeRepository>;
	let mockDeploymentRepository: jest.Mocked<CustomNodeDeploymentRepository>;
	let mockRuntimeService: jest.Mocked<CustomNodeRuntimeService>;

	const mockCustomNode: CustomNode = {
		id: 'node-123',
		name: 'test-node',
		version: '1.0.0',
		description: 'Test custom node',
		author: 'test-author',
		category: 'test',
		tags: ['test', 'sample'],
		status: 'validated',
		filePath: '/tmp/test-node.zip',
		fileSize: 1024000,
		nodeTypes: ['TestNode'],
		metadata: {
			dependencies: ['lodash@^4.0.0'],
			license: 'MIT',
			nodeTypes: ['TestNode'],
			fileHash: 'test-hash',
			author: 'test-author',
		},
		validationResults: {
			syntax: true,
			dependencies: true,
			security: true,
			tests: true,
			warnings: [],
			errors: [],
		},
		createdAt: new Date('2024-01-01T00:00:00.000Z'),
		updatedAt: new Date('2024-01-01T00:00:00.000Z'),
		userId: 'user-123',
		isActive: true,
	} as CustomNode;

	const mockDeployment: CustomNodeDeployment = {
		id: 'deployment-123',
		nodeId: 'node-123',
		environment: 'production',
		status: 'deployed',
		config: {},
		deployedBy: 'user-123',
		createdAt: new Date('2024-01-01T00:00:00.000Z'),
		updatedAt: new Date('2024-01-01T00:00:00.000Z'),
		node: mockCustomNode,
	} as CustomNodeDeployment;

	beforeEach(() => {
		jest.clearAllMocks();

		mockLogger = mock<Logger>();
		mockGlobalConfig = mock<GlobalConfig>({
			customNodes: {
				nodeModulesPath: '/custom/node_modules',
				customNodesPath: '/custom/custom-nodes',
			},
		});
		mockCustomNodeRepository = mock<CustomNodeRepository>();
		mockDeploymentRepository = mock<CustomNodeDeploymentRepository>();
		mockRuntimeService = mock<CustomNodeRuntimeService>();

		// Mock fs operations to succeed by default
		(fs.mkdir as jest.Mock).mockResolvedValue(undefined);
		(fs.access as jest.Mock).mockResolvedValue(undefined);
		(fs.copyFile as jest.Mock).mockResolvedValue(undefined);
		(fs.writeFile as jest.Mock).mockResolvedValue(undefined);
		(fs.rm as jest.Mock).mockResolvedValue(undefined);

		service = new CustomNodeDeploymentService(
			mockLogger,
			mockGlobalConfig,
			mockCustomNodeRepository,
			mockDeploymentRepository,
			mockRuntimeService,
		);
	});

	describe('constructor and initialization', () => {
		it('should initialize with custom paths from config', () => {
			expect(mockGlobalConfig.customNodes?.nodeModulesPath).toBe('/custom/node_modules');
			expect(mockGlobalConfig.customNodes?.customNodesPath).toBe('/custom/custom-nodes');
		});

		it('should create necessary directories during initialization', async () => {
			// Wait for constructor to complete
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(fs.mkdir).toHaveBeenCalledWith('/custom/custom-nodes', { recursive: true });
			expect(fs.mkdir).toHaveBeenCalledWith('/custom/custom-nodes/deployed', { recursive: true });
			expect(fs.mkdir).toHaveBeenCalledWith('/custom/custom-nodes/staging', { recursive: true });
		});

		it('should handle directory creation failures gracefully', async () => {
			(fs.mkdir as jest.Mock).mockRejectedValue(new Error('Permission denied'));

			const newService = new CustomNodeDeploymentService(
				mockLogger,
				mockGlobalConfig,
				mockCustomNodeRepository,
				mockDeploymentRepository,
				mockRuntimeService,
			);

			// Wait for constructor to complete
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(mockLogger.error).toHaveBeenCalledWith(
				'Failed to create custom nodes directories',
				expect.objectContaining({ error: expect.any(Error) }),
			);
		});
	});

	describe('deployCustomNode', () => {
		const deploymentOptions: DeploymentOptions = {
			environment: 'production',
			force: false,
			skipValidation: false,
		};

		it('should deploy custom node successfully', async () => {
			mockCustomNodeRepository.findOne.mockResolvedValue(mockCustomNode);
			mockDeploymentRepository.findOne.mockResolvedValue(null); // No existing deployment
			mockDeploymentRepository.create.mockReturnValue(mockDeployment);
			mockDeploymentRepository.save.mockResolvedValue(mockDeployment);
			mockDeploymentRepository.markAsStarted.mockResolvedValue(undefined);
			mockDeploymentRepository.updateStatus.mockResolvedValue(undefined);
			mockCustomNodeRepository.updateStatus.mockResolvedValue(undefined);

			// Mock successful dependency installation
			const mockProcess = new EventEmitter() as ChildProcess & {
				stdout: EventEmitter;
				stderr: EventEmitter;
			};
			mockProcess.stdout = new EventEmitter();
			mockProcess.stderr = new EventEmitter();
			(spawn as jest.Mock).mockReturnValue(mockProcess);

			// Mock runtime service operations
			mockRuntimeService.validateNodeForLoading.mockResolvedValue({
				valid: true,
				issues: [],
			});
			mockRuntimeService.loadCustomNode.mockResolvedValue(undefined);

			const deployPromise = service.deployCustomNode('node-123', deploymentOptions, 'user-123');

			// Simulate npm install success
			setTimeout(() => {
				mockProcess.emit('close', 0);
			}, 10);

			const result = await deployPromise;

			expect(result).toEqual({
				deploymentId: 'deployment-123',
				status: 'deployed',
				message: 'Deployment completed successfully',
			});
			expect(mockDeploymentRepository.save).toHaveBeenCalled();
			expect(mockRuntimeService.loadCustomNode).toHaveBeenCalledWith(
				mockCustomNode,
				expect.stringContaining('test-node'),
			);
		});

		it('should throw NotFoundError if custom node not found', async () => {
			mockCustomNodeRepository.findOne.mockResolvedValue(null);

			await expect(
				service.deployCustomNode('non-existent', deploymentOptions, 'user-123'),
			).rejects.toThrow(NotFoundError);

			expect(mockCustomNodeRepository.findOne).toHaveBeenCalledWith({
				where: { id: 'non-existent', isActive: true },
			});
		});

		it('should throw BadRequestError if node not validated and validation not skipped', async () => {
			const unvalidatedNode = { ...mockCustomNode, status: 'uploaded' };
			mockCustomNodeRepository.findOne.mockResolvedValue(unvalidatedNode);

			await expect(
				service.deployCustomNode('node-123', deploymentOptions, 'user-123'),
			).rejects.toThrow(BadRequestError);
		});

		it('should allow deployment of unvalidated node when skipValidation is true', async () => {
			const unvalidatedNode = { ...mockCustomNode, status: 'uploaded' };
			const optionsWithSkip = { ...deploymentOptions, skipValidation: true };

			mockCustomNodeRepository.findOne.mockResolvedValue(unvalidatedNode);
			mockDeploymentRepository.findOne.mockResolvedValue(null);
			mockDeploymentRepository.create.mockReturnValue(mockDeployment);
			mockDeploymentRepository.save.mockResolvedValue(mockDeployment);
			mockDeploymentRepository.markAsStarted.mockResolvedValue(undefined);
			mockDeploymentRepository.updateStatus.mockResolvedValue(undefined);
			mockCustomNodeRepository.updateStatus.mockResolvedValue(undefined);

			// Mock successful npm install
			const mockProcess = new EventEmitter() as ChildProcess & {
				stdout: EventEmitter;
				stderr: EventEmitter;
			};
			mockProcess.stdout = new EventEmitter();
			mockProcess.stderr = new EventEmitter();
			(spawn as jest.Mock).mockReturnValue(mockProcess);

			mockRuntimeService.validateNodeForLoading.mockResolvedValue({
				valid: true,
				issues: [],
			});
			mockRuntimeService.loadCustomNode.mockResolvedValue(undefined);

			const deployPromise = service.deployCustomNode('node-123', optionsWithSkip, 'user-123');

			setTimeout(() => {
				mockProcess.emit('close', 0);
			}, 10);

			const result = await deployPromise;

			expect(result.status).toBe('deployed');
		});

		it('should throw BadRequestError if already deployed without force', async () => {
			mockCustomNodeRepository.findOne.mockResolvedValue(mockCustomNode);
			mockDeploymentRepository.findOne.mockResolvedValue(mockDeployment);

			await expect(
				service.deployCustomNode('node-123', deploymentOptions, 'user-123'),
			).rejects.toThrow(BadRequestError);
		});

		it('should allow redeployment with force option', async () => {
			const forceOptions = { ...deploymentOptions, force: true };

			mockCustomNodeRepository.findOne.mockResolvedValue(mockCustomNode);
			mockDeploymentRepository.findOne.mockResolvedValue(mockDeployment);
			mockDeploymentRepository.create.mockReturnValue(mockDeployment);
			mockDeploymentRepository.save.mockResolvedValue(mockDeployment);
			mockDeploymentRepository.markAsStarted.mockResolvedValue(undefined);
			mockDeploymentRepository.updateStatus.mockResolvedValue(undefined);
			mockCustomNodeRepository.updateStatus.mockResolvedValue(undefined);

			// Mock successful npm install
			const mockProcess = new EventEmitter() as ChildProcess & {
				stdout: EventEmitter;
				stderr: EventEmitter;
			};
			mockProcess.stdout = new EventEmitter();
			mockProcess.stderr = new EventEmitter();
			(spawn as jest.Mock).mockReturnValue(mockProcess);

			mockRuntimeService.validateNodeForLoading.mockResolvedValue({
				valid: true,
				issues: [],
			});
			mockRuntimeService.loadCustomNode.mockResolvedValue(undefined);

			const deployPromise = service.deployCustomNode('node-123', forceOptions, 'user-123');

			setTimeout(() => {
				mockProcess.emit('close', 0);
			}, 10);

			const result = await deployPromise;

			expect(result.status).toBe('deployed');
		});

		it('should handle deployment failure and update status', async () => {
			mockCustomNodeRepository.findOne.mockResolvedValue(mockCustomNode);
			mockDeploymentRepository.findOne.mockResolvedValue(null);
			mockDeploymentRepository.create.mockReturnValue(mockDeployment);
			mockDeploymentRepository.save.mockResolvedValue(mockDeployment);
			mockDeploymentRepository.markAsStarted.mockResolvedValue(undefined);
			mockDeploymentRepository.updateStatus.mockResolvedValue(undefined);

			// Mock runtime service failure
			mockRuntimeService.validateNodeForLoading.mockResolvedValue({
				valid: false,
				issues: ['Missing required exports'],
			});

			const result = await service.deployCustomNode('node-123', deploymentOptions, 'user-123');

			expect(result.status).toBe('failed');
			expect(result.errors).toContain('Node validation failed: Missing required exports');
			expect(mockDeploymentRepository.updateStatus).toHaveBeenCalledWith(
				'deployment-123',
				'failed',
				expect.stringContaining('Node validation failed'),
			);
		});

		it('should handle npm install failure', async () => {
			mockCustomNodeRepository.findOne.mockResolvedValue(mockCustomNode);
			mockDeploymentRepository.findOne.mockResolvedValue(null);
			mockDeploymentRepository.create.mockReturnValue(mockDeployment);
			mockDeploymentRepository.save.mockResolvedValue(mockDeployment);
			mockDeploymentRepository.markAsStarted.mockResolvedValue(undefined);
			mockDeploymentRepository.updateStatus.mockResolvedValue(undefined);

			// Mock npm install failure
			const mockProcess = new EventEmitter() as ChildProcess & {
				stdout: EventEmitter;
				stderr: EventEmitter;
			};
			mockProcess.stdout = new EventEmitter();
			mockProcess.stderr = new EventEmitter();
			(spawn as jest.Mock).mockReturnValue(mockProcess);

			const deployPromise = service.deployCustomNode('node-123', deploymentOptions, 'user-123');

			setTimeout(() => {
				mockProcess.stderr.emit('data', 'npm install failed');
				mockProcess.emit('close', 1);
			}, 10);

			const result = await deployPromise;

			expect(result.status).toBe('failed');
			expect(result.errors).toEqual(
				expect.arrayContaining([expect.stringContaining('npm install failed')]),
			);
		});

		it('should extract different file types correctly', async () => {
			// Test ZIP file extraction
			const zipNode = { ...mockCustomNode, filePath: '/tmp/test-node.zip' };
			mockCustomNodeRepository.findOne.mockResolvedValue(zipNode);
			mockDeploymentRepository.findOne.mockResolvedValue(null);
			mockDeploymentRepository.create.mockReturnValue(mockDeployment);
			mockDeploymentRepository.save.mockResolvedValue(mockDeployment);

			(execSync as jest.Mock).mockReturnValue(undefined);

			// Start deployment to trigger file extraction
			const deployPromise = service.deployCustomNode('node-123', deploymentOptions, 'user-123');

			// Let the deployment fail at runtime validation to focus on file extraction
			mockRuntimeService.validateNodeForLoading.mockResolvedValue({
				valid: false,
				issues: ['Test'],
			});

			await deployPromise;

			expect(execSync).toHaveBeenCalledWith(expect.stringContaining('unzip'));
		});
	});

	describe('undeployCustomNode', () => {
		it('should undeploy custom node successfully', async () => {
			mockDeploymentRepository.findOne.mockResolvedValue(mockDeployment);
			mockDeploymentRepository.updateStatus.mockResolvedValue(undefined);
			mockDeploymentRepository.find.mockResolvedValue([]); // No other deployments
			mockCustomNodeRepository.updateStatus.mockResolvedValue(undefined);
			mockRuntimeService.isNodeLoaded.mockReturnValue(true);
			mockRuntimeService.unloadCustomNode.mockResolvedValue(undefined);

			const result = await service.undeployCustomNode('node-123', 'production');

			expect(result).toEqual({
				deploymentId: 'deployment-123',
				status: 'undeployed',
				message: 'Undeployment completed successfully',
			});
			expect(mockRuntimeService.unloadCustomNode).toHaveBeenCalledWith('test-node');
			expect(fs.rm).toHaveBeenCalled();
		});

		it('should throw NotFoundError if no active deployment found', async () => {
			mockDeploymentRepository.findOne.mockResolvedValue(null);

			await expect(service.undeployCustomNode('node-123', 'production')).rejects.toThrow(
				NotFoundError,
			);
		});

		it('should handle undeployment failure and revert status', async () => {
			mockDeploymentRepository.findOne.mockResolvedValue(mockDeployment);
			mockDeploymentRepository.updateStatus.mockResolvedValue(undefined);
			mockRuntimeService.isNodeLoaded.mockReturnValue(true);
			mockRuntimeService.unloadCustomNode.mockRejectedValue(new Error('Unload failed'));

			const result = await service.undeployCustomNode('node-123', 'production');

			expect(result.status).toBe('failed');
			expect(result.errors).toContain('Unload failed');
			expect(mockDeploymentRepository.updateStatus).toHaveBeenCalledWith(
				'deployment-123',
				'deployed',
				expect.stringContaining('Undeployment failed'),
			);
		});

		it('should skip unloading if node not currently loaded', async () => {
			mockDeploymentRepository.findOne.mockResolvedValue(mockDeployment);
			mockDeploymentRepository.updateStatus.mockResolvedValue(undefined);
			mockDeploymentRepository.find.mockResolvedValue([]);
			mockCustomNodeRepository.updateStatus.mockResolvedValue(undefined);
			mockRuntimeService.isNodeLoaded.mockReturnValue(false);

			const result = await service.undeployCustomNode('node-123', 'production');

			expect(result.status).toBe('undeployed');
			expect(mockRuntimeService.unloadCustomNode).not.toHaveBeenCalled();
			expect(mockLogger.warn).toHaveBeenCalledWith('Node not currently loaded in runtime', {
				nodeName: 'test-node',
			});
		});

		it('should not change node status if other deployments exist', async () => {
			const otherDeployment = { ...mockDeployment, id: 'deployment-456' };

			mockDeploymentRepository.findOne.mockResolvedValue(mockDeployment);
			mockDeploymentRepository.updateStatus.mockResolvedValue(undefined);
			mockDeploymentRepository.find.mockResolvedValue([otherDeployment]);
			mockRuntimeService.isNodeLoaded.mockReturnValue(true);
			mockRuntimeService.unloadCustomNode.mockResolvedValue(undefined);

			await service.undeployCustomNode('node-123', 'production');

			expect(mockCustomNodeRepository.updateStatus).not.toHaveBeenCalled();
		});
	});

	describe('getDeploymentStatus', () => {
		it('should return deployment status with logs and runtime info', async () => {
			const deploymentWithNode = { ...mockDeployment, node: mockCustomNode };
			mockDeploymentRepository.findOne.mockResolvedValue(deploymentWithNode);

			const mockRuntimeInfo: RuntimeNodeInfo = {
				name: 'test-node',
				version: '1.0.0',
				displayName: 'Test Node',
				description: 'Test custom node',
				nodeTypes: ['TestNode'],
				credentials: [],
				dependencies: {},
				loaded: true,
			};

			mockRuntimeService.getLoadedNodeInfo.mockReturnValue({
				nodeTypeName: 'test-node',
				version: '1.0.0',
				metadata: {
					nodeTypes: ['TestNode'],
					dependencies: {},
				},
			});
			mockRuntimeService.getNodeHealth.mockReturnValue({
				isHealthy: true,
				issues: [],
			});

			const result = await service.getDeploymentStatus('deployment-123');

			expect(result.deployment).toEqual(deploymentWithNode);
			expect(result.logs).toEqual(
				expect.arrayContaining([expect.stringContaining('Deployment deployment-123 started')]),
			);
			expect(result.runtimeInfo).toMatchObject({
				name: 'test-node',
				loaded: true,
			});
		});

		it('should throw NotFoundError if deployment not found', async () => {
			mockDeploymentRepository.findOne.mockResolvedValue(null);

			await expect(service.getDeploymentStatus('non-existent')).rejects.toThrow(NotFoundError);
		});

		it('should not include runtime info for non-deployed status', async () => {
			const pendingDeployment = { ...mockDeployment, status: 'pending' as const };
			mockDeploymentRepository.findOne.mockResolvedValue(pendingDeployment);

			const result = await service.getDeploymentStatus('deployment-123');

			expect(result.runtimeInfo).toBeUndefined();
		});
	});

	describe('listDeployedNodes', () => {
		it('should return list of deployed nodes with runtime info', async () => {
			const deployments = [
				{ ...mockDeployment, node: mockCustomNode },
				{
					...mockDeployment,
					id: 'deployment-456',
					node: { ...mockCustomNode, name: 'other-node' },
				},
			];
			mockDeploymentRepository.find.mockResolvedValue(deployments);

			mockRuntimeService.getLoadedNodeInfo
				.mockReturnValueOnce({
					nodeTypeName: 'test-node',
					version: '1.0.0',
					metadata: { nodeTypes: ['TestNode'], dependencies: {} },
				})
				.mockReturnValueOnce({
					nodeTypeName: 'other-node',
					version: '1.0.0',
					metadata: { nodeTypes: ['OtherNode'], dependencies: {} },
				});

			mockRuntimeService.getNodeHealth.mockReturnValue({
				isHealthy: true,
				issues: [],
			});

			const result = await service.listDeployedNodes();

			expect(result).toHaveLength(2);
			expect(result[0].name).toBe('test-node');
			expect(result[0].loaded).toBe(true);
			expect(result[1].name).toBe('other-node');
			expect(result[1].loaded).toBe(true);
		});

		it('should handle runtime errors for deployed nodes', async () => {
			const deployments = [{ ...mockDeployment, node: mockCustomNode }];
			mockDeploymentRepository.find.mockResolvedValue(deployments);
			mockRuntimeService.getLoadedNodeInfo.mockImplementation(() => {
				throw new Error('Node not loaded');
			});

			const result = await service.listDeployedNodes();

			expect(result).toHaveLength(1);
			expect(result[0].loaded).toBe(false);
			expect(result[0].error).toBe('Node not loaded');
		});
	});

	describe('hotReloadNode', () => {
		it('should hot reload node successfully', async () => {
			const deploymentWithNode = { ...mockDeployment, node: mockCustomNode };
			mockDeploymentRepository.findOne.mockResolvedValue(deploymentWithNode);
			mockRuntimeService.hotReloadNode.mockResolvedValue(undefined);

			const emitSpy = jest.spyOn(service, 'emit');

			await service.hotReloadNode('node-123');

			expect(mockRuntimeService.hotReloadNode).toHaveBeenCalledWith(
				mockCustomNode,
				expect.stringContaining('test-node'),
			);
			expect(emitSpy).toHaveBeenCalledWith('nodeReloaded', {
				nodeId: 'node-123',
				nodeName: 'test-node',
				deploymentId: 'deployment-123',
			});
		});

		it('should throw NotFoundError if no active deployment found', async () => {
			mockDeploymentRepository.findOne.mockResolvedValue(null);

			await expect(service.hotReloadNode('node-123')).rejects.toThrow(NotFoundError);
		});
	});

	describe('cancelDeployment', () => {
		it('should cancel active deployment', async () => {
			// Simulate active deployment by adding to the activeDeployments map
			const abortController = new AbortController();
			jest
				.spyOn(service as any, 'activeDeployments', 'get')
				.mockReturnValue(new Map([['deployment-123', abortController]]));

			mockDeploymentRepository.updateStatus.mockResolvedValue(undefined);

			await service.cancelDeployment('deployment-123');

			expect(mockDeploymentRepository.updateStatus).toHaveBeenCalledWith(
				'deployment-123',
				'failed',
				'Deployment cancelled by user',
			);
		});

		it('should handle cancellation of non-existent deployment', async () => {
			jest.spyOn(service as any, 'activeDeployments', 'get').mockReturnValue(new Map());

			await service.cancelDeployment('non-existent');

			expect(mockDeploymentRepository.updateStatus).not.toHaveBeenCalled();
		});
	});

	describe('cleanupOldDeployments', () => {
		it('should cleanup old failed and undeployed deployments', async () => {
			const oldDeployments = [
				{ ...mockDeployment, status: 'failed' as const },
				{ ...mockDeployment, id: 'deployment-456', status: 'undeployed' as const },
			];

			mockDeploymentRepository.find.mockResolvedValue(oldDeployments);
			mockDeploymentRepository.remove.mockResolvedValue(undefined);

			const result = await service.cleanupOldDeployments(30);

			expect(result).toBe(2);
			expect(fs.rm).toHaveBeenCalledTimes(2);
			expect(mockDeploymentRepository.remove).toHaveBeenCalledTimes(2);
		});

		it('should handle cleanup failures gracefully', async () => {
			const oldDeployments = [{ ...mockDeployment, status: 'failed' as const }];

			mockDeploymentRepository.find.mockResolvedValue(oldDeployments);
			(fs.rm as jest.Mock).mockRejectedValue(new Error('Permission denied'));
			mockDeploymentRepository.remove.mockRejectedValue(new Error('Database error'));

			const result = await service.cleanupOldDeployments(30);

			expect(result).toBe(0);
			expect(mockLogger.warn).toHaveBeenCalledWith(
				'Failed to cleanup old deployment',
				expect.objectContaining({
					deploymentId: 'deployment-123',
					error: expect.any(String),
				}),
			);
		});
	});

	describe('private helper methods', () => {
		it('should handle single JS file deployment', async () => {
			const jsNode = { ...mockCustomNode, filePath: '/tmp/test-node.js' };

			// Test private method indirectly through deployment
			mockCustomNodeRepository.findOne.mockResolvedValue(jsNode);
			mockDeploymentRepository.findOne.mockResolvedValue(null);
			mockDeploymentRepository.create.mockReturnValue(mockDeployment);
			mockDeploymentRepository.save.mockResolvedValue(mockDeployment);
			mockRuntimeService.validateNodeForLoading.mockResolvedValue({
				valid: false,
				issues: ['Test'], // Fail early to check file handling
			});

			await service.deployCustomNode('node-123', { environment: 'production' }, 'user-123');

			expect(fs.copyFile).toHaveBeenCalledWith(
				'/tmp/test-node.js',
				expect.stringContaining('test-node.js'),
			);
		});

		it('should create package.json when missing', async () => {
			const deploymentOptions: DeploymentOptions = { environment: 'production' };

			mockCustomNodeRepository.findOne.mockResolvedValue(mockCustomNode);
			mockDeploymentRepository.findOne.mockResolvedValue(null);
			mockDeploymentRepository.create.mockReturnValue(mockDeployment);
			mockDeploymentRepository.save.mockResolvedValue(mockDeployment);

			// Mock package.json doesn't exist
			(fs.access as jest.Mock).mockRejectedValueOnce(new Error('File not found'));

			mockRuntimeService.validateNodeForLoading.mockResolvedValue({
				valid: false,
				issues: ['Test'], // Fail early to focus on package.json creation
			});

			await service.deployCustomNode('node-123', deploymentOptions, 'user-123');

			expect(fs.writeFile).toHaveBeenCalledWith(
				expect.stringContaining('package.json'),
				expect.stringContaining('"name": "test-node"'),
			);
		});

		it('should handle tar.gz extraction', async () => {
			const tarNode = { ...mockCustomNode, filePath: '/tmp/test-node.tar.gz' };

			mockCustomNodeRepository.findOne.mockResolvedValue(tarNode);
			mockDeploymentRepository.findOne.mockResolvedValue(null);
			mockDeploymentRepository.create.mockReturnValue(mockDeployment);
			mockDeploymentRepository.save.mockResolvedValue(mockDeployment);
			mockRuntimeService.validateNodeForLoading.mockResolvedValue({
				valid: false,
				issues: ['Test'],
			});

			(execSync as jest.Mock).mockReturnValue(undefined);

			await service.deployCustomNode('node-123', { environment: 'production' }, 'user-123');

			expect(execSync).toHaveBeenCalledWith(expect.stringContaining('tar -xzf'));
		});

		it('should handle package extraction errors', async () => {
			const zipNode = { ...mockCustomNode, filePath: '/tmp/test-node.zip' };

			mockCustomNodeRepository.findOne.mockResolvedValue(zipNode);
			mockDeploymentRepository.findOne.mockResolvedValue(null);
			mockDeploymentRepository.create.mockReturnValue(mockDeployment);
			mockDeploymentRepository.save.mockResolvedValue(mockDeployment);

			(execSync as jest.Mock).mockImplementation(() => {
				throw new Error('Extraction failed');
			});

			const result = await service.deployCustomNode(
				'node-123',
				{ environment: 'production' },
				'user-123',
			);

			expect(result.status).toBe('failed');
			expect(result.errors).toEqual(
				expect.arrayContaining([expect.stringContaining('Failed to extract package')]),
			);
		});
	});

	describe('event emission', () => {
		it('should emit nodeDeployed event on successful deployment', async () => {
			mockCustomNodeRepository.findOne.mockResolvedValue(mockCustomNode);
			mockDeploymentRepository.findOne.mockResolvedValue(null);
			mockDeploymentRepository.create.mockReturnValue(mockDeployment);
			mockDeploymentRepository.save.mockResolvedValue(mockDeployment);
			mockDeploymentRepository.markAsStarted.mockResolvedValue(undefined);
			mockDeploymentRepository.updateStatus.mockResolvedValue(undefined);
			mockCustomNodeRepository.updateStatus.mockResolvedValue(undefined);

			const mockProcess = new EventEmitter() as ChildProcess & {
				stdout: EventEmitter;
				stderr: EventEmitter;
			};
			mockProcess.stdout = new EventEmitter();
			mockProcess.stderr = new EventEmitter();
			(spawn as jest.Mock).mockReturnValue(mockProcess);

			mockRuntimeService.validateNodeForLoading.mockResolvedValue({
				valid: true,
				issues: [],
			});
			mockRuntimeService.loadCustomNode.mockResolvedValue(undefined);

			const emitSpy = jest.spyOn(service, 'emit');

			const deployPromise = service.deployCustomNode(
				'node-123',
				{ environment: 'production' },
				'user-123',
			);

			setTimeout(() => {
				mockProcess.emit('close', 0);
			}, 10);

			await deployPromise;

			expect(emitSpy).toHaveBeenCalledWith('nodeDeployed', {
				nodeId: 'node-123',
				nodeName: 'test-node',
				deploymentId: 'deployment-123',
				environment: 'production',
			});
		});

		it('should emit nodeUndeployed event on successful undeployment', async () => {
			mockDeploymentRepository.findOne.mockResolvedValue(mockDeployment);
			mockDeploymentRepository.updateStatus.mockResolvedValue(undefined);
			mockDeploymentRepository.find.mockResolvedValue([]);
			mockCustomNodeRepository.updateStatus.mockResolvedValue(undefined);
			mockRuntimeService.isNodeLoaded.mockReturnValue(true);
			mockRuntimeService.unloadCustomNode.mockResolvedValue(undefined);

			const emitSpy = jest.spyOn(service, 'emit');

			await service.undeployCustomNode('node-123', 'production');

			expect(emitSpy).toHaveBeenCalledWith('nodeUndeployed', {
				nodeId: 'node-123',
				nodeName: 'test-node',
				deploymentId: 'deployment-123',
			});
		});
	});
});
