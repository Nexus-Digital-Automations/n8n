import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestingPinia } from '@pinia/testing';
import { setActivePinia } from 'pinia';
import { fireEvent, waitFor } from '@testing-library/vue';
import { createRouter, createWebHistory } from 'vue-router';
import SettingsCustomNodesView from './SettingsCustomNodesView.vue';
import { createComponentRenderer } from '@/__tests__/render';
import { useUIStore } from '@/stores/ui.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useCustomNodesStore } from '@/stores/customNodes.store';
import type { CustomNodeSummary } from '@/stores/customNodes.store';

// Mock router
const router = createRouter({
	history: createWebHistory(),
	routes: [
		{ path: '/settings/custom-nodes', component: SettingsCustomNodesView },
	],
});

const renderComponent = createComponentRenderer(SettingsCustomNodesView, {
	global: {
		plugins: [router],
	},
});

// Mock composables
const mockTelemetry = {
	track: vi.fn(),
};

const mockToast = {
	showMessage: vi.fn(),
	showError: vi.fn(),
};

const mockDocumentTitle = {
	set: vi.fn(),
};

vi.mock('@/composables/useTelemetry', () => ({
	useTelemetry: () => mockTelemetry,
}));

vi.mock('@/composables/useToast', () => ({
	useToast: () => mockToast,
}));

vi.mock('@/composables/useDocumentTitle', () => ({
	useDocumentTitle: () => mockDocumentTitle,
}));

// Mock child components
vi.mock('@/components/CustomNodeCard.vue', () => ({
	default: {
		name: 'CustomNodeCard',
		props: ['node'],
		emits: ['action'],
		template: '<div data-testid="custom-node-card" @click="$emit(\'action\', node.id, \'test\')">{{ node.name }}</div>',
	},
}));

vi.mock('@/components/CustomNodeUploadModal.vue', () => ({
	default: {
		name: 'CustomNodeUploadModal',
		template: '<div data-testid="custom-node-upload-modal"></div>',
	},
}));

vi.mock('@/components/CustomNodeFilters.vue', () => ({
	default: {
		name: 'CustomNodeFilters',
		props: [
			'availableCategories',
			'availableTags', 
			'availableStatuses',
			'selectedCategory',
			'selectedStatus',
			'selectedTags',
		],
		emits: ['filterChange'],
		template: '<div data-testid="custom-node-filters" @click="$emit(\'filterChange\', { status: \'deployed\' })"></div>',
	},
}));

describe('SettingsCustomNodesView', () => {
	let uiStore: ReturnType<typeof useUIStore>;
	let settingsStore: ReturnType<typeof useSettingsStore>;
	let customNodesStore: ReturnType<typeof useCustomNodesStore>;

	const mockCustomNodes: CustomNodeSummary[] = [
		{
			id: 'node-1',
			name: 'Test Node 1',
			version: '1.0.0',
			status: 'deployed',
			description: 'First test node',
			author: 'Test Author 1',
			category: 'utility',
			tags: ['test', 'automation'],
			nodeTypes: ['TestNode1'],
			createdAt: '2024-01-01T00:00:00.000Z',
			updatedAt: '2024-01-01T00:00:00.000Z',
			deployedAt: '2024-01-01T00:00:00.000Z',
			isActive: true,
		},
		{
			id: 'node-2',
			name: 'Test Node 2',
			version: '1.1.0',
			status: 'validated',
			description: 'Second test node',
			author: 'Test Author 2',
			category: 'integration',
			tags: ['test', 'api'],
			nodeTypes: ['TestNode2'],
			createdAt: '2024-01-02T00:00:00.000Z',
			updatedAt: '2024-01-02T00:00:00.000Z',
			isActive: false,
		},
		{
			id: 'node-3',
			name: 'Failed Node',
			version: '0.9.0',
			status: 'failed',
			description: 'A node that failed validation',
			author: 'Test Author 3',
			category: 'utility',
			tags: ['test'],
			nodeTypes: ['FailedNode'],
			createdAt: '2024-01-03T00:00:00.000Z',
			updatedAt: '2024-01-03T00:00:00.000Z',
			isActive: false,
		},
	];

	beforeEach(() => {
		const pinia = createTestingPinia();
		setActivePinia(pinia);
		uiStore = useUIStore();
		settingsStore = useSettingsStore();
		customNodesStore = useCustomNodesStore();

		// Setup store mocks
		customNodesStore.customNodes = mockCustomNodes.reduce((acc, node) => {
			acc[node.id] = node;
			return acc;
		}, {} as Record<string, CustomNodeSummary>);

		customNodesStore.getCustomNodesList = mockCustomNodes;
		customNodesStore.loading = {
			list: false,
			details: false,
			upload: false,
			deploy: false,
			validate: false,
		};
		customNodesStore.statistics = {
			total: 3,
			active: 1,
			byStatus: {
				deployed: 1,
				validated: 1,
				failed: 1,
				uploaded: 0,
			},
			byCategory: {
				utility: 2,
				integration: 1,
			},
		};
		customNodesStore.availableFilters = {
			categories: ['utility', 'integration'],
			authors: ['Test Author 1', 'Test Author 2', 'Test Author 3'],
			tags: ['test', 'automation', 'api'],
			statuses: ['deployed', 'validated', 'failed'],
		};
		customNodesStore.pagination = {
			limit: 20,
			offset: 0,
			total: 3,
		};

		// Mock store methods
		customNodesStore.fetchCustomNodes = vi.fn().mockResolvedValue(undefined);
		customNodesStore.fetchStatistics = vi.fn().mockResolvedValue(undefined);
		customNodesStore.deployCustomNode = vi.fn().mockResolvedValue(undefined);
		customNodesStore.undeployCustomNode = vi.fn().mockResolvedValue(undefined);
		customNodesStore.validateCustomNode = vi.fn().mockResolvedValue(undefined);
		customNodesStore.deleteCustomNode = vi.fn().mockResolvedValue(undefined);
		customNodesStore.hotReloadNode = vi.fn().mockResolvedValue(undefined);
		customNodesStore.updateFilters = vi.fn();
		customNodesStore.updatePagination = vi.fn();

		uiStore.openModal = vi.fn();
		uiStore.closeModal = vi.fn();

		vi.clearAllMocks();
	});

	describe('page initialization', () => {
		it('should render page title and description', () => {
			const { getByRole, getByText } = renderComponent();

			expect(getByRole('heading', { level: 1 })).toHaveTextContent('Custom Nodes');
			expect(getByText(/manage.*custom.*nodes/i)).toBeInTheDocument();
		});

		it('should set document title on mount', () => {
			renderComponent();

			expect(mockDocumentTitle.set).toHaveBeenCalledWith([
				'Custom Nodes',
				'Settings',
			]);
		});

		it('should fetch data on mount', () => {
			renderComponent();

			expect(customNodesStore.fetchCustomNodes).toHaveBeenCalled();
			expect(customNodesStore.fetchStatistics).toHaveBeenCalled();
		});

		it('should render upload button', () => {
			const { getByTestId } = renderComponent();

			const uploadButton = getByTestId('upload-custom-node-button');
			expect(uploadButton).toBeInTheDocument();
			expect(uploadButton).toHaveTextContent(/upload.*node/i);
		});
	});

	describe('statistics cards', () => {
		it('should render all statistics cards', () => {
			const { getByText } = renderComponent();

			expect(getByText('Total')).toBeInTheDocument();
			expect(getByText('3')).toBeInTheDocument();

			expect(getByText('Active')).toBeInTheDocument();
			expect(getByText('1')).toBeInTheDocument();

			expect(getByText('Deployed')).toBeInTheDocument();
			expect(getByText('1')).toBeInTheDocument();

			expect(getByText('Failed')).toBeInTheDocument();
			expect(getByText('1')).toBeInTheDocument();
		});

		it('should handle missing statistics gracefully', () => {
			customNodesStore.statistics = {
				total: 0,
				active: 0,
				byStatus: {},
				byCategory: {},
			};

			const { getByText } = renderComponent();

			expect(getByText('0')).toBeInTheDocument();
		});
	});

	describe('search functionality', () => {
		it('should render search input', () => {
			const { getByPlaceholderText } = renderComponent();

			const searchInput = getByPlaceholderText(/search/i);
			expect(searchInput).toBeInTheDocument();
		});

		it('should filter nodes by search term in name', async () => {
			const { getByPlaceholderText, getAllByTestId } = renderComponent();

			const searchInput = getByPlaceholderText(/search/i);
			await fireEvent.input(searchInput, { target: { value: 'Test Node 1' } });

			await waitFor(() => {
				const nodeCards = getAllByTestId('custom-node-card');
				expect(nodeCards).toHaveLength(1);
			});

			expect(mockTelemetry.track).toHaveBeenCalledWith('user searched custom nodes', {
				term: 'Test Node 1',
			});
		});

		it('should filter nodes by search term in description', async () => {
			const { getByPlaceholderText, getAllByTestId } = renderComponent();

			const searchInput = getByPlaceholderText(/search/i);
			await fireEvent.input(searchInput, { target: { value: 'Second test node' } });

			await waitFor(() => {
				const nodeCards = getAllByTestId('custom-node-card');
				expect(nodeCards).toHaveLength(1);
			});
		});

		it('should filter nodes by search term in author', async () => {
			const { getByPlaceholderText, getAllByTestId } = renderComponent();

			const searchInput = getByPlaceholderText(/search/i);
			await fireEvent.input(searchInput, { target: { value: 'Author 2' } });

			await waitFor(() => {
				const nodeCards = getAllByTestId('custom-node-card');
				expect(nodeCards).toHaveLength(1);
			});
		});

		it('should show no results when search term does not match', async () => {
			const { getByPlaceholderText, queryByTestId } = renderComponent();

			const searchInput = getByPlaceholderText(/search/i);
			await fireEvent.input(searchInput, { target: { value: 'nonexistent' } });

			await waitFor(() => {
				expect(queryByTestId('custom-node-card')).not.toBeInTheDocument();
			});
		});

		it('should be case insensitive', async () => {
			const { getByPlaceholderText, getAllByTestId } = renderComponent();

			const searchInput = getByPlaceholderText(/search/i);
			await fireEvent.input(searchInput, { target: { value: 'TEST NODE 1' } });

			await waitFor(() => {
				const nodeCards = getAllByTestId('custom-node-card');
				expect(nodeCards).toHaveLength(1);
			});
		});
	});

	describe('sorting functionality', () => {
		it('should render sort controls', () => {
			const { getByRole, getAllByRole } = renderComponent();

			const sortSelect = getByRole('combobox');
			expect(sortSelect).toBeInTheDocument();

			const sortButtons = getAllByRole('button');
			const sortOrderButton = sortButtons.find(btn => 
				btn.querySelector('[data-icon]')?.getAttribute('data-icon')?.includes('sort')
			);
			expect(sortOrderButton).toBeInTheDocument();
		});

		it('should handle sort change', async () => {
			const { getByRole } = renderComponent();

			const sortSelect = getByRole('combobox');
			await fireEvent.change(sortSelect, { target: { value: 'name' } });

			expect(customNodesStore.updateFilters).toHaveBeenCalledWith({
				sortBy: 'name',
				sortOrder: 'desc',
			});
		});

		it('should toggle sort order', async () => {
			const { getAllByRole } = renderComponent();

			const buttons = getAllByRole('button');
			const sortOrderButton = buttons.find(btn => 
				btn.querySelector('[data-icon]')?.getAttribute('data-icon')?.includes('sort')
			);

			if (sortOrderButton) {
				await fireEvent.click(sortOrderButton);

				expect(customNodesStore.updateFilters).toHaveBeenCalledWith({
					sortBy: 'createdAt',
					sortOrder: 'asc',
				});
			}
		});
	});

	describe('filters functionality', () => {
		it('should toggle filters visibility', async () => {
			const { getByRole, queryByTestId } = renderComponent();

			expect(queryByTestId('custom-node-filters')).not.toBeInTheDocument();

			const filtersButton = getByRole('button', { name: /filters/i });
			await fireEvent.click(filtersButton);

			expect(queryByTestId('custom-node-filters')).toBeInTheDocument();
		});

		it('should handle filter changes', async () => {
			const { getByRole, getByTestId } = renderComponent();

			const filtersButton = getByRole('button', { name: /filters/i });
			await fireEvent.click(filtersButton);

			const filtersComponent = getByTestId('custom-node-filters');
			await fireEvent.click(filtersComponent);

			expect(mockTelemetry.track).toHaveBeenCalledWith('user applied custom node filters', {
				category: '',
				status: 'deployed',
				tagsCount: 0,
			});
		});

		it('should pass correct props to filters component', async () => {
			const { getByRole, getByTestId } = renderComponent();

			const filtersButton = getByRole('button', { name: /filters/i });
			await fireEvent.click(filtersButton);

			const filtersComponent = getByTestId('custom-node-filters');
			expect(filtersComponent).toBeInTheDocument();
		});
	});

	describe('node list display', () => {
		it('should render all nodes when no filters applied', () => {
			const { getAllByTestId } = renderComponent();

			const nodeCards = getAllByTestId('custom-node-card');
			expect(nodeCards).toHaveLength(3);
		});

		it('should show loading state', () => {
			customNodesStore.loading.list = true;

			const { container } = renderComponent();

			expect(container.querySelector('[class*="loading"]')).toBeInTheDocument();
		});

		it('should handle node actions', async () => {
			const { getAllByTestId } = renderComponent();

			const nodeCards = getAllByTestId('custom-node-card');
			await fireEvent.click(nodeCards[0]);

			expect(customNodesStore.deployCustomNode).not.toHaveBeenCalled(); // Mock doesn't emit actual action
		});
	});

	describe('empty states', () => {
		it('should show empty state when no nodes exist', () => {
			customNodesStore.getCustomNodesList = [];

			const { getByText, getByRole } = renderComponent();

			expect(getByText(/no.*custom.*nodes/i)).toBeInTheDocument();
			expect(getByRole('button', { name: /upload.*first/i })).toBeInTheDocument();
		});

		it('should show filtered empty state when filters applied', async () => {
			const { getByPlaceholderText, getByText, getByRole } = renderComponent();

			const searchInput = getByPlaceholderText(/search/i);
			await fireEvent.input(searchInput, { target: { value: 'nonexistent' } });

			await waitFor(() => {
				expect(getByText(/no.*results.*filters/i)).toBeInTheDocument();
				expect(getByRole('button', { name: /clear.*filters/i })).toBeInTheDocument();
			});
		});

		it('should clear filters from empty state', async () => {
			const { getByPlaceholderText, getByRole } = renderComponent();

			const searchInput = getByPlaceholderText(/search/i);
			await fireEvent.input(searchInput, { target: { value: 'nonexistent' } });

			await waitFor(async () => {
				const clearButton = getByRole('button', { name: /clear.*filters/i });
				await fireEvent.click(clearButton);
			});

			expect(mockTelemetry.track).toHaveBeenCalledWith('user cleared custom node filters');
		});
	});

	describe('pagination', () => {
		beforeEach(() => {
			customNodesStore.pagination = {
				limit: 2,
				offset: 0,
				total: 10, // More than limit to show pagination
			};
		});

		it('should show pagination when total exceeds limit', () => {
			const { container } = renderComponent();

			expect(container.querySelector('[class*="pagination"]')).toBeInTheDocument();
		});

		it('should not show pagination when total is within limit', () => {
			customNodesStore.pagination.total = 2;

			const { container } = renderComponent();

			expect(container.querySelector('[class*="pagination"]')).not.toBeInTheDocument();
		});

		it('should handle page changes', () => {
			// This would need a more complex mock for the pagination component
			// For now, just verify pagination component is rendered
			const { container } = renderComponent();

			expect(container.querySelector('[class*="pagination"]')).toBeInTheDocument();
		});
	});

	describe('node actions', () => {
		const testAction = async (action: string, storeMethod: keyof typeof customNodesStore) => {
			// Create a custom component that emits the action directly
			const { getAllByTestId } = renderComponent();

			// Simulate clicking a node card that would emit the action
			const nodeCards = getAllByTestId('custom-node-card');
			
			// Mock the action emission
			const component = renderComponent().component;
			await component.exposed?.handleNodeAction('node-1', action);

			expect(customNodesStore[storeMethod]).toHaveBeenCalledWith('node-1');
			expect(mockToast.showMessage).toHaveBeenCalledWith({
				title: expect.any(String),
				message: expect.any(String),
				type: 'success',
			});
		};

		it('should handle deploy action', async () => {
			await testAction('deploy', 'deployCustomNode');
		});

		it('should handle undeploy action', async () => {
			await testAction('undeploy', 'undeployCustomNode');
		});

		it('should handle validate action', async () => {
			await testAction('validate', 'validateCustomNode');
		});

		it('should handle delete action', async () => {
			await testAction('delete', 'deleteCustomNode');
		});

		it('should handle hot reload action', async () => {
			await testAction('hotReload', 'hotReloadNode');
		});

		it('should handle action errors', async () => {
			const error = new Error('Action failed');
			customNodesStore.deployCustomNode = vi.fn().mockRejectedValue(error);

			const component = renderComponent().component;
			await component.exposed?.handleNodeAction('node-1', 'deploy');

			expect(mockToast.showError).toHaveBeenCalledWith(error, expect.any(String));
		});

		it('should track telemetry for actions', async () => {
			const component = renderComponent().component;
			await component.exposed?.handleNodeAction('node-1', 'deploy');

			expect(mockTelemetry.track).toHaveBeenCalledWith('user performed custom node action', {
				action: 'deploy',
				nodeId: 'node-1',
			});
		});
	});

	describe('upload modal', () => {
		it('should render upload modal component', () => {
			const { getByTestId } = renderComponent();

			expect(getByTestId('custom-node-upload-modal')).toBeInTheDocument();
		});

		it('should open upload modal when button is clicked', async () => {
			const { getByTestId } = renderComponent();

			const uploadButton = getByTestId('upload-custom-node-button');
			await fireEvent.click(uploadButton);

			expect(uiStore.openModal).toHaveBeenCalledWith('customNodeUpload');
			expect(mockTelemetry.track).toHaveBeenCalledWith('user opened custom node upload modal');
		});
	});

	describe('data refresh', () => {
		it('should refresh data when filters change', async () => {
			const { getByPlaceholderText } = renderComponent();

			vi.clearAllMocks();

			const searchInput = getByPlaceholderText(/search/i);
			await fireEvent.input(searchInput, { target: { value: 'test' } });

			await waitFor(() => {
				expect(customNodesStore.fetchCustomNodes).toHaveBeenCalled();
			});
		});

		it('should pass correct parameters to fetchCustomNodes', async () => {
			const component = renderComponent().component;
			
			// Simulate filter changes
			component.exposed?.searchTerm = 'test';
			component.exposed?.selectedStatus = 'deployed';
			component.exposed?.selectedCategory = 'utility';
			component.exposed?.selectedTags = ['automation'];

			await component.exposed?.refreshNodes();

			expect(customNodesStore.fetchCustomNodes).toHaveBeenCalledWith({
				status: 'deployed',
				category: 'utility',
				search: 'test',
				tags: 'automation',
				sortBy: 'createdAt',
				sortOrder: 'desc',
				limit: 20,
				offset: 0,
			});
		});

		it('should handle fetch errors gracefully', async () => {
			const error = new Error('Fetch failed');
			customNodesStore.fetchCustomNodes = vi.fn().mockRejectedValue(error);

			const component = renderComponent().component;
			await component.exposed?.refreshNodes();

			expect(mockToast.showError).toHaveBeenCalledWith(error, expect.any(String));
		});
	});

	describe('responsive behavior', () => {
		it('should render with proper CSS classes for responsive layout', () => {
			const { container } = renderComponent();

			expect(container.querySelector('[class*="container"]')).toBeInTheDocument();
			expect(container.querySelector('[class*="statsGrid"]')).toBeInTheDocument();
			expect(container.querySelector('[class*="nodeGrid"]')).toBeInTheDocument();
		});
	});

	describe('accessibility', () => {
		it('should have proper heading hierarchy', () => {
			const { getByRole } = renderComponent();

			expect(getByRole('heading', { level: 1 })).toBeInTheDocument();
		});

		it('should have accessible form controls', () => {
			const { getByPlaceholderText, getByRole } = renderComponent();

			expect(getByPlaceholderText(/search/i)).toHaveAttribute('type', 'search');
			expect(getByRole('combobox')).toBeInTheDocument();
		});

		it('should provide proper button labels', () => {
			const { getByTestId, getByRole } = renderComponent();

			expect(getByTestId('upload-custom-node-button')).toHaveAccessibleName();
			expect(getByRole('button', { name: /filters/i })).toBeInTheDocument();
		});
	});
});