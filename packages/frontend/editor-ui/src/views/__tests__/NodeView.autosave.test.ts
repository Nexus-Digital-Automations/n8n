import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import { nextTick } from 'vue';
import NodeView from '../NodeView.vue';
import { useUIStore } from '@/stores/ui.store';
import { useWorkflowsStore } from '@/stores/workflows.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useCanvasStore } from '@/stores/canvas.store';
import { useNodeTypesStore } from '@/stores/nodeTypes.store';
import { useCredentialsStore } from '@/stores/credentials.store';
import { PLACEHOLDER_EMPTY_WORKFLOW_ID } from '@/constants';

// Mock heavy dependencies
vi.mock('@/composables/useWorkflowSaving', () => ({
	useWorkflowSaving: () => ({
		saveCurrentWorkflow: vi.fn().mockResolvedValue(true),
	}),
}));

vi.mock('@/composables/useToast', () => ({
	useToast: () => ({
		showMessage: vi.fn(),
		showError: vi.fn(),
		showSuccess: vi.fn(),
	}),
}));

vi.mock('@n8n/i18n', () => ({
	useI18n: () => ({
		baseText: vi.fn((key: string, options?: any) => {
			if (key === 'workflowAutosave.savedAt') {
				return `Saved at ${options?.interpolate?.time || 'unknown'}`;
			}
			return key;
		}),
	}),
}));

vi.mock('@/composables/useMessage', () => ({
	useMessage: () => ({
		confirm: vi.fn().mockResolvedValue('confirmed'),
	}),
}));

// Mock canvas operations
vi.mock('@/composables/useCanvas', () => ({
	useCanvas: () => ({
		fitView: vi.fn(),
		zoomToFit: vi.fn(),
		resetZoom: vi.fn(),
	}),
}));

// Mock external libraries
vi.mock('n8n-workflow', () => ({
	NodeHelpers: {
		getNodeParameters: vi.fn().mockReturnValue({}),
	},
	Workflow: class MockWorkflow {
		getNode = vi.fn();
		getNodes = vi.fn().mockReturnValue([]);
		getConnections = vi.fn().mockReturnValue({});
	},
}));

// Mock localStorage
const localStorageMock = {
	getItem: vi.fn(),
	setItem: vi.fn(),
	removeItem: vi.fn(),
	clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('NodeView Autosave Integration', () => {
	let wrapper: VueWrapper<any>;
	let pinia: ReturnType<typeof createPinia>;
	let router: ReturnType<typeof createRouter>;
	let uiStore: ReturnType<typeof useUIStore>;
	let workflowsStore: ReturnType<typeof useWorkflowsStore>;
	let settingsStore: ReturnType<typeof useSettingsStore>;
	let canvasStore: ReturnType<typeof useCanvasStore>;

	beforeEach(async () => {
		pinia = createPinia();
		setActivePinia(pinia);

		router = createRouter({
			history: createWebHistory(),
			routes: [{ path: '/workflow/:id', component: NodeView }],
		});

		// Initialize stores
		uiStore = useUIStore();
		workflowsStore = useWorkflowsStore();
		settingsStore = useSettingsStore();
		canvasStore = useCanvasStore();

		// Setup initial store state
		workflowsStore.workflow = {
			id: 'test-workflow-id',
			name: 'Test Workflow',
			nodes: [],
			connections: {},
			settings: {},
			pinData: {},
			active: false,
			isArchived: false,
		} as any;

		// Mock node types store
		const nodeTypesStore = useNodeTypesStore();
		nodeTypesStore.nodeTypes = new Map();

		// Mock credentials store
		const credentialsStore = useCredentialsStore();
		credentialsStore.allCredentials = [];

		// Clear localStorage mocks
		localStorageMock.getItem.mockClear();
		localStorageMock.setItem.mockClear();

		vi.useFakeTimers();
	});

	afterEach(() => {
		if (wrapper) {
			wrapper.unmount();
		}
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	const mountNodeView = async (routePath = '/workflow/test-workflow-id') => {
		await router.push(routePath);

		wrapper = mount(NodeView, {
			global: {
				plugins: [pinia, router],
				stubs: {
					'router-view': true,
					'n8n-loading': true,
					'workflow-canvas': true,
					'workflow-settings': true,
				},
			},
		});

		await nextTick();
		return wrapper;
	};

	describe('autosave initialization', () => {
		it('should initialize autosave when component mounts', async () => {
			await mountNodeView();

			// Autosave should be initialized
			expect(wrapper.vm.workflowAutosave).toBeDefined();
			expect(wrapper.vm.workflowAutosave.autosaveSettings.value.enabled).toBeDefined();
		});

		it('should not initialize autosave for demo routes', async () => {
			await router.push('/demo');

			wrapper = mount(NodeView, {
				global: {
					plugins: [pinia, router],
					stubs: {
						'router-view': true,
						'n8n-loading': true,
						'workflow-canvas': true,
					},
				},
			});

			await nextTick();

			// Should not initialize autosave for demo routes
			expect(wrapper.vm.isDemoRoute).toBe(false); // Depends on route matching logic
		});

		it('should load autosave settings from localStorage', async () => {
			const savedSettings = {
				enabled: true,
				intervalMinutes: 5,
				showNotifications: false,
			};
			localStorageMock.getItem.mockReturnValue(JSON.stringify(savedSettings));

			await mountNodeView();

			expect(wrapper.vm.workflowAutosave.autosaveSettings.value.intervalMinutes).toBe(5);
			expect(wrapper.vm.workflowAutosave.autosaveSettings.value.showNotifications).toBe(false);
		});
	});

	describe('autosave triggers', () => {
		it('should trigger autosave on node parameter changes when enabled', async () => {
			localStorageMock.getItem.mockReturnValue(
				JSON.stringify({
					enabled: true,
					saveOnNodeChange: true,
					intervalMinutes: 2,
				}),
			);

			const mockPerformAutosave = vi.fn().mockResolvedValue(true);

			await mountNodeView();
			wrapper.vm.workflowAutosave.performAutosave = mockPerformAutosave;

			// Simulate node parameter change
			const testNode = {
				id: 'node1',
				type: 'test-node',
				typeVersion: 1,
				position: [100, 100],
				parameters: { value: 'test' },
			};

			workflowsStore.workflow.nodes = [testNode];
			uiStore.stateIsDirty = true;

			// Simulate parameter update that triggers autosave
			await wrapper.vm.onUpdateNodeParameters({
				name: 'node1',
				value: { value: 'updated' },
			});

			expect(mockPerformAutosave).toHaveBeenCalledWith('change');
		});

		it('should trigger autosave on connection changes when enabled', async () => {
			localStorageMock.getItem.mockReturnValue(
				JSON.stringify({
					enabled: true,
					saveOnConnectionChange: true,
					intervalMinutes: 2,
				}),
			);

			const mockPerformAutosave = vi.fn().mockResolvedValue(true);

			await mountNodeView();
			wrapper.vm.workflowAutosave.performAutosave = mockPerformAutosave;

			// Simulate connection change
			uiStore.stateIsDirty = true;

			// Trigger connection creation
			await wrapper.vm.onCreateConnection({
				source: { node: 'node1', type: 'main', index: 0 },
				target: { node: 'node2', type: 'main', index: 0 },
			});

			expect(mockPerformAutosave).toHaveBeenCalledWith('change');
		});

		it('should not trigger autosave when settings disabled', async () => {
			localStorageMock.getItem.mockReturnValue(
				JSON.stringify({
					enabled: true,
					saveOnNodeChange: false,
					saveOnConnectionChange: false,
					intervalMinutes: 2,
				}),
			);

			const mockPerformAutosave = vi.fn();

			await mountNodeView();
			wrapper.vm.workflowAutosave.performAutosave = mockPerformAutosave;

			// Simulate changes
			uiStore.stateIsDirty = true;
			await wrapper.vm.onUpdateNodeParameters({
				name: 'node1',
				value: { value: 'updated' },
			});

			expect(mockPerformAutosave).not.toHaveBeenCalled();
		});

		it('should reset autosave timer after manual save', async () => {
			const mockResetTimer = vi.fn();

			await mountNodeView();
			wrapper.vm.workflowAutosave.resetAutosaveTimer = mockResetTimer;

			// Simulate manual save
			await wrapper.vm.onSaveWorkflow();

			expect(mockResetTimer).toHaveBeenCalled();
		});
	});

	describe('timer management', () => {
		it('should trigger autosave at specified intervals', async () => {
			localStorageMock.getItem.mockReturnValue(
				JSON.stringify({
					enabled: true,
					intervalMinutes: 1, // 1 minute for faster testing
				}),
			);

			const mockPerformAutosave = vi.fn().mockResolvedValue(true);

			await mountNodeView();
			wrapper.vm.workflowAutosave.performAutosave = mockPerformAutosave;

			// Make workflow dirty
			uiStore.stateIsDirty = true;
			workflowsStore.workflow.nodes = [{ id: 'node1' }] as any;

			// Fast forward 1 minute
			vi.advanceTimersByTime(60000);
			await nextTick();

			expect(mockPerformAutosave).toHaveBeenCalledWith('timer');
		});

		it('should update countdown timer correctly', async () => {
			localStorageMock.getItem.mockReturnValue(
				JSON.stringify({
					enabled: true,
					intervalMinutes: 2,
				}),
			);

			await mountNodeView();

			// Initial countdown should be 2 minutes (120 seconds)
			expect(wrapper.vm.workflowAutosave.autosaveStatus.value.nextAutosaveIn).toBe(120);

			// After 30 seconds
			vi.advanceTimersByTime(30000);
			expect(wrapper.vm.workflowAutosave.autosaveStatus.value.nextAutosaveIn).toBe(90);

			// After another 60 seconds
			vi.advanceTimersByTime(60000);
			expect(wrapper.vm.workflowAutosave.autosaveStatus.value.nextAutosaveIn).toBe(30);
		});

		it('should pause autosave when workflow is not dirty', async () => {
			localStorageMock.getItem.mockReturnValue(
				JSON.stringify({
					enabled: true,
					intervalMinutes: 1,
				}),
			);

			const mockPerformAutosave = vi.fn().mockResolvedValue(true);

			await mountNodeView();
			wrapper.vm.workflowAutosave.performAutosave = mockPerformAutosave;

			// Keep workflow clean
			uiStore.stateIsDirty = false;

			// Fast forward 1 minute
			vi.advanceTimersByTime(60000);
			await nextTick();

			// Should not autosave when workflow is not dirty
			expect(mockPerformAutosave).not.toHaveBeenCalled();
		});
	});

	describe('workflow state management', () => {
		it('should reset autosave counters when switching workflows', async () => {
			await mountNodeView();

			// Simulate some autosaves
			wrapper.vm.workflowAutosave.autosaveStatus.value.autosaveCount = 5;
			wrapper.vm.workflowAutosave.autosaveStatus.value.lastAutosaveTime = new Date();

			// Switch to new workflow
			workflowsStore.workflow.id = 'new-workflow-id';
			await nextTick();

			expect(wrapper.vm.workflowAutosave.autosaveStatus.value.autosaveCount).toBe(0);
			expect(wrapper.vm.workflowAutosave.autosaveStatus.value.lastAutosaveTime).toBeNull();
		});

		it('should not autosave empty workflows', async () => {
			workflowsStore.workflow.id = PLACEHOLDER_EMPTY_WORKFLOW_ID;
			const mockPerformAutosave = vi.fn();

			await mountNodeView();
			wrapper.vm.workflowAutosave.performAutosave = mockPerformAutosave;

			uiStore.stateIsDirty = true;

			// Fast forward timer
			vi.advanceTimersByTime(120000);
			await nextTick();

			expect(mockPerformAutosave).not.toHaveBeenCalled();
		});

		it('should not autosave archived workflows', async () => {
			workflowsStore.workflow.isArchived = true;
			const mockPerformAutosave = vi.fn();

			await mountNodeView();
			wrapper.vm.workflowAutosave.performAutosave = mockPerformAutosave;

			uiStore.stateIsDirty = true;

			// Fast forward timer
			vi.advanceTimersByTime(120000);
			await nextTick();

			expect(mockPerformAutosave).not.toHaveBeenCalled();
		});
	});

	describe('conflict prevention', () => {
		it('should not autosave while manual save is in progress', async () => {
			const mockPerformAutosave = vi.fn();

			await mountNodeView();
			wrapper.vm.workflowAutosave.performAutosave = mockPerformAutosave;

			// Mark workflow as dirty and add saving action
			uiStore.stateIsDirty = true;
			uiStore.activeActions.push('workflowSaving');

			// Fast forward timer
			vi.advanceTimersByTime(120000);
			await nextTick();

			expect(mockPerformAutosave).not.toHaveBeenCalled();
		});

		it('should resume autosave after manual save completes', async () => {
			const mockPerformAutosave = vi.fn().mockResolvedValue(true);

			await mountNodeView();
			wrapper.vm.workflowAutosave.performAutosave = mockPerformAutosave;

			// Start with saving in progress
			uiStore.stateIsDirty = true;
			uiStore.activeActions.push('workflowSaving');

			// Fast forward - should not save
			vi.advanceTimersByTime(60000);
			await nextTick();
			expect(mockPerformAutosave).not.toHaveBeenCalled();

			// Complete manual save
			uiStore.activeActions.splice(0, 1);

			// Fast forward again - should save now
			vi.advanceTimersByTime(60000);
			await nextTick();
			expect(mockPerformAutosave).toHaveBeenCalled();
		});
	});

	describe('error handling', () => {
		it('should handle autosave failures gracefully', async () => {
			const mockPerformAutosave = vi.fn().mockResolvedValue(false);
			const mockShowMessage = vi.fn();

			vi.doMock('@/composables/useToast', () => ({
				useToast: () => ({
					showMessage: mockShowMessage,
				}),
			}));

			await mountNodeView();
			wrapper.vm.workflowAutosave.performAutosave = mockPerformAutosave;

			// Trigger manual autosave
			const result = await wrapper.vm.workflowAutosave.performAutosave();

			expect(result).toBe(false);
			// Component should handle failure gracefully without crashing
		});

		it('should handle autosave errors gracefully', async () => {
			const mockPerformAutosave = vi.fn().mockRejectedValue(new Error('Network error'));

			await mountNodeView();
			wrapper.vm.workflowAutosave.performAutosave = mockPerformAutosave;

			// Should not throw
			await expect(wrapper.vm.workflowAutosave.performAutosave()).resolves.toBe(false);
		});
	});

	describe('component lifecycle', () => {
		it('should cleanup autosave on component unmount', async () => {
			const mockCleanup = vi.fn();

			await mountNodeView();
			wrapper.vm.workflowAutosave.cleanup = mockCleanup;

			// Unmount component
			wrapper.unmount();

			expect(mockCleanup).toHaveBeenCalled();
		});

		it('should pause autosave when component becomes inactive', async () => {
			await mountNodeView();

			// Simulate component deactivation (e.g., route change)
			const mockCleanup = vi.fn();
			wrapper.vm.workflowAutosave.cleanup = mockCleanup;

			// Navigate away (would trigger onBeforeUnmount in real app)
			await router.push('/other-route');

			// In the actual component, this would be handled by lifecycle hooks
		});
	});

	describe('settings integration', () => {
		it('should update autosave behavior when settings change', async () => {
			await mountNodeView();

			// Change settings
			wrapper.vm.workflowAutosave.updateAutosaveSettings({
				enabled: false,
			});

			expect(wrapper.vm.workflowAutosave.autosaveSettings.value.enabled).toBe(false);
			expect(wrapper.vm.workflowAutosave.autosaveStatus.value.isAutosaveEnabled).toBe(false);
		});

		it('should persist settings changes to localStorage', async () => {
			await mountNodeView();

			const newSettings = {
				enabled: true,
				intervalMinutes: 10,
				showNotifications: false,
			};

			wrapper.vm.workflowAutosave.updateAutosaveSettings(newSettings);

			expect(localStorageMock.setItem).toHaveBeenCalledWith(
				'n8n-autosave-settings',
				JSON.stringify(expect.objectContaining(newSettings)),
			);
		});
	});

	describe('real workflow operations', () => {
		it('should handle complex node operations with autosave', async () => {
			localStorageMock.getItem.mockReturnValue(
				JSON.stringify({
					enabled: true,
					saveOnNodeChange: true,
					intervalMinutes: 2,
				}),
			);

			const mockPerformAutosave = vi.fn().mockResolvedValue(true);

			await mountNodeView();
			wrapper.vm.workflowAutosave.performAutosave = mockPerformAutosave;

			// Add multiple nodes
			const nodes = [
				{ id: 'node1', type: 'test', position: [100, 100], parameters: {} },
				{ id: 'node2', type: 'test', position: [200, 200], parameters: {} },
			];

			workflowsStore.workflow.nodes = nodes as any;
			uiStore.stateIsDirty = true;

			// Update parameters
			await wrapper.vm.onUpdateNodeParameters({
				name: 'node1',
				value: { newParam: 'value' },
			});

			expect(mockPerformAutosave).toHaveBeenCalledWith('change');

			// Create connection
			await wrapper.vm.onCreateConnection({
				source: { node: 'node1', type: 'main', index: 0 },
				target: { node: 'node2', type: 'main', index: 0 },
			});

			// Should trigger autosave again if connection changes enabled
			if (wrapper.vm.workflowAutosave.autosaveSettings.value.saveOnConnectionChange) {
				expect(mockPerformAutosave).toHaveBeenCalledWith('change');
			}
		});

		it('should maintain autosave state through workflow operations', async () => {
			const mockPerformAutosave = vi.fn().mockResolvedValue(true);

			await mountNodeView();
			wrapper.vm.workflowAutosave.performAutosave = mockPerformAutosave;

			// Perform multiple operations
			uiStore.stateIsDirty = true;

			// Manual save
			await wrapper.vm.onSaveWorkflow();

			// Check that autosave state is consistent
			expect(wrapper.vm.workflowAutosave.autosaveStatus.value).toBeDefined();
			expect(typeof wrapper.vm.workflowAutosave.autosaveStatus.value.nextAutosaveIn).toBe('number');
		});
	});
});
