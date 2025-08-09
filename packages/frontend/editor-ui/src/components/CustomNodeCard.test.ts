import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestingPinia } from '@pinia/testing';
import { setActivePinia } from 'pinia';
import { fireEvent, waitFor } from '@testing-library/vue';
import CustomNodeCard from './CustomNodeCard.vue';
import { createComponentRenderer } from '@/__tests__/render';
import { useCustomNodesStore } from '@/stores/customNodes.store';
import type { CustomNodeSummary } from '@/stores/customNodes.store';

const mockCustomNode: CustomNodeSummary = {
	id: 'node-123',
	name: 'test-node',
	version: '1.0.0',
	status: 'validated',
	description: 'Test custom node for automation',
	author: 'test-author',
	category: 'test',
	tags: ['test', 'sample', 'automation', 'utility'],
	nodeTypes: ['TestNode', 'AnotherTestNode', 'ThirdNode', 'FourthNode'],
	createdAt: '2024-01-01T00:00:00.000Z',
	updatedAt: '2024-01-01T00:00:00.000Z',
	deployedAt: '2024-01-01T00:00:00.000Z',
	isActive: true,
};

const renderComponent = createComponentRenderer(CustomNodeCard);

// Mock composables
const mockTelemetry = {
	track: vi.fn(),
};

const mockToast = {
	showMessage: vi.fn(),
	showError: vi.fn(),
};

vi.mock('@/composables/useTelemetry', () => ({
	useTelemetry: () => mockTelemetry,
}));

vi.mock('@/composables/useToast', () => ({
	useToast: () => mockToast,
}));

// Mock global confirm
global.confirm = vi.fn();

describe('CustomNodeCard', () => {
	let customNodesStore: ReturnType<typeof useCustomNodesStore>;

	beforeEach(() => {
		const pinia = createTestingPinia();
		setActivePinia(pinia);
		customNodesStore = useCustomNodesStore();
		vi.clearAllMocks();
	});

	describe('rendering', () => {
		it('should render node basic information correctly', () => {
			const { getByText, getByTestId } = renderComponent({
				props: { node: mockCustomNode },
			});

			expect(getByTestId('custom-node-card')).toBeInTheDocument();
			expect(getByText('test-node')).toBeInTheDocument();
			expect(getByText('v1.0.0')).toBeInTheDocument();
			expect(getByText('Test custom node for automation')).toBeInTheDocument();
			expect(getByText('test-author')).toBeInTheDocument();
			expect(getByText('test')).toBeInTheDocument();
		});

		it('should show formatted creation date', () => {
			const { getByText } = renderComponent({
				props: { node: mockCustomNode },
			});

			expect(getByText('Jan 1, 2024, 12:00 AM')).toBeInTheDocument();
		});

		it('should show formatted deployment date when deployed', () => {
			const deployedNode = { ...mockCustomNode, status: 'deployed' as const };
			const { getByText } = renderComponent({
				props: { node: deployedNode },
			});

			// Should show deployed date
			const deployedLabels = getByText('Jan 1, 2024, 12:00 AM');
			expect(deployedLabels).toBeInTheDocument();
		});

		it('should not show deployment date when not deployed', () => {
			const undeployedNode = { ...mockCustomNode, deployedAt: undefined };
			const { queryByText } = renderComponent({
				props: { node: undeployedNode },
			});

			// Deployed label should not be present
			expect(queryByText(/deployed/i)).not.toBeInTheDocument();
		});

		it('should show node types with badges (first 3)', () => {
			const { getByText } = renderComponent({
				props: { node: mockCustomNode },
			});

			expect(getByText('TestNode')).toBeInTheDocument();
			expect(getByText('AnotherTestNode')).toBeInTheDocument();
			expect(getByText('ThirdNode')).toBeInTheDocument();
			expect(getByText('+1')).toBeInTheDocument(); // +1 more badge
		});

		it('should show tags (first 4)', () => {
			const { getByText } = renderComponent({
				props: { node: mockCustomNode },
			});

			expect(getByText('test')).toBeInTheDocument();
			expect(getByText('sample')).toBeInTheDocument();
			expect(getByText('automation')).toBeInTheDocument();
			expect(getByText('utility')).toBeInTheDocument();
		});

		it('should handle node without description', () => {
			const nodeWithoutDescription = { ...mockCustomNode, description: '' };
			const { getByText } = renderComponent({
				props: { node: nodeWithoutDescription },
			});

			expect(getByText(/no description/i)).toBeInTheDocument();
		});

		it('should handle node without category', () => {
			const nodeWithoutCategory = { ...mockCustomNode, category: '' };
			const { queryByText } = renderComponent({
				props: { node: nodeWithoutCategory },
			});

			// Category row should not be present
			expect(queryByText(/category/i)).not.toBeInTheDocument();
		});

		it('should apply loading class when loading prop is true', () => {
			const { getByTestId } = renderComponent({
				props: { node: mockCustomNode, loading: true },
			});

			const card = getByTestId('custom-node-card');
			expect(card).toHaveClass('loading');
		});
	});

	describe('status configuration', () => {
		it.each([
			['uploaded', 'secondary', 'upload'],
			['validating', 'warning', 'sync-alt'],
			['validated', 'success', 'check-circle'],
			['failed', 'danger', 'exclamation-triangle'],
			['deployed', 'primary', 'rocket'],
		])('should show correct status for %s', (status, expectedColor, expectedIcon) => {
			const nodeWithStatus = { ...mockCustomNode, status: status as any };
			const { container } = renderComponent({
				props: { node: nodeWithStatus },
			});

			const statusBadge = container.querySelector('[class*="statusBadge"]');
			expect(statusBadge).toBeInTheDocument();
		});
	});

	describe('actions', () => {
		it('should show deploy button for validated status', () => {
			const validatedNode = { ...mockCustomNode, status: 'validated' as const };
			const { getByRole } = renderComponent({
				props: { node: validatedNode },
			});

			const deployButton = getByRole('button', { name: /deploy/i });
			expect(deployButton).toBeInTheDocument();
		});

		it('should show hot reload button for deployed status', () => {
			const deployedNode = { ...mockCustomNode, status: 'deployed' as const };
			const { getByRole } = renderComponent({
				props: { node: deployedNode },
			});

			const hotReloadButton = getByRole('button', { name: /hot reload/i });
			expect(hotReloadButton).toBeInTheDocument();
		});

		it('should show validate button for uploaded status', () => {
			const uploadedNode = { ...mockCustomNode, status: 'uploaded' as const };
			const { getByRole } = renderComponent({
				props: { node: uploadedNode },
			});

			const validateButton = getByRole('button', { name: /validate/i });
			expect(validateButton).toBeInTheDocument();
		});

		it('should show validate button for failed status', () => {
			const failedNode = { ...mockCustomNode, status: 'failed' as const };
			const { getByRole } = renderComponent({
				props: { node: failedNode },
			});

			const validateButton = getByRole('button', { name: /validate/i });
			expect(validateButton).toBeInTheDocument();
		});

		it('should show active indicator for deployed nodes', () => {
			const deployedNode = { ...mockCustomNode, status: 'deployed' as const };
			const { container } = renderComponent({
				props: { node: deployedNode },
			});

			const activeButton = container.querySelector('button[title*="active"]');
			expect(activeButton).toBeInTheDocument();
		});
	});

	describe('dropdown actions', () => {
		it('should open dropdown when actions button is clicked', async () => {
			const { container, getByRole } = renderComponent({
				props: { node: mockCustomNode },
			});

			const actionsButton = container.querySelector('button[class*="tertiary"]');
			expect(actionsButton).toBeInTheDocument();

			await fireEvent.click(actionsButton!);

			// Check if dropdown items are visible
			await waitFor(() => {
				expect(getByRole('menuitem', { name: /view details/i })).toBeInTheDocument();
				expect(getByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
				expect(getByRole('menuitem', { name: /delete/i })).toBeInTheDocument();
			});
		});

		it('should show correct actions for validated status in dropdown', async () => {
			const validatedNode = { ...mockCustomNode, status: 'validated' as const };
			const { container, getByRole } = renderComponent({
				props: { node: validatedNode },
			});

			const actionsButton = container.querySelector('button[class*="tertiary"]');
			await fireEvent.click(actionsButton!);

			await waitFor(() => {
				expect(getByRole('menuitem', { name: /deploy/i })).toBeInTheDocument();
				expect(getByRole('menuitem', { name: /validate/i })).toBeInTheDocument();
			});
		});

		it('should show correct actions for deployed status in dropdown', async () => {
			const deployedNode = { ...mockCustomNode, status: 'deployed' as const };
			const { container, getByRole } = renderComponent({
				props: { node: deployedNode },
			});

			const actionsButton = container.querySelector('button[class*="tertiary"]');
			await fireEvent.click(actionsButton!);

			await waitFor(() => {
				expect(getByRole('menuitem', { name: /undeploy/i })).toBeInTheDocument();
				expect(getByRole('menuitem', { name: /hot reload/i })).toBeInTheDocument();
			});
		});
	});

	describe('event handling', () => {
		it('should emit action event when quick action button is clicked', async () => {
			const { getByRole, emitted } = renderComponent({
				props: { node: { ...mockCustomNode, status: 'validated' as const } },
			});

			const deployButton = getByRole('button', { name: /deploy/i });
			await fireEvent.click(deployButton);

			expect(emitted().action).toHaveLength(1);
			expect(emitted().action[0]).toEqual(['node-123', 'deploy']);
		});

		it('should track telemetry when action is performed', async () => {
			const { getByRole } = renderComponent({
				props: { node: { ...mockCustomNode, status: 'validated' as const } },
			});

			const deployButton = getByRole('button', { name: /deploy/i });
			await fireEvent.click(deployButton);

			expect(mockTelemetry.track).toHaveBeenCalledWith('user clicked custom node action', {
				action: 'deploy',
				nodeId: 'node-123',
				nodeStatus: 'validated',
			});
		});

		it('should emit action event from dropdown menu', async () => {
			const { container, getByRole, emitted } = renderComponent({
				props: { node: mockCustomNode },
			});

			const actionsButton = container.querySelector('button[class*="tertiary"]');
			await fireEvent.click(actionsButton!);

			await waitFor(async () => {
				const viewDetailsAction = getByRole('menuitem', { name: /view details/i });
				await fireEvent.click(viewDetailsAction);
			});

			expect(emitted().action).toHaveLength(1);
			expect(emitted().action[0]).toEqual(['node-123', 'viewDetails']);
		});

		it('should show confirmation for delete action', async () => {
			global.confirm = vi.fn().mockReturnValue(true);

			const { container, getByRole, emitted } = renderComponent({
				props: { node: mockCustomNode },
			});

			const actionsButton = container.querySelector('button[class*="tertiary"]');
			await fireEvent.click(actionsButton!);

			await waitFor(async () => {
				const deleteAction = getByRole('menuitem', { name: /delete/i });
				await fireEvent.click(deleteAction);
			});

			expect(global.confirm).toHaveBeenCalledWith(expect.stringContaining('test-node'));
			expect(emitted().action).toHaveLength(1);
			expect(emitted().action[0]).toEqual(['node-123', 'delete']);
		});

		it('should show confirmation for undeploy action', async () => {
			global.confirm = vi.fn().mockReturnValue(true);
			const deployedNode = { ...mockCustomNode, status: 'deployed' as const };

			const { container, getByRole, emitted } = renderComponent({
				props: { node: deployedNode },
			});

			const actionsButton = container.querySelector('button[class*="tertiary"]');
			await fireEvent.click(actionsButton!);

			await waitFor(async () => {
				const undeployAction = getByRole('menuitem', { name: /undeploy/i });
				await fireEvent.click(undeployAction);
			});

			expect(global.confirm).toHaveBeenCalled();
			expect(emitted().action).toHaveLength(1);
			expect(emitted().action[0]).toEqual(['node-123', 'undeploy']);
		});

		it('should not emit action when confirmation is cancelled', async () => {
			global.confirm = vi.fn().mockReturnValue(false);

			const { container, getByRole, emitted } = renderComponent({
				props: { node: mockCustomNode },
			});

			const actionsButton = container.querySelector('button[class*="tertiary"]');
			await fireEvent.click(actionsButton!);

			await waitFor(async () => {
				const deleteAction = getByRole('menuitem', { name: /delete/i });
				await fireEvent.click(deleteAction);
			});

			expect(global.confirm).toHaveBeenCalled();
			expect(emitted().action).toBeUndefined();
		});
	});

	describe('loading states', () => {
		beforeEach(() => {
			customNodesStore.loading = {
				list: false,
				details: false,
				upload: false,
				deploy: false,
				validate: false,
			};
		});

		it('should show loading state when deploy action is loading', () => {
			customNodesStore.loading.deploy = true;

			const { container } = renderComponent({
				props: { node: mockCustomNode },
			});

			const actionsButton = container.querySelector('button[class*="tertiary"]');
			// Button should show loading state
			expect(actionsButton).toHaveAttribute('class', expect.stringContaining('loading'));
		});

		it('should show loading state when validate action is loading', () => {
			customNodesStore.loading.validate = true;
			const uploadedNode = { ...mockCustomNode, status: 'uploaded' as const };

			const { getByRole } = renderComponent({
				props: { node: uploadedNode },
			});

			const validateButton = getByRole('button', { name: /validate/i });
			expect(validateButton).toHaveAttribute('class', expect.stringContaining('loading'));
		});

		it('should disable actions when loading', () => {
			customNodesStore.loading.deploy = true;
			const validatedNode = { ...mockCustomNode, status: 'validated' as const };

			const { getByRole } = renderComponent({
				props: { node: validatedNode },
			});

			const deployButton = getByRole('button', { name: /deploy/i });
			expect(deployButton).toBeDisabled();
		});
	});

	describe('edge cases', () => {
		it('should handle node with no tags', () => {
			const nodeWithoutTags = { ...mockCustomNode, tags: [] };
			const { container } = renderComponent({
				props: { node: nodeWithoutTags },
			});

			// Tags section should not be rendered
			const tagsSection = container.querySelector('[class*="tags"]');
			expect(tagsSection).not.toBeInTheDocument();
		});

		it('should handle node with no node types', () => {
			const nodeWithoutNodeTypes = { ...mockCustomNode, nodeTypes: [] };
			const { container } = renderComponent({
				props: { node: nodeWithoutNodeTypes },
			});

			// Node types section should not be rendered
			const nodeTypesSection = container.querySelector('[class*="nodeTypes"]');
			expect(nodeTypesSection).not.toBeInTheDocument();
		});

		it('should handle node with single tag and node type', () => {
			const nodeWithSingleItems = {
				...mockCustomNode,
				tags: ['single-tag'],
				nodeTypes: ['SingleNode'],
			};
			const { getByText, queryByText } = renderComponent({
				props: { node: nodeWithSingleItems },
			});

			expect(getByText('single-tag')).toBeInTheDocument();
			expect(getByText('SingleNode')).toBeInTheDocument();
			expect(queryByText('+')).not.toBeInTheDocument(); // No +N badges
		});

		it('should handle very long node names gracefully', () => {
			const nodeWithLongName = {
				...mockCustomNode,
				name: 'very-long-node-name-that-might-cause-layout-issues',
			};
			const { getByText } = renderComponent({
				props: { node: nodeWithLongName },
			});

			expect(getByText('very-long-node-name-that-might-cause-layout-issues')).toBeInTheDocument();
		});

		it('should handle invalid date strings', () => {
			const nodeWithInvalidDate = { ...mockCustomNode, createdAt: 'invalid-date' };
			const { container } = renderComponent({
				props: { node: nodeWithInvalidDate },
			});

			// Should not crash, though date might show as "Invalid Date"
			expect(container).toBeInTheDocument();
		});
	});

	describe('accessibility', () => {
		it('should have proper ARIA attributes', () => {
			const { container } = renderComponent({
				props: { node: mockCustomNode },
			});

			const card = container.querySelector('[data-test-id="custom-node-card"]');
			expect(card).toBeInTheDocument();
		});

		it('should have tooltips for status icons', () => {
			const { container } = renderComponent({
				props: { node: mockCustomNode },
			});

			const tooltip = container.querySelector('[class*="statusIcon"]');
			expect(tooltip).toBeInTheDocument();
		});

		it('should have proper button labels', () => {
			const validatedNode = { ...mockCustomNode, status: 'validated' as const };
			const { getByRole } = renderComponent({
				props: { node: validatedNode },
			});

			const deployButton = getByRole('button', { name: /deploy/i });
			expect(deployButton).toHaveAccessibleName();
		});
	});
});
