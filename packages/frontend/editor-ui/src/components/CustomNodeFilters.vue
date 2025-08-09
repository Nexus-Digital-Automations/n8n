<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from '@n8n/i18n';

interface Props {
	availableCategories: string[];
	availableTags: string[];
	availableStatuses: string[];
	selectedCategory: string;
	selectedStatus: string;
	selectedTags: string[];
}

interface Emits {
	filterChange: [
		filters: {
			category?: string;
			status?: string;
			tags?: string[];
		},
	];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const i18n = useI18n();

// Local state for filters
const localCategory = computed({
	get: () => props.selectedCategory,
	set: (value: string) => {
		emit('filterChange', { category: value });
	},
});

const localStatus = computed({
	get: () => props.selectedStatus,
	set: (value: string) => {
		emit('filterChange', { status: value });
	},
});

const localTags = computed({
	get: () => props.selectedTags,
	set: (value: string[]) => {
		emit('filterChange', { tags: value });
	},
});

// Status options with labels
const statusOptions = computed(() => [
	{ value: 'all', label: i18n.baseText('settings.customNodes.filters.status.all') },
	{ value: 'uploaded', label: i18n.baseText('settings.customNodes.filters.status.uploaded') },
	{ value: 'validating', label: i18n.baseText('settings.customNodes.filters.status.validating') },
	{ value: 'validated', label: i18n.baseText('settings.customNodes.filters.status.validated') },
	{ value: 'failed', label: i18n.baseText('settings.customNodes.filters.status.failed') },
	{ value: 'deployed', label: i18n.baseText('settings.customNodes.filters.status.deployed') },
]);

// Category options with labels
const categoryOptions = computed(() => [
	{ value: '', label: i18n.baseText('settings.customNodes.filters.category.all') },
	...props.availableCategories.map((category) => ({
		value: category,
		label: category,
	})),
]);

// Tag options for multi-select
const tagOptions = computed(() =>
	props.availableTags.map((tag) => ({
		value: tag,
		label: tag,
	})),
);

// Clear all filters
const clearAllFilters = () => {
	emit('filterChange', {
		category: '',
		status: 'all',
		tags: [],
	});
};

// Check if any filters are active
const hasActiveFilters = computed(() => {
	return (
		props.selectedCategory !== '' || props.selectedStatus !== 'all' || props.selectedTags.length > 0
	);
});
</script>

<template>
	<div :class="$style.filtersPanel">
		<div :class="$style.filtersHeader">
			<h4>{{ i18n.baseText('settings.customNodes.filters.title') }}</h4>
			<n8n-button
				v-if="hasActiveFilters"
				type="tertiary"
				size="small"
				:label="i18n.baseText('settings.customNodes.filters.clearAll')"
				@click="clearAllFilters"
			/>
		</div>

		<div :class="$style.filtersGrid">
			<!-- Status Filter -->
			<div :class="$style.filterGroup">
				<label :class="$style.filterLabel">
					{{ i18n.baseText('settings.customNodes.filters.status.label') }}
				</label>
				<n8n-select v-model="localStatus" :class="$style.filterSelect">
					<n8n-option
						v-for="option in statusOptions"
						:key="option.value"
						:value="option.value"
						:label="option.label"
					/>
				</n8n-select>
			</div>

			<!-- Category Filter -->
			<div :class="$style.filterGroup">
				<label :class="$style.filterLabel">
					{{ i18n.baseText('settings.customNodes.filters.category.label') }}
				</label>
				<n8n-select
					v-model="localCategory"
					:class="$style.filterSelect"
					:placeholder="i18n.baseText('settings.customNodes.filters.category.placeholder')"
				>
					<n8n-option
						v-for="option in categoryOptions"
						:key="option.value"
						:value="option.value"
						:label="option.label"
					/>
				</n8n-select>
			</div>

			<!-- Tags Filter -->
			<div :class="$style.filterGroup">
				<label :class="$style.filterLabel">
					{{ i18n.baseText('settings.customNodes.filters.tags.label') }}
				</label>
				<n8n-select
					v-model="localTags"
					:class="$style.filterSelect"
					multiple
					:placeholder="i18n.baseText('settings.customNodes.filters.tags.placeholder')"
					:max-tag-count="3"
				>
					<n8n-option
						v-for="option in tagOptions"
						:key="option.value"
						:value="option.value"
						:label="option.label"
					/>
				</n8n-select>
			</div>
		</div>

		<!-- Active Filters Display -->
		<div v-if="hasActiveFilters" :class="$style.activeFilters">
			<span :class="$style.activeFiltersLabel">
				{{ i18n.baseText('settings.customNodes.filters.active') }}:
			</span>
			<div :class="$style.activeFilterTags">
				<n8n-tag
					v-if="selectedStatus !== 'all'"
					:text="`${i18n.baseText('settings.customNodes.filters.status.label')}: ${statusOptions.find((s) => s.value === selectedStatus)?.label}`"
					theme="light"
					@remove="localStatus = 'all'"
				/>
				<n8n-tag
					v-if="selectedCategory"
					:text="`${i18n.baseText('settings.customNodes.filters.category.label')}: ${selectedCategory}`"
					theme="light"
					@remove="localCategory = ''"
				/>
				<n8n-tag
					v-for="tag in selectedTags"
					:key="tag"
					:text="`${i18n.baseText('settings.customNodes.filters.tags.label')}: ${tag}`"
					theme="light"
					@remove="localTags = selectedTags.filter((t) => t !== tag)"
				/>
			</div>
		</div>
	</div>
</template>

<style lang="scss" module>
.filtersPanel {
	background: var(--color-background-xlight);
	border: 1px solid var(--color-foreground-light);
	border-radius: var(--border-radius-large);
	padding: var(--spacing-m);
	margin-bottom: var(--spacing-m);
}

.filtersHeader {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: var(--spacing-s);

	h4 {
		margin: 0;
		font-size: var(--font-size-m);
		font-weight: var(--font-weight-bold);
		color: var(--color-text-dark);
	}
}

.filtersGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
	gap: var(--spacing-m);
	margin-bottom: var(--spacing-s);
}

.filterGroup {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-2xs);
}

.filterLabel {
	font-size: var(--font-size-s);
	font-weight: var(--font-weight-medium);
	color: var(--color-text-base);
}

.filterSelect {
	width: 100%;
}

.activeFilters {
	display: flex;
	align-items: flex-start;
	gap: var(--spacing-xs);
	padding-top: var(--spacing-s);
	border-top: 1px solid var(--color-foreground-light);
}

.activeFiltersLabel {
	font-size: var(--font-size-xs);
	color: var(--color-text-light);
	white-space: nowrap;
	padding-top: var(--spacing-3xs);
}

.activeFilterTags {
	display: flex;
	flex-wrap: wrap;
	gap: var(--spacing-3xs);
}
</style>
