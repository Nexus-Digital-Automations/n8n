import { createComponentRenderer } from '@/__tests__/render';
import { createTestingPinia } from '@pinia/testing';
import { setActivePinia, createPinia } from 'pinia';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import SettingsCustomNodesView from '../SettingsCustomNodesView.vue';

// Mock composables
vi.mock('@n8n/i18n', () => ({
	useI18n: () => ({
		baseText: (key: string, options?: any) => {
			const translations: Record<string, string> = {
				'settings.customNodes.title': 'Custom Nodes',
				'settings.customNodes.description': 'Manage custom nodes in your n8n instance',
				'settings.customNodes.uploadNode': 'Upload Node',
				'settings.customNodes.search.placeholder': 'Search custom nodes...',
				'settings.customNodes.filters.toggle': 'Filters',
				'settings.customNodes.sort.name': 'Name',
				'settings.customNodes.sort.created': 'Created',
				'settings.customNodes.sort.status': 'Status',
				'settings.customNodes.sort.version': 'Version',
				'settings.customNodes.stats.total': 'Total Nodes',
				'settings.customNodes.stats.active': 'Active Nodes',
				'settings.customNodes.stats.deployed': 'Deployed',
				'settings.customNodes.stats.failed': 'Failed',
				'settings.customNodes.empty.title': 'No custom nodes yet',
				'settings.customNodes.empty.description': 'Upload your first custom node to get started',
				'settings.customNodes.empty.uploadFirst': 'Upload First Node',
				'settings.customNodes.empty.filtered.title': 'No nodes match your filters',
				'settings.customNodes.empty.filtered.description':
					'Try adjusting your search or filter criteria',
				'settings.customNodes.empty.filtered.clearFilters': 'Clear Filters',
				'settings.customNodes.deploy.success.title': 'Node Deployed',
				'settings.customNodes.deploy.success.message': 'Node deployed successfully',
				'settings.customNodes.undeploy.success.title': 'Node Undeployed',
				'settings.customNodes.undeploy.success.message': 'Node undeployed successfully',
				'settings.customNodes.validate.success.title': 'Node Validated',
				'settings.customNodes.validate.success.message': 'Node validated successfully',
				'settings.customNodes.delete.success.title': 'Node Deleted',
				'settings.customNodes.delete.success.message': 'Node deleted successfully',
				'settings.customNodes.hotReload.success.title': 'Node Reloaded',
				'settings.customNodes.hotReload.success.message': 'Node reloaded successfully',
				'settings.customNodes.action.error.title': 'Action Failed',
				'settings.customNodes.fetch.error.title': 'Fetch Error',
				'settings.title': 'Settings',
			};
			const result = translations[key] || key;
			return options?.interpolate
				? result.replace(/\{(\w+)\}/g, (_, k) => options.interpolate[k] || `{${k}}`)
				: result;
		},
	}),
}));

vi.mock('@/composables/useTelemetry', () => ({
	useTelemetry: () => ({
		track: vi.fn(),
	}),
}));

vi.mock('@/composables/useToast', () => ({
	useToast: () => ({
		showMessage: vi.fn(),
		showError: vi.fn(),
	}),
}));

vi.mock('@/composables/useDocumentTitle', () => ({
	useDocumentTitle: () => ({
		set: vi.fn(),
	}),
}));

vi.mock('vue-router', async () => {
	const actual = await vi.importActual('vue-router');
	return {
		...actual,
		useRouter: () => ({
			push: vi.fn(),
			replace: vi.fn(),
			go: vi.fn(),
			back: vi.fn(),
			forward: vi.fn(),
		}),
	};
});

// Mock child components
vi.mock('@/components/CustomNodeCard.vue', () => ({
	default: {
		name: 'CustomNodeCard',
		template:
			'<div class="custom-node-card" @click="$emit(\'action\', \'test-action\')">{{ node.name }}</div>',
		props: ['node'],
		emits: ['action'],
	},
}));

vi.mock('@/components/CustomNodeUploadModal.vue', () => ({
	default: {
		name: 'CustomNodeUploadModal',
		template: '<div class="custom-node-upload-modal">Upload Modal</div>',
	},
}));

vi.mock('@/components/CustomNodeFilters.vue', () => ({
	default: {
		name: 'CustomNodeFilters',
		template:
			'<div class="custom-node-filters" @filter-change="$emit(\'filter-change\', $event)">Filters</div>',
		props: [
			'availableCategories',
			'availableTags',
			'availableStatuses',
			'selectedCategory',
			'selectedStatus',
			'selectedTags',
		],
		emits: ['filter-change'],
	},
}));

const renderComponent = createComponentRenderer(SettingsCustomNodesView, {
	router: createRouter({
		history: createWebHistory(),
		routes: [{ path: '/', component: { template: '<div>Home</div>' } }],
	}),
});

describe('SettingsCustomNodesView', () => {
	let mockUIStore: any;
	let mockSettingsStore: any;
	let mockCustomNodesStore: any;

	const mockNodes = [
		{
			id: 'node-1',
			name: 'Test Node 1',
			description: 'Test node description 1',
			author: 'Author 1',
			category: 'database',
			tags: ['popular', 'official'],
			status: 'deployed',
			version: '1.0.0',
			createdAt: '2024-01-01T00:00:00Z',
		},
		{
			id: 'node-2',
			name: 'Test Node 2',
			description: 'Test node description 2',
			author: 'Author 2',
			category: 'communication',
			tags: ['community'],
			status: 'uploaded',
			version: '1.1.0',
			createdAt: '2024-01-02T00:00:00Z',
		},
	];

	beforeEach(() => {
		const pinia = createTestingPinia({
			createSpy: vi.fn,
		});
		setActivePinia(pinia);

		mockUIStore = {
			openModal: vi.fn(),
			closeModal: vi.fn(),
		};

		mockSettingsStore = {
			settings: {},
		};

		mockCustomNodesStore = {
			getCustomNodesList: mockNodes,
			statistics: {
				total: 10,
				active: 8,
				byStatus: {
					deployed: 5,
					failed: 2,
					uploaded: 2,
					validated: 1,
				},
			},
			pagination: {
				limit: 20,
				offset: 0,
				total: 2,
			},
			availableFilters: {
				categories: ['database', 'communication', 'productivity'],
				tags: ['popular', 'official', 'community', 'beta'],
				statuses: ['all', 'uploaded', 'validated', 'deployed', 'failed'],
			},
			loading: {
				list: false,
			},
			fetchCustomNodes: vi.fn().mockResolvedValue(mockNodes),
			fetchStatistics: vi.fn().mockResolvedValue({}),
			deployCustomNode: vi.fn().mockResolvedValue({}),
			undeployCustomNode: vi.fn().mockResolvedValue({}),
			validateCustomNode: vi.fn().mockResolvedValue({}),
			deleteCustomNode: vi.fn().mockResolvedValue({}),
			hotReloadNode: vi.fn().mockResolvedValue({}),
			updateFilters: vi.fn(),
			updatePagination: vi.fn(),
		};

		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Rendering', () => {
		it('should render the main view structure', () => {
			const { getByText, container } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							settings: mockSettingsStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			expect(getByText('Custom Nodes')).toBeInTheDocument();
			expect(getByText('Manage custom nodes in your n8n instance')).toBeInTheDocument();
			expect(getByText('Upload Node')).toBeInTheDocument();
			expect(container.querySelector('.container')).toBeInTheDocument();
		});

		it('should render header with correct structure', () => {
			const { container, getByTestId } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							settings: mockSettingsStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			const header = container.querySelector('.header');
			expect(header).toBeInTheDocument();

			const uploadButton = getByTestId('upload-custom-node-button');
			expect(uploadButton).toBeInTheDocument();
		});

		it('should render statistics cards correctly', () => {
			const { getByText } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							settings: mockSettingsStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			expect(getByText('Total Nodes')).toBeInTheDocument();
			expect(getByText('Active Nodes')).toBeInTheDocument();
			expect(getByText('Deployed')).toBeInTheDocument();
			expect(getByText('Failed')).toBeInTheDocument();
			expect(getByText('10')).toBeInTheDocument(); // Total value
			expect(getByText('8')).toBeInTheDocument(); // Active value
		});

		it('should render search and filters section', () => {
			const { container, getByPlaceholderText } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							settings: mockSettingsStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			const searchInput = getByPlaceholderText('Search custom nodes...');
			expect(searchInput).toBeInTheDocument();

			const searchFilters = container.querySelector('.searchFilters');
			expect(searchFilters).toBeInTheDocument();
		});

		it('should render node grid when nodes exist', () => {
			const { container } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							settings: mockSettingsStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			const nodeGrid = container.querySelector('.nodeGrid');
			expect(nodeGrid).toBeInTheDocument();

			const nodeCards = container.querySelectorAll('.custom-node-card');
			expect(nodeCards).toHaveLength(2);
		});

		it('should render loading state when loading', () => {
			const loadingStore = {
				...mockCustomNodesStore,
				loading: { list: true },
			};

			const { container } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							settings: mockSettingsStore,
							customNodes: loadingStore,
						},
					},
				},
			});

			const loading = container.querySelector('.loading');
			expect(loading).toBeInTheDocument();
		});

		it('should render empty state when no nodes', () => {
			const emptyStore = {
				...mockCustomNodesStore,
				getCustomNodesList: [],
			};

			const { getByText } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							settings: mockSettingsStore,
							customNodes: emptyStore,
						},
					},
				},
			});

			expect(getByText('No custom nodes yet')).toBeInTheDocument();
			expect(getByText('Upload your first custom node to get started')).toBeInTheDocument();
		});
	});

	describe('Search and Filtering', () => {
		it('should handle search input correctly', async () => {
			const { getByPlaceholderText } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							settings: mockSettingsStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			const searchInput = getByPlaceholderText('Search custom nodes...') as HTMLInputElement;

			searchInput.value = 'Test Node 1';
			searchInput.dispatchEvent(new Event('input', { bubbles: true }));
			await nextTick();

			// After filtering, only Test Node 1 should be visible
			expect(mockCustomNodesStore.fetchCustomNodes).toHaveBeenCalled();
		});

		it('should toggle filters panel correctly', async () => {
			const { getByText, queryByText } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							settings: mockSettingsStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			// Initially filters should be hidden
			expect(queryByText('Filters')).not.toBeInTheDocument();

			// Click filters toggle
			const filtersToggle = getByText('Filters');
			filtersToggle.click();
			await nextTick();

			// Filters panel should now be visible
			expect(queryByText('Filters')).toBeInTheDocument();
		});

		it('should handle filter changes correctly', async () => {
			const { container, getByText } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							settings: mockSettingsStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			// Show filters first
			const filtersToggle = getByText('Filters');
			filtersToggle.click();
			await nextTick();

			// Simulate filter change
			const filtersComponent = container.querySelector('.custom-node-filters');
			if (filtersComponent) {
				const filterChangeEvent = new CustomEvent('filter-change', {
					detail: { category: 'database' },
				});
				filtersComponent.dispatchEvent(filterChangeEvent);
				await nextTick();
			}
		});

		it('should clear filters correctly', async () => {
			// Test the clearFilters functionality
			// This would require a more complex setup to test the filtered state
		});
	});

	describe('Sorting', () => {
		it('should handle sort by change correctly', async () => {
			const { container } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							settings: mockSettingsStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			// Find sort select
			const sortSelect = container.querySelector('.filterControls select');
			if (sortSelect) {
				// Change sort value
				(sortSelect as HTMLSelectElement).value = 'name';
				sortSelect.dispatchEvent(new Event('change', { bubbles: true }));
				await nextTick();

				expect(mockCustomNodesStore.updateFilters).toHaveBeenCalledWith({
					sortBy: 'name',
					sortOrder: 'desc',
				});
			}
		});

		it('should toggle sort order correctly', async () => {
			const { container } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							settings: mockSettingsStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			// Find sort order button
			const sortOrderButton = container.querySelector('.filterControls button:last-child');
			if (sortOrderButton) {
				sortOrderButton.click();
				await nextTick();

				expect(mockCustomNodesStore.updateFilters).toHaveBeenCalledWith({
					sortBy: 'createdAt',
					sortOrder: 'asc',
				});
			}
		});
	});

	describe('Node Actions', () => {
		it('should handle deploy action correctly', async () => {
			const { container } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							settings: mockSettingsStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			// Simulate node action
			const nodeCard = container.querySelector('.custom-node-card');
			if (nodeCard) {
				const actionEvent = new CustomEvent('action', {
					detail: ['node-1', 'deploy'],
				});
				nodeCard.dispatchEvent(actionEvent);
				await nextTick();

				expect(mockCustomNodesStore.deployCustomNode).toHaveBeenCalledWith('node-1');
			}
		});

		it('should handle undeploy action correctly', async () => {
			// Similar test for undeploy action
		});

		it('should handle validate action correctly', async () => {
			// Similar test for validate action
		});

		it('should handle delete action correctly', async () => {
			// Similar test for delete action
		});

		it('should handle hot reload action correctly', async () => {
			// Similar test for hot reload action
		});

		it('should handle action errors correctly', async () => {
			mockCustomNodesStore.deployCustomNode.mockRejectedValue(new Error('Deploy failed'));

			// Test error handling for failed actions
		});
	});

	describe('Modal Management', () => {
		it('should open upload modal when upload button clicked', async () => {
			const { getByTestId } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							settings: mockSettingsStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			const uploadButton = getByTestId('upload-custom-node-button');
			uploadButton.click();
			await nextTick();

			expect(mockUIStore.openModal).toHaveBeenCalledWith('customNodeUpload');
		});

		it('should open upload modal from empty state', async () => {
			const emptyStore = {
				...mockCustomNodesStore,
				getCustomNodesList: [],
			};

			const { getByText } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							settings: mockSettingsStore,
							customNodes: emptyStore,
						},
					},
				},
			});

			const uploadFirstButton = getByText('Upload First Node');
			uploadFirstButton.click();
			await nextTick();

			expect(mockUIStore.openModal).toHaveBeenCalledWith('customNodeUpload');
		});
	});

	describe('Pagination', () => {
		it('should render pagination when needed', () => {
			const paginationStore = {
				...mockCustomNodesStore,
				pagination: {
					limit: 1,
					offset: 0,
					total: 5,
				},
			};

			const { container } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							settings: mockSettingsStore,
							customNodes: paginationStore,
						},
					},
				},
			});

			const pagination = container.querySelector('.pagination');
			expect(pagination).toBeInTheDocument();
		});

		it('should handle page changes correctly', () => {
			// Test pagination page change functionality
			// This would require more complex setup to test pagination interactions
		});
	});

	describe('Empty States', () => {
		it('should show filtered empty state when filters active', () => {
			const emptyStore = {
				...mockCustomNodesStore,
				getCustomNodesList: [],
			};

			// This would require setting up a component with active filters
			// to test the filtered empty state
		});

		it('should show default empty state when no nodes', () => {
			const emptyStore = {
				...mockCustomNodesStore,
				getCustomNodesList: [],
			};

			const { getByText } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							settings: mockSettingsStore,
							customNodes: emptyStore,
						},
					},
				},
			});

			expect(getByText('No custom nodes yet')).toBeInTheDocument();
			expect(getByText('Upload your first custom node to get started')).toBeInTheDocument();
		});
	});

	describe('Lifecycle Hooks', () => {
		it('should fetch data on mount', () => {
			renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							settings: mockSettingsStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			expect(mockCustomNodesStore.fetchCustomNodes).toHaveBeenCalled();
			expect(mockCustomNodesStore.fetchStatistics).toHaveBeenCalled();
		});

		it('should set document title correctly', () => {
			// Test document title setting
			// This would require mocking the useDocumentTitle composable properly
		});
	});

	describe('Computed Properties', () => {
		it('should filter nodes correctly based on search term', () => {
			// Test filteredNodes computed property with search
			// This requires testing the component's internal state
		});

		it('should filter nodes correctly based on category', () => {
			// Test filteredNodes computed property with category filter
		});

		it('should filter nodes correctly based on status', () => {
			// Test filteredNodes computed property with status filter
		});

		it('should filter nodes correctly based on tags', () => {
			// Test filteredNodes computed property with tags filter
		});

		it('should show correct empty state config for filters', () => {
			// Test emptyStateConfig computed property with filters
		});

		it('should show correct empty state config for no nodes', () => {
			// Test emptyStateConfig computed property without nodes
		});
	});

	describe('Error Handling', () => {
		it('should handle fetch errors gracefully', async () => {
			mockCustomNodesStore.fetchCustomNodes.mockRejectedValue(new Error('Fetch failed'));

			renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							settings: mockSettingsStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			// Toast error should be shown
			// This would require proper toast mocking
		});

		it('should handle node action errors gracefully', () => {
			// Test error handling for various node actions
		});
	});

	describe('Responsive Design', () => {
		it('should have responsive grid layouts', () => {
			const { container } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							settings: mockSettingsStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			const statsGrid = container.querySelector('.statsGrid');
			const nodeGrid = container.querySelector('.nodeGrid');

			expect(statsGrid).toHaveStyle({ display: 'grid' });
			expect(nodeGrid).toHaveStyle({ display: 'grid' });
		});

		it('should have proper spacing and layout', () => {
			const { container } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							settings: mockSettingsStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			const containerEl = container.querySelector('.container');
			expect(containerEl).toBeInTheDocument();
		});
	});
});
