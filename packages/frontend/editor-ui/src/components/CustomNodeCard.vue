<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from '@n8n/i18n';
import { useTelemetry } from '@/composables/useTelemetry';
import { useToast } from '@/composables/useToast';
import type { CustomNodeSummary } from '@/stores/customNodes.store';
import { useCustomNodesStore } from '@/stores/customNodes.store';
import type { UserAction } from '@n8n/design-system';

interface Props {
	node: CustomNodeSummary;
	loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	loading: false,
});

const emit = defineEmits<{
	action: [nodeId: string, action: string];
}>();

const i18n = useI18n();
const telemetry = useTelemetry();
const toast = useToast();
const customNodesStore = useCustomNodesStore();

const showActions = ref(false);
const isDeploying = ref(false);

const statusConfig = computed(() => {
	const status = props.node.status;
	const configs = {
		uploaded: {
			color: 'secondary',
			icon: 'upload',
			text: i18n.baseText('settings.customNodes.status.uploaded'),
			description: i18n.baseText('settings.customNodes.status.uploaded.description'),
		},
		validating: {
			color: 'warning',
			icon: 'sync-alt',
			text: i18n.baseText('settings.customNodes.status.validating'),
			description: i18n.baseText('settings.customNodes.status.validating.description'),
		},
		validated: {
			color: 'success',
			icon: 'check-circle',
			text: i18n.baseText('settings.customNodes.status.validated'),
			description: i18n.baseText('settings.customNodes.status.validated.description'),
		},
		failed: {
			color: 'danger',
			icon: 'exclamation-triangle',
			text: i18n.baseText('settings.customNodes.status.failed'),
			description: i18n.baseText('settings.customNodes.status.failed.description'),
		},
		deployed: {
			color: 'primary',
			icon: 'rocket',
			text: i18n.baseText('settings.customNodes.status.deployed'),
			description: i18n.baseText('settings.customNodes.status.deployed.description'),
		},
	};
	return configs[status] || configs.uploaded;
});

const availableActions = computed(() => {
	const actions: UserAction<string>[] = [];

	// View Details
	actions.push({
		label: i18n.baseText('settings.customNodes.actions.viewDetails'),
		value: 'viewDetails',
		icon: 'eye',
		type: 'secondary',
	});

	// Status-specific actions
	switch (props.node.status) {
		case 'uploaded':
		case 'failed':
			actions.push({
				label: i18n.baseText('settings.customNodes.actions.validate'),
				value: 'validate',
				icon: 'check',
				type: 'secondary',
			});
			break;

		case 'validated':
			actions.push({
				label: i18n.baseText('settings.customNodes.actions.deploy'),
				value: 'deploy',
				icon: 'rocket',
				type: 'primary',
			});
			actions.push({
				label: i18n.baseText('settings.customNodes.actions.validate'),
				value: 'validate',
				icon: 'sync-alt',
				type: 'secondary',
			});
			break;

		case 'deployed':
			actions.push({
				label: i18n.baseText('settings.customNodes.actions.undeploy'),
				value: 'undeploy',
				icon: 'stop',
				type: 'secondary',
			});
			actions.push({
				label: i18n.baseText('settings.customNodes.actions.hotReload'),
				value: 'hotReload',
				icon: 'sync',
				type: 'secondary',
			});
			break;
	}

	// Always available actions
	actions.push({
		label: i18n.baseText('settings.customNodes.actions.edit'),
		value: 'edit',
		icon: 'edit',
		type: 'secondary',
	});

	actions.push({
		label: i18n.baseText('settings.customNodes.actions.delete'),
		value: 'delete',
		icon: 'trash',
		type: 'danger',
	});

	return actions;
});

const isActionLoading = computed(() => {
	const nodeId = props.node.id;
	return customNodesStore.loading.validate || customNodesStore.loading.deploy || isDeploying.value;
});

const formattedDate = (dateString: string) => {
	return new Date(dateString).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
};

const handleAction = async (action: string) => {
	showActions.value = false;

	telemetry.track('user clicked custom node action', {
		action,
		nodeId: props.node.id,
		nodeStatus: props.node.status,
	});

	if (action === 'viewDetails') {
		// Navigate to details view - would need router integration
		// router.push(`/settings/custom-nodes/${props.node.id}`);
		return;
	}

	if (action === 'edit') {
		// Open edit modal - would need modal integration
		return;
	}

	// Handle confirmation for dangerous actions
	if (action === 'delete') {
		const confirmed = await confirmAction(
			i18n.baseText('settings.customNodes.delete.confirm.title'),
			i18n.baseText('settings.customNodes.delete.confirm.message', {
				interpolate: { nodeName: props.node.name },
			}),
		);
		if (!confirmed) return;
	}

	if (action === 'undeploy') {
		const confirmed = await confirmAction(
			i18n.baseText('settings.customNodes.undeploy.confirm.title'),
			i18n.baseText('settings.customNodes.undeploy.confirm.message', {
				interpolate: { nodeName: props.node.name },
			}),
		);
		if (!confirmed) return;
	}

	emit('action', props.node.id, action);
};

const confirmAction = async (title: string, message: string): Promise<boolean> => {
	// This would integrate with n8n's confirmation modal system
	// For now, use browser confirm
	return confirm(`${title}\n\n${message}`);
};

const getNodeTypeColor = (index: number) => {
	const colors = ['primary', 'success', 'warning', 'danger', 'info'];
	return colors[index % colors.length];
};
</script>

<template>
	<div :class="[$style.card, { [$style.loading]: props.loading }]" data-test-id="custom-node-card">
		<div :class="$style.cardHeader">
			<div :class="$style.nodeInfo">
				<div :class="$style.nodeName">
					<h3>{{ props.node.name }}</h3>
					<n8n-badge :type="statusConfig.color" :class="$style.statusBadge">
						<n8n-icon :icon="statusConfig.icon" size="xsmall" />
						{{ statusConfig.text }}
					</n8n-badge>
				</div>
				<div :class="$style.nodeVersion">v{{ props.node.version }}</div>
			</div>

			<div :class="$style.cardActions">
				<n8n-button
					v-if="props.node.status === 'deployed'"
					type="success"
					size="small"
					circle
					:title="i18n.baseText('settings.customNodes.status.active')"
				>
					<n8n-icon icon="play" size="xsmall" />
				</n8n-button>

				<n8n-dropdown v-model:visible="showActions" trigger="click" placement="bottom-end">
					<template #trigger>
						<n8n-button type="tertiary" size="small" circle :loading="isActionLoading">
							<n8n-icon icon="ellipsis-v" />
						</n8n-button>
					</template>
					<n8n-dropdown-menu>
						<n8n-dropdown-item
							v-for="action in availableActions"
							:key="action.value"
							@click="handleAction(action.value)"
						>
							<template #icon>
								<n8n-icon :icon="action.icon" />
							</template>
							{{ action.label }}
						</n8n-dropdown-item>
					</n8n-dropdown-menu>
				</n8n-dropdown>
			</div>
		</div>

		<div :class="$style.cardContent">
			<div :class="$style.description">
				{{ props.node.description || i18n.baseText('settings.customNodes.noDescription') }}
			</div>

			<div :class="$style.metadata">
				<div :class="$style.metaRow">
					<span :class="$style.metaLabel">
						{{ i18n.baseText('settings.customNodes.author') }}:
					</span>
					<span :class="$style.metaValue">{{ props.node.author }}</span>
				</div>

				<div v-if="props.node.category" :class="$style.metaRow">
					<span :class="$style.metaLabel">
						{{ i18n.baseText('settings.customNodes.category') }}:
					</span>
					<span :class="$style.metaValue">{{ props.node.category }}</span>
				</div>

				<div :class="$style.metaRow">
					<span :class="$style.metaLabel">
						{{ i18n.baseText('settings.customNodes.created') }}:
					</span>
					<span :class="$style.metaValue">{{ formattedDate(props.node.createdAt) }}</span>
				</div>

				<div v-if="props.node.deployedAt" :class="$style.metaRow">
					<span :class="$style.metaLabel">
						{{ i18n.baseText('settings.customNodes.deployed') }}:
					</span>
					<span :class="$style.metaValue">{{ formattedDate(props.node.deployedAt) }}</span>
				</div>
			</div>

			<!-- Node Types -->
			<div v-if="props.node.nodeTypes.length" :class="$style.nodeTypes">
				<span :class="$style.nodeTypesLabel">
					{{ i18n.baseText('settings.customNodes.nodeTypes') }}:
				</span>
				<div :class="$style.nodeTypesList">
					<n8n-badge
						v-for="(nodeType, index) in props.node.nodeTypes.slice(0, 3)"
						:key="nodeType"
						:type="getNodeTypeColor(index)"
						size="small"
					>
						{{ nodeType }}
					</n8n-badge>
					<n8n-badge v-if="props.node.nodeTypes.length > 3" type="secondary" size="small">
						+{{ props.node.nodeTypes.length - 3 }}
					</n8n-badge>
				</div>
			</div>

			<!-- Tags -->
			<div v-if="props.node.tags.length" :class="$style.tags">
				<div :class="$style.tagsList">
					<n8n-tag v-for="tag in props.node.tags.slice(0, 4)" :key="tag" size="small">
						{{ tag }}
					</n8n-tag>
					<n8n-tag v-if="props.node.tags.length > 4" size="small" type="info">
						+{{ props.node.tags.length - 4 }}
					</n8n-tag>
				</div>
			</div>
		</div>

		<div :class="$style.cardFooter">
			<div :class="$style.quickActions">
				<n8n-button
					v-if="props.node.status === 'validated'"
					type="primary"
					size="small"
					icon="rocket"
					:loading="customNodesStore.loading.deploy"
					@click="handleAction('deploy')"
				>
					{{ i18n.baseText('settings.customNodes.actions.deploy') }}
				</n8n-button>

				<n8n-button
					v-else-if="props.node.status === 'deployed'"
					type="secondary"
					size="small"
					icon="sync"
					@click="handleAction('hotReload')"
				>
					{{ i18n.baseText('settings.customNodes.actions.hotReload') }}
				</n8n-button>

				<n8n-button
					v-else-if="props.node.status === 'failed' || props.node.status === 'uploaded'"
					type="secondary"
					size="small"
					icon="check"
					:loading="customNodesStore.loading.validate"
					@click="handleAction('validate')"
				>
					{{ i18n.baseText('settings.customNodes.actions.validate') }}
				</n8n-button>
			</div>

			<div :class="$style.statusInfo">
				<n8n-tooltip :content="statusConfig.description">
					<n8n-icon
						:icon="statusConfig.icon"
						:class="[$style.statusIcon, $style[`status-${statusConfig.color}`]]"
					/>
				</n8n-tooltip>
			</div>
		</div>
	</div>
</template>

<style lang="scss" module>
.card {
	background: var(--color-background-xlight);
	border: 1px solid var(--color-foreground-light);
	border-radius: var(--border-radius-large);
	padding: var(--spacing-m);
	transition: all 0.2s ease;
	height: fit-content;

	&:hover {
		border-color: var(--color-foreground-dark);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
		transform: translateY(-2px);
	}

	&.loading {
		opacity: 0.7;
		pointer-events: none;
	}
}

.cardHeader {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	margin-bottom: var(--spacing-s);
}

.nodeInfo {
	flex: 1;
}

.nodeName {
	display: flex;
	align-items: center;
	gap: var(--spacing-xs);
	margin-bottom: var(--spacing-2xs);

	h3 {
		margin: 0;
		font-size: var(--font-size-m);
		font-weight: var(--font-weight-bold);
		color: var(--color-text-dark);
		line-height: 1.2;
	}

	.statusBadge {
		flex-shrink: 0;
	}
}

.nodeVersion {
	font-size: var(--font-size-2xs);
	color: var(--color-text-light);
	font-family: var(--font-family-monospace);
}

.cardActions {
	display: flex;
	gap: var(--spacing-2xs);
	align-items: center;
	flex-shrink: 0;
}

.cardContent {
	margin-bottom: var(--spacing-s);
}

.description {
	color: var(--color-text-base);
	font-size: var(--font-size-s);
	line-height: 1.4;
	margin-bottom: var(--spacing-s);
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.metadata {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-3xs);
	margin-bottom: var(--spacing-s);
}

.metaRow {
	display: flex;
	font-size: var(--font-size-2xs);

	.metaLabel {
		color: var(--color-text-light);
		min-width: 60px;
		flex-shrink: 0;
	}

	.metaValue {
		color: var(--color-text-base);
		font-weight: var(--font-weight-medium);
	}
}

.nodeTypes {
	margin-bottom: var(--spacing-xs);
}

.nodeTypesLabel {
	font-size: var(--font-size-2xs);
	color: var(--color-text-light);
	display: block;
	margin-bottom: var(--spacing-3xs);
}

.nodeTypesList {
	display: flex;
	flex-wrap: wrap;
	gap: var(--spacing-3xs);
}

.tags {
	margin-bottom: var(--spacing-xs);
}

.tagsList {
	display: flex;
	flex-wrap: wrap;
	gap: var(--spacing-3xs);
}

.cardFooter {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding-top: var(--spacing-s);
	border-top: 1px solid var(--color-foreground-light);
}

.quickActions {
	display: flex;
	gap: var(--spacing-xs);
}

.statusInfo {
	display: flex;
	align-items: center;
}

.statusIcon {
	font-size: var(--font-size-s);

	&.status-primary {
		color: var(--color-primary);
	}

	&.status-success {
		color: var(--color-success);
	}

	&.status-warning {
		color: var(--color-warning);
	}

	&.status-danger {
		color: var(--color-danger);
	}

	&.status-secondary {
		color: var(--color-text-light);
	}
}
</style>
