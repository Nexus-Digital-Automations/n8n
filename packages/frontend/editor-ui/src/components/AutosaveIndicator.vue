<!--
  Autosave status indicator component
  Shows current autosave status with visual feedback
-->

<template>
	<div 
		:class="[$style.autosaveIndicator, { [$style.disabled]: !autosaveStatus.isAutosaveEnabled }]"
		:title="tooltipText"
		data-test-id="autosave-indicator"
	>
		<div :class="$style.statusContainer">
			<!-- Autosave Icon -->
			<n8n-icon
				:icon="statusIcon"
				:class="[$style.statusIcon, statusIconClass]"
				:spin="autosaveStatus.isAutosaving"
				size="small"
			/>
			
			<!-- Status Text -->
			<span :class="$style.statusText">
				{{ statusText }}
			</span>
		</div>
		
		<!-- Countdown Timer (when enabled and has unsaved changes) -->
		<div 
			v-if="showCountdown" 
			:class="$style.countdown"
		>
			{{ $locale.baseText('workflowAutosave.nextSaveIn', { 
				interpolate: { time: formatCountdown(autosaveStatus.nextAutosaveIn) } 
			}) }}
		</div>
		
		<!-- Settings Button -->
		<n8n-button
			v-if="showSettings"
			:class="$style.settingsButton"
			type="tertiary"
			size="mini"
			icon="cog"
			@click="$emit('openSettings')"
			:title="$locale.baseText('workflowAutosave.openSettings')"
		/>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { N8nIcon, N8nButton } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import type { AutosaveStatus } from '@/composables/useWorkflowAutosave';

interface Props {
	autosaveStatus: AutosaveStatus;
	showSettings?: boolean;
	compact?: boolean;
}

interface Emits {
	openSettings: [];
}

const props = withDefaults(defineProps<Props>(), {
	showSettings: true,
	compact: false,
});

defineEmits<Emits>();

const { locale } = useI18n();

/**
 * Get status icon based on current autosave state
 */
const statusIcon = computed(() => {
	if (!props.autosaveStatus.isAutosaveEnabled) return 'ban';
	if (props.autosaveStatus.isAutosaving) return 'spinner';
	if (props.autosaveStatus.hasUnsavedChanges) return 'clock';
	return 'check-circle';
});

/**
 * Get status icon CSS class for styling
 */
const statusIconClass = computed(() => {
	if (!props.autosaveStatus.isAutosaveEnabled) return props.$style.disabled;
	if (props.autosaveStatus.isAutosaving) return props.$style.saving;
	if (props.autosaveStatus.hasUnsavedChanges) return props.$style.pending;
	return props.$style.saved;
});

/**
 * Get status text based on current autosave state
 */
const statusText = computed(() => {
	if (!props.autosaveStatus.isAutosaveEnabled) {
		return locale.baseText('workflowAutosave.disabled');
	}
	
	if (props.autosaveStatus.isAutosaving) {
		return locale.baseText('workflowAutosave.saving');
	}
	
	if (props.autosaveStatus.hasUnsavedChanges) {
		if (props.autosaveStatus.nextAutosaveIn > 0) {
			return locale.baseText('workflowAutosave.pendingWithTimer');
		}
		return locale.baseText('workflowAutosave.pending');
	}
	
	if (props.autosaveStatus.lastAutosaveTime) {
		return locale.baseText('workflowAutosave.lastSaved', {
			interpolate: { 
				time: props.autosaveStatus.lastAutosaveTime.toLocaleTimeString(locale.locale, {
					hour: '2-digit',
					minute: '2-digit',
				})
			}
		});
	}
	
	return locale.baseText('workflowAutosave.ready');
});

/**
 * Get detailed tooltip text
 */
const tooltipText = computed(() => {
	const parts: string[] = [];
	
	if (!props.autosaveStatus.isAutosaveEnabled) {
		parts.push(locale.baseText('workflowAutosave.disabledTooltip'));
	} else {
		parts.push(locale.baseText('workflowAutosave.enabledTooltip'));
		
		if (props.autosaveStatus.autosaveCount > 0) {
			parts.push(locale.baseText('workflowAutosave.saveCount', {
				interpolate: { count: props.autosaveStatus.autosaveCount.toString() }
			}));
		}
		
		if (props.autosaveStatus.lastAutosaveTime) {
			parts.push(locale.baseText('workflowAutosave.lastSavedAt', {
				interpolate: { 
					time: props.autosaveStatus.lastAutosaveTime.toLocaleString(locale.locale)
				}
			}));
		}
	}
	
	return parts.join('\n');
});

/**
 * Whether to show the countdown timer
 */
const showCountdown = computed(() => {
	return (
		props.autosaveStatus.isAutosaveEnabled &&
		props.autosaveStatus.hasUnsavedChanges &&
		props.autosaveStatus.nextAutosaveIn > 0 &&
		!props.autosaveStatus.isAutosaving &&
		!props.compact
	);
});

/**
 * Format countdown time as MM:SS
 */
function formatCountdown(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
</script>

<style lang="scss" module>
.autosaveIndicator {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: var(--spacing-5xs);
	padding: var(--spacing-2xs);
	border-radius: var(--border-radius-base);
	background-color: var(--color-background-xlight);
	border: 1px solid var(--color-foreground-base);
	min-width: 120px;
	font-size: var(--font-size-2xs);
	transition: all 0.2s ease;

	&.disabled {
		opacity: 0.6;
		background-color: var(--color-background-light);
	}

	&:hover {
		background-color: var(--color-background-light);
	}
}

.statusContainer {
	display: flex;
	align-items: center;
	gap: var(--spacing-4xs);
	width: 100%;
}

.statusIcon {
	flex-shrink: 0;
	transition: color 0.2s ease;

	&.saved {
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

.statusText {
	flex: 1;
	color: var(--color-text-base);
	font-weight: var(--font-weight-regular);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.countdown {
	font-size: var(--font-size-3xs);
	color: var(--color-text-light);
	font-family: var(--font-family-monospace);
	white-space: nowrap;
}

.settingsButton {
	margin-left: var(--spacing-4xs);
	opacity: 0.7;
	transition: opacity 0.2s ease;

	&:hover {
		opacity: 1;
	}
}

/* Compact mode styles */
.autosaveIndicator.compact {
	min-width: auto;
	padding: var(--spacing-4xs) var(--spacing-3xs);
	
	.statusText {
		display: none;
	}
	
	.statusContainer {
		width: auto;
	}
}

/* Animation for saving state */
@keyframes pulse {
	0%, 100% { opacity: 1; }
	50% { opacity: 0.6; }
}

.statusIcon.saving {
	animation: pulse 1.5s ease-in-out infinite;
}

/* Responsive design */
@media (max-width: 768px) {
	.autosaveIndicator:not(.compact) {
		.statusText {
			font-size: var(--font-size-3xs);
		}
		
		.countdown {
			font-size: var(--font-size-4xs);
		}
	}
}
</style>