<!--
  Autosave settings configuration modal
  Allows users to configure autosave preferences
-->

<template>
	<Modal
		:name="AUTOSAVE_SETTINGS_MODAL_KEY"
		:title="$locale.baseText('workflowAutosave.settingsTitle')"
		:subtitle="$locale.baseText('workflowAutosave.settingsSubtitle')"
		width="540px"
		:center="true"
		data-test-id="autosave-settings-modal"
	>
		<template #content>
			<div :class="$style.container">
				<!-- Enable/Disable Autosave -->
				<div :class="$style.settingSection">
					<n8n-toggle
						v-model="localSettings.enabled"
						:label="$locale.baseText('workflowAutosave.enableLabel')"
						data-test-id="autosave-enabled-toggle"
					/>
					<p :class="$style.settingDescription">
						{{ $locale.baseText('workflowAutosave.enableDescription') }}
					</p>
				</div>

				<!-- Autosave Interval -->
				<div :class="[$style.settingSection, { [$style.disabled]: !localSettings.enabled }]">
					<n8n-input-label
						:label="$locale.baseText('workflowAutosave.intervalLabel')"
						:bold="false"
						size="small"
					>
						<n8n-select
							v-model="localSettings.intervalMinutes"
							:disabled="!localSettings.enabled"
							:placeholder="$locale.baseText('workflowAutosave.intervalPlaceholder')"
							data-test-id="autosave-interval-select"
						>
							<n8n-option
								v-for="option in intervalOptions"
								:key="option.value"
								:value="option.value"
								:label="option.label"
							/>
						</n8n-select>
					</n8n-input-label>
					<p :class="$style.settingDescription">
						{{ $locale.baseText('workflowAutosave.intervalDescription') }}
					</p>
				</div>

				<!-- Show Notifications -->
				<div :class="[$style.settingSection, { [$style.disabled]: !localSettings.enabled }]">
					<n8n-toggle
						v-model="localSettings.showNotifications"
						:disabled="!localSettings.enabled"
						:label="$locale.baseText('workflowAutosave.notificationsLabel')"
						data-test-id="autosave-notifications-toggle"
					/>
					<p :class="$style.settingDescription">
						{{ $locale.baseText('workflowAutosave.notificationsDescription') }}
					</p>
				</div>

				<!-- Advanced Settings -->
				<div :class="$style.advancedSection">
					<n8n-text
						tag="h4"
						size="small"
						color="text-base"
						:class="$style.sectionTitle"
					>
						{{ $locale.baseText('workflowAutosave.advancedSettings') }}
					</n8n-text>

					<!-- Save on Connection Change -->
					<div :class="[$style.settingSection, { [$style.disabled]: !localSettings.enabled }]">
						<n8n-toggle
							v-model="localSettings.saveOnConnectionChange"
							:disabled="!localSettings.enabled"
							:label="$locale.baseText('workflowAutosave.saveOnConnectionLabel')"
							data-test-id="autosave-connection-toggle"
						/>
						<p :class="$style.settingDescription">
							{{ $locale.baseText('workflowAutosave.saveOnConnectionDescription') }}
						</p>
					</div>

					<!-- Save on Node Change (Disabled for now - can be resource intensive) -->
					<div :class="[$style.settingSection, $style.disabled]">
						<n8n-toggle
							v-model="localSettings.saveOnNodeChange"
							:disabled="true"
							:label="$locale.baseText('workflowAutosave.saveOnNodeLabel')"
							data-test-id="autosave-node-toggle"
						/>
						<p :class="$style.settingDescription">
							{{ $locale.baseText('workflowAutosave.saveOnNodeDescription') }}
							<n8n-text tag="span" size="small" color="text-light">
								({{ $locale.baseText('workflowAutosave.comingSoon') }})
							</n8n-text>
						</p>
					</div>
				</div>

				<!-- Current Status -->
				<div :class="$style.statusSection">
					<n8n-text
						tag="h4"
						size="small"
						color="text-base"
						:class="$style.sectionTitle"
					>
						{{ $locale.baseText('workflowAutosave.currentStatus') }}
					</n8n-text>

					<div :class="$style.statusGrid">
						<div :class="$style.statusItem">
							<span :class="$style.statusLabel">
								{{ $locale.baseText('workflowAutosave.status') }}:
							</span>
							<span :class="[$style.statusValue, getStatusClass()]">
								{{ getStatusText() }}
							</span>
						</div>

						<div v-if="autosaveStatus.lastAutosaveTime" :class="$style.statusItem">
							<span :class="$style.statusLabel">
								{{ $locale.baseText('workflowAutosave.lastSaved') }}:
							</span>
							<span :class="$style.statusValue">
								{{ formatLastSaveTime() }}
							</span>
						</div>

						<div v-if="autosaveStatus.autosaveCount > 0" :class="$style.statusItem">
							<span :class="$style.statusLabel">
								{{ $locale.baseText('workflowAutosave.totalSaves') }}:
							</span>
							<span :class="$style.statusValue">
								{{ autosaveStatus.autosaveCount }}
							</span>
						</div>
					</div>
				</div>
			</div>
		</template>

		<template #footer>
			<div :class="$style.footer">
				<n8n-button
					type="tertiary"
					@click="closeModal"
					data-test-id="autosave-settings-cancel"
				>
					{{ $locale.baseText('workflowAutosave.cancel') }}
				</n8n-button>
				<n8n-button
					type="primary"
					@click="saveSettings"
					:disabled="!hasChanges"
					data-test-id="autosave-settings-save"
				>
					{{ $locale.baseText('workflowAutosave.saveSettings') }}
				</n8n-button>
			</div>
		</template>
	</Modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Modal from '@/components/Modal.vue';
import {
	N8nButton,
	N8nInputLabel,
	N8nOption,
	N8nSelect,
	N8nText,
	N8nToggle,
} from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { useUIStore } from '@/stores/ui.store';
import { useToast } from '@/composables/useToast';
import type { AutosaveSettings, AutosaveStatus } from '@/composables/useWorkflowAutosave';

// Constants
const AUTOSAVE_SETTINGS_MODAL_KEY = 'autosaveSettings';

interface Props {
	autosaveSettings: AutosaveSettings;
	autosaveStatus: AutosaveStatus;
}

interface Emits {
	updateSettings: [settings: AutosaveSettings];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { locale } = useI18n();
const uiStore = useUIStore();
const toast = useToast();

// Local state for form
const localSettings = ref<AutosaveSettings>({ ...props.autosaveSettings });

// Interval options for dropdown
const intervalOptions = computed(() => [
	{ value: 1, label: locale.baseText('workflowAutosave.interval.1min') },
	{ value: 2, label: locale.baseText('workflowAutosave.interval.2min') },
	{ value: 3, label: locale.baseText('workflowAutosave.interval.3min') },
	{ value: 5, label: locale.baseText('workflowAutosave.interval.5min') },
	{ value: 10, label: locale.baseText('workflowAutosave.interval.10min') },
	{ value: 15, label: locale.baseText('workflowAutosave.interval.15min') },
	{ value: 30, label: locale.baseText('workflowAutosave.interval.30min') },
	{ value: 60, label: locale.baseText('workflowAutosave.interval.60min') },
]);

// Check if settings have changed
const hasChanges = computed(() => {
	return (
		localSettings.value.enabled !== props.autosaveSettings.enabled ||
		localSettings.value.intervalMinutes !== props.autosaveSettings.intervalMinutes ||
		localSettings.value.showNotifications !== props.autosaveSettings.showNotifications ||
		localSettings.value.saveOnNodeChange !== props.autosaveSettings.saveOnNodeChange ||
		localSettings.value.saveOnConnectionChange !== props.autosaveSettings.saveOnConnectionChange
	);
});

// Reset local settings when props change
watch(
	() => props.autosaveSettings,
	(newSettings) => {
		localSettings.value = { ...newSettings };
	},
	{ deep: true }
);

/**
 * Get status text based on current autosave state
 */
function getStatusText(): string {
	if (!props.autosaveStatus.isAutosaveEnabled) {
		return locale.baseText('workflowAutosave.statusDisabled');
	}
	if (props.autosaveStatus.isAutosaving) {
		return locale.baseText('workflowAutosave.statusSaving');
	}
	if (props.autosaveStatus.hasUnsavedChanges) {
		return locale.baseText('workflowAutosave.statusPending');
	}
	return locale.baseText('workflowAutosave.statusActive');
}

/**
 * Get CSS class for status styling
 */
function getStatusClass(): string {
	if (!props.autosaveStatus.isAutosaveEnabled) {
		return 'disabled';
	}
	if (props.autosaveStatus.isAutosaving) {
		return 'saving';
	}
	if (props.autosaveStatus.hasUnsavedChanges) {
		return 'pending';
	}
	return 'active';
}

/**
 * Format last save time for display
 */
function formatLastSaveTime(): string {
	if (!props.autosaveStatus.lastAutosaveTime) return '';
	
	const now = new Date();
	const lastSave = props.autosaveStatus.lastAutosaveTime;
	const diffMinutes = Math.floor((now.getTime() - lastSave.getTime()) / (1000 * 60));
	
	if (diffMinutes < 1) {
		return locale.baseText('workflowAutosave.justNow');
	} else if (diffMinutes < 60) {
		return locale.baseText('workflowAutosave.minutesAgo', {
			interpolate: { minutes: diffMinutes.toString() }
		});
	} else {
		return lastSave.toLocaleString(locale.locale);
	}
}

/**
 * Save settings and close modal
 */
function saveSettings(): void {
	try {
		emit('updateSettings', { ...localSettings.value });
		
		toast.showMessage({
			title: locale.baseText('workflowAutosave.settingsSaved'),
			message: locale.baseText('workflowAutosave.settingsSavedMessage'),
			type: 'success',
			duration: 3000,
		});
		
		closeModal();
	} catch (error) {
		console.error('Failed to save autosave settings:', error);
		
		toast.showMessage({
			title: locale.baseText('workflowAutosave.settingsError'),
			message: locale.baseText('workflowAutosave.settingsErrorMessage'),
			type: 'error',
			duration: 5000,
		});
	}
}

/**
 * Close the modal without saving
 */
function closeModal(): void {
	uiStore.closeModal(AUTOSAVE_SETTINGS_MODAL_KEY);
}
</script>

<style lang="scss" module>
.container {
	padding: var(--spacing-s) 0;
}

.settingSection {
	margin-bottom: var(--spacing-m);
	
	&.disabled {
		opacity: 0.6;
		pointer-events: none;
	}
}

.settingDescription {
	margin: var(--spacing-2xs) 0 0 0;
	font-size: var(--font-size-2xs);
	color: var(--color-text-light);
	line-height: 1.4;
}

.advancedSection {
	margin-top: var(--spacing-l);
	padding-top: var(--spacing-m);
	border-top: 1px solid var(--color-foreground-light);
}

.statusSection {
	margin-top: var(--spacing-l);
	padding-top: var(--spacing-m);
	border-top: 1px solid var(--color-foreground-light);
}

.sectionTitle {
	margin-bottom: var(--spacing-s);
	font-weight: var(--font-weight-bold);
}

.statusGrid {
	display: grid;
	grid-template-columns: 1fr;
	gap: var(--spacing-2xs);
}

.statusItem {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: var(--spacing-3xs) 0;
}

.statusLabel {
	font-size: var(--font-size-2xs);
	color: var(--color-text-base);
	font-weight: var(--font-weight-regular);
}

.statusValue {
	font-size: var(--font-size-2xs);
	font-weight: var(--font-weight-bold);
	
	&.active {
		color: var(--color-success);
	}
	
	&.saving {
		color: var(--color-secondary);
	}
	
	&.pending {
		color: var(--color-warning);
	}
	
	&.disabled {
		color: var(--color-text-light);
	}
}

.footer {
	display: flex;
	justify-content: flex-end;
	gap: var(--spacing-2xs);
}

/* Responsive adjustments */
@media (max-width: 600px) {
	.container {
		padding: var(--spacing-xs) 0;
	}
	
	.statusGrid {
		gap: var(--spacing-3xs);
	}
	
	.statusItem {
		flex-direction: column;
		align-items: flex-start;
		gap: var(--spacing-5xs);
	}
}
</style>