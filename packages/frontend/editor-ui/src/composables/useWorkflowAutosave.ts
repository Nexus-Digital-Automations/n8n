/**
 * Composable for workflow autosave functionality
 * Provides configurable automatic saving with visual indicators
 */

import { computed, ref, watch, onUnmounted, nextTick } from 'vue';
import { useWorkflowSaving } from '@/composables/useWorkflowSaving';
import { useUIStore } from '@/stores/ui.store';
import { useWorkflowsStore } from '@/stores/workflows.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useToast } from '@/composables/useToast';
import { useI18n } from '@n8n/i18n';
import { useRouter } from 'vue-router';
import { PLACEHOLDER_EMPTY_WORKFLOW_ID } from '@/constants';

export interface AutosaveSettings {
	enabled: boolean;
	intervalMinutes: number;
	showNotifications: boolean;
	saveOnNodeChange: boolean;
	saveOnConnectionChange: boolean;
}

export interface AutosaveStatus {
	isAutosaveEnabled: boolean;
	lastAutosaveTime: Date | null;
	isAutosaving: boolean;
	nextAutosaveIn: number; // seconds
	autosaveCount: number;
	hasUnsavedChanges: boolean;
}

const DEFAULT_AUTOSAVE_SETTINGS: AutosaveSettings = {
	enabled: true,
	intervalMinutes: 2,
	showNotifications: true,
	saveOnNodeChange: false, // Can be resource intensive
	saveOnConnectionChange: true,
};

export function useWorkflowAutosave() {
	const router = useRouter();
	const uiStore = useUIStore();
	const workflowsStore = useWorkflowsStore();
	const settingsStore = useSettingsStore();
	const toast = useToast();
	const i18n = useI18n();

	const { saveCurrentWorkflow } = useWorkflowSaving({ router });

	// Reactive state
	const autosaveSettings = ref<AutosaveSettings>({ ...DEFAULT_AUTOSAVE_SETTINGS });
	const lastAutosaveTime = ref<Date | null>(null);
	const isAutosaving = ref(false);
	const autosaveCount = ref(0);
	const nextAutosaveIn = ref(0);
	
	// Internal state
	const autosaveTimer = ref<NodeJS.Timeout | null>(null);
	const countdownTimer = ref<NodeJS.Timeout | null>(null);
	const lastWorkflowState = ref<string>('');

	/**
	 * Load autosave settings from localStorage with fallback to defaults
	 */
	function loadAutosaveSettings(): AutosaveSettings {
		try {
			const stored = localStorage.getItem('n8n-autosave-settings');
			if (stored) {
				const parsed = JSON.parse(stored) as AutosaveSettings;
				// Validate and merge with defaults
				return {
					enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_AUTOSAVE_SETTINGS.enabled,
					intervalMinutes: (typeof parsed.intervalMinutes === 'number' && parsed.intervalMinutes >= 1 && parsed.intervalMinutes <= 60) 
						? parsed.intervalMinutes 
						: DEFAULT_AUTOSAVE_SETTINGS.intervalMinutes,
					showNotifications: typeof parsed.showNotifications === 'boolean' ? parsed.showNotifications : DEFAULT_AUTOSAVE_SETTINGS.showNotifications,
					saveOnNodeChange: typeof parsed.saveOnNodeChange === 'boolean' ? parsed.saveOnNodeChange : DEFAULT_AUTOSAVE_SETTINGS.saveOnNodeChange,
					saveOnConnectionChange: typeof parsed.saveOnConnectionChange === 'boolean' ? parsed.saveOnConnectionChange : DEFAULT_AUTOSAVE_SETTINGS.saveOnConnectionChange,
				};
			}
		} catch (error) {
			console.warn('Failed to load autosave settings:', error);
		}
		return { ...DEFAULT_AUTOSAVE_SETTINGS };
	}

	/**
	 * Save autosave settings to localStorage
	 */
	function saveAutosaveSettings(settings: AutosaveSettings): void {
		try {
			localStorage.setItem('n8n-autosave-settings', JSON.stringify(settings));
			autosaveSettings.value = { ...settings };
		} catch (error) {
			console.error('Failed to save autosave settings:', error);
		}
	}

	/**
	 * Check if autosave should be triggered based on current state
	 */
	const shouldAutosave = computed(() => {
		return (
			autosaveSettings.value.enabled &&
			uiStore.stateIsDirty &&
			!isAutosaving.value &&
			workflowsStore.workflow.id !== PLACEHOLDER_EMPTY_WORKFLOW_ID &&
			workflowsStore.workflow.id !== 'new' &&
			!uiStore.activeActions.includes('workflowSaving') &&
			!workflowsStore.workflow.isArchived
		);
	});

	/**
	 * Get current autosave status
	 */
	const autosaveStatus = computed<AutosaveStatus>(() => ({
		isAutosaveEnabled: autosaveSettings.value.enabled,
		lastAutosaveTime: lastAutosaveTime.value,
		isAutosaving: isAutosaving.value,
		nextAutosaveIn: nextAutosaveIn.value,
		autosaveCount: autosaveCount.value,
		hasUnsavedChanges: uiStore.stateIsDirty,
	}));

	/**
	 * Get workflow state hash for change detection
	 */
	function getWorkflowStateHash(): string {
		try {
			const workflow = workflowsStore.workflow;
			const state = {
				nodes: workflow.nodes,
				connections: workflow.connections,
				settings: workflow.settings,
				pinData: workflow.pinData,
			};
			return JSON.stringify(state);
		} catch {
			return '';
		}
	}

	/**
	 * Check if workflow state has actually changed
	 */
	function hasWorkflowChanged(): boolean {
		const currentState = getWorkflowStateHash();
		const hasChanged = currentState !== lastWorkflowState.value;
		if (hasChanged) {
			lastWorkflowState.value = currentState;
		}
		return hasChanged;
	}

	/**
	 * Perform autosave operation
	 */
	async function performAutosave(source: 'timer' | 'change' = 'timer'): Promise<boolean> {
		if (!shouldAutosave.value || isAutosaving.value) {
			return false;
		}

		// Skip if no actual changes detected
		if (!hasWorkflowChanged()) {
			return false;
		}

		isAutosaving.value = true;

		try {
			// Add small delay to ensure UI state is settled
			await nextTick();
			
			const success = await saveCurrentWorkflow({}, false);
			
			if (success) {
				lastAutosaveTime.value = new Date();
				autosaveCount.value++;
				
				if (autosaveSettings.value.showNotifications) {
					toast.showMessage({
						title: i18n.baseText('workflowAutosave.saved'),
						message: i18n.baseText('workflowAutosave.savedAt', {
							interpolate: { time: lastAutosaveTime.value.toLocaleTimeString() }
						}),
						type: 'success',
						duration: 2000,
					});
				}

				// Reset timer after successful save
				if (source === 'timer') {
					resetAutosaveTimer();
				}
				
				return true;
			} else {
				if (autosaveSettings.value.showNotifications) {
					toast.showMessage({
						title: i18n.baseText('workflowAutosave.failed'),
						message: i18n.baseText('workflowAutosave.failedMessage'),
						type: 'warning',
						duration: 3000,
					});
				}
				return false;
			}
		} catch (error) {
			console.error('Autosave failed:', error);
			
			if (autosaveSettings.value.showNotifications) {
				toast.showMessage({
					title: i18n.baseText('workflowAutosave.error'),
					message: i18n.baseText('workflowAutosave.errorMessage'),
					type: 'error',
					duration: 3000,
				});
			}
			return false;
		} finally {
			isAutosaving.value = false;
		}
	}

	/**
	 * Start the autosave countdown timer
	 */
	function startCountdown(): void {
		if (countdownTimer.value) {
			clearInterval(countdownTimer.value);
		}

		nextAutosaveIn.value = autosaveSettings.value.intervalMinutes * 60;
		
		countdownTimer.value = setInterval(() => {
			nextAutosaveIn.value--;
			if (nextAutosaveIn.value <= 0) {
				clearInterval(countdownTimer.value!);
			}
		}, 1000);
	}

	/**
	 * Set up the autosave timer
	 */
	function setupAutosaveTimer(): void {
		if (!autosaveSettings.value.enabled) return;

		clearAutosaveTimer();
		
		const intervalMs = autosaveSettings.value.intervalMinutes * 60 * 1000;
		
		autosaveTimer.value = setInterval(() => {
			if (shouldAutosave.value) {
				void performAutosave('timer');
			}
		}, intervalMs);

		startCountdown();
	}

	/**
	 * Reset the autosave timer (e.g., after manual save)
	 */
	function resetAutosaveTimer(): void {
		if (autosaveSettings.value.enabled) {
			setupAutosaveTimer();
		}
	}

	/**
	 * Clear the autosave timer
	 */
	function clearAutosaveTimer(): void {
		if (autosaveTimer.value) {
			clearInterval(autosaveTimer.value);
			autosaveTimer.value = null;
		}
		if (countdownTimer.value) {
			clearInterval(countdownTimer.value);
			countdownTimer.value = null;
		}
		nextAutosaveIn.value = 0;
	}

	/**
	 * Enable or disable autosave
	 */
	function setAutosaveEnabled(enabled: boolean): void {
		const newSettings = { ...autosaveSettings.value, enabled };
		saveAutosaveSettings(newSettings);
		
		if (enabled) {
			setupAutosaveTimer();
		} else {
			clearAutosaveTimer();
		}
	}

	/**
	 * Update autosave interval
	 */
	function setAutosaveInterval(intervalMinutes: number): void {
		if (intervalMinutes < 1 || intervalMinutes > 60) {
			throw new Error('Autosave interval must be between 1 and 60 minutes');
		}

		const newSettings = { ...autosaveSettings.value, intervalMinutes };
		saveAutosaveSettings(newSettings);
		
		if (autosaveSettings.value.enabled) {
			setupAutosaveTimer();
		}
	}

	/**
	 * Update autosave settings
	 */
	function updateAutosaveSettings(newSettings: Partial<AutosaveSettings>): void {
		const updatedSettings = { ...autosaveSettings.value, ...newSettings };
		saveAutosaveSettings(updatedSettings);
		
		if (updatedSettings.enabled) {
			setupAutosaveTimer();
		} else {
			clearAutosaveTimer();
		}
	}

	/**
	 * Initialize autosave functionality
	 */
	function initializeAutosave(): void {
		// Load settings
		autosaveSettings.value = loadAutosaveSettings();
		
		// Initialize workflow state tracking
		lastWorkflowState.value = getWorkflowStateHash();
		
		// Set up timer if enabled
		if (autosaveSettings.value.enabled) {
			setupAutosaveTimer();
		}

		// Watch for manual saves to reset timer
		watch(
			() => uiStore.stateIsDirty,
			(isDirty, wasIsDirty) => {
				if (wasIsDirty && !isDirty) {
					// Workflow was just saved manually
					resetAutosaveTimer();
				}
			}
		);

		// Watch for workflow changes
		watch(
			() => workflowsStore.workflow.id,
			() => {
				autosaveCount.value = 0;
				lastAutosaveTime.value = null;
				lastWorkflowState.value = getWorkflowStateHash();
				
				if (autosaveSettings.value.enabled) {
					resetAutosaveTimer();
				}
			}
		);

		// Optional: Watch for immediate autosave triggers
		if (autosaveSettings.value.saveOnConnectionChange) {
			watch(
				() => workflowsStore.workflow.connections,
				() => {
					if (shouldAutosave.value) {
						// Debounce to avoid excessive saves
						setTimeout(() => {
							void performAutosave('change');
						}, 1000);
					}
				},
				{ deep: true }
			);
		}
	}

	/**
	 * Cleanup function
	 */
	function cleanup(): void {
		clearAutosaveTimer();
	}

	// Cleanup on unmount
	onUnmounted(() => {
		cleanup();
	});

	return {
		// State
		autosaveSettings: computed(() => autosaveSettings.value),
		autosaveStatus,
		
		// Methods
		initializeAutosave,
		performAutosave,
		setAutosaveEnabled,
		setAutosaveInterval,
		updateAutosaveSettings,
		resetAutosaveTimer,
		cleanup,
	};
}