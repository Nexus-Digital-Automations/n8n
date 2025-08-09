import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { InternalServerError } from '@/errors/response-errors/internal-server.error';
import { NotFoundError } from '@/errors/response-errors/not-found.error';
import {
	CustomNodeRuntimeService,
	type LoadedNodeInfo,
	type RuntimeNodeHealth,
	type NodeTypeInfo,
} from '@/services/custom-node-runtime.service';
import type { CustomNode } from '@n8n/db';
import { mock } from 'jest-mock-extended';
import { promises as fs } from 'fs';
import { pathExists } from 'fs-extra';

// Mock file system operations
jest.mock('fs', () => ({
	promises: {
		readFile: jest.fn(),
		access: jest.fn(),
		stat: jest.fn(),
		readdir: jest.fn(),
	},
}));

// Mock fs-extra
jest.mock('fs-extra', () => ({
	pathExists: jest.fn(),
}));

// Mock path operations
jest.mock('path', () => ({
	join: jest.fn((...args) => args.join('/')),
	dirname: jest.fn((path) => path.split('/').slice(0, -1).join('/')),
	basename: jest.fn((path) => path.split('/').pop()),
	resolve: jest.fn((path) => path),
}));

// Mock module operations
const mockRequire = {
	cache: {},
	resolve: jest.fn(),
};
global.require = mockRequire as any;

// Mock dynamic import
const mockImport = jest.fn();
global.import = mockImport as any;

// Mock setInterval and clearInterval for cleanup testing
jest.useFakeTimers();

describe('CustomNodeRuntimeService', () => {
	let service: CustomNodeRuntimeService;
	let mockLogger: jest.Mocked<Logger>;
	let mockGlobalConfig: jest.Mocked<GlobalConfig>;

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
			dependencies: { lodash: '^4.0.0' },
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

	const mockNodeClass = class TestNode {
		description = {
			displayName: 'Test Node',
			name: 'testNode',
			group: ['transform'],
		};

		async execute(items: any[]) {
			return items;
		}
	};

	const mockNodeModule = {
		TestNode: mockNodeClass,
		default: mockNodeClass,
	};

	beforeEach(() => {
		jest.clearAllMocks();
		jest.clearAllTimers();

		mockLogger = mock<Logger>();
		mockGlobalConfig = mock<GlobalConfig>();

		// Reset require cache mock
		mockRequire.cache = {};
		mockRequire.resolve.mockImplementation((path) => path);

		// Mock fs-extra pathExists to return true by default
		(pathExists as jest.Mock).mockResolvedValue(true);

		// Mock fs.readFile for package.json
		(fs.readFile as jest.Mock).mockResolvedValue(
			JSON.stringify({
				name: 'test-node',
				version: '1.0.0',
				main: 'test-node.js',
				n8n: {
					nodes: ['dist/test-node.js'],
				},
			}),
		);

		service = new CustomNodeRuntimeService(mockLogger, mockGlobalConfig);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe('constructor and initialization', () => {
		it('should initialize service and setup cache cleanup', () => {
			expect(service).toBeInstanceOf(CustomNodeRuntimeService);
			expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 1000 * 60 * 5);
		});

		it('should setup periodic health monitoring', () => {
			// Fast forward time to trigger cleanup
			jest.advanceTimersByTime(1000 * 60 * 5 + 1000);

			// Should have called the cleanup function
			expect(setInterval).toHaveBeenCalled();
		});
	});

	describe('loadCustomNode', () => {
		const deploymentPath = '/custom/nodes/test-node';

		beforeEach(() => {
			// Mock successful module loading
			mockImport.mockResolvedValue(mockNodeModule);
			mockRequire.resolve.mockReturnValue('/custom/nodes/test-node/test-node.js');
		});

		it('should load custom node successfully', async () => {
			const result = await service.loadCustomNode(mockCustomNode, deploymentPath);

			expect(result).toEqual({
				nodeTypeName: 'test-node',
				nodeClass: mockNodeModule,
				filePath: '/custom/nodes/test-node/dist/test-node.js',
				loadedAt: expect.any(Date),
				version: '1.0.0',
				metadata: {
					dependencies: { lodash: '^4.0.0' },
					nodeTypes: ['TestNode'],
					author: 'test-author',
					license: 'MIT',
				},
			});

			expect(service.isNodeLoaded('test-node')).toBe(true);
			expect(service.getLoadedNodeInfo('test-node')).toEqual(result);
		});

		it('should emit nodeLoaded event on successful load', async () => {
			const emitSpy = jest.spyOn(service, 'emit');

			await service.loadCustomNode(mockCustomNode, deploymentPath);

			expect(emitSpy).toHaveBeenCalledWith('nodeLoaded', {
				nodeId: 'node-123',
				nodeName: 'test-node',
				version: '1.0.0',
				loadedAt: expect.any(Date),
			});
		});

		it('should throw NotFoundError if deployment path does not exist', async () => {
			(pathExists as jest.Mock).mockResolvedValue(false);

			await expect(service.loadCustomNode(mockCustomNode, deploymentPath)).rejects.toThrow(
				NotFoundError,
			);

			expect(pathExists).toHaveBeenCalledWith(deploymentPath);
		});

		it('should throw NotFoundError if no valid entry point found', async () => {
			// Mock all possible entry points to not exist
			(pathExists as jest.Mock)
				.mockResolvedValueOnce(true) // deployment path exists
				.mockResolvedValueOnce(true) // package.json exists
				.mockResolvedValue(false); // all entry points don't exist

			await expect(service.loadCustomNode(mockCustomNode, deploymentPath)).rejects.toThrow(
				InternalServerError,
			);
		});

		it('should handle different entry point patterns correctly', async () => {
			// Test package.json main field
			(fs.readFile as jest.Mock).mockResolvedValue(
				JSON.stringify({
					name: 'test-node',
					main: 'lib/index.js',
				}),
			);
			(pathExists as jest.Mock)
				.mockResolvedValueOnce(true) // deployment path
				.mockResolvedValueOnce(true) // package.json
				.mockResolvedValueOnce(true); // main entry point

			await service.loadCustomNode(mockCustomNode, deploymentPath);

			expect(pathExists).toHaveBeenCalledWith('/custom/nodes/test-node/lib/index.js');
		});

		it('should handle n8n specific entry points', async () => {
			(fs.readFile as jest.Mock).mockResolvedValue(
				JSON.stringify({
					name: 'test-node',
					n8n: {
						nodes: ['dist/TestNode.js'],
					},
				}),
			);
			(pathExists as jest.Mock)
				.mockResolvedValueOnce(true) // deployment path
				.mockResolvedValueOnce(true) // package.json
				.mockResolvedValueOnce(true); // n8n entry point

			await service.loadCustomNode(mockCustomNode, deploymentPath);

			expect(pathExists).toHaveBeenCalledWith('/custom/nodes/test-node/dist/TestNode.js');
		});

		it('should handle ES module imports', async () => {
			const esModule = { default: mockNodeClass };
			mockImport.mockResolvedValue(esModule);

			const result = await service.loadCustomNode(mockCustomNode, deploymentPath);

			expect(result.nodeClass).toBe(mockNodeClass);
		});

		it('should fallback to CommonJS require if ES import fails', async () => {
			mockImport.mockRejectedValue(new Error('ES import failed'));
			global.require = jest.fn().mockReturnValue(mockNodeModule);

			const result = await service.loadCustomNode(mockCustomNode, deploymentPath);

			expect(result.nodeClass).toBe(mockNodeModule);
		});

		it('should handle single node class exports', async () => {
			mockImport.mockResolvedValue(mockNodeClass);

			const result = await service.loadCustomNode(mockCustomNode, deploymentPath);

			expect(result.metadata.nodeTypes).toContain('TestNode');
		});

		it('should handle multiple node types in object export', async () => {
			const multiNodeModule = {
				NodeA: class NodeA {},
				NodeB: class NodeB {},
				NotANode: 'string-value', // Should be ignored
			};
			mockImport.mockResolvedValue(multiNodeModule);

			const result = await service.loadCustomNode(mockCustomNode, deploymentPath);

			expect(result.metadata.nodeTypes).toContain('NodeA');
			expect(result.metadata.nodeTypes).toContain('NodeB');
			expect(result.metadata.nodeTypes).not.toContain('NotANode');
		});

		it('should throw error if no valid node types found in module', async () => {
			mockImport.mockResolvedValue({ invalid: 'export' });

			await expect(service.loadCustomNode(mockCustomNode, deploymentPath)).rejects.toThrow(
				InternalServerError,
			);
		});

		it('should clear module cache before loading', async () => {
			const entryPoint = '/custom/nodes/test-node/test-node.js';
			mockRequire.cache[entryPoint] = { some: 'cached-module' };

			await service.loadCustomNode(mockCustomNode, deploymentPath);

			expect(mockRequire.cache[entryPoint]).toBeUndefined();
		});

		it('should initialize health monitoring for loaded node', async () => {
			await service.loadCustomNode(mockCustomNode, deploymentPath);

			const health = service.getNodeHealth('test-node');
			expect(health).toEqual({
				isHealthy: true,
				lastCheck: expect.any(Date),
				issues: [],
				memoryUsage: {
					used: 0,
					peak: 0,
				},
				executionStats: {
					count: 0,
					averageTime: 0,
					errorRate: 0,
				},
			});
		});

		it('should handle malformed package.json gracefully', async () => {
			(fs.readFile as jest.Mock).mockResolvedValue('invalid json');

			// Should still try default entry points
			await service.loadCustomNode(mockCustomNode, deploymentPath);

			expect(mockLogger.warn).toHaveBeenCalledWith(
				'Failed to parse package.json',
				expect.any(Object),
			);
		});
	});

	describe('unloadCustomNode', () => {
		beforeEach(async () => {
			// Load a node first
			mockImport.mockResolvedValue(mockNodeModule);
			await service.loadCustomNode(mockCustomNode, '/custom/nodes/test-node');
		});

		it('should unload custom node successfully', async () => {
			expect(service.isNodeLoaded('test-node')).toBe(true);

			await service.unloadCustomNode('test-node');

			expect(service.isNodeLoaded('test-node')).toBe(false);
			expect(service.getLoadedNodeInfo('test-node')).toBeUndefined();
			expect(service.getNodeHealth('test-node')).toBeUndefined();
		});

		it('should emit nodeUnloaded event', async () => {
			const emitSpy = jest.spyOn(service, 'emit');

			await service.unloadCustomNode('test-node');

			expect(emitSpy).toHaveBeenCalledWith('nodeUnloaded', {
				nodeName: 'test-node',
				unloadedAt: expect.any(Date),
			});
		});

		it('should throw NotFoundError if node not loaded', async () => {
			await expect(service.unloadCustomNode('non-existent')).rejects.toThrow(NotFoundError);
		});

		it('should clear module cache when unloading', async () => {
			const filePath = '/custom/nodes/test-node/dist/test-node.js';
			mockRequire.cache[filePath] = { some: 'cached-module' };
			mockRequire.cache['/custom/nodes/test-node/related.js'] = { related: 'module' };

			await service.unloadCustomNode('test-node');

			expect(mockRequire.cache[filePath]).toBeUndefined();
			expect(mockRequire.cache['/custom/nodes/test-node/related.js']).toBeUndefined();
		});

		it('should handle unload errors gracefully', async () => {
			// Simulate error during unregistration
			const registrySpy = jest.spyOn(service, 'getNodeTypeRegistry');
			registrySpy.mockImplementation(() => {
				throw new Error('Registry error');
			});

			await expect(service.unloadCustomNode('test-node')).rejects.toThrow(InternalServerError);
		});
	});

	describe('hotReloadNode', () => {
		beforeEach(() => {
			mockImport.mockResolvedValue(mockNodeModule);
		});

		it('should hot reload loaded node successfully', async () => {
			// Load node initially
			await service.loadCustomNode(mockCustomNode, '/custom/nodes/test-node');
			expect(service.isNodeLoaded('test-node')).toBe(true);

			const emitSpy = jest.spyOn(service, 'emit');

			// Hot reload
			const result = await service.hotReloadNode(mockCustomNode, '/custom/nodes/test-node');

			expect(result.nodeTypeName).toBe('test-node');
			expect(service.isNodeLoaded('test-node')).toBe(true);
			expect(emitSpy).toHaveBeenCalledWith('nodeReloaded', {
				nodeId: 'node-123',
				nodeName: 'test-node',
				version: '1.0.0',
				reloadedAt: expect.any(Date),
				wasLoaded: true,
			});
		});

		it('should hot reload non-loaded node successfully', async () => {
			expect(service.isNodeLoaded('test-node')).toBe(false);

			const emitSpy = jest.spyOn(service, 'emit');

			const result = await service.hotReloadNode(mockCustomNode, '/custom/nodes/test-node');

			expect(result.nodeTypeName).toBe('test-node');
			expect(service.isNodeLoaded('test-node')).toBe(true);
			expect(emitSpy).toHaveBeenCalledWith('nodeReloaded', {
				nodeId: 'node-123',
				nodeName: 'test-node',
				version: '1.0.0',
				reloadedAt: expect.any(Date),
				wasLoaded: false,
			});
		});
	});

	describe('getAllLoadedNodes', () => {
		it('should return empty array when no nodes loaded', () => {
			const result = service.getAllLoadedNodes();
			expect(result).toEqual([]);
		});

		it('should return all loaded nodes', async () => {
			mockImport.mockResolvedValue(mockNodeModule);
			await service.loadCustomNode(mockCustomNode, '/custom/nodes/test-node');

			const secondNode = { ...mockCustomNode, id: 'node-456', name: 'second-node' };
			await service.loadCustomNode(secondNode, '/custom/nodes/second-node');

			const result = service.getAllLoadedNodes();
			expect(result).toHaveLength(2);
			expect(result.map((n) => n.nodeTypeName)).toContain('test-node');
			expect(result.map((n) => n.nodeTypeName)).toContain('second-node');
		});
	});

	describe('updateExecutionStats', () => {
		beforeEach(async () => {
			mockImport.mockResolvedValue(mockNodeModule);
			await service.loadCustomNode(mockCustomNode, '/custom/nodes/test-node');
		});

		it('should update execution statistics correctly', () => {
			// First execution (success)
			service.updateExecutionStats('test-node', 100, true);

			let health = service.getNodeHealth('test-node');
			expect(health?.executionStats).toEqual({
				count: 1,
				averageTime: 100,
				errorRate: 0,
			});

			// Second execution (success)
			service.updateExecutionStats('test-node', 200, true);

			health = service.getNodeHealth('test-node');
			expect(health?.executionStats).toEqual({
				count: 2,
				averageTime: 150, // (100 + 200) / 2
				errorRate: 0,
			});

			// Third execution (failure)
			service.updateExecutionStats('test-node', 50, false);

			health = service.getNodeHealth('test-node');
			expect(health?.executionStats).toEqual({
				count: 3,
				averageTime: expect.closeTo(116.67, 1), // (100 + 200 + 50) / 3
				errorRate: expect.closeTo(0.33, 1), // 1 error out of 3 executions
			});
		});

		it('should handle missing health stats gracefully', () => {
			expect(() => {
				service.updateExecutionStats('non-existent', 100, true);
			}).not.toThrow();
		});
	});

	describe('validateNodeForLoading', () => {
		const deploymentPath = '/custom/nodes/test-node';

		it('should validate node successfully', async () => {
			const result = await service.validateNodeForLoading(deploymentPath, 'test-node');

			expect(result).toEqual({
				valid: true,
				issues: [],
			});
		});

		it('should fail validation if deployment path does not exist', async () => {
			(pathExists as jest.Mock).mockResolvedValue(false);

			const result = await service.validateNodeForLoading('/non/existent', 'test-node');

			expect(result.valid).toBe(false);
			expect(result.issues).toContain('Deployment path does not exist: /non/existent');
		});

		it('should detect missing entry point', async () => {
			(pathExists as jest.Mock)
				.mockResolvedValueOnce(true) // deployment path exists
				.mockResolvedValueOnce(true) // package.json exists
				.mockResolvedValue(false); // all entry points don't exist

			const result = await service.validateNodeForLoading(deploymentPath, 'test-node');

			expect(result.valid).toBe(false);
			expect(result.issues).toContain('No valid entry point found');
		});

		it('should detect missing dependencies', async () => {
			(fs.readFile as jest.Mock).mockResolvedValue(
				JSON.stringify({
					name: 'test-node',
					dependencies: {
						lodash: '^4.0.0',
					},
				}),
			);
			(pathExists as jest.Mock)
				.mockResolvedValueOnce(true) // deployment path
				.mockResolvedValueOnce(true) // package.json
				.mockResolvedValueOnce(true) // entry point
				.mockResolvedValueOnce(false); // node_modules doesn't exist

			const result = await service.validateNodeForLoading(deploymentPath, 'test-node');

			expect(result.valid).toBe(false);
			expect(result.issues).toContain('Dependencies not installed (node_modules not found)');
		});

		it('should handle invalid package.json', async () => {
			(fs.readFile as jest.Mock).mockRejectedValue(new Error('Parse error'));

			const result = await service.validateNodeForLoading(deploymentPath, 'test-node');

			expect(result.valid).toBe(false);
			expect(result.issues).toContain('Invalid package.json file');
		});

		it('should handle validation errors gracefully', async () => {
			(pathExists as jest.Mock).mockRejectedValue(new Error('Filesystem error'));

			const result = await service.validateNodeForLoading(deploymentPath, 'test-node');

			expect(result.valid).toBe(false);
			expect(result.issues).toContain('Validation failed: Filesystem error');
		});
	});

	describe('health monitoring', () => {
		beforeEach(async () => {
			mockImport.mockResolvedValue(mockNodeModule);
			await service.loadCustomNode(mockCustomNode, '/custom/nodes/test-node');
		});

		it('should perform periodic health checks', () => {
			const health = service.getNodeHealth('test-node');
			expect(health?.isHealthy).toBe(true);

			// Mock require.resolve to fail
			mockRequire.resolve.mockImplementation(() => {
				throw new Error('Module not found');
			});

			// Fast forward to trigger health check
			jest.advanceTimersByTime(1000 * 60 * 60 + 1000);

			const updatedHealth = service.getNodeHealth('test-node');
			expect(updatedHealth?.lastCheck.getTime()).toBeGreaterThan(health!.lastCheck.getTime());
		});

		it('should update memory usage during health checks', () => {
			// Mock process.memoryUsage
			const originalMemoryUsage = process.memoryUsage;
			process.memoryUsage = jest.fn().mockReturnValue({
				heapUsed: 1024 * 1024, // 1MB
				heapTotal: 2048 * 1024,
				external: 512 * 1024,
				rss: 4096 * 1024,
			});

			// Fast forward to trigger health check
			jest.advanceTimersByTime(1000 * 60 * 60 + 1000);

			const health = service.getNodeHealth('test-node');
			expect(health?.memoryUsage?.used).toBe(1024 * 1024);
			expect(health?.memoryUsage?.peak).toBeGreaterThanOrEqual(1024 * 1024);

			// Restore original function
			process.memoryUsage = originalMemoryUsage;
		});

		it('should handle health check for non-existent nodes', () => {
			// Remove the loaded node to simulate it being removed
			service['loadedNodes'].delete('test-node');

			// Fast forward to trigger health check
			jest.advanceTimersByTime(1000 * 60 * 60 + 1000);

			// Should not throw error
			expect(() => jest.runOnlyPendingTimers()).not.toThrow();
		});
	});

	describe('getNodeTypeRegistry', () => {
		beforeEach(async () => {
			mockImport.mockResolvedValue(mockNodeModule);
			await service.loadCustomNode(mockCustomNode, '/custom/nodes/test-node');
		});

		it('should return copy of node type registry', () => {
			const registry = service.getNodeTypeRegistry();

			expect(registry).toBeInstanceOf(Map);
			expect(registry.get('TestNode')).toBe(mockNodeClass);

			// Should be a copy, not reference
			registry.set('NewType', class NewType {});
			expect(service.getNodeTypeRegistry().has('NewType')).toBe(false);
		});
	});

	describe('error handling', () => {
		it('should handle module loading failures gracefully', async () => {
			mockImport.mockRejectedValue(new Error('Module load failed'));
			global.require = jest.fn().mockImplementation(() => {
				throw new Error('CommonJS load failed');
			});

			await expect(
				service.loadCustomNode(mockCustomNode, '/custom/nodes/test-node'),
			).rejects.toThrow(InternalServerError);

			expect(mockLogger.error).toHaveBeenCalledWith(
				'Failed to load custom node',
				expect.objectContaining({
					nodeName: 'test-node',
					error: expect.any(String),
				}),
			);
		});

		it('should handle null/undefined module exports', async () => {
			mockImport.mockResolvedValue(null);

			await expect(
				service.loadCustomNode(mockCustomNode, '/custom/nodes/test-node'),
			).rejects.toThrow(InternalServerError);
		});

		it('should handle unload failures without affecting other operations', async () => {
			// Load a node first
			mockImport.mockResolvedValue(mockNodeModule);
			await service.loadCustomNode(mockCustomNode, '/custom/nodes/test-node');

			// Mock require.resolve to fail during unload
			mockRequire.resolve.mockImplementation(() => {
				throw new Error('Resolve failed');
			});

			await expect(service.unloadCustomNode('test-node')).rejects.toThrow(InternalServerError);

			expect(mockLogger.error).toHaveBeenCalledWith(
				'Failed to unload custom node',
				expect.objectContaining({
					nodeName: 'test-node',
					error: expect.any(String),
				}),
			);
		});
	});

	describe('module cache management', () => {
		beforeEach(async () => {
			mockImport.mockResolvedValue(mockNodeModule);
		});

		it('should clear related modules from cache', async () => {
			const basePath = '/custom/nodes/test-node';
			const entryPoint = `${basePath}/test-node.js`;
			const relatedModule = `${basePath}/utils.js`;

			mockRequire.cache[entryPoint] = { main: 'module' };
			mockRequire.cache[relatedModule] = { utils: 'module' };
			mockRequire.cache['/other/path/module.js'] = { other: 'module' };

			await service.loadCustomNode(mockCustomNode, basePath);

			expect(mockRequire.cache[entryPoint]).toBeUndefined();
			expect(mockRequire.cache[relatedModule]).toBeUndefined();
			expect(mockRequire.cache['/other/path/module.js']).toBeDefined(); // Should not be cleared
		});

		it('should handle cache clearing for non-existent modules', async () => {
			mockRequire.resolve.mockImplementation(() => {
				throw new Error('Module not found');
			});

			// Should not throw error
			await expect(
				service.loadCustomNode(mockCustomNode, '/custom/nodes/test-node'),
			).rejects.toThrow(InternalServerError);
		});
	});
});
