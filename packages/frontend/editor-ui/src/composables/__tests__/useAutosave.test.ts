import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useAutosave, type AutosaveCallbacks, type AutosaveConfig } from '../useAutosave';
import { useSettingsStore } from '@/stores/settings.store';
import { useUIStore } from '@/stores/ui.store';

// Mock dependencies
vi.mock('@/composables/useToast', () => ({
	useToast: () => ({
		showMessage: vi.fn(),
	}),
}));

vi.mock('@n8n/i18n', () => ({
	useI18n: () => ({
		baseText: vi.fn((key: string, options?: any) => options?.fallback || key),
	}),
}));

describe('useAutosave', () => {
	let mockCallbacks: AutosaveCallbacks;
	let pinia: ReturnType<typeof createPinia>;

	beforeEach(() => {
		pinia = createPinia();
		setActivePinia(pinia);

		mockCallbacks = {
			onSave: vi.fn().mockResolvedValue(true),
			onDirtyStateChange: vi.fn(),
			onError: vi.fn(),
			onSuccess: vi.fn(),
		};

		// Mock timers
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	describe('initialization', () => {
		it('should initialize with default configuration', () => {
			const autosave = useAutosave(mockCallbacks);

			expect(autosave.config.value.enabled).toBe(false);
			expect(autosave.config.value.interval).toBe(30);
			expect(autosave.config.value.autoStart).toBe(true);
			expect(autosave.state.value.isActive).toBe(false);
		});

		it('should merge initial config with defaults', () => {
			const initialConfig: Partial<AutosaveConfig> = {
				enabled: true,
				interval: 60,
				showIndicators: false,
			};

			const autosave = useAutosave(mockCallbacks, initialConfig);

			expect(autosave.config.value.enabled).toBe(true);
			expect(autosave.config.value.interval).toBe(60);
			expect(autosave.config.value.showIndicators).toBe(false);
			expect(autosave.config.value.maxFiles).toBe(10); // default
		});

		it('should start automatically if autoStart is true', () => {
			const autosave = useAutosave(mockCallbacks, { autoStart: true });

			expect(autosave.state.value.isActive).toBe(true);
		});
	});

	describe('state management', () => {
		it('should track dirty state correctly', () => {
			const autosave = useAutosave(mockCallbacks);

			expect(autosave.state.value.hasUnsavedChanges).toBe(false);

			autosave.markDirty();
			expect(autosave.state.value.hasUnsavedChanges).toBe(true);
			expect(mockCallbacks.onDirtyStateChange).toHaveBeenCalledWith(true);

			autosave.markClean();
			expect(autosave.state.value.hasUnsavedChanges).toBe(false);
			expect(mockCallbacks.onDirtyStateChange).toHaveBeenCalledWith(false);
		});

		it('should not trigger onDirtyStateChange if state unchanged', () => {
			const autosave = useAutosave(mockCallbacks);

			autosave.markDirty();
			autosave.markDirty(); // Second call should not trigger callback

			expect(mockCallbacks.onDirtyStateChange).toHaveBeenCalledTimes(1);
		});

		it('should track save count and timing', async () => {
			const autosave = useAutosave(mockCallbacks, { enabled: true });
			autosave.start();
			autosave.markDirty();

			const savePromise = autosave.saveNow();
			await savePromise;

			expect(autosave.state.value.saveCount).toBe(1);
			expect(autosave.state.value.lastSaveTime).toBeInstanceOf(Date);
			expect(autosave.state.value.hasUnsavedChanges).toBe(false);
		});
	});

	describe('timer management', () => {
		it('should set up timer when enabled and active', () => {
			const autosave = useAutosave(mockCallbacks, { enabled: true, interval: 10 });
			autosave.start();

			expect(autosave.state.value.isActive).toBe(true);
			expect(autosave.state.value.nextSaveIn).toBe(10);
		});

		it('should trigger autosave at specified intervals', async () => {
			const autosave = useAutosave(mockCallbacks, { enabled: true, interval: 5 });
			autosave.start();
			autosave.markDirty();

			// Fast-forward timer
			vi.advanceTimersByTime(5000);
			await nextTick();

			expect(mockCallbacks.onSave).toHaveBeenCalled();
		});

		it('should reset timer after successful save', async () => {
			const autosave = useAutosave(mockCallbacks, { enabled: true, interval: 10 });
			autosave.start();
			autosave.markDirty();

			await autosave.saveNow();

			expect(autosave.state.value.nextSaveIn).toBe(10); // Timer reset
		});

		it('should clear timers when stopped', () => {
			const autosave = useAutosave(mockCallbacks, { enabled: true, interval: 10 });
			autosave.start();

			expect(autosave.state.value.nextSaveIn).toBeGreaterThan(0);

			autosave.stop();

			expect(autosave.state.value.isActive).toBe(false);
			expect(autosave.state.value.nextSaveIn).toBe(0);
		});
	});

	describe('autosave conditions', () => {
		it('should only autosave when all conditions are met', async () => {
			const uiStore = useUIStore();
			const autosave = useAutosave(mockCallbacks, {
				enabled: true,
				interval: 5,
				preventConflicts: true,
			});

			autosave.start();

			// Should not save if not dirty
			vi.advanceTimersByTime(5000);
			await nextTick();
			expect(mockCallbacks.onSave).not.toHaveBeenCalled();

			// Mark dirty but add conflicting action
			autosave.markDirty();
			uiStore.activeActions.push('saving');

			vi.advanceTimersByTime(5000);
			await nextTick();
			expect(mockCallbacks.onSave).not.toHaveBeenCalled();

			// Remove conflict - should save now
			uiStore.activeActions.splice(0, 1);
			vi.advanceTimersByTime(5000);
			await nextTick();
			expect(mockCallbacks.onSave).toHaveBeenCalled();
		});

		it('should skip autosave if already saving', async () => {
			const slowSave = vi
				.fn()
				.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(true), 1000)));

			const autosave = useAutosave(
				{ ...mockCallbacks, onSave: slowSave },
				{
					enabled: true,
					interval: 5,
				},
			);

			autosave.start();
			autosave.markDirty();

			// Start first save
			const promise1 = autosave.saveNow();

			// Try to start second save while first is still running
			const promise2 = autosave.saveNow();

			const result1 = await promise1;
			const result2 = await promise2;

			expect(result1).toBe(true);
			expect(result2).toBe(false); // Should be rejected
			expect(slowSave).toHaveBeenCalledTimes(1);
		});
	});

	describe('debounced saving', () => {
		it('should trigger debounced save when markDirty is called', async () => {
			const autosave = useAutosave(mockCallbacks, {
				enabled: true,
				debounceTime: 1000,
			});

			autosave.start();
			autosave.markDirty();

			// Should not save immediately
			expect(mockCallbacks.onSave).not.toHaveBeenCalled();

			// Should save after debounce time
			vi.advanceTimersByTime(1000);
			await nextTick();
			expect(mockCallbacks.onSave).toHaveBeenCalled();
		});

		it('should reset debounce timer on multiple markDirty calls', async () => {
			const autosave = useAutosave(mockCallbacks, {
				enabled: true,
				debounceTime: 1000,
			});

			autosave.start();

			autosave.markDirty();
			vi.advanceTimersByTime(500);

			autosave.markDirty(); // Should reset timer
			vi.advanceTimersByTime(500);
			expect(mockCallbacks.onSave).not.toHaveBeenCalled();

			vi.advanceTimersByTime(500); // Now should save
			await nextTick();
			expect(mockCallbacks.onSave).toHaveBeenCalled();
		});
	});

	describe('error handling', () => {
		it('should handle save callback errors gracefully', async () => {
			const error = new Error('Save failed');
			const failingCallback = vi.fn().mockRejectedValue(error);

			const autosave = useAutosave(
				{
					...mockCallbacks,
					onSave: failingCallback,
				},
				{ enabled: true },
			);

			autosave.start();
			autosave.markDirty();

			const result = await autosave.saveNow();

			expect(result).toBe(false);
			expect(autosave.state.value.error).toBe('Save failed');
			expect(mockCallbacks.onError).toHaveBeenCalledWith(error);
		});

		it('should handle save callback returning false', async () => {
			const failingCallback = vi.fn().mockResolvedValue(false);

			const autosave = useAutosave(
				{
					...mockCallbacks,
					onSave: failingCallback,
				},
				{ enabled: true },
			);

			autosave.start();
			autosave.markDirty();

			const result = await autosave.saveNow();

			expect(result).toBe(false);
			expect(autosave.state.value.error).toBe('Autosave failed');
		});

		it('should clear errors on successful save', async () => {
			const autosave = useAutosave(mockCallbacks, { enabled: true });
			autosave.start();
			autosave.markDirty();

			// Set error state
			const failingCallback = vi.fn().mockRejectedValue(new Error('Test error'));
			await useAutosave({ ...mockCallbacks, onSave: failingCallback }, { enabled: true }).saveNow();

			// Now succeed
			const result = await autosave.saveNow();

			expect(result).toBe(true);
			expect(autosave.state.value.error).toBeNull();
		});
	});

	describe('configuration updates', () => {
		it('should update configuration and restart timer if needed', () => {
			const autosave = useAutosave(mockCallbacks, { enabled: true, interval: 10 });
			autosave.start();

			expect(autosave.state.value.nextSaveIn).toBe(10);

			autosave.updateConfig({ interval: 20 });

			expect(autosave.config.value.interval).toBe(20);
			expect(autosave.state.value.nextSaveIn).toBe(20);
		});

		it('should validate interval bounds', () => {
			const autosave = useAutosave(mockCallbacks);

			expect(() => autosave.setInterval(5)).toThrowError('must be between 10 and 3600');
			expect(() => autosave.setInterval(4000)).toThrowError('must be between 10 and 3600');
			expect(() => autosave.setInterval(30)).not.toThrow();
		});

		it('should enable/disable autosave', () => {
			const autosave = useAutosave(mockCallbacks, { enabled: false });
			autosave.start();

			expect(autosave.state.value.isEnabled).toBe(false);

			autosave.setEnabled(true);

			expect(autosave.state.value.isEnabled).toBe(true);
		});
	});

	describe('global configuration integration', () => {
		it('should merge global settings with local config', () => {
			const settingsStore = useSettingsStore();

			// Mock global settings
			settingsStore.settings = {
				autosave: {
					enabled: true,
					interval: 45,
					maxFiles: 20,
				},
			} as any;

			const autosave = useAutosave(mockCallbacks, { interval: 60 });

			// Local config should override global
			expect(autosave.config.value.interval).toBe(60);
			// Global config should apply where not overridden
			expect(autosave.config.value.enabled).toBe(true);
			expect(autosave.config.value.maxFiles).toBe(20);
		});

		it('should handle missing global settings gracefully', () => {
			const settingsStore = useSettingsStore();
			settingsStore.settings = {} as any;

			const autosave = useAutosave(mockCallbacks);

			expect(autosave.config.value.enabled).toBe(false); // Default
		});
	});

	describe('beforeunload handling', () => {
		it('should warn before unload if there are unsaved changes', () => {
			const autosave = useAutosave(mockCallbacks, { enabled: true });
			autosave.markDirty();

			const event = new Event('beforeunload') as BeforeUnloadEvent;
			event.preventDefault = vi.fn();

			const result = autosave.handleBeforeUnload(event);

			expect(event.preventDefault).toHaveBeenCalled();
			expect(typeof result).toBe('string');
			expect(event.returnValue).toBeDefined();
		});

		it('should not warn before unload if no unsaved changes', () => {
			const autosave = useAutosave(mockCallbacks, { enabled: true });

			const event = new Event('beforeunload') as BeforeUnloadEvent;
			event.preventDefault = vi.fn();

			const result = autosave.handleBeforeUnload(event);

			expect(event.preventDefault).not.toHaveBeenCalled();
			expect(result).toBeUndefined();
		});
	});

	describe('lifecycle management', () => {
		it('should cleanup timers on unmount', () => {
			const autosave = useAutosave(mockCallbacks, { enabled: true, interval: 10 });
			autosave.start();

			expect(autosave.state.value.isActive).toBe(true);
			expect(autosave.state.value.nextSaveIn).toBeGreaterThan(0);

			// Simulate unmount by calling stop
			autosave.stop();

			expect(autosave.state.value.isActive).toBe(false);
			expect(autosave.state.value.nextSaveIn).toBe(0);
		});
	});

	describe('edge cases', () => {
		it('should handle rapid start/stop cycles', () => {
			const autosave = useAutosave(mockCallbacks, { enabled: true, interval: 10 });

			autosave.start();
			autosave.stop();
			autosave.start();
			autosave.stop();
			autosave.start();

			expect(autosave.state.value.isActive).toBe(true);
		});

		it('should handle config changes while saving', async () => {
			const slowSave = vi
				.fn()
				.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(true), 1000)));

			const autosave = useAutosave(
				{ ...mockCallbacks, onSave: slowSave },
				{
					enabled: true,
					interval: 10,
				},
			);

			autosave.start();
			autosave.markDirty();

			const savePromise = autosave.saveNow();

			// Change config while saving
			autosave.updateConfig({ interval: 20 });

			await savePromise;

			expect(autosave.config.value.interval).toBe(20);
		});

		it('should handle multiple simultaneous saves gracefully', async () => {
			const autosave = useAutosave(mockCallbacks, { enabled: true });
			autosave.start();
			autosave.markDirty();

			const promises = [autosave.saveNow(), autosave.saveNow(), autosave.saveNow()];

			const results = await Promise.all(promises);

			expect(results.filter((r) => r === true)).toHaveLength(1);
			expect(results.filter((r) => r === false)).toHaveLength(2);
			expect(mockCallbacks.onSave).toHaveBeenCalledTimes(1);
		});
	});
});
