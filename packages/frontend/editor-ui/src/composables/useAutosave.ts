/**
 * Generic autosave composable with interval management
 * Provides configurable automatic saving functionality that can be used across different contexts
 */

import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useSettingsStore } from '@/stores/settings.store';
import { useUIStore } from '@/stores/ui.store';
import { useToast } from '@/composables/useToast';
import { useI18n } from '@n8n/i18n';

export interface AutosaveConfig {
	enabled: boolean;
	interval: number; // seconds
	maxFiles?: number;
	maxFileAge?: number; // minutes
	showIndicators?: boolean;
	preventConflicts?: boolean;
	storagePath?: string;
	autoStart?: boolean;
	debounceTime?: number; // milliseconds
	compress?: boolean;
}

export interface AutosaveState {
	isEnabled: boolean;
	isActive: boolean;
	isSaving: boolean;
	lastSaveTime: Date | null;
	nextSaveIn: number; // seconds
	saveCount: number;
	hasUnsavedChanges: boolean;
	error: string | null;
}

export interface AutosaveCallbacks {
	onSave: () => Promise<boolean>;
	onDirtyStateChange?: (isDirty: boolean) => void;
	onError?: (error: Error) => void;
	onSuccess?: (saveTime: Date) => void;
}

const DEFAULT_CONFIG: AutosaveConfig = {
	enabled: false,
	interval: 30,
	maxFiles: 10,
	maxFileAge: 1440,
	showIndicators: true,
	preventConflicts: true,
	storagePath: 'autosave',
	autoStart: true,
	debounceTime: 5000,
	compress: false,
};

export function useAutosave(callbacks: AutosaveCallbacks, initialConfig?: Partial<AutosaveConfig>) {
	const settingsStore = useSettingsStore();
	const uiStore = useUIStore();
	const toast = useToast();
	const i18n = useI18n();

	// Reactive state
	const config = ref<AutosaveConfig>({ ...DEFAULT_CONFIG, ...initialConfig });
	const isActive = ref(false);
	const isSaving = ref(false);
	const lastSaveTime = ref<Date | null>(null);
	const nextSaveIn = ref(0);
	const saveCount = ref(0);
	const lastChangeTime = ref<Date | null>(null);
	const error = ref<string | null>(null);
	
	// Internal state
	const autosaveTimer = ref<NodeJS.Timeout | null>(null);
	const countdownTimer = ref<NodeJS.Timeout | null>(null);
	const debounceTimer = ref<NodeJS.Timeout | null>(null);
	const isDirty = ref(false);
	
	// Get autosave configuration from global settings if available
	const globalConfig = computed(() => {
		try {
			const globalSettings = settingsStore.settings?.autosave;
			if (globalSettings) {
				return {
					enabled: globalSettings.enabled ?? DEFAULT_CONFIG.enabled,
					interval: globalSettings.interval ?? DEFAULT_CONFIG.interval,
					maxFiles: globalSettings.maxFiles ?? DEFAULT_CONFIG.maxFiles,
					maxFileAge: globalSettings.maxFileAge ?? DEFAULT_CONFIG.maxFileAge,
					showIndicators: globalSettings.showIndicators ?? DEFAULT_CONFIG.showIndicators,
					preventConflicts: globalSettings.preventConflicts ?? DEFAULT_CONFIG.preventConflicts,
					storagePath: globalSettings.storagePath ?? DEFAULT_CONFIG.storagePath,
					autoStart: globalSettings.autoStart ?? DEFAULT_CONFIG.autoStart,
					debounceTime: globalSettings.debounceTime ?? DEFAULT_CONFIG.debounceTime,
					compress: globalSettings.compress ?? DEFAULT_CONFIG.compress,
				};
			}
		} catch (error) {
			console.warn('Failed to load global autosave config:', error);
		}
		return DEFAULT_CONFIG;
	});

	// Merged configuration (global + local overrides)
	const effectiveConfig = computed<AutosaveConfig>(() => ({
		...globalConfig.value,
		...config.value,
	}));

	// Computed autosave state
	const autosaveState = computed<AutosaveState>(() => ({
		isEnabled: effectiveConfig.value.enabled,
		isActive: isActive.value,
		isSaving: isSaving.value,
		lastSaveTime: lastSaveTime.value,
		nextSaveIn: nextSaveIn.value,
		saveCount: saveCount.value,
		hasUnsavedChanges: isDirty.value,
		error: error.value,
	}));

	// Check if autosave should run
	const shouldAutosave = computed(() => {
		return (
			effectiveConfig.value.enabled &&
			isActive.value &&
			isDirty.value &&
			!isSaving.value &&
			(!effectiveConfig.value.preventConflicts || !uiStore.activeActions.includes('saving'))
		);
	});

	/**
	 * Mark content as dirty (has unsaved changes)
	 */
	function markDirty(): void {
		if (!isDirty.value) {
			isDirty.value = true;
			lastChangeTime.value = new Date();
			callbacks.onDirtyStateChange?.(true);
			
			// Trigger debounced save if enabled
			if (effectiveConfig.value.debounceTime && effectiveConfig.value.debounceTime > 0) {
				scheduleDebouncesSave();
			}
		}
	}

	/**
	 * Mark content as clean (no unsaved changes)
	 */
	function markClean(): void {
		if (isDirty.value) {
			isDirty.value = false;
			callbacks.onDirtyStateChange?.(false);
		}
	}

	/**
	 * Schedule a debounced save
	 */
	function scheduleDebouncesSave(): void {
		if (debounceTimer.value) {
			clearTimeout(debounceTimer.value);
		}

		debounceTimer.value = setTimeout(() => {
			if (shouldAutosave.value) {
				void performAutosave('debounce');
			}
		}, effectiveConfig.value.debounceTime);
	}

	/**
	 * Start the countdown timer
	 */
	function startCountdown(): void {
		if (countdownTimer.value) {
			clearInterval(countdownTimer.value);
		}

		nextSaveIn.value = effectiveConfig.value.interval;
		
		countdownTimer.value = setInterval(() => {
			nextSaveIn.value = Math.max(0, nextSaveIn.value - 1);
			
			if (nextSaveIn.value <= 0) {
				clearInterval(countdownTimer.value!);
			}
		}, 1000);
	}

	/**
	 * Setup the main autosave timer
	 */
	function setupTimer(): void {
		clearTimer();

		if (!effectiveConfig.value.enabled || !isActive.value) {
			return;
		}

		const intervalMs = effectiveConfig.value.interval * 1000;
		
		autosaveTimer.value = setInterval(() => {
			if (shouldAutosave.value) {
				void performAutosave('timer');
			}
		}, intervalMs);

		startCountdown();
	}

	/**
	 * Clear all timers
	 */
	function clearTimer(): void {
		if (autosaveTimer.value) {
			clearInterval(autosaveTimer.value);
			autosaveTimer.value = null;
		}
		
		if (countdownTimer.value) {
			clearInterval(countdownTimer.value);
			countdownTimer.value = null;
		}
		
		if (debounceTimer.value) {
			clearTimeout(debounceTimer.value);
			debounceTimer.value = null;
		}
		
		nextSaveIn.value = 0;
	}

	/**
	 * Perform the actual autosave operation
	 */
	async function performAutosave(trigger: 'timer' | 'manual' | 'debounce' = 'manual'): Promise<boolean> {
		if (isSaving.value || !shouldAutosave.value) {
			return false;
		}

		// Prevent conflicts with manual saves
		if (effectiveConfig.value.preventConflicts && uiStore.activeActions.includes('saving')) {
			return false;
		}

		isSaving.value = true;
		error.value = null;

		try {
			// Add small delay to ensure state is settled
			await nextTick();
			
			const success = await callbacks.onSave();
			
			if (success) {
				const saveTime = new Date();
				lastSaveTime.value = saveTime;
				saveCount.value++;
				markClean();
				
				if (effectiveConfig.value.showIndicators) {
					toast.showMessage({
						title: i18n.baseText('autosave.saved.title', { fallback: 'Auto-saved' }),
						message: i18n.baseText('autosave.saved.message', {
							fallback: 'Changes saved automatically at {time}',
							interpolate: { time: saveTime.toLocaleTimeString() }
						}),
						type: 'success',
						duration: 2000,
					});
				}

				callbacks.onSuccess?.(saveTime);

				// Reset timer after successful save
				if (trigger === 'timer') {
					setupTimer();
				}
				
				return true;
			} else {
				const errorMsg = 'Autosave failed';
				error.value = errorMsg;
				
				if (effectiveConfig.value.showIndicators) {
					toast.showMessage({
						title: i18n.baseText('autosave.failed.title', { fallback: 'Autosave Failed' }),
						message: i18n.baseText('autosave.failed.message', { 
							fallback: 'Failed to save changes automatically' 
						}),
						type: 'warning',
						duration: 3000,
					});
				}
				
				return false;
			}
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Unknown autosave error';
			error.value = errorMsg;
			
			console.error('Autosave error:', err);
			
			if (effectiveConfig.value.showIndicators) {
				toast.showMessage({
					title: i18n.baseText('autosave.error.title', { fallback: 'Autosave Error' }),
					message: i18n.baseText('autosave.error.message', {
						fallback: 'An error occurred while auto-saving: {error}',
						interpolate: { error: errorMsg }
					}),
					type: 'error',
					duration: 5000,
				});
			}

			callbacks.onError?.(err instanceof Error ? err : new Error(errorMsg));
			return false;
		} finally {
			isSaving.value = false;
		}
	}

	/**
	 * Start autosave functionality
	 */
	function start(): void {
		if (isActive.value) return;
		
		isActive.value = true;
		
		if (effectiveConfig.value.enabled) {
			setupTimer();
		}
	}

	/**
	 * Stop autosave functionality
	 */
	function stop(): void {
		if (!isActive.value) return;
		
		isActive.value = false;
		clearTimer();
	}

	/**
	 * Update autosave configuration
	 */
	function updateConfig(newConfig: Partial<AutosaveConfig>): void {
		config.value = { ...config.value, ...newConfig };
		
		// Restart timer if active and enabled
		if (isActive.value && effectiveConfig.value.enabled) {
			setupTimer();
		} else if (!effectiveConfig.value.enabled) {
			clearTimer();
		}
	}

	/**
	 * Enable or disable autosave
	 */
	function setEnabled(enabled: boolean): void {
		updateConfig({ enabled });
	}

	/**
	 * Update autosave interval
	 */
	function setInterval(intervalSeconds: number): void {
		if (intervalSeconds < 10 || intervalSeconds > 3600) {
			throw new Error('Autosave interval must be between 10 and 3600 seconds');
		}
		updateConfig({ interval: intervalSeconds });
	}

	/**
	 * Force an immediate autosave
	 */
	async function saveNow(): Promise<boolean> {
		return performAutosave('manual');
	}

	/**
	 * Reset the timer (useful after manual saves)
	 */
	function resetTimer(): void {
		if (isActive.value && effectiveConfig.value.enabled) {
			setupTimer();
		}
	}

	/**
	 * Handle navigation away from page
	 */
	function handleBeforeUnload(event: BeforeUnloadEvent): string | undefined {
		if (isDirty.value && effectiveConfig.value.enabled) {
			const message = i18n.baseText('autosave.unsaved.warning', {
				fallback: 'You have unsaved changes. Are you sure you want to leave?'
			});
			event.preventDefault();
			event.returnValue = message;
			return message;
		}
	}

	// Initialize on mount if autoStart is enabled
	onMounted(() => {
		if (effectiveConfig.value.autoStart) {
			start();
		}

		// Add beforeunload listener for navigation warning
		window.addEventListener('beforeunload', handleBeforeUnload);
	});

	// Cleanup on unmount
	onUnmounted(() => {
		stop();
		window.removeEventListener('beforeunload', handleBeforeUnload);
	});

	// Watch for config changes
	watch(effectiveConfig, () => {
		if (isActive.value) {
			if (effectiveConfig.value.enabled) {
				setupTimer();
			} else {
				clearTimer();
			}
		}
	}, { deep: true });

	return {
		// State
		config: computed(() => effectiveConfig.value),
		state: autosaveState,
		
		// Actions  
		start,
		stop,
		saveNow,
		markDirty,
		markClean,
		resetTimer,
		updateConfig,
		setEnabled,
		setInterval,
		
		// Internal for testing
		performAutosave,
		shouldAutosave,
	};
}