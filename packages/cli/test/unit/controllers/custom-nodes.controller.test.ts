import type { Response } from 'express';
import { Container } from '@n8n/di';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { NotFoundError } from '@/errors/response-errors/not-found.error';
import { CustomNodesController } from '@/controllers/custom-nodes.controller';
import { CustomNodeStorageService } from '@/services/custom-node-storage.service';
import { CustomNodeDeploymentService } from '@/services/custom-node-deployment.service';
import { mock } from 'jest-mock-extended';
import type { AuthenticatedRequest } from '@/requests';
import type { IUser } from 'n8n-workflow';
import type {
	CustomNodeRepository,
	CustomNodeDeploymentRepository,
	CustomNode,
	CustomNodeDeployment,
} from '@n8n/db';

// Mock the decorators
jest.mock('@/decorators', () => ({
	Get: jest.fn(() => jest.fn()),
	Post: jest.fn(() => jest.fn()),
	Put: jest.fn(() => jest.fn()),
	Delete: jest.fn(() => jest.fn()),
	RestController: jest.fn(() => jest.fn()),
	GlobalScope: jest.fn(() => jest.fn()),
}));

// Mock Container
jest.mock('@n8n/di', () => ({
	Container: {
		get: jest.fn(),
	},
}));

describe('CustomNodesController', () => {
	let controller: CustomNodesController;
	let mockCustomNodeRepository: jest.Mocked<CustomNodeRepository>;
	let mockDeploymentRepository: jest.Mocked<CustomNodeDeploymentRepository>;
	let mockStorageService: jest.Mocked<CustomNodeStorageService>;
	let mockDeploymentService: jest.Mocked<CustomNodeDeploymentService>;
	let req: AuthenticatedRequest<any, any, any>;
	let res: Response;
	let user: IUser;

	const mockCustomNode: CustomNode = {
		id: 'node-123',
		name: 'test-node',
		version: '1.0.0',
		description: 'Test custom node',
		author: 'test-author',
		category: 'test',
		tags: ['test', 'sample'],
		status: 'uploaded',
		filePath: '/path/to/node',
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

	const mockDeployment: CustomNodeDeployment = {
		id: 'deployment-123',
		nodeId: 'node-123',
		version: '1.0.0',
		environment: 'production',
		status: 'deployed',
		deployedBy: 'user-123',
		deployedAt: new Date('2024-01-01T00:00:00.000Z'),
		rollbackAvailable: true,
		deploymentConfig: {},
		errorMessage: null,
		node: mockCustomNode,
		user: { id: 'user-123' } as IUser,
	} as CustomNodeDeployment;

	beforeEach(() => {
		// Clear all mocks
		jest.clearAllMocks();

		// Setup mocked dependencies
		mockCustomNodeRepository = mock<CustomNodeRepository>();
		mockDeploymentRepository = mock<CustomNodeDeploymentRepository>();
		mockStorageService = mock<CustomNodeStorageService>();
		mockDeploymentService = mock<CustomNodeDeploymentService>();

		// Configure Container.get to return our mocks
		(Container.get as jest.Mock).mockImplementation((token) => {
			if (token === 'CustomNodeRepository') return mockCustomNodeRepository;
			if (token === 'CustomNodeDeploymentRepository') return mockDeploymentRepository;
			if (token === CustomNodeStorageService) return mockStorageService;
			if (token === CustomNodeDeploymentService) return mockDeploymentService;
			return undefined;
		});

		// Create controller instance
		controller = new CustomNodesController();

		// Setup mock request/response objects
		user = {
			id: 'user-123',
			email: 'test@example.com',
			globalRole: { name: 'owner', scope: 'global' },
		} as IUser;

		req = mock<AuthenticatedRequest<any, any, any>>({
			user,
			params: {},
			query: {},
			body: {},
		});

		res = mock<Response>({
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis(),
		});
	});

	describe('GET /custom-nodes', () => {
		it('should return list of custom nodes with default pagination', async () => {
			const mockNodes = [mockCustomNode];
			const mockFilters = {
				categories: ['test'],
				authors: ['test-author'],
				tags: ['test', 'sample'],
				statuses: ['uploaded'],
			};

			mockCustomNodeRepository.find.mockResolvedValue(mockNodes);
			mockCustomNodeRepository.count.mockResolvedValue(1);
			mockStorageService.getAvailableFilters.mockResolvedValue(mockFilters);

			await controller.listCustomNodes(req, res);

			expect(mockCustomNodeRepository.find).toHaveBeenCalledWith({
				skip: 0,
				take: 20,
				order: { createdAt: 'DESC' },
				where: {},
			});
			expect(res.json).toHaveBeenCalledWith({
				nodes: mockNodes,
				total: 1,
				limit: 20,
				offset: 0,
				filters: mockFilters,
			});
		});

		it('should apply filters and pagination from query parameters', async () => {
			req.query = {
				status: 'deployed',
				category: 'test',
				search: 'test-node',
				tags: 'test,sample',
				limit: '10',
				offset: '5',
				sortBy: 'name',
				sortOrder: 'asc',
			};

			const mockNodes = [mockCustomNode];
			mockCustomNodeRepository.find.mockResolvedValue(mockNodes);
			mockCustomNodeRepository.count.mockResolvedValue(1);
			mockStorageService.getAvailableFilters.mockResolvedValue({
				categories: [],
				authors: [],
				tags: [],
				statuses: [],
			});

			await controller.listCustomNodes(req, res);

			expect(mockCustomNodeRepository.find).toHaveBeenCalledWith({
				skip: 5,
				take: 10,
				order: { name: 'ASC' },
				where: expect.objectContaining({
					status: 'deployed',
					category: 'test',
					tags: expect.any(Object), // Should contain IN clause for tags
				}),
			});
		});

		it('should handle invalid pagination parameters', async () => {
			req.query = {
				limit: 'invalid',
				offset: 'invalid',
			};

			mockCustomNodeRepository.find.mockResolvedValue([]);
			mockCustomNodeRepository.count.mockResolvedValue(0);
			mockStorageService.getAvailableFilters.mockResolvedValue({
				categories: [],
				authors: [],
				tags: [],
				statuses: [],
			});

			await controller.listCustomNodes(req, res);

			// Should use default values when invalid parameters provided
			expect(mockCustomNodeRepository.find).toHaveBeenCalledWith({
				skip: 0,
				take: 20,
				order: { createdAt: 'DESC' },
				where: {},
			});
		});
	});

	describe('GET /custom-nodes/:id', () => {
		it('should return custom node details when found', async () => {
			req.params = { id: 'node-123' };
			mockCustomNodeRepository.findOneBy.mockResolvedValue(mockCustomNode);

			await controller.getCustomNode(req, res);

			expect(mockCustomNodeRepository.findOneBy).toHaveBeenCalledWith({ id: 'node-123' });
			expect(res.json).toHaveBeenCalledWith(mockCustomNode);
		});

		it('should throw NotFoundError when custom node not found', async () => {
			req.params = { id: 'non-existent' };
			mockCustomNodeRepository.findOneBy.mockResolvedValue(null);

			await expect(controller.getCustomNode(req, res)).rejects.toThrow(NotFoundError);
			expect(mockCustomNodeRepository.findOneBy).toHaveBeenCalledWith({ id: 'non-existent' });
		});
	});

	describe('POST /custom-nodes', () => {
		it('should create custom node from file upload', async () => {
			const mockFile = {
				buffer: Buffer.from('test file content'),
				originalname: 'test-node.zip',
				mimetype: 'application/zip',
				size: 1024,
			} as Express.Multer.File;

			req.file = mockFile;
			req.body = {
				name: 'test-node',
				description: 'Test description',
				category: 'test',
				tags: '["test", "sample"]',
			};

			mockStorageService.createCustomNode.mockResolvedValue(mockCustomNode);

			await controller.createCustomNode(req, res);

			expect(mockStorageService.createCustomNode).toHaveBeenCalledWith(
				expect.objectContaining({
					name: 'test-node',
					description: 'Test description',
					category: 'test',
					tags: ['test', 'sample'],
					file: mockFile,
					author: user.email,
				}),
				{ userId: user.id },
			);
			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalledWith(mockCustomNode);
		});

		it('should throw BadRequestError when no file provided', async () => {
			req.body = {
				name: 'test-node',
				description: 'Test description',
			};

			await expect(controller.createCustomNode(req, res)).rejects.toThrow(BadRequestError);
		});

		it('should handle JSON source instead of file upload', async () => {
			req.body = {
				name: 'test-node',
				description: 'Test description',
				source: {
					type: 'npm',
					location: '@n8n/test-node',
					version: '1.0.0',
				},
			};

			mockStorageService.createCustomNode.mockResolvedValue(mockCustomNode);

			await controller.createCustomNode(req, res);

			expect(mockStorageService.createCustomNode).toHaveBeenCalledWith(
				expect.objectContaining({
					name: 'test-node',
					description: 'Test description',
					source: {
						type: 'npm',
						location: '@n8n/test-node',
						version: '1.0.0',
					},
					author: user.email,
				}),
				{ userId: user.id },
			);
		});
	});

	describe('PUT /custom-nodes/:id', () => {
		it('should update custom node successfully', async () => {
			req.params = { id: 'node-123' };
			req.body = {
				name: 'updated-node',
				description: 'Updated description',
				category: 'updated',
				tags: ['updated'],
			};

			const updatedNode = { ...mockCustomNode, ...req.body };
			mockCustomNodeRepository.findOneBy.mockResolvedValue(mockCustomNode);
			mockStorageService.updateCustomNode.mockResolvedValue(updatedNode);

			await controller.updateCustomNode(req, res);

			expect(mockCustomNodeRepository.findOneBy).toHaveBeenCalledWith({ id: 'node-123' });
			expect(mockStorageService.updateCustomNode).toHaveBeenCalledWith('node-123', req.body, {
				userId: user.id,
			});
			expect(res.json).toHaveBeenCalledWith(updatedNode);
		});

		it('should throw NotFoundError when custom node not found', async () => {
			req.params = { id: 'non-existent' };
			req.body = { name: 'updated-node' };
			mockCustomNodeRepository.findOneBy.mockResolvedValue(null);

			await expect(controller.updateCustomNode(req, res)).rejects.toThrow(NotFoundError);
		});
	});

	describe('DELETE /custom-nodes/:id', () => {
		it('should delete custom node successfully', async () => {
			req.params = { id: 'node-123' };
			req.query = { force: 'false', cleanup: 'true' };

			mockCustomNodeRepository.findOneBy.mockResolvedValue(mockCustomNode);
			mockStorageService.deleteCustomNode.mockResolvedValue({ success: true });

			await controller.deleteCustomNode(req, res);

			expect(mockCustomNodeRepository.findOneBy).toHaveBeenCalledWith({ id: 'node-123' });
			expect(mockStorageService.deleteCustomNode).toHaveBeenCalledWith('node-123', {
				force: false,
				cleanup: true,
				userId: user.id,
			});
			expect(res.json).toHaveBeenCalledWith({ success: true });
		});

		it('should throw NotFoundError when custom node not found', async () => {
			req.params = { id: 'non-existent' };
			mockCustomNodeRepository.findOneBy.mockResolvedValue(null);

			await expect(controller.deleteCustomNode(req, res)).rejects.toThrow(NotFoundError);
		});
	});

	describe('POST /custom-nodes/:id/validate', () => {
		it('should validate custom node successfully', async () => {
			req.params = { id: 'node-123' };
			req.body = { skipTests: false };

			const validationResult = {
				syntax: true,
				dependencies: true,
				security: true,
				tests: true,
				warnings: [],
				errors: [],
			};

			mockCustomNodeRepository.findOneBy.mockResolvedValue(mockCustomNode);
			mockStorageService.validateCustomNode.mockResolvedValue(validationResult);

			await controller.validateCustomNode(req, res);

			expect(mockCustomNodeRepository.findOneBy).toHaveBeenCalledWith({ id: 'node-123' });
			expect(mockStorageService.validateCustomNode).toHaveBeenCalledWith('node-123', {
				skipTests: false,
				userId: user.id,
			});
			expect(res.json).toHaveBeenCalledWith(validationResult);
		});
	});

	describe('POST /custom-nodes/:id/deploy', () => {
		it('should deploy custom node successfully', async () => {
			req.params = { id: 'node-123' };
			req.body = {
				environment: 'production',
				force: false,
				skipValidation: false,
			};

			const deploymentResult = {
				deploymentId: 'deployment-123',
				status: 'deploying',
				message: 'Deployment initiated successfully',
			};

			mockCustomNodeRepository.findOneBy.mockResolvedValue(mockCustomNode);
			mockDeploymentService.deployCustomNode.mockResolvedValue(deploymentResult);

			await controller.deployCustomNode(req, res);

			expect(mockCustomNodeRepository.findOneBy).toHaveBeenCalledWith({ id: 'node-123' });
			expect(mockDeploymentService.deployCustomNode).toHaveBeenCalledWith('node-123', {
				environment: 'production',
				force: false,
				skipValidation: false,
				userId: user.id,
			});
			expect(res.json).toHaveBeenCalledWith(deploymentResult);
		});
	});

	describe('DELETE /custom-nodes/:id/deploy', () => {
		it('should undeploy custom node successfully', async () => {
			req.params = { id: 'node-123' };
			req.query = { environment: 'production', force: 'false' };

			const undeployResult = {
				success: true,
				message: 'Node undeployed successfully',
			};

			mockCustomNodeRepository.findOneBy.mockResolvedValue(mockCustomNode);
			mockDeploymentService.undeployCustomNode.mockResolvedValue(undeployResult);

			await controller.undeployCustomNode(req, res);

			expect(mockCustomNodeRepository.findOneBy).toHaveBeenCalledWith({ id: 'node-123' });
			expect(mockDeploymentService.undeployCustomNode).toHaveBeenCalledWith('node-123', {
				environment: 'production',
				force: false,
				userId: user.id,
			});
			expect(res.json).toHaveBeenCalledWith(undeployResult);
		});
	});

	describe('GET /custom-nodes/:id/runtime-status', () => {
		it('should return runtime status successfully', async () => {
			req.params = { id: 'node-123' };

			const runtimeStatus = {
				nodeId: 'node-123',
				deploymentStatus: 'deployed',
				runtime: {
					isLoaded: true,
					version: '1.0.0',
					loadedAt: '2024-01-01T00:00:00.000Z',
					instances: 5,
					memory: { used: '50MB', peak: '75MB' },
					performance: {
						executionCount: 100,
						averageExecutionTime: 250,
						errorRate: 0.01,
					},
				},
				health: {
					status: 'healthy',
					lastCheck: '2024-01-01T00:00:00.000Z',
					issues: [],
				},
			};

			mockCustomNodeRepository.findOneBy.mockResolvedValue(mockCustomNode);
			mockDeploymentService.getRuntimeStatus.mockResolvedValue(runtimeStatus);

			await controller.getRuntimeStatus(req, res);

			expect(mockCustomNodeRepository.findOneBy).toHaveBeenCalledWith({ id: 'node-123' });
			expect(mockDeploymentService.getRuntimeStatus).toHaveBeenCalledWith('node-123');
			expect(res.json).toHaveBeenCalledWith(runtimeStatus);
		});
	});

	describe('POST /custom-nodes/:id/hot-reload', () => {
		it('should hot reload custom node successfully', async () => {
			req.params = { id: 'node-123' };

			const hotReloadResult = {
				success: true,
				message: 'Node hot reloaded successfully',
			};

			mockCustomNodeRepository.findOneBy.mockResolvedValue(mockCustomNode);
			mockDeploymentService.hotReloadNode.mockResolvedValue(hotReloadResult);

			await controller.hotReloadCustomNode(req, res);

			expect(mockCustomNodeRepository.findOneBy).toHaveBeenCalledWith({ id: 'node-123' });
			expect(mockDeploymentService.hotReloadNode).toHaveBeenCalledWith('node-123', {
				userId: user.id,
			});
			expect(res.json).toHaveBeenCalledWith(hotReloadResult);
		});
	});

	describe('GET /custom-nodes/statistics/summary', () => {
		it('should return statistics summary', async () => {
			const mockStatistics = {
				total: 10,
				byStatus: {
					uploaded: 2,
					validated: 3,
					deployed: 4,
					failed: 1,
				},
				byCategory: {
					test: 5,
					utility: 3,
					integration: 2,
				},
				active: 4,
			};

			mockStorageService.getStatistics.mockResolvedValue(mockStatistics);

			await controller.getStatistics(req, res);

			expect(mockStorageService.getStatistics).toHaveBeenCalledWith({ userId: user.id });
			expect(res.json).toHaveBeenCalledWith(mockStatistics);
		});
	});

	describe('POST /custom-nodes/batch', () => {
		it('should perform batch operation successfully', async () => {
			req.body = {
				nodeIds: ['node-1', 'node-2', 'node-3'],
				action: 'deploy',
				force: false,
			};

			const batchResult = {
				success: 2,
				failed: 1,
				results: [
					{ nodeId: 'node-1', success: true, message: 'Deployed successfully' },
					{ nodeId: 'node-2', success: true, message: 'Deployed successfully' },
					{ nodeId: 'node-3', success: false, error: 'Validation failed' },
				],
			};

			mockStorageService.batchOperation.mockResolvedValue(batchResult);

			await controller.performBatchOperation(req, res);

			expect(mockStorageService.batchOperation).toHaveBeenCalledWith(
				['node-1', 'node-2', 'node-3'],
				'deploy',
				{ force: false, userId: user.id },
			);
			expect(res.json).toHaveBeenCalledWith(batchResult);
		});

		it('should throw BadRequestError for invalid batch operation', async () => {
			req.body = {
				nodeIds: [],
				action: 'deploy',
			};

			await expect(controller.performBatchOperation(req, res)).rejects.toThrow(BadRequestError);
		});
	});
});
