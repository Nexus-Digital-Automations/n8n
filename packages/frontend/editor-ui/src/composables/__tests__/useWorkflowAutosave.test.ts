import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import { useWorkflowAutosave, type AutosaveSettings } from '../useWorkflowAutosave';
import { useUIStore } from '@/stores/ui.store';
import { useWorkflowsStore } from '@/stores/workflows.store';
import { useSettingsStore } from '@/stores/settings.store';
import { PLACEHOLDER_EMPTY_WORKFLOW_ID } from '@/constants';

// Mock dependencies
vi.mock('@/composables/useWorkflowSaving', () => ({
	useWorkflowSaving: () => ({
		saveCurrentWorkflow: vi.fn().mockResolvedValue(true),
	}),
}));

vi.mock('@/composables/useToast', () => ({
	useToast: () => ({
		showMessage: vi.fn(),
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

vi.mock('vue-router', () => ({
	useRouter: () => ({}),
}));

// Mock localStorage
const localStorageMock = {
	getItem: vi.fn(),
	setItem: vi.fn(),
	removeItem: vi.fn(),
	clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('useWorkflowAutosave', () => {
	let pinia: ReturnType<typeof createPinia>;
	let uiStore: ReturnType<typeof useUIStore>;
	let workflowsStore: ReturnType<typeof useWorkflowsStore>;
	let settingsStore: ReturnType<typeof useSettingsStore>;

	beforeEach(() => {
		pinia = createPinia();
		setActivePinia(pinia);

		uiStore = useUIStore();
		workflowsStore = useWorkflowsStore();
		settingsStore = useSettingsStore();

		// Mock initial workflow state
		workflowsStore.workflow = {
			id: 'test-workflow-id',
			nodes: [],
			connections: {},
			settings: {},
			pinData: {},
			isArchived: false,
		} as any;

		// Clear localStorage mocks
		localStorageMock.getItem.mockClear();
		localStorageMock.setItem.mockClear();

		// Mock timers
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	describe('initialization', () => {
		it('should load default settings when localStorage is empty', () => {
			localStorageMock.getItem.mockReturnValue(null);

			const autosave = useWorkflowAutosave();
			autosave.initializeAutosave();

			expect(autosave.autosaveSettings.value.enabled).toBe(true);
			expect(autosave.autosaveSettings.value.intervalMinutes).toBe(2);
			expect(autosave.autosaveSettings.value.showNotifications).toBe(true);
		});

		it('should load settings from localStorage', () => {
			const savedSettings: AutosaveSettings = {
				enabled: false,
				intervalMinutes: 5,
				showNotifications: false,
				saveOnNodeChange: true,
				saveOnConnectionChange: false,
			};
			localStorageMock.getItem.mockReturnValue(JSON.stringify(savedSettings));

			const autosave = useWorkflowAutosave();
			autosave.initializeAutosave();

			expect(autosave.autosaveSettings.value).toEqual(savedSettings);
		});

		it('should validate and sanitize loaded settings', () => {
			const invalidSettings = {
				enabled: 'true', // Wrong type
				intervalMinutes: 120, // Out of range
				showNotifications: false,
				extraProperty: 'should be ignored',
			};
			localStorageMock.getItem.mockReturnValue(JSON.stringify(invalidSettings));

			const autosave = useWorkflowAutosave();
			autosave.initializeAutosave();

			expect(autosave.autosaveSettings.value.enabled).toBe(true); // Default
			expect(autosave.autosaveSettings.value.intervalMinutes).toBe(2); // Default
			expect(autosave.autosaveSettings.value.showNotifications).toBe(false); // Valid
		});

		it('should handle corrupted localStorage gracefully', () => {
			localStorageMock.getItem.mockReturnValue('invalid json');

			const autosave = useWorkflowAutosave();
			autosave.initializeAutosave();

			// Should fallback to defaults
			expect(autosave.autosaveSettings.value.enabled).toBe(true);
			expect(autosave.autosaveSettings.value.intervalMinutes).toBe(2);
		});
	});

	describe('autosave conditions', () => {
		it('should determine when autosave should run', () => {
			const autosave = useWorkflowAutosave();
			autosave.initializeAutosave();

			// Initially should not autosave (not dirty)
			expect(autosave.shouldAutosave).toBe(false);

			// Make workflow dirty
			uiStore.stateIsDirty = true;
			expect(autosave.shouldAutosave).toBe(true);

			// Disable autosave
			autosave.setAutosaveEnabled(false);
			expect(autosave.shouldAutosave).toBe(false);
		});

		it('should not autosave for empty workflow', () => {
			workflowsStore.workflow.id = PLACEHOLDER_EMPTY_WORKFLOW_ID;
			uiStore.stateIsDirty = true;

			const autosave = useWorkflowAutosave();
			autosave.initializeAutosave();

			expect(autosave.shouldAutosave).toBe(false);
		});

		it('should not autosave for new workflow', () => {
			workflowsStore.workflow.id = 'new';
			uiStore.stateIsDirty = true;

			const autosave = useWorkflowAutosave();
			autosave.initializeAutosave();

			expect(autosave.shouldAutosave).toBe(false);
		});

		it('should not autosave for archived workflow', () => {
			workflowsStore.workflow.isArchived = true;
			uiStore.stateIsDirty = true;

			const autosave = useWorkflowAutosave();
			autosave.initializeAutosave();

			expect(autosave.shouldAutosave).toBe(false);
		});

		it('should not autosave when manual save is in progress', () => {
			uiStore.stateIsDirty = true;
			uiStore.activeActions.push('workflowSaving');

			const autosave = useWorkflowAutosave();
			autosave.initializeAutosave();

			expect(autosave.shouldAutosave).toBe(false);
		});

		it('should not autosave when already autosaving', async () => {
			const mockSave = vi
				.fn()
				.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(true), 1000)));

			vi.doMock('@/composables/useWorkflowSaving', () => ({
				useWorkflowSaving: () => ({
					saveCurrentWorkflow: mockSave,
				}),
			}));

			uiStore.stateIsDirty = true;
			const autosave = useWorkflowAutosave();
			autosave.initializeAutosave();

			// Start first autosave
			const promise1 = autosave.performAutosave();

			// Try second autosave while first is running
			const promise2 = autosave.performAutosave();

			const [result1, result2] = await Promise.all([promise1, promise2]);

			expect(result1).toBe(true);
			expect(result2).toBe(false);
			expect(mockSave).toHaveBeenCalledTimes(1);
		});
	});

	describe('workflow change detection', () => {
		it('should detect workflow changes', () => {
			const autosave = useWorkflowAutosave();
			autosave.initializeAutosave();

			// Initial state - no changes
			expect(autosave.hasWorkflowChanged()).toBe(true); // First call always returns true
			expect(autosave.hasWorkflowChanged()).toBe(false); // Second call with same state

			// Change workflow
			workflowsStore.workflow.nodes = [{ id: 'node1' }] as any;
			expect(autosave.hasWorkflowChanged()).toBe(true);
			expect(autosave.hasWorkflowChanged()).toBe(false); // State now cached
		});

		it('should handle workflow state serialization errors', () => {
			// Create circular reference that would break JSON.stringify
			const circularNode = { id: 'node1' } as any;
			circularNode.self = circularNode;
			workflowsStore.workflow.nodes = [circularNode];

			const autosave = useWorkflowAutosave();
			autosave.initializeAutosave();

			// Should not throw, should return empty string and false
			expect(() => autosave.hasWorkflowChanged()).not.toThrow();
		});
	});

	describe('autosave execution', () => {
		it('should perform successful autosave', async () => {
			const mockSaveWorkflow = vi.fn().mockResolvedValue(true);

			vi.doMock('@/composables/useWorkflowSaving', () => ({
				useWorkflowSaving: () => ({
					saveCurrentWorkflow: mockSaveWorkflow,
				}),
			}));

			uiStore.stateIsDirty = true;
			const autosave = useWorkflowAutosave();
			autosave.initializeAutosave();

			const result = await autosave.performAutosave();

			expect(result).toBe(true);
			expect(autosave.autosaveStatus.value.lastAutosaveTime).toBeInstanceOf(Date);
			expect(autosave.autosaveStatus.value.autosaveCount).toBe(1);
			expect(mockSaveWorkflow).toHaveBeenCalledWith({}, false);
		});

		it('should handle save failure gracefully', async () => {
			const mockSaveWorkflow = vi.fn().mockResolvedValue(false);

			vi.doMock('@/composables/useWorkflowSaving', () => ({
				useWorkflowSaving: () => ({
					saveCurrentWorkflow: mockSaveWorkflow,
				}),
			}));

			uiStore.stateIsDirty = true;
			const autosave = useWorkflowAutosave();
			autosave.initializeAutosave();

			const result = await autosave.performAutosave();

			expect(result).toBe(false);
			expect(autosave.autosaveStatus.value.lastAutosaveTime).toBeNull();
			expect(autosave.autosaveStatus.value.autosaveCount).toBe(0);
		});

		it('should handle save error gracefully', async () => {
			const mockSaveWorkflow = vi.fn().mockRejectedValue(new Error('Save failed'));

			vi.doMock('@/composables/useWorkflowSaving', () => ({
				useWorkflowSaving: () => ({
					saveCurrentWorkflow: mockSaveWorkflow,
				}),
			}));

			uiStore.stateIsDirty = true;
			const autosave = useWorkflowAutosave();
			autosave.initializeAutosave();

			const result = await autosave.performAutosave();

			expect(result).toBe(false);
			expect(autosave.autosaveStatus.value.isAutosaving).toBe(false);
		});

		it('should skip autosave if no actual changes detected', async () => {
			const mockSaveWorkflow = vi.fn().mockResolvedValue(true);

			vi.doMock('@/composables/useWorkflowSaving', () => ({
				useWorkflowSaving: () => ({
					saveCurrentWorkflow: mockSaveWorkflow,
				}),
			}));

			uiStore.stateIsDirty = true;
			const autosave = useWorkflowAutosave();
			autosave.initializeAutosave();

			// First call should save
			await autosave.performAutosave();
			expect(mockSaveWorkflow).toHaveBeenCalledTimes(1);

			// Second call without workflow changes should not save
			const result = await autosave.performAutosave();
			expect(result).toBe(false);
			expect(mockSaveWorkflow).toHaveBeenCalledTimes(1);
		});
	});

	describe('timer management', () => {
		it('should set up timer with correct interval', () => {
			const autosave = useWorkflowAutosave();
			autosave.updateAutosaveSettings({ intervalMinutes: 3 });
			autosave.initializeAutosave();

			expect(autosave.autosaveStatus.value.nextAutosaveIn).toBe(180); // 3 minutes in seconds
		});

		it('should trigger autosave at timer intervals', async () => {
			const mockSaveWorkflow = vi.fn().mockResolvedValue(true);

			vi.doMock('@/composables/useWorkflowSaving', () => ({
				useWorkflowSaving: () => ({
					saveCurrentWorkflow: mockSaveWorkflow,
				}),
			}));

			uiStore.stateIsDirty = true;
			const autosave = useWorkflowAutosave();
			autosave.updateAutosaveSettings({ intervalMinutes: 1 });
			autosave.initializeAutosave();

			// Advance timer by 1 minute
			vi.advanceTimersByTime(60000);
			await nextTick();

			expect(mockSaveWorkflow).toHaveBeenCalled();
		});

		it('should reset timer after manual save', () => {
			const autosave = useWorkflowAutosave();
			autosave.updateAutosaveSettings({ intervalMinutes: 2 });
			autosave.initializeAutosave();

			// Fast forward to near timer trigger
			vi.advanceTimersByTime(110000); // 1:50
			expect(autosave.autosaveStatus.value.nextAutosaveIn).toBeLessThan(30);

			// Simulate manual save
			autosave.resetAutosaveTimer();

			expect(autosave.autosaveStatus.value.nextAutosaveIn).toBe(120); // Reset to 2 minutes
		});

		it('should update countdown timer correctly', () => {
			const autosave = useWorkflowAutosave();
			autosave.updateAutosaveSettings({ intervalMinutes: 1 });
			autosave.initializeAutosave();

			expect(autosave.autosaveStatus.value.nextAutosaveIn).toBe(60);

			vi.advanceTimersByTime(30000); // 30 seconds
			expect(autosave.autosaveStatus.value.nextAutosaveIn).toBe(30);

			vi.advanceTimersByTime(30000); // Another 30 seconds
			expect(autosave.autosaveStatus.value.nextAutosaveIn).toBe(0);
		});
	});

	describe('settings management', () => {
		it('should save settings to localStorage', () => {
			const autosave = useWorkflowAutosave();

			const newSettings: AutosaveSettings = {
				enabled: false,
				intervalMinutes: 10,
				showNotifications: false,
				saveOnNodeChange: true,
				saveOnConnectionChange: false,
			};

			autosave.updateAutosaveSettings(newSettings);

			expect(localStorageMock.setItem).toHaveBeenCalledWith(
				'n8n-autosave-settings',
				JSON.stringify(newSettings),
			);
		});

		it('should handle localStorage save errors gracefully', () => {
			localStorageMock.setItem.mockImplementation(() => {
				throw new Error('Storage quota exceeded');
			});

			const autosave = useWorkflowAutosave();

			// Should not throw
			expect(() => {
				autosave.updateAutosaveSettings({ intervalMinutes: 5 });
			}).not.toThrow();
		});

		it('should validate interval bounds', () => {
			const autosave = useWorkflowAutosave();

			expect(() => autosave.setAutosaveInterval(0.5)).toThrowError('must be between 1 and 60');
			expect(() => autosave.setAutosaveInterval(120)).toThrowError('must be between 1 and 60');
			expect(() => autosave.setAutosaveInterval(30)).not.toThrow();
		});

		it('should enable/disable autosave properly', () => {
			const autosave = useWorkflowAutosave();
			autosave.initializeAutosave();

			expect(autosave.autosaveStatus.value.isAutosaveEnabled).toBe(true);

			autosave.setAutosaveEnabled(false);
			expect(autosave.autosaveStatus.value.isAutosaveEnabled).toBe(false);
			expect(autosave.autosaveStatus.value.nextAutosaveIn).toBe(0);

			autosave.setAutosaveEnabled(true);
			expect(autosave.autosaveStatus.value.isAutosaveEnabled).toBe(true);
			expect(autosave.autosaveStatus.value.nextAutosaveIn).toBeGreaterThan(0);
		});
	});

	describe('workflow change watchers', () => {
		it('should reset counters when workflow changes', async () => {
			const autosave = useWorkflowAutosave();
			autosave.initializeAutosave();

			// Simulate some autosaves
			autosave.autosaveStatus.value.autosaveCount = 5;
			autosave.autosaveStatus.value.lastAutosaveTime = new Date();

			// Change workflow
			workflowsStore.workflow.id = 'new-workflow-id';
			await nextTick();

			expect(autosave.autosaveStatus.value.autosaveCount).toBe(0);
			expect(autosave.autosaveStatus.value.lastAutosaveTime).toBeNull();
		});

		it('should reset timer after manual saves', async () => {
			const autosave = useWorkflowAutosave();
			autosave.updateAutosaveSettings({ intervalMinutes: 2 });
			autosave.initializeAutosave();

			// Fast forward timer
			vi.advanceTimersByTime(90000); // 1:30
			expect(autosave.autosaveStatus.value.nextAutosaveIn).toBeLessThan(60);

			// Simulate manual save by changing dirty state
			uiStore.stateIsDirty = true;
			await nextTick();
			uiStore.stateIsDirty = false;
			await nextTick();

			// Timer should reset
			expect(autosave.autosaveStatus.value.nextAutosaveIn).toBe(120);
		});

		it('should trigger connection change autosave', async () => {
			const mockSaveWorkflow = vi.fn().mockResolvedValue(true);

			vi.doMock('@/composables/useWorkflowSaving', () => ({
				useWorkflowSaving: () => ({
					saveCurrentWorkflow: mockSaveWorkflow,
				}),
			}));

			uiStore.stateIsDirty = true;
			const autosave = useWorkflowAutosave();
			autosave.updateAutosaveSettings({ saveOnConnectionChange: true });
			autosave.initializeAutosave();

			// Change connections
			workflowsStore.workflow.connections = {
				node1: { main: [[{ node: 'node2', type: 'main', index: 0 }]] },
			};
			await nextTick();

			// Should trigger debounced save
			vi.advanceTimersByTime(1000);
			await nextTick();

			expect(mockSaveWorkflow).toHaveBeenCalled();
		});
	});

	describe('status computation', () => {
		it('should compute autosave status correctly', () => {
			const autosave = useWorkflowAutosave();
			autosave.initializeAutosave();

			const status = autosave.autosaveStatus.value;

			expect(status.isAutosaveEnabled).toBe(true);
			expect(status.lastAutosaveTime).toBeNull();
			expect(status.isAutosaving).toBe(false);
			expect(status.autosaveCount).toBe(0);
			expect(typeof status.nextAutosaveIn).toBe('number');
			expect(typeof status.hasUnsavedChanges).toBe('boolean');
		});
	});

	describe('cleanup', () => {
		it('should cleanup timers properly', () => {
			const autosave = useWorkflowAutosave();
			autosave.updateAutosaveSettings({ intervalMinutes: 1 });
			autosave.initializeAutosave();

			expect(autosave.autosaveStatus.value.nextAutosaveIn).toBeGreaterThan(0);

			autosave.cleanup();

			expect(autosave.autosaveStatus.value.nextAutosaveIn).toBe(0);
		});
	});

	describe('edge cases', () => {
		it('should handle rapid settings changes', () => {
			const autosave = useWorkflowAutosave();

			autosave.updateAutosaveSettings({ intervalMinutes: 1 });
			autosave.updateAutosaveSettings({ intervalMinutes: 2 });
			autosave.updateAutosaveSettings({ intervalMinutes: 3 });

			expect(autosave.autosaveSettings.value.intervalMinutes).toBe(3);
		});

		it('should handle workflow state changes during autosave', async () => {
			const mockSaveWorkflow = vi.fn().mockImplementation(
				() =>
					new Promise((resolve) => {
						// Change workflow state while save is in progress
						workflowsStore.workflow.nodes = [{ id: 'new-node' }] as any;
						setTimeout(() => resolve(true), 100);
					}),
			);

			vi.doMock('@/composables/useWorkflowSaving', () => ({
				useWorkflowSaving: () => ({
					saveCurrentWorkflow: mockSaveWorkflow,
				}),
			}));

			uiStore.stateIsDirty = true;
			const autosave = useWorkflowAutosave();
			autosave.initializeAutosave();

			const result = await autosave.performAutosave();

			expect(result).toBe(true);
			expect(mockSaveWorkflow).toHaveBeenCalled();
		});
	});
});
