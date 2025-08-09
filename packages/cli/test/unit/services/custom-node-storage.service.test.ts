import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import type { CustomNode, CustomNodeRepository, CustomNodeDeploymentRepository } from '@n8n/db';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { InternalServerError } from '@/errors/response-errors/internal-server.error';
import { NotFoundError } from '@/errors/response-errors/not-found.error';
import {
	CustomNodeStorageService,
	type CustomNodeCreateRequest,
	type ValidationOptions,
} from '@/services/custom-node-storage.service';
import { CustomNodeValidationService } from '@/services/custom-node-validation.service';
import { mock } from 'jest-mock-extended';
import { promises as fs } from 'fs';
import { join } from 'path';

// Mock file system operations
jest.mock('fs', () => ({
	promises: {
		access: jest.fn(),
		mkdir: jest.fn(),
		writeFile: jest.fn(),
		readFile: jest.fn(),
		unlink: jest.fn(),
		stat: jest.fn(),
		readdir: jest.fn(),
	},
}));

// Mock crypto
jest.mock('crypto', () => ({
	createHash: jest.fn(() => ({
		update: jest.fn().mockReturnThis(),
		digest: jest.fn(() => 'mock-hash'),
	})),
	randomUUID: jest.fn(() => 'mock-uuid'),
}));

// Mock path operations
jest.mock('path', () => ({
	join: jest.fn((...args) => args.join('/')),
	extname: jest.fn((path) => {
		const parts = path.split('.');
		return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
	}),
	basename: jest.fn((path) => path.split('/').pop()),
}));

// Mock stream operations
jest.mock('stream/promises', () => ({
	pipeline: jest.fn(),
}));

// Mock os
jest.mock('os', () => ({
	tmpdir: jest.fn(() => '/tmp'),
}));

describe('CustomNodeStorageService', () => {
	let service: CustomNodeStorageService;
	let mockLogger: jest.Mocked<Logger>;
	let mockGlobalConfig: jest.Mocked<GlobalConfig>;
	let mockCustomNodeRepository: jest.Mocked<CustomNodeRepository>;
	let mockDeploymentRepository: jest.Mocked<CustomNodeDeploymentRepository>;
	let mockValidationService: jest.Mocked<CustomNodeValidationService>;

	const mockCustomNode: CustomNode = {
		id: 'node-123',
		name: 'test-node',
		version: '1.0.0',
		description: 'Test custom node',
		author: 'test-author',
		category: 'test',
		tags: ['test', 'sample'],
		status: 'uploaded',
		filePath: '/tmp/n8n-custom-nodes/node-123.zip',
		fileSize: 1024000,
		nodeTypes: ['TestNode'],
		metadata: {
			dependencies: ['lodash@^4.0.0'],
			license: 'MIT',
		},
		validationResults: null,
		createdAt: new Date('2024-01-01T00:00:00.000Z'),
		updatedAt: new Date('2024-01-01T00:00:00.000Z'),
		userId: 'user-123',
	} as CustomNode;

	beforeEach(() => {
		jest.clearAllMocks();

		mockLogger = mock<Logger>();
		mockGlobalConfig = mock<GlobalConfig>({
			customNodes: {
				storageBasePath: '/custom/storage/path',
			},
		});
		mockCustomNodeRepository = mock<CustomNodeRepository>();
		mockDeploymentRepository = mock<CustomNodeDeploymentRepository>();
		mockValidationService = mock<CustomNodeValidationService>();

		// Mock fs.access to simulate directory exists
		(fs.access as jest.Mock).mockResolvedValue(undefined);

		service = new CustomNodeStorageService(
			mockLogger,
			mockGlobalConfig,
			mockCustomNodeRepository,
			mockDeploymentRepository,
			mockValidationService,
		);
	});

	describe('constructor and initialization', () => {
		it('should use custom storage path from config', () => {
			expect(mockGlobalConfig.customNodes?.storageBasePath).toBe('/custom/storage/path');
		});

		it('should create storage directory if it does not exist', async () => {
			(fs.access as jest.Mock).mockRejectedValue(new Error('Directory not found'));
			(fs.mkdir as jest.Mock).mockResolvedValue(undefined);

			service = new CustomNodeStorageService(
				mockLogger,
				mockGlobalConfig,
				mockCustomNodeRepository,
				mockDeploymentRepository,
				mockValidationService,
			);

			// Wait for constructor to complete
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(fs.mkdir).toHaveBeenCalledWith('/custom/storage/path', { recursive: true });
			expect(mockLogger.info).toHaveBeenCalledWith('Created custom nodes storage directory', {
				path: '/custom/storage/path',
			});
		});
	});

	describe('createCustomNode', () => {
		const validCreateRequest: CustomNodeCreateRequest = {
			name: 'test-node',
			version: '1.0.0',
			description: 'Test custom node',
			category: 'test',
			tags: ['test', 'sample'],
			authorId: 'user-123',
			file: {
				buffer: Buffer.from('test file content'),
				originalName: 'test-node.zip',
				mimeType: 'application/zip',
			},
		};

		it('should create custom node successfully with file upload', async () => {
			mockCustomNodeRepository.findByNameAndVersion.mockResolvedValue(null);
			mockCustomNodeRepository.save.mockResolvedValue(mockCustomNode);
			mockValidationService.validateNode.mockResolvedValue({
				syntax: true,
				dependencies: true,
				security: true,
				tests: true,
				warnings: [],
				errors: [],
			});

			const result = await service.createCustomNode(validCreateRequest);

			expect(mockCustomNodeRepository.findByNameAndVersion).toHaveBeenCalledWith(
				'test-node',
				'1.0.0',
			);
			expect(fs.writeFile).toHaveBeenCalled();
			expect(mockValidationService.validateNode).toHaveBeenCalled();
			expect(mockCustomNodeRepository.save).toHaveBeenCalled();
			expect(result).toEqual(mockCustomNode);
		});

		it('should throw BadRequestError if node with same name/version exists', async () => {
			mockCustomNodeRepository.findByNameAndVersion.mockResolvedValue(mockCustomNode);

			await expect(service.createCustomNode(validCreateRequest)).rejects.toThrow(BadRequestError);
			expect(mockCustomNodeRepository.findByNameAndVersion).toHaveBeenCalledWith(
				'test-node',
				'1.0.0',
			);
		});

		it('should throw BadRequestError for invalid file type', async () => {
			const invalidRequest = {
				...validCreateRequest,
				file: {
					...validCreateRequest.file!,
					originalName: 'test-node.txt',
					mimeType: 'text/plain',
				},
			};

			mockCustomNodeRepository.findByNameAndVersion.mockResolvedValue(null);

			await expect(service.createCustomNode(invalidRequest)).rejects.toThrow(BadRequestError);
		});

		it('should throw BadRequestError for file size exceeding limit', async () => {
			const largeFileRequest = {
				...validCreateRequest,
				file: {
					...validCreateRequest.file!,
					buffer: Buffer.alloc(11 * 1024 * 1024), // 11MB
				},
			};

			mockCustomNodeRepository.findByNameAndVersion.mockResolvedValue(null);

			await expect(service.createCustomNode(largeFileRequest)).rejects.toThrow(BadRequestError);
		});

		it('should handle validation failures', async () => {
			const validationResults = {
				syntax: false,
				dependencies: true,
				security: true,
				tests: false,
				warnings: ['Some warnings'],
				errors: ['Syntax error found'],
			};

			mockCustomNodeRepository.findByNameAndVersion.mockResolvedValue(null);
			mockValidationService.validateNode.mockResolvedValue(validationResults);
			mockCustomNodeRepository.save.mockResolvedValue({
				...mockCustomNode,
				status: 'failed',
				validationResults,
			});

			const result = await service.createCustomNode(validCreateRequest);

			expect(result.status).toBe('failed');
			expect(result.validationResults).toEqual(validationResults);
		});

		it('should skip storage if validateOnly is true', async () => {
			const validateOnlyRequest = {
				...validCreateRequest,
				validateOnly: true,
			};

			mockCustomNodeRepository.findByNameAndVersion.mockResolvedValue(null);
			mockValidationService.validateNode.mockResolvedValue({
				syntax: true,
				dependencies: true,
				security: true,
				tests: true,
				warnings: [],
				errors: [],
			});

			const result = await service.createCustomNode(validateOnlyRequest);

			expect(fs.writeFile).not.toHaveBeenCalled();
			expect(mockCustomNodeRepository.save).not.toHaveBeenCalled();
			expect(result).toEqual(
				expect.objectContaining({
					name: 'test-node',
					version: '1.0.0',
				}),
			);
		});

		it('should handle file system errors during storage', async () => {
			mockCustomNodeRepository.findByNameAndVersion.mockResolvedValue(null);
			(fs.writeFile as jest.Mock).mockRejectedValue(new Error('Disk full'));

			await expect(service.createCustomNode(validCreateRequest)).rejects.toThrow(
				InternalServerError,
			);
		});
	});

	describe('updateCustomNode', () => {
		it('should update custom node metadata successfully', async () => {
			const updateData = {
				description: 'Updated description',
				category: 'updated',
				tags: ['updated', 'test'],
			};

			mockCustomNodeRepository.findOneBy.mockResolvedValue(mockCustomNode);
			mockCustomNodeRepository.save.mockResolvedValue({
				...mockCustomNode,
				...updateData,
			});

			const result = await service.updateCustomNode('node-123', updateData);

			expect(mockCustomNodeRepository.findOneBy).toHaveBeenCalledWith({ id: 'node-123' });
			expect(mockCustomNodeRepository.save).toHaveBeenCalledWith(
				expect.objectContaining(updateData),
			);
			expect(result.description).toBe('Updated description');
		});

		it('should throw NotFoundError if node does not exist', async () => {
			mockCustomNodeRepository.findOneBy.mockResolvedValue(null);

			await expect(
				service.updateCustomNode('non-existent', { description: 'Updated' }),
			).rejects.toThrow(NotFoundError);
		});

		it('should update file and revalidate if new file provided', async () => {
			const updateData = {
				file: {
					buffer: Buffer.from('updated file content'),
					originalName: 'updated-node.zip',
					mimeType: 'application/zip',
				},
			};

			mockCustomNodeRepository.findOneBy.mockResolvedValue(mockCustomNode);
			mockValidationService.validateNode.mockResolvedValue({
				syntax: true,
				dependencies: true,
				security: true,
				tests: true,
				warnings: [],
				errors: [],
			});
			mockCustomNodeRepository.save.mockResolvedValue({
				...mockCustomNode,
				status: 'validated',
			});

			const result = await service.updateCustomNode('node-123', updateData);

			expect(fs.writeFile).toHaveBeenCalled();
			expect(mockValidationService.validateNode).toHaveBeenCalled();
			expect(result.status).toBe('validated');
		});
	});

	describe('deleteCustomNode', () => {
		it('should delete custom node successfully', async () => {
			const options = { force: false, cleanup: true };

			mockCustomNodeRepository.findOneBy.mockResolvedValue(mockCustomNode);
			mockDeploymentRepository.findBy.mockResolvedValue([]);
			mockCustomNodeRepository.remove.mockResolvedValue(mockCustomNode);

			const result = await service.deleteCustomNode('node-123', options);

			expect(mockCustomNodeRepository.findOneBy).toHaveBeenCalledWith({ id: 'node-123' });
			expect(fs.unlink).toHaveBeenCalledWith(mockCustomNode.filePath);
			expect(mockCustomNodeRepository.remove).toHaveBeenCalledWith(mockCustomNode);
			expect(result).toEqual({ success: true });
		});

		it('should throw NotFoundError if node does not exist', async () => {
			mockCustomNodeRepository.findOneBy.mockResolvedValue(null);

			await expect(service.deleteCustomNode('non-existent')).rejects.toThrow(NotFoundError);
		});

		it('should throw BadRequestError if node has active deployments and force is false', async () => {
			const activeDeployment = {
				id: 'deployment-123',
				status: 'deployed',
			};

			mockCustomNodeRepository.findOneBy.mockResolvedValue(mockCustomNode);
			mockDeploymentRepository.findBy.mockResolvedValue([activeDeployment] as any);

			await expect(service.deleteCustomNode('node-123', { force: false })).rejects.toThrow(
				BadRequestError,
			);
		});

		it('should force delete even with active deployments when force is true', async () => {
			const activeDeployment = {
				id: 'deployment-123',
				status: 'deployed',
			};

			mockCustomNodeRepository.findOneBy.mockResolvedValue(mockCustomNode);
			mockDeploymentRepository.findBy.mockResolvedValue([activeDeployment] as any);
			mockCustomNodeRepository.remove.mockResolvedValue(mockCustomNode);

			const result = await service.deleteCustomNode('node-123', { force: true });

			expect(mockCustomNodeRepository.remove).toHaveBeenCalledWith(mockCustomNode);
			expect(result).toEqual({ success: true });
		});

		it('should handle file system errors gracefully during cleanup', async () => {
			mockCustomNodeRepository.findOneBy.mockResolvedValue(mockCustomNode);
			mockDeploymentRepository.findBy.mockResolvedValue([]);
			(fs.unlink as jest.Mock).mockRejectedValue(new Error('File not found'));
			mockCustomNodeRepository.remove.mockResolvedValue(mockCustomNode);

			const result = await service.deleteCustomNode('node-123', { cleanup: true });

			expect(mockLogger.warn).toHaveBeenCalledWith(
				'Failed to delete custom node file',
				expect.any(Object),
			);
			expect(result).toEqual({ success: true });
		});
	});

	describe('validateCustomNode', () => {
		it('should validate custom node and update status', async () => {
			const validationOptions: ValidationOptions = {
				validateSyntax: true,
				validateDependencies: true,
				validateSecurity: true,
				runTests: false,
			};

			const validationResults = {
				syntax: true,
				dependencies: true,
				security: true,
				tests: false,
				warnings: ['Some warnings'],
				errors: [],
			};

			mockCustomNodeRepository.findOneBy.mockResolvedValue(mockCustomNode);
			mockValidationService.validateNode.mockResolvedValue(validationResults);
			mockCustomNodeRepository.save.mockResolvedValue({
				...mockCustomNode,
				status: 'validated',
				validationResults,
			});

			const result = await service.validateCustomNode('node-123', validationOptions);

			expect(mockCustomNodeRepository.findOneBy).toHaveBeenCalledWith({ id: 'node-123' });
			expect(mockValidationService.validateNode).toHaveBeenCalledWith(
				mockCustomNode.filePath,
				validationOptions,
			);
			expect(mockCustomNodeRepository.save).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 'validated',
					validationResults,
				}),
			);
			expect(result).toEqual(validationResults);
		});

		it('should update status to failed if validation fails', async () => {
			const validationResults = {
				syntax: false,
				dependencies: true,
				security: true,
				tests: false,
				warnings: [],
				errors: ['Syntax error'],
			};

			mockCustomNodeRepository.findOneBy.mockResolvedValue(mockCustomNode);
			mockValidationService.validateNode.mockResolvedValue(validationResults);
			mockCustomNodeRepository.save.mockResolvedValue({
				...mockCustomNode,
				status: 'failed',
				validationResults,
			});

			const result = await service.validateCustomNode('node-123');

			expect(mockCustomNodeRepository.save).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 'failed',
					validationResults,
				}),
			);
			expect(result).toEqual(validationResults);
		});
	});

	describe('getStatistics', () => {
		it('should return statistics summary', async () => {
			const mockNodes = [
				{ ...mockCustomNode, status: 'uploaded' },
				{ ...mockCustomNode, id: 'node-2', status: 'deployed' },
				{ ...mockCustomNode, id: 'node-3', status: 'deployed', category: 'utility' },
				{ ...mockCustomNode, id: 'node-4', status: 'failed' },
			];

			mockCustomNodeRepository.find.mockResolvedValue(mockNodes as CustomNode[]);

			const result = await service.getStatistics();

			expect(result).toEqual({
				total: 4,
				byStatus: {
					uploaded: 1,
					deployed: 2,
					failed: 1,
				},
				byCategory: {
					test: 3,
					utility: 1,
				},
				active: 2,
			});
		});
	});

	describe('getAvailableFilters', () => {
		it('should return available filter options', async () => {
			const mockNodes = [
				{ ...mockCustomNode, category: 'test', tags: ['test', 'sample'] },
				{ ...mockCustomNode, id: 'node-2', category: 'utility', tags: ['utility'] },
				{ ...mockCustomNode, id: 'node-3', author: 'other-author' },
			];

			mockCustomNodeRepository.find.mockResolvedValue(mockNodes as CustomNode[]);

			const result = await service.getAvailableFilters();

			expect(result).toEqual({
				categories: ['test', 'utility'],
				authors: ['test-author', 'other-author'],
				tags: ['test', 'sample', 'utility'],
				statuses: ['uploaded', 'validating', 'validated', 'failed', 'deployed'],
			});
		});
	});

	describe('batchOperation', () => {
		it('should perform batch deploy operation', async () => {
			const nodeIds = ['node-1', 'node-2', 'node-3'];
			const mockNodes = nodeIds.map((id) => ({ ...mockCustomNode, id }));

			mockCustomNodeRepository.findBy.mockResolvedValue(mockNodes as CustomNode[]);
			// Mock individual operations to succeed
			jest.spyOn(service, 'deployCustomNode' as any).mockImplementation(async (nodeId) => ({
				success: true,
				deploymentId: `deployment-${nodeId}`,
			}));

			const result = await service.batchOperation(nodeIds, 'deploy', { force: false });

			expect(result).toEqual({
				success: 3,
				failed: 0,
				results: expect.arrayContaining([
					expect.objectContaining({ nodeId: 'node-1', success: true }),
					expect.objectContaining({ nodeId: 'node-2', success: true }),
					expect.objectContaining({ nodeId: 'node-3', success: true }),
				]),
			});
		});

		it('should handle partial failures in batch operation', async () => {
			const nodeIds = ['node-1', 'node-2'];
			const mockNodes = nodeIds.map((id) => ({ ...mockCustomNode, id }));

			mockCustomNodeRepository.findBy.mockResolvedValue(mockNodes as CustomNode[]);

			// Mock first operation to succeed, second to fail
			jest.spyOn(service as any, 'deployCustomNode').mockImplementation(async (nodeId) => {
				if (nodeId === 'node-1') {
					return { success: true, deploymentId: 'deployment-node-1' };
				}
				throw new Error('Deployment failed');
			});

			const result = await service.batchOperation(nodeIds, 'deploy');

			expect(result).toEqual({
				success: 1,
				failed: 1,
				results: [
					expect.objectContaining({ nodeId: 'node-1', success: true }),
					expect.objectContaining({ nodeId: 'node-2', success: false, error: 'Deployment failed' }),
				],
			});
		});

		it('should throw BadRequestError for invalid node IDs', async () => {
			const nodeIds = ['node-1', 'non-existent'];
			mockCustomNodeRepository.findBy.mockResolvedValue([mockCustomNode] as CustomNode[]);

			await expect(service.batchOperation(nodeIds, 'deploy')).rejects.toThrow(BadRequestError);
		});
	});

	describe('private helper methods', () => {
		it('should generate file hash correctly', async () => {
			const buffer = Buffer.from('test content');

			// Access private method using bracket notation
			const hash = (service as any).generateFileHash(buffer);

			expect(hash).toBe('mock-hash');
		});

		it('should validate file type correctly', () => {
			const validFile = { originalName: 'test.zip', mimeType: 'application/zip' };
			const invalidFile = { originalName: 'test.txt', mimeType: 'text/plain' };

			expect((service as any).isValidFileType(validFile)).toBe(true);
			expect((service as any).isValidFileType(invalidFile)).toBe(false);
		});

		it('should validate file size correctly', () => {
			const validBuffer = Buffer.alloc(5 * 1024 * 1024); // 5MB
			const invalidBuffer = Buffer.alloc(15 * 1024 * 1024); // 15MB

			expect((service as any).isValidFileSize(validBuffer)).toBe(true);
			expect((service as any).isValidFileSize(invalidBuffer)).toBe(false);
		});
	});
});
