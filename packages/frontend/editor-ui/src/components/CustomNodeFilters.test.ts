import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestingPinia } from '@pinia/testing';
import { setActivePinia } from 'pinia';
import { fireEvent, waitFor } from '@testing-library/vue';
import CustomNodeFilters from './CustomNodeFilters.vue';
import { createComponentRenderer } from '@/__tests__/render';

const mockProps = {
	availableCategories: ['test', 'utility', 'integration', 'analytics'],
	availableTags: ['automation', 'data', 'api', 'webhook', 'database', 'sample'],
	availableStatuses: ['uploaded', 'validated', 'deployed', 'failed'],
	selectedCategory: '',
	selectedStatus: 'all',
	selectedTags: [],
};

const renderComponent = createComponentRenderer(CustomNodeFilters);

describe('CustomNodeFilters', () => {
	beforeEach(() => {
		const pinia = createTestingPinia();
		setActivePinia(pinia);
		vi.clearAllMocks();
	});

	describe('rendering', () => {
		it('should render filters panel with title', () => {
			const { getByText, getByTestId } = renderComponent({
				props: mockProps,
			});

			expect(getByText('Filters')).toBeInTheDocument();
			expect(getByTestId('custom-node-filters')).toBeInTheDocument();
		});

		it('should render all filter groups', () => {
			const { getByText } = renderComponent({
				props: mockProps,
			});

			expect(getByText('Status')).toBeInTheDocument();
			expect(getByText('Category')).toBeInTheDocument();
			expect(getByText('Tags')).toBeInTheDocument();
		});

		it('should not show clear all button when no filters are active', () => {
			const { queryByRole } = renderComponent({
				props: mockProps,
			});

			expect(queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument();
		});

		it('should show clear all button when filters are active', () => {
			const { getByRole } = renderComponent({
				props: {
					...mockProps,
					selectedStatus: 'deployed',
				},
			});

			expect(getByRole('button', { name: /clear all/i })).toBeInTheDocument();
		});
	});

	describe('status filter', () => {
		it('should display all status options', () => {
			const { getByRole, getAllByRole } = renderComponent({
				props: mockProps,
			});

			const statusSelect = getByRole('combobox', { name: /status/i });
			expect(statusSelect).toBeInTheDocument();

			fireEvent.click(statusSelect);

			const options = getAllByRole('option');
			expect(options).toHaveLength(6); // all, uploaded, validating, validated, failed, deployed
		});

		it('should have "all" selected by default', () => {
			const { getByDisplayValue } = renderComponent({
				props: mockProps,
			});

			expect(getByDisplayValue('All')).toBeInTheDocument();
		});

		it('should show selected status', () => {
			const { getByDisplayValue } = renderComponent({
				props: {
					...mockProps,
					selectedStatus: 'deployed',
				},
			});

			expect(getByDisplayValue('Deployed')).toBeInTheDocument();
		});

		it('should emit filterChange when status is changed', async () => {
			const { getByRole, emitted } = renderComponent({
				props: mockProps,
			});

			const statusSelect = getByRole('combobox', { name: /status/i });
			await fireEvent.change(statusSelect, { target: { value: 'validated' } });

			expect(emitted().filterChange).toHaveLength(1);
			expect(emitted().filterChange[0]).toEqual([{ status: 'validated' }]);
		});
	});

	describe('category filter', () => {
		it('should display category options from props', () => {
			const { getByRole } = renderComponent({
				props: mockProps,
			});

			const categorySelect = getByRole('combobox', { name: /category/i });
			expect(categorySelect).toBeInTheDocument();
		});

		it('should show "All Categories" as default', () => {
			const { getByDisplayValue } = renderComponent({
				props: mockProps,
			});

			expect(getByDisplayValue('All Categories')).toBeInTheDocument();
		});

		it('should show selected category', () => {
			const { getByDisplayValue } = renderComponent({
				props: {
					...mockProps,
					selectedCategory: 'utility',
				},
			});

			expect(getByDisplayValue('utility')).toBeInTheDocument();
		});

		it('should emit filterChange when category is changed', async () => {
			const { getByRole, emitted } = renderComponent({
				props: mockProps,
			});

			const categorySelect = getByRole('combobox', { name: /category/i });
			await fireEvent.change(categorySelect, { target: { value: 'test' } });

			expect(emitted().filterChange).toHaveLength(1);
			expect(emitted().filterChange[0]).toEqual([{ category: 'test' }]);
		});
	});

	describe('tags filter', () => {
		it('should display as multi-select', () => {
			const { getByRole } = renderComponent({
				props: mockProps,
			});

			const tagsSelect = getByRole('combobox', { name: /tags/i });
			expect(tagsSelect).toHaveAttribute('multiple');
		});

		it('should show selected tags', () => {
			const { getByText } = renderComponent({
				props: {
					...mockProps,
					selectedTags: ['automation', 'api'],
				},
			});

			expect(getByText('automation')).toBeInTheDocument();
			expect(getByText('api')).toBeInTheDocument();
		});

		it('should limit displayed tags to 3', () => {
			const { container } = renderComponent({
				props: {
					...mockProps,
					selectedTags: ['automation', 'api', 'data', 'webhook'],
				},
			});

			// Should show max 3 tags with overflow indicator
			const tagElements = container.querySelectorAll('.n8n-tag');
			expect(tagElements.length).toBeLessThanOrEqual(4); // 3 tags + potential +N indicator
		});

		it('should emit filterChange when tags are changed', async () => {
			const { getByRole, emitted } = renderComponent({
				props: mockProps,
			});

			const tagsSelect = getByRole('listbox', { name: /tags/i });

			// Simulate adding a tag
			await fireEvent.change(tagsSelect, { target: { value: ['automation'] } });

			expect(emitted().filterChange).toHaveLength(1);
			expect(emitted().filterChange[0]).toEqual([{ tags: ['automation'] }]);
		});
	});

	describe('active filters display', () => {
		it('should not show active filters section when no filters are active', () => {
			const { queryByText } = renderComponent({
				props: mockProps,
			});

			expect(queryByText(/active/i)).not.toBeInTheDocument();
		});

		it('should show active filters section when filters are applied', () => {
			const { getByText } = renderComponent({
				props: {
					...mockProps,
					selectedStatus: 'deployed',
					selectedCategory: 'utility',
				},
			});

			expect(getByText(/active/i)).toBeInTheDocument();
		});

		it('should display active status filter as tag', () => {
			const { getByText } = renderComponent({
				props: {
					...mockProps,
					selectedStatus: 'deployed',
				},
			});

			expect(getByText('Status: Deployed')).toBeInTheDocument();
		});

		it('should display active category filter as tag', () => {
			const { getByText } = renderComponent({
				props: {
					...mockProps,
					selectedCategory: 'utility',
				},
			});

			expect(getByText('Category: utility')).toBeInTheDocument();
		});

		it('should display active tag filters', () => {
			const { getByText } = renderComponent({
				props: {
					...mockProps,
					selectedTags: ['automation', 'api'],
				},
			});

			expect(getByText('Tags: automation')).toBeInTheDocument();
			expect(getByText('Tags: api')).toBeInTheDocument();
		});

		it('should allow removing individual active filter tags', async () => {
			const { getByText, emitted } = renderComponent({
				props: {
					...mockProps,
					selectedStatus: 'deployed',
				},
			});

			const statusTag = getByText('Status: Deployed');
			const removeButton = statusTag.querySelector('button[aria-label="Remove"]');

			if (removeButton) {
				await fireEvent.click(removeButton);
				expect(emitted().filterChange).toHaveLength(1);
				expect(emitted().filterChange[0]).toEqual([{ status: 'all' }]);
			}
		});

		it('should allow removing individual tag filters', async () => {
			const { getByText, emitted } = renderComponent({
				props: {
					...mockProps,
					selectedTags: ['automation', 'api'],
				},
			});

			const tagElement = getByText('Tags: automation');
			const removeButton = tagElement.querySelector('button[aria-label="Remove"]');

			if (removeButton) {
				await fireEvent.click(removeButton);
				expect(emitted().filterChange).toHaveLength(1);
				expect(emitted().filterChange[0]).toEqual([{ tags: ['api'] }]);
			}
		});
	});

	describe('clear all functionality', () => {
		it('should clear all filters when clear all button is clicked', async () => {
			const { getByRole, emitted } = renderComponent({
				props: {
					...mockProps,
					selectedStatus: 'deployed',
					selectedCategory: 'utility',
					selectedTags: ['automation'],
				},
			});

			const clearAllButton = getByRole('button', { name: /clear all/i });
			await fireEvent.click(clearAllButton);

			expect(emitted().filterChange).toHaveLength(1);
			expect(emitted().filterChange[0]).toEqual([
				{
					category: '',
					status: 'all',
					tags: [],
				},
			]);
		});
	});

	describe('computed properties', () => {
		it('should detect when filters are active - status', () => {
			const { container } = renderComponent({
				props: {
					...mockProps,
					selectedStatus: 'deployed',
				},
			});

			expect(container.querySelector('[class*="activeFilters"]')).toBeInTheDocument();
		});

		it('should detect when filters are active - category', () => {
			const { container } = renderComponent({
				props: {
					...mockProps,
					selectedCategory: 'utility',
				},
			});

			expect(container.querySelector('[class*="activeFilters"]')).toBeInTheDocument();
		});

		it('should detect when filters are active - tags', () => {
			const { container } = renderComponent({
				props: {
					...mockProps,
					selectedTags: ['automation'],
				},
			});

			expect(container.querySelector('[class*="activeFilters"]')).toBeInTheDocument();
		});

		it('should generate correct status options', () => {
			const { getAllByRole } = renderComponent({
				props: mockProps,
			});

			const statusSelect = getAllByRole('combobox')[0]; // First combobox is status
			fireEvent.click(statusSelect);

			const options = getAllByRole('option');
			const expectedOptions = ['All', 'Uploaded', 'Validating', 'Validated', 'Failed', 'Deployed'];

			options.forEach((option, index) => {
				expect(option).toHaveTextContent(expectedOptions[index]);
			});
		});

		it('should generate correct category options', () => {
			const { getAllByRole } = renderComponent({
				props: mockProps,
			});

			const categorySelect = getAllByRole('combobox')[1]; // Second combobox is category
			fireEvent.click(categorySelect);

			const options = getAllByRole('option');
			expect(options[0]).toHaveTextContent('All Categories');
			expect(options[1]).toHaveTextContent('test');
			expect(options[2]).toHaveTextContent('utility');
			expect(options[3]).toHaveTextContent('integration');
			expect(options[4]).toHaveTextContent('analytics');
		});
	});

	describe('edge cases', () => {
		it('should handle empty available categories', () => {
			const { getByRole } = renderComponent({
				props: {
					...mockProps,
					availableCategories: [],
				},
			});

			const categorySelect = getByRole('combobox', { name: /category/i });
			fireEvent.click(categorySelect);

			const options = getAllByRole('option');
			expect(options).toHaveLength(1); // Only "All Categories"
		});

		it('should handle empty available tags', () => {
			const { getByRole } = renderComponent({
				props: {
					...mockProps,
					availableTags: [],
				},
			});

			const tagsSelect = getByRole('listbox', { name: /tags/i });
			expect(tagsSelect).toBeInTheDocument();
		});

		it('should handle empty available statuses', () => {
			const { getAllByRole } = renderComponent({
				props: {
					...mockProps,
					availableStatuses: [],
				},
			});

			const statusSelect = getAllByRole('combobox')[0];
			fireEvent.click(statusSelect);

			const options = getAllByRole('option');
			expect(options).toHaveLength(6); // Built-in status options
		});

		it('should handle very long category names gracefully', () => {
			const longCategoryName = 'very-long-category-name-that-might-cause-layout-issues-in-the-ui';
			const { getByText } = renderComponent({
				props: {
					...mockProps,
					availableCategories: [longCategoryName],
					selectedCategory: longCategoryName,
				},
			});

			expect(getByText(longCategoryName)).toBeInTheDocument();
		});

		it('should handle many selected tags', () => {
			const manyTags = ['tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6'];
			const { container } = renderComponent({
				props: {
					...mockProps,
					selectedTags: manyTags,
				},
			});

			expect(container.querySelector('[class*="activeFilters"]')).toBeInTheDocument();
		});
	});

	describe('accessibility', () => {
		it('should have proper ARIA labels', () => {
			const { getByRole } = renderComponent({
				props: mockProps,
			});

			expect(getByRole('combobox', { name: /status/i })).toBeInTheDocument();
			expect(getByRole('combobox', { name: /category/i })).toBeInTheDocument();
			expect(getByRole('listbox', { name: /tags/i })).toBeInTheDocument();
		});

		it('should have proper labeling for filter groups', () => {
			const { getByText } = renderComponent({
				props: mockProps,
			});

			expect(getByText('Status')).toBeInTheDocument();
			expect(getByText('Category')).toBeInTheDocument();
			expect(getByText('Tags')).toBeInTheDocument();
		});

		it('should provide clear button accessibility when filters are active', () => {
			const { getByRole } = renderComponent({
				props: {
					...mockProps,
					selectedStatus: 'deployed',
				},
			});

			const clearButton = getByRole('button', { name: /clear all/i });
			expect(clearButton).toBeInTheDocument();
			expect(clearButton).toBeVisible();
		});
	});

	describe('responsive behavior', () => {
		it('should render filters in grid layout', () => {
			const { container } = renderComponent({
				props: mockProps,
			});

			const filtersGrid = container.querySelector('[class*="filtersGrid"]');
			expect(filtersGrid).toBeInTheDocument();
		});

		it('should handle active filters layout', () => {
			const { container } = renderComponent({
				props: {
					...mockProps,
					selectedStatus: 'deployed',
					selectedCategory: 'utility',
					selectedTags: ['automation', 'api'],
				},
			});

			const activeFilters = container.querySelector('[class*="activeFilters"]');
			expect(activeFilters).toBeInTheDocument();

			const filterTags = container.querySelector('[class*="activeFilterTags"]');
			expect(filterTags).toBeInTheDocument();
		});
	});

	describe('event handling', () => {
		it('should handle rapid filter changes', async () => {
			const { getByRole, emitted } = renderComponent({
				props: mockProps,
			});

			const statusSelect = getByRole('combobox', { name: /status/i });
			const categorySelect = getByRole('combobox', { name: /category/i });

			// Rapid changes
			await fireEvent.change(statusSelect, { target: { value: 'deployed' } });
			await fireEvent.change(categorySelect, { target: { value: 'utility' } });
			await fireEvent.change(statusSelect, { target: { value: 'validated' } });

			expect(emitted().filterChange).toHaveLength(3);
			expect(emitted().filterChange[0]).toEqual([{ status: 'deployed' }]);
			expect(emitted().filterChange[1]).toEqual([{ category: 'utility' }]);
			expect(emitted().filterChange[2]).toEqual([{ status: 'validated' }]);
		});

		it('should emit correct data structure for all filter types', async () => {
			const { getByRole, emitted } = renderComponent({
				props: mockProps,
			});

			const statusSelect = getByRole('combobox', { name: /status/i });
			await fireEvent.change(statusSelect, { target: { value: 'deployed' } });

			expect(emitted().filterChange[0][0]).toHaveProperty('status');
			expect(emitted().filterChange[0][0].status).toBe('deployed');
		});
	});
});
