<script setup lang="ts">
import { computed, onBeforeMount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from '@n8n/i18n';
import { useTelemetry } from '@/composables/useTelemetry';
import { useToast } from '@/composables/useToast';
import { useDocumentTitle } from '@/composables/useDocumentTitle';
import { useUIStore } from '@/stores/ui.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useCustomNodesStore } from '@/stores/customNodes.store';
import type { CustomNodeSummary } from '@/stores/customNodes.store';

import CustomNodeCard from '@/components/CustomNodeCard.vue';
import CustomNodeUploadModal from '@/components/CustomNodeUploadModal.vue';
import CustomNodeFilters from '@/components/CustomNodeFilters.vue';

const CUSTOM_NODE_UPLOAD_MODAL_KEY = 'customNodeUpload';

// Composables
const router = useRouter();
const i18n = useI18n();
const telemetry = useTelemetry();
const toast = useToast();
const documentTitle = useDocumentTitle();

// Stores
const uiStore = useUIStore();
const settingsStore = useSettingsStore();
const customNodesStore = useCustomNodesStore();

// State
const searchTerm = ref('');
const selectedCategory = ref('');
const selectedStatus = ref('all');
const selectedTags = ref<string[]>([]);
const sortBy = ref('createdAt');
const sortOrder = ref('desc');
const showFilters = ref(false);

// Computed
const filteredNodes = computed(() => {
	return customNodesStore.getCustomNodesList.filter((node: CustomNodeSummary) => {
		const matchesSearch =
			!searchTerm.value ||
			node.name.toLowerCase().includes(searchTerm.value.toLowerCase()) ||
			node.description.toLowerCase().includes(searchTerm.value.toLowerCase()) ||
			node.author.toLowerCase().includes(searchTerm.value.toLowerCase());

		const matchesCategory = !selectedCategory.value || node.category === selectedCategory.value;

		const matchesStatus = selectedStatus.value === 'all' || node.status === selectedStatus.value;

		const matchesTags =
			selectedTags.value.length === 0 || selectedTags.value.some((tag) => node.tags.includes(tag));

		return matchesSearch && matchesCategory && matchesStatus && matchesTags;
	});
});

const hasNodes = computed(() => filteredNodes.value.length > 0);

const emptyStateConfig = computed(() => {
	const hasFilters =
		searchTerm.value ||
		selectedCategory.value ||
		selectedStatus.value !== 'all' ||
		selectedTags.value.length > 0;

	if (hasFilters) {
		return {
			title: i18n.baseText('settings.customNodes.empty.filtered.title'),
			description: i18n.baseText('settings.customNodes.empty.filtered.description'),
			buttonText: i18n.baseText('settings.customNodes.empty.filtered.clearFilters'),
			showButton: true,
			action: clearFilters,
		};
	}

	return {
		title: i18n.baseText('settings.customNodes.empty.title'),
		description: i18n.baseText('settings.customNodes.empty.description'),
		buttonText: i18n.baseText('settings.customNodes.empty.uploadFirst'),
		showButton: true,
		action: openUploadModal,
	};
});

const statsCards = computed(() => [
	{
		title: i18n.baseText('settings.customNodes.stats.total'),
		value: customNodesStore.statistics.total,
		icon: 'cube',
		color: 'primary',
	},
	{
		title: i18n.baseText('settings.customNodes.stats.active'),
		value: customNodesStore.statistics.active,
		icon: 'play',
		color: 'success',
	},
	{
		title: i18n.baseText('settings.customNodes.stats.deployed'),
		value: customNodesStore.statistics.byStatus.deployed || 0,
		icon: 'rocket',
		color: 'warning',
	},
	{
		title: i18n.baseText('settings.customNodes.stats.failed'),
		value: customNodesStore.statistics.byStatus.failed || 0,
		icon: 'exclamation-triangle',
		color: 'danger',
	},
]);

// Methods
const openUploadModal = () => {
	telemetry.track('user opened custom node upload modal');
	uiStore.openModal(CUSTOM_NODE_UPLOAD_MODAL_KEY);
};

const clearFilters = () => {
	searchTerm.value = '';
	selectedCategory.value = '';
	selectedStatus.value = 'all';
	selectedTags.value = [];
	telemetry.track('user cleared custom node filters');
};

const handleSearch = (term: string) => {
	searchTerm.value = term;
	if (term) {
		telemetry.track('user searched custom nodes', { term });
	}
};

const handleFilterChange = (filters: { category?: string; status?: string; tags?: string[] }) => {
	if (filters.category !== undefined) selectedCategory.value = filters.category;
	if (filters.status !== undefined) selectedStatus.value = filters.status;
	if (filters.tags !== undefined) selectedTags.value = filters.tags;

	telemetry.track('user applied custom node filters', {
		category: selectedCategory.value,
		status: selectedStatus.value,
		tagsCount: selectedTags.value.length,
	});
};

const handleSortChange = (newSortBy: string, newSortOrder: string) => {
	sortBy.value = newSortBy;
	sortOrder.value = newSortOrder;
	customNodesStore.updateFilters({ sortBy: newSortBy, sortOrder: newSortOrder });
};

const handleNodeAction = async (nodeId: string, action: string) => {
	try {
		switch (action) {
			case 'deploy':
				await customNodesStore.deployCustomNode(nodeId);
				toast.showMessage({
					title: i18n.baseText('settings.customNodes.deploy.success.title'),
					message: i18n.baseText('settings.customNodes.deploy.success.message'),
					type: 'success',
				});
				break;
			case 'undeploy':
				await customNodesStore.undeployCustomNode(nodeId);
				toast.showMessage({
					title: i18n.baseText('settings.customNodes.undeploy.success.title'),
					message: i18n.baseText('settings.customNodes.undeploy.success.message'),
					type: 'success',
				});
				break;
			case 'validate':
				await customNodesStore.validateCustomNode(nodeId);
				toast.showMessage({
					title: i18n.baseText('settings.customNodes.validate.success.title'),
					message: i18n.baseText('settings.customNodes.validate.success.message'),
					type: 'success',
				});
				break;
			case 'delete':
				await customNodesStore.deleteCustomNode(nodeId);
				toast.showMessage({
					title: i18n.baseText('settings.customNodes.delete.success.title'),
					message: i18n.baseText('settings.customNodes.delete.success.message'),
					type: 'success',
				});
				break;
			case 'hotReload':
				await customNodesStore.hotReloadNode(nodeId);
				toast.showMessage({
					title: i18n.baseText('settings.customNodes.hotReload.success.title'),
					message: i18n.baseText('settings.customNodes.hotReload.success.message'),
					type: 'success',
				});
				break;
		}

		telemetry.track('user performed custom node action', {
			action,
			nodeId,
		});
	} catch (error) {
		toast.showError(error, i18n.baseText('settings.customNodes.action.error.title'));
	}
};

const refreshNodes = async () => {
	try {
		await customNodesStore.fetchCustomNodes({
			status: selectedStatus.value === 'all' ? undefined : selectedStatus.value,
			category: selectedCategory.value || undefined,
			search: searchTerm.value || undefined,
			tags: selectedTags.value.length > 0 ? selectedTags.value.join(',') : undefined,
			sortBy: sortBy.value,
			sortOrder: sortOrder.value,
			limit: customNodesStore.pagination.limit,
			offset: customNodesStore.pagination.offset,
		});
	} catch (error) {
		toast.showError(error, i18n.baseText('settings.customNodes.fetch.error.title'));
	}
};

// Watchers
watch([searchTerm, selectedCategory, selectedStatus, selectedTags], () => refreshNodes(), {
	deep: true,
});

// Lifecycle
onBeforeMount(async () => {
	documentTitle.set([i18n.baseText('settings.customNodes.title'), i18n.baseText('settings.title')]);
});

onMounted(async () => {
	await Promise.all([customNodesStore.fetchCustomNodes(), customNodesStore.fetchStatistics()]);
});
</script>

<template>
	<div :class="$style.container">
		<!-- Header -->
		<div :class="$style.header">
			<div :class="$style.title">
				<h1>{{ i18n.baseText('settings.customNodes.title') }}</h1>
				<p>{{ i18n.baseText('settings.customNodes.description') }}</p>
			</div>

			<div :class="$style.actions">
				<n8n-button
					type="primary"
					size="large"
					icon="plus"
					@click="openUploadModal"
					data-test-id="upload-custom-node-button"
				>
					{{ i18n.baseText('settings.customNodes.uploadNode') }}
				</n8n-button>
			</div>
		</div>

		<!-- Statistics Cards -->
		<div :class="$style.statsGrid">
			<div
				v-for="stat in statsCards"
				:key="stat.title"
				:class="[$style.statCard, $style[`stat-${stat.color}`]]"
			>
				<div :class="$style.statIcon">
					<n8n-icon :icon="stat.icon" />
				</div>
				<div :class="$style.statContent">
					<span :class="$style.statValue">{{ stat.value }}</span>
					<span :class="$style.statTitle">{{ stat.title }}</span>
				</div>
			</div>
		</div>

		<!-- Search and Filters -->
		<div :class="$style.searchFilters">
			<div :class="$style.searchBox">
				<n8n-input
					v-model="searchTerm"
					type="search"
					:placeholder="i18n.baseText('settings.customNodes.search.placeholder')"
					size="large"
					clearable
					@input="handleSearch"
				>
					<template #prefix>
						<n8n-icon icon="search" />
					</template>
				</n8n-input>
			</div>

			<div :class="$style.filterControls">
				<n8n-button
					type="secondary"
					:class="{ [$style.active]: showFilters }"
					@click="showFilters = !showFilters"
				>
					<n8n-icon icon="filter" />
					{{ i18n.baseText('settings.customNodes.filters.toggle') }}
				</n8n-button>

				<n8n-select
					v-model="sortBy"
					size="medium"
					@update:model-value="handleSortChange(sortBy, sortOrder)"
				>
					<n8n-option value="name">{{
						i18n.baseText('settings.customNodes.sort.name')
					}}</n8n-option>
					<n8n-option value="createdAt">{{
						i18n.baseText('settings.customNodes.sort.created')
					}}</n8n-option>
					<n8n-option value="status">{{
						i18n.baseText('settings.customNodes.sort.status')
					}}</n8n-option>
					<n8n-option value="version">{{
						i18n.baseText('settings.customNodes.sort.version')
					}}</n8n-option>
				</n8n-select>

				<n8n-button
					type="tertiary"
					size="medium"
					:icon="sortOrder === 'asc' ? 'sort-amount-up' : 'sort-amount-down'"
					@click="handleSortChange(sortBy, sortOrder === 'asc' ? 'desc' : 'asc')"
				/>
			</div>
		</div>

		<!-- Filters Panel -->
		<CustomNodeFilters
			v-if="showFilters"
			:available-categories="customNodesStore.availableFilters.categories"
			:available-tags="customNodesStore.availableFilters.tags"
			:available-statuses="customNodesStore.availableFilters.statuses"
			:selected-category="selectedCategory"
			:selected-status="selectedStatus"
			:selected-tags="selectedTags"
			@filter-change="handleFilterChange"
		/>

		<!-- Node List -->
		<div v-if="customNodesStore.loading.list" :class="$style.loading">
			<n8n-loading :loading="true" :rows="3" />
		</div>

		<div v-else-if="hasNodes" :class="$style.nodeGrid">
			<CustomNodeCard
				v-for="node in filteredNodes"
				:key="node.id"
				:node="node"
				@action="handleNodeAction"
			/>
		</div>

		<!-- Empty State -->
		<div v-else :class="$style.emptyState">
			<div :class="$style.emptyStateContent">
				<div :class="$style.emptyStateIcon">
					<n8n-icon icon="cube" size="xlarge" />
				</div>
				<h3>{{ emptyStateConfig.title }}</h3>
				<p>{{ emptyStateConfig.description }}</p>
				<n8n-button
					v-if="emptyStateConfig.showButton"
					type="primary"
					@click="emptyStateConfig.action"
				>
					{{ emptyStateConfig.buttonText }}
				</n8n-button>
			</div>
		</div>

		<!-- Pagination -->
		<div
			v-if="hasNodes && customNodesStore.pagination.total > customNodesStore.pagination.limit"
			:class="$style.pagination"
		>
			<n8n-pagination
				:current-page="
					Math.floor(customNodesStore.pagination.offset / customNodesStore.pagination.limit) + 1
				"
				:page-size="customNodesStore.pagination.limit"
				:total="customNodesStore.pagination.total"
				@update:current-page="
					(page: number) => {
						customNodesStore.updatePagination({
							offset: (page - 1) * customNodesStore.pagination.limit,
						});
						refreshNodes();
					}
				"
			/>
		</div>

		<!-- Upload Modal -->
		<CustomNodeUploadModal />
	</div>
</template>

<style lang="scss" module>
.container {
	padding: var(--spacing-xl);
	max-width: 1200px;
	margin: 0 auto;
}

.header {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	margin-bottom: var(--spacing-xl);

	.title {
		h1 {
			margin: 0 0 var(--spacing-xs) 0;
			font-size: var(--font-size-2xl);
			font-weight: var(--font-weight-bold);
		}

		p {
			margin: 0;
			color: var(--color-text-base);
			font-size: var(--font-size-s);
		}
	}

	.actions {
		display: flex;
		gap: var(--spacing-s);
	}
}

.statsGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
	gap: var(--spacing-m);
	margin-bottom: var(--spacing-xl);
}

.statCard {
	display: flex;
	align-items: center;
	padding: var(--spacing-m);
	background: var(--color-background-xlight);
	border: 1px solid var(--color-foreground-light);
	border-radius: var(--border-radius-large);
	transition:
		transform 0.2s ease,
		box-shadow 0.2s ease;

	&:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
	}

	.statIcon {
		width: 48px;
		height: 48px;
		border-radius: var(--border-radius-base);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-right: var(--spacing-m);
		font-size: var(--font-size-xl);
	}

	.statContent {
		display: flex;
		flex-direction: column;
	}

	.statValue {
		font-size: var(--font-size-2xl);
		font-weight: var(--font-weight-bold);
		line-height: 1;
	}

	.statTitle {
		font-size: var(--font-size-xs);
		color: var(--color-text-light);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	&.stat-primary .statIcon {
		background: var(--color-primary-tint-3);
		color: var(--color-primary);
	}

	&.stat-success .statIcon {
		background: var(--color-success-tint-3);
		color: var(--color-success);
	}

	&.stat-warning .statIcon {
		background: var(--color-warning-tint-3);
		color: var(--color-warning);
	}

	&.stat-danger .statIcon {
		background: var(--color-danger-tint-3);
		color: var(--color-danger);
	}
}

.searchFilters {
	display: flex;
	gap: var(--spacing-m);
	margin-bottom: var(--spacing-m);

	.searchBox {
		flex: 1;
	}

	.filterControls {
		display: flex;
		gap: var(--spacing-s);
		align-items: center;

		.active {
			background: var(--color-primary);
			color: var(--color-text-inverse);
		}
	}
}

.nodeGrid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
	gap: var(--spacing-m);
	margin-bottom: var(--spacing-xl);
}

.loading {
	margin: var(--spacing-xl) 0;
}

.emptyState {
	display: flex;
	justify-content: center;
	align-items: center;
	min-height: 400px;
	text-align: center;

	.emptyStateContent {
		max-width: 400px;

		.emptyStateIcon {
			margin-bottom: var(--spacing-l);
			color: var(--color-text-lighter);
		}

		h3 {
			margin: 0 0 var(--spacing-s) 0;
			font-size: var(--font-size-xl);
			color: var(--color-text-dark);
		}

		p {
			margin: 0 0 var(--spacing-l) 0;
			color: var(--color-text-base);
			line-height: 1.5;
		}
	}
}

.pagination {
	display: flex;
	justify-content: center;
	margin-top: var(--spacing-xl);
}
</style>
