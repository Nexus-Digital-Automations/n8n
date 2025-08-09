import { createPinia, setActivePinia } from 'pinia';
import { vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { useCustomNodesStore } from './customNodes.store';
import type {
	CustomNodeSummary,
	CustomNodeDetails,
	ListCustomNodesResponse,
	DeploymentResult,
	RuntimeStatus,
} from './customNodes.store';
import type { IRestApiContext } from '@/Interface';

// Mock the API functions
const mockApiCalls = vi.hoisted(() => ({
	getCustomNodes: vi.fn(),
	getCustomNode: vi.fn(),
	createCustomNode: vi.fn(),
	updateCustomNode: vi.fn(),
	deleteCustomNode: vi.fn(),
	validateCustomNode: vi.fn(),
	deployCustomNode: vi.fn(),
	undeployCustomNode: vi.fn(),
	getRuntimeStatus: vi.fn(),
	hotReloadNode: vi.fn(),
	getStatistics: vi.fn(),
}));

// Mock the useRootStore
const mockRootStore = {
	restApiContext: mock<IRestApiContext>({
		restApi: () => ({
			makeRestApiRequest: vi.fn(),
		}),
	}),
};

vi.mock('@n8n/stores/useRootStore', () => ({
	useRootStore: vi.fn(() => mockRootStore),
}));

// Mock the API module
vi.mock('./customNodes.store', async () => {
	const actual = await vi.importActual('./customNodes.store');
	return {
		...actual,
		customNodesApi: mockApiCalls,
	};
});

describe('customNodesStore', () => {
	let store: ReturnType<typeof useCustomNodesStore>;

	// Mock data
	const mockCustomNodeSummary: CustomNodeSummary = {
		id: 'node-123',
		name: 'test-node',
		version: '1.0.0',
		status: 'validated',
		description: 'Test custom node',
		author: 'test-author',
		category: 'test',
		tags: ['test', 'sample'],
		nodeTypes: ['TestNode'],
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-01T00:00:00.000Z',
		isActive: true,
	};

	const mockCustomNodeDetails: CustomNodeDetails = {
		...mockCustomNodeSummary,
		validationResults: {
			syntax: true,
			dependencies: true,
			security: true,
			tests: true,
			warnings: [],
			errors: [],
		},
		metadata: {
			nodeTypes: ['TestNode'],
			author: 'test-author',
			license: 'MIT',
			fileSize: '1024',
			dependencies: ['lodash@^4.0.0'],
		},
		deploymentInfo: {
			deployedVersion: '1.0.0',
			deploymentStatus: 'deployed',
			lastDeployment: '2024-01-01T00:00:00.000Z',
			rollbackAvailable: true,
		},
		files: [
			{
				name: 'test-node.js',
				size: 1024,
				type: 'application/javascript',
				path: '/dist/test-node.js',
			},
		],
		dependencies: [
			{
				name: 'lodash',
				version: '^4.0.0',
				resolved: true,
			},
		],
		testResults: {
			passed: 5,
			failed: 0,
			coverage: 95,
		},
	};

	const mockListResponse: ListCustomNodesResponse = {
		nodes: [mockCustomNodeSummary],
		total: 1,
		limit: 20,
		offset: 0,
		filters: {
			categories: ['test'],
			authors: ['test-author'],
			tags: ['test', 'sample'],
			statuses: ['validated'],
		},
	};

	const mockDeploymentResult: DeploymentResult = {
		deploymentId: 'deployment-123',
		status: 'deployed',
		message: 'Deployment completed successfully',
		logs: ['Deployment started', 'Node loaded', 'Deployment completed'],
	};

	const mockRuntimeStatus: RuntimeStatus = {
		nodeId: 'node-123',
		deploymentStatus: 'deployed',
		runtime: {
			isLoaded: true,
			version: '1.0.0',
			loadedAt: '2024-01-01T00:00:00.000Z',
			instances: 1,
			memory: {
				used: '10MB',
				peak: '15MB',
			},
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

	const mockStatistics = {
		total: 10,
		byStatus: {
			uploaded: 2,
			validated: 5,
			deployed: 3,
			failed: 0,
		},
		byCategory: {
			test: 5,
			utility: 3,
			integration: 2,
		},
		active: 8,
	};

	beforeEach(() => {
		setActivePinia(createPinia());
		store = useCustomNodesStore();
		vi.clearAllMocks();
	});

	describe('initial state', () => {
		it('should have correct initial state', () => {
			expect(store.customNodes).toEqual({});
			expect(store.customNodeDetails).toEqual({});
			expect(store.currentFilters).toEqual({
				status: 'all',
				category: '',
				search: '',
				tags: [],
				sortBy: 'createdAt',
				sortOrder: 'desc',
			});
			expect(store.pagination).toEqual({
				limit: 20,
				offset: 0,
				total: 0,
			});
			expect(store.loading).toEqual({
				list: false,
				details: false,
				upload: false,
				deploy: false,
				validate: false,
			});
			expect(store.availableFilters).toEqual({
				categories: [],
				authors: [],
				tags: [],
				statuses: [],
			});
			expect(store.statistics).toEqual({
				total: 0,
				byStatus: {},
				byCategory: {},
				active: 0,
			});
		});
	});

	describe('computed properties', () => {
		beforeEach(() => {
			store.customNodes = {
				'node-123': mockCustomNodeSummary,
				'node-456': {
					...mockCustomNodeSummary,
					id: 'node-456',
					name: 'second-node',
					createdAt: '2024-01-02T00:00:00.000Z',
				},
			};
		});

		describe('getCustomNodesList', () => {
			it('should return sorted list of nodes by creation date descending', () => {
				store.currentFilters.sortBy = 'createdAt';
				store.currentFilters.sortOrder = 'desc';

				const result = store.getCustomNodesList;
				expect(result).toHaveLength(2);
				expect(result[0].id).toBe('node-456'); // More recent
				expect(result[1].id).toBe('node-123'); // Older
			});

			it('should sort by name ascending when specified', () => {
				store.currentFilters.sortBy = 'name';
				store.currentFilters.sortOrder = 'asc';

				const result = store.getCustomNodesList;
				expect(result[0].name).toBe('second-node');
				expect(result[1].name).toBe('test-node');
			});
		});

		describe('getCustomNodeById', () => {
			it('should return node details when available', () => {
				store.customNodeDetails['node-123'] = mockCustomNodeDetails;

				const result = store.getCustomNodeById('node-123');
				expect(result).toEqual(mockCustomNodeDetails);
			});

			it('should return node summary when details not available', () => {
				const result = store.getCustomNodeById('node-123');
				expect(result).toEqual(mockCustomNodeSummary);
			});

			it('should return undefined for non-existent node', () => {
				const result = store.getCustomNodeById('non-existent');
				expect(result).toBeUndefined();
			});
		});

		describe('getNodesByStatus', () => {
			beforeEach(() => {
				store.customNodes = {
					'node-123': { ...mockCustomNodeSummary, status: 'validated' },
					'node-456': { ...mockCustomNodeSummary, id: 'node-456', status: 'deployed' },
					'node-789': { ...mockCustomNodeSummary, id: 'node-789', status: 'failed' },
				};
			});

			it('should return all nodes when status is "all"', () => {
				const result = store.getNodesByStatus('all');
				expect(result).toHaveLength(3);
			});

			it('should filter by specific status', () => {
				const result = store.getNodesByStatus('deployed');
				expect(result).toHaveLength(1);
				expect(result[0].id).toBe('node-456');
			});
		});

		describe('getNodesByCategory', () => {
			beforeEach(() => {
				store.customNodes = {
					'node-123': { ...mockCustomNodeSummary, category: 'test' },
					'node-456': { ...mockCustomNodeSummary, id: 'node-456', category: 'utility' },
					'node-789': { ...mockCustomNodeSummary, id: 'node-789', category: 'test' },
				};
			});

			it('should return all nodes when no category filter', () => {
				const result = store.getNodesByCategory('');
				expect(result).toHaveLength(3);
			});

			it('should filter by specific category', () => {
				const result = store.getNodesByCategory('test');
				expect(result).toHaveLength(2);
			});
		});
	});

	describe('fetchCustomNodes', () => {
		it('should fetch and set custom nodes successfully', async () => {
			mockApiCalls.getCustomNodes.mockResolvedValue(mockListResponse);

			const result = await store.fetchCustomNodes();

			expect(store.loading.list).toBe(false);
			expect(store.customNodes).toEqual({
				'node-123': mockCustomNodeSummary,
			});
			expect(store.pagination).toEqual({
				limit: 20,
				offset: 0,
				total: 1,
			});
			expect(store.availableFilters).toEqual(mockListResponse.filters);
			expect(result).toEqual(mockListResponse);
		});

		it('should handle API errors gracefully', async () => {
			mockApiCalls.getCustomNodes.mockRejectedValue(new Error('API Error'));

			await expect(store.fetchCustomNodes()).rejects.toThrow('API Error');
			expect(store.loading.list).toBe(false);
		});

		it('should pass parameters to API call', async () => {
			mockApiCalls.getCustomNodes.mockResolvedValue(mockListResponse);

			const params = {
				status: 'validated',
				category: 'test',
				search: 'test',
				limit: 10,
				offset: 5,
			};

			await store.fetchCustomNodes(params);

			expect(mockApiCalls.getCustomNodes).toHaveBeenCalledWith(
				mockRootStore.restApiContext,
				params,
			);
		});
	});

	describe('fetchCustomNodeDetails', () => {
		it('should fetch and set node details', async () => {
			mockApiCalls.getCustomNode.mockResolvedValue(mockCustomNodeDetails);

			const result = await store.fetchCustomNodeDetails('node-123');

			expect(store.loading.details).toBe(false);
			expect(store.customNodeDetails['node-123']).toEqual(mockCustomNodeDetails);
			expect(result).toEqual(mockCustomNodeDetails);
		});

		it('should update node summary when details are fetched', async () => {
			store.customNodes['node-123'] = mockCustomNodeSummary;
			mockApiCalls.getCustomNode.mockResolvedValue(mockCustomNodeDetails);

			await store.fetchCustomNodeDetails('node-123');

			expect(store.customNodes['node-123']).toEqual(mockCustomNodeDetails);
		});

		it('should handle API errors', async () => {
			mockApiCalls.getCustomNode.mockRejectedValue(new Error('Node not found'));

			await expect(store.fetchCustomNodeDetails('non-existent')).rejects.toThrow('Node not found');
			expect(store.loading.details).toBe(false);
		});
	});

	describe('uploadCustomNode', () => {
		it('should upload new custom node', async () => {
			const formData = new FormData();
			formData.append('name', 'new-node');

			mockApiCalls.createCustomNode.mockResolvedValue(mockCustomNodeSummary);

			const result = await store.uploadCustomNode(formData);

			expect(store.loading.upload).toBe(false);
			expect(store.customNodes['node-123']).toEqual(mockCustomNodeSummary);
			expect(result).toEqual(mockCustomNodeSummary);
			expect(mockApiCalls.createCustomNode).toHaveBeenCalledWith(
				mockRootStore.restApiContext,
				formData,
			);
		});

		it('should handle upload errors', async () => {
			const formData = new FormData();
			mockApiCalls.createCustomNode.mockRejectedValue(new Error('Upload failed'));

			await expect(store.uploadCustomNode(formData)).rejects.toThrow('Upload failed');
			expect(store.loading.upload).toBe(false);
		});
	});

	describe('updateCustomNode', () => {
		it('should update existing custom node', async () => {
			const formData = new FormData();
			const updatedNode = { ...mockCustomNodeSummary, description: 'Updated description' };

			mockApiCalls.updateCustomNode.mockResolvedValue(updatedNode);

			const result = await store.updateCustomNode('node-123', formData);

			expect(store.loading.upload).toBe(false);
			expect(store.customNodes['node-123']).toEqual(updatedNode);
			expect(result).toEqual(updatedNode);
		});

		it('should handle update errors', async () => {
			const formData = new FormData();
			mockApiCalls.updateCustomNode.mockRejectedValue(new Error('Update failed'));

			await expect(store.updateCustomNode('node-123', formData)).rejects.toThrow('Update failed');
			expect(store.loading.upload).toBe(false);
		});
	});

	describe('deleteCustomNode', () => {
		beforeEach(() => {
			store.customNodes['node-123'] = mockCustomNodeSummary;
			store.customNodeDetails['node-123'] = mockCustomNodeDetails;
		});

		it('should delete custom node from store', async () => {
			mockApiCalls.deleteCustomNode.mockResolvedValue({ success: true });

			await store.deleteCustomNode('node-123');

			expect(store.customNodes['node-123']).toBeUndefined();
			expect(store.customNodeDetails['node-123']).toBeUndefined();
			expect(mockApiCalls.deleteCustomNode).toHaveBeenCalledWith(
				mockRootStore.restApiContext,
				'node-123',
				undefined,
			);
		});

		it('should pass options to API call', async () => {
			mockApiCalls.deleteCustomNode.mockResolvedValue({ success: true });
			const options = { force: true, cleanup: true };

			await store.deleteCustomNode('node-123', options);

			expect(mockApiCalls.deleteCustomNode).toHaveBeenCalledWith(
				mockRootStore.restApiContext,
				'node-123',
				options,
			);
		});

		it('should handle delete errors', async () => {
			mockApiCalls.deleteCustomNode.mockRejectedValue(new Error('Delete failed'));

			await expect(store.deleteCustomNode('node-123')).rejects.toThrow('Delete failed');
		});
	});

	describe('validateCustomNode', () => {
		beforeEach(() => {
			store.customNodes['node-123'] = { ...mockCustomNodeSummary, status: 'uploaded' };
		});

		it('should validate node and update status to validated', async () => {
			const validationResult = {
				syntax: true,
				dependencies: true,
				security: true,
				tests: true,
				warnings: [],
				errors: [],
			};

			mockApiCalls.validateCustomNode.mockResolvedValue(validationResult);

			const result = await store.validateCustomNode('node-123');

			expect(store.loading.validate).toBe(false);
			expect(store.customNodes['node-123'].status).toBe('validated');
			expect(result).toEqual(validationResult);
		});

		it('should update status to failed when validation fails', async () => {
			const validationResult = {
				syntax: false,
				dependencies: true,
				security: true,
				tests: false,
				warnings: ['Some warning'],
				errors: ['Syntax error'],
			};

			mockApiCalls.validateCustomNode.mockResolvedValue(validationResult);

			await store.validateCustomNode('node-123');

			expect(store.customNodes['node-123'].status).toBe('failed');
		});

		it('should handle validation errors', async () => {
			mockApiCalls.validateCustomNode.mockRejectedValue(new Error('Validation failed'));

			await expect(store.validateCustomNode('node-123')).rejects.toThrow('Validation failed');
			expect(store.loading.validate).toBe(false);
		});
	});

	describe('deployCustomNode', () => {
		beforeEach(() => {
			store.customNodes['node-123'] = { ...mockCustomNodeSummary, status: 'validated' };
		});

		it('should deploy node successfully', async () => {
			mockApiCalls.deployCustomNode.mockResolvedValue(mockDeploymentResult);

			const result = await store.deployCustomNode('node-123');

			expect(store.loading.deploy).toBe(false);
			expect(store.customNodes['node-123'].status).toBe('deployed');
			expect(store.customNodes['node-123'].deployedAt).toBeDefined();
			expect(result).toEqual(mockDeploymentResult);
		});

		it('should pass options to API call', async () => {
			mockApiCalls.deployCustomNode.mockResolvedValue(mockDeploymentResult);
			const options = {
				environment: 'production' as const,
				force: true,
				skipValidation: false,
			};

			await store.deployCustomNode('node-123', options);

			expect(mockApiCalls.deployCustomNode).toHaveBeenCalledWith(
				mockRootStore.restApiContext,
				'node-123',
				options,
			);
		});

		it('should handle deployment errors', async () => {
			mockApiCalls.deployCustomNode.mockRejectedValue(new Error('Deployment failed'));

			await expect(store.deployCustomNode('node-123')).rejects.toThrow('Deployment failed');
			expect(store.loading.deploy).toBe(false);
		});
	});

	describe('undeployCustomNode', () => {
		beforeEach(() => {
			store.customNodes['node-123'] = {
				...mockCustomNodeSummary,
				status: 'deployed',
				deployedAt: '2024-01-01T00:00:00.000Z',
			};
		});

		it('should undeploy node successfully', async () => {
			const undeployResult = { ...mockDeploymentResult, status: 'undeployed' as const };
			mockApiCalls.undeployCustomNode.mockResolvedValue(undeployResult);

			const result = await store.undeployCustomNode('node-123');

			expect(store.loading.deploy).toBe(false);
			expect(store.customNodes['node-123'].status).toBe('validated');
			expect(store.customNodes['node-123'].deployedAt).toBeUndefined();
			expect(result).toEqual(undeployResult);
		});

		it('should pass options to API call', async () => {
			const undeployResult = { ...mockDeploymentResult, status: 'undeployed' as const };
			mockApiCalls.undeployCustomNode.mockResolvedValue(undeployResult);
			const options = { environment: 'production', force: true };

			await store.undeployCustomNode('node-123', options);

			expect(mockApiCalls.undeployCustomNode).toHaveBeenCalledWith(
				mockRootStore.restApiContext,
				'node-123',
				options,
			);
		});

		it('should handle undeploy errors', async () => {
			mockApiCalls.undeployCustomNode.mockRejectedValue(new Error('Undeploy failed'));

			await expect(store.undeployCustomNode('node-123')).rejects.toThrow('Undeploy failed');
			expect(store.loading.deploy).toBe(false);
		});
	});

	describe('getRuntimeStatus', () => {
		it('should get runtime status', async () => {
			mockApiCalls.getRuntimeStatus.mockResolvedValue(mockRuntimeStatus);

			const result = await store.getRuntimeStatus('node-123');

			expect(result).toEqual(mockRuntimeStatus);
			expect(mockApiCalls.getRuntimeStatus).toHaveBeenCalledWith(
				mockRootStore.restApiContext,
				'node-123',
			);
		});

		it('should handle runtime status errors', async () => {
			mockApiCalls.getRuntimeStatus.mockRejectedValue(new Error('Status unavailable'));

			await expect(store.getRuntimeStatus('node-123')).rejects.toThrow('Status unavailable');
		});
	});

	describe('hotReloadNode', () => {
		it('should hot reload node', async () => {
			const reloadResult = { success: true, message: 'Node reloaded successfully' };
			mockApiCalls.hotReloadNode.mockResolvedValue(reloadResult);

			const result = await store.hotReloadNode('node-123');

			expect(result).toEqual(reloadResult);
			expect(mockApiCalls.hotReloadNode).toHaveBeenCalledWith(
				mockRootStore.restApiContext,
				'node-123',
			);
		});

		it('should handle hot reload errors', async () => {
			mockApiCalls.hotReloadNode.mockRejectedValue(new Error('Reload failed'));

			await expect(store.hotReloadNode('node-123')).rejects.toThrow('Reload failed');
		});
	});

	describe('fetchStatistics', () => {
		it('should fetch and update statistics', async () => {
			mockApiCalls.getStatistics.mockResolvedValue(mockStatistics);

			const result = await store.fetchStatistics();

			expect(store.statistics).toEqual(mockStatistics);
			expect(result).toEqual(mockStatistics);
			expect(mockApiCalls.getStatistics).toHaveBeenCalledWith(mockRootStore.restApiContext);
		});

		it('should handle statistics errors', async () => {
			mockApiCalls.getStatistics.mockRejectedValue(new Error('Statistics unavailable'));

			await expect(store.fetchStatistics()).rejects.toThrow('Statistics unavailable');
		});
	});

	describe('updateFilters', () => {
		it('should update current filters', () => {
			const newFilters = {
				status: 'deployed',
				category: 'utility',
				search: 'test search',
			};

			store.updateFilters(newFilters);

			expect(store.currentFilters).toEqual({
				...store.currentFilters,
				...newFilters,
			});
		});

		it('should preserve existing filters when updating', () => {
			store.currentFilters.tags = ['existing-tag'];
			store.updateFilters({ status: 'deployed' });

			expect(store.currentFilters.tags).toEqual(['existing-tag']);
			expect(store.currentFilters.status).toBe('deployed');
		});
	});

	describe('updatePagination', () => {
		it('should update pagination settings', () => {
			const newPagination = {
				limit: 50,
				offset: 10,
				total: 100,
			};

			store.updatePagination(newPagination);

			expect(store.pagination).toEqual(newPagination);
		});

		it('should preserve existing pagination when partially updating', () => {
			store.pagination.total = 100;
			store.updatePagination({ limit: 50 });

			expect(store.pagination.total).toBe(100);
			expect(store.pagination.limit).toBe(50);
		});
	});

	describe('addCustomNode', () => {
		it('should add new node to store', () => {
			store.addCustomNode(mockCustomNodeSummary);

			expect(store.customNodes['node-123']).toEqual(mockCustomNodeSummary);
		});

		it('should overwrite existing node', () => {
			store.customNodes['node-123'] = { ...mockCustomNodeSummary, description: 'Old' };

			const updatedNode = { ...mockCustomNodeSummary, description: 'New' };
			store.addCustomNode(updatedNode);

			expect(store.customNodes['node-123'].description).toBe('New');
		});
	});

	describe('updateCustomNodeStatus', () => {
		beforeEach(() => {
			store.customNodes['node-123'] = { ...mockCustomNodeSummary, status: 'uploaded' };
		});

		it('should update node status', () => {
			store.updateCustomNodeStatus('node-123', 'validated');

			expect(store.customNodes['node-123'].status).toBe('validated');
		});

		it('should handle non-existent node gracefully', () => {
			expect(() => {
				store.updateCustomNodeStatus('non-existent', 'deployed');
			}).not.toThrow();
		});
	});

	describe('loading states', () => {
		it('should manage loading states correctly during operations', async () => {
			mockApiCalls.getCustomNodes.mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve(mockListResponse), 100)),
			);

			const fetchPromise = store.fetchCustomNodes();
			expect(store.loading.list).toBe(true);

			await fetchPromise;
			expect(store.loading.list).toBe(false);
		});

		it('should reset loading states even on errors', async () => {
			mockApiCalls.validateCustomNode.mockRejectedValue(new Error('Validation failed'));

			try {
				await store.validateCustomNode('node-123');
			} catch (error) {
				// Expected error
			}

			expect(store.loading.validate).toBe(false);
		});
	});

	describe('edge cases and error handling', () => {
		it('should handle empty API responses', async () => {
			const emptyResponse = {
				nodes: [],
				total: 0,
				limit: 20,
				offset: 0,
				filters: {
					categories: [],
					authors: [],
					tags: [],
					statuses: [],
				},
			};
			mockApiCalls.getCustomNodes.mockResolvedValue(emptyResponse);

			await store.fetchCustomNodes();

			expect(store.customNodes).toEqual({});
			expect(store.pagination.total).toBe(0);
		});

		it('should handle concurrent operations gracefully', async () => {
			mockApiCalls.getCustomNodes.mockResolvedValue(mockListResponse);
			mockApiCalls.getCustomNode.mockResolvedValue(mockCustomNodeDetails);

			// Start multiple operations concurrently
			const promises = [
				store.fetchCustomNodes(),
				store.fetchCustomNodeDetails('node-123'),
				store.fetchStatistics(),
			];

			await Promise.all(promises);

			expect(store.customNodes['node-123']).toEqual(mockCustomNodeDetails);
			expect(store.customNodeDetails['node-123']).toEqual(mockCustomNodeDetails);
		});

		it('should maintain state consistency after errors', async () => {
			store.customNodes['node-123'] = mockCustomNodeSummary;

			mockApiCalls.deleteCustomNode.mockRejectedValue(new Error('Delete failed'));

			try {
				await store.deleteCustomNode('node-123');
			} catch (error) {
				// Expected error
			}

			// Node should still exist in store since deletion failed
			expect(store.customNodes['node-123']).toEqual(mockCustomNodeSummary);
		});
	});
});
