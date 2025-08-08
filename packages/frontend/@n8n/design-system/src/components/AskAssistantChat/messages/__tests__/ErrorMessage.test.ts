import { render, fireEvent } from '@testing-library/vue';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { nextTick } from 'vue';

import type { ChatUI } from '../../../../types';

import ErrorMessage from '../ErrorMessage.vue';

// Mock dependencies
vi.mock('../../../../composables/useI18n', () => ({
	useI18n: vi.fn(() => ({
		t: vi.fn((key: string) => {
			const translations: Record<string, string> = {
				'generic.retry': 'Retry',
			};
			return translations[key] || key;
		}),
	})),
}));

const stubs = {
	N8nButton: {
		template:
			'<button class="n8n-button" @click="$emit(\'click\')" :disabled="disabled" :data-type="type" :data-size="size"><slot /></button>',
		props: ['disabled', 'type', 'size'],
		emits: ['click'],
	},
	N8nIcon: {
		template: '<span class="n8n-icon" :data-icon="icon" :data-size="size" />',
		props: ['icon', 'size'],
	},
	BaseMessage: {
		template: '<div class="base-message"><slot /></div>',
		props: ['message', 'isFirstOfRole', 'user'],
	},
};

const createErrorMessage = (
	overrides: Partial<ChatUI.ErrorMessage & { id?: string; read?: boolean }> = {},
): ChatUI.ErrorMessage & { id: string; read: boolean } =>
	({
		id: '1',
		type: 'error',
		role: 'assistant',
		content: 'Something went wrong',
		read: false,
		...overrides,
	}) as ChatUI.ErrorMessage & { id: string; read: boolean };

describe('ErrorMessage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Basic Rendering', () => {
		it('should render error message correctly', () => {
			const message = createErrorMessage();
			const wrapper = render(ErrorMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toMatchSnapshot();
			expect(wrapper.container.textContent).toContain('Something went wrong');
		});

		it('should display error icon', () => {
			const message = createErrorMessage();
			const wrapper = render(ErrorMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const errorIcon = wrapper.container.querySelector('.n8n-icon');
			expect(errorIcon).toBeInTheDocument();
			expect(errorIcon).toHaveAttribute('data-icon', 'triangle-alert');
		});

		it('should render with BaseMessage wrapper', () => {
			const message = createErrorMessage();
			const wrapper = render(ErrorMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const baseMessage = wrapper.container.querySelector('.base-message');
			expect(baseMessage).toBeInTheDocument();
		});

		it('should display error container with data-test-id', () => {
			const message = createErrorMessage();
			const wrapper = render(ErrorMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const errorContainer = wrapper.container.querySelector(
				'[data-test-id="chat-message-system"]',
			);
			expect(errorContainer).toBeInTheDocument();
		});

		it('should handle empty content gracefully', () => {
			const message = createErrorMessage({ content: '' });
			const wrapper = render(ErrorMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
		});
	});

	describe('Error Content Display', () => {
		it('should display error messages', () => {
			const message = createErrorMessage({
				content: 'Network error',
			});
			const wrapper = render(ErrorMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.textContent).toContain('Network error');
		});

		it('should display long error messages', () => {
			const longError =
				'A very long error message that explains in detail what went wrong with the request and why it failed to complete successfully';
			const message = createErrorMessage({
				content: longError,
			});
			const wrapper = render(ErrorMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.textContent).toContain(longError);
		});

		it('should handle multiline error messages', () => {
			const multilineError = 'Error: Request failed\nStatus: 500\nDetails: Internal server error';
			const message = createErrorMessage({
				content: multilineError,
			});
			const wrapper = render(ErrorMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.textContent).toContain('Request failed');
			expect(wrapper.container.textContent).toContain('Status: 500');
			expect(wrapper.container.textContent).toContain('Internal server error');
		});

		it('should handle special characters in error content', () => {
			const specialError = 'Error with special chars: <>&"\'';
			const message = createErrorMessage({ content: specialError });
			const wrapper = render(ErrorMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.textContent).toContain(specialError);
		});
	});

	describe('Retry Functionality', () => {
		it('should show retry button when retry function is provided', () => {
			const retryFn = vi.fn();
			const message = createErrorMessage({ retry: retryFn });
			const wrapper = render(ErrorMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const retryButton = wrapper.container.querySelector('.n8n-button');
			expect(retryButton).toBeInTheDocument();
			expect(wrapper.container.textContent).toContain('Retry');
		});

		it('should not show retry button when retry function is not provided', () => {
			const message = createErrorMessage();
			const wrapper = render(ErrorMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.querySelector('.n8n-button')).not.toBeInTheDocument();
		});

		it('should call retry function when retry button clicked', async () => {
			const retryFn = vi.fn().mockResolvedValue(undefined);
			const message = createErrorMessage({ retry: retryFn });
			const wrapper = render(ErrorMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const retryButton = wrapper.container.querySelector('.n8n-button');
			await fireEvent.click(retryButton!);

			expect(retryFn).toHaveBeenCalledTimes(1);
		});

		it('should have retry button with correct props', () => {
			const retryFn = vi.fn();
			const message = createErrorMessage({ retry: retryFn });
			const wrapper = render(ErrorMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const retryButton = wrapper.container.querySelector('.n8n-button');
			expect(retryButton).toHaveAttribute('data-type', 'secondary');
			expect(retryButton).toHaveAttribute('data-size', 'mini');
		});

		it('should have retry button with test id', () => {
			const retryFn = vi.fn();
			const message = createErrorMessage({ retry: retryFn });
			const wrapper = render(ErrorMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const retryButton = wrapper.container.querySelector('[data-test-id="error-retry-button"]');
			expect(retryButton).toBeInTheDocument();
		});
	});

	describe('Component Structure', () => {
		it('should pass correct props to BaseMessage', () => {
			const user = { firstName: 'John', lastName: 'Doe' };
			const message = createErrorMessage();
			const wrapper = render(ErrorMessage, {
				props: {
					message,
					isFirstOfRole: true,
					user,
				},
				global: { stubs },
			});

			// BaseMessage should receive the props
			expect(wrapper.container.querySelector('.base-message')).toBeInTheDocument();
		});

		it('should work without user prop', () => {
			const message = createErrorMessage();
			const wrapper = render(ErrorMessage, {
				props: {
					message,
					isFirstOfRole: false,
				},
				global: { stubs },
			});

			expect(wrapper.container.querySelector('.base-message')).toBeInTheDocument();
		});

		it('should display icon with correct size', () => {
			const message = createErrorMessage();
			const wrapper = render(ErrorMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const icon = wrapper.container.querySelector('.n8n-icon');
			expect(icon).toHaveAttribute('data-size', 'small');
		});
	});

	describe('Edge Cases', () => {
		it('should handle message type inconsistency', () => {
			const message = { ...createErrorMessage(), type: 'not-error' } as any;
			const wrapper = render(ErrorMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
		});

		it('should handle undefined retry function', () => {
			const message = { ...createErrorMessage(), retry: undefined };
			const wrapper = render(ErrorMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.querySelector('.n8n-button')).not.toBeInTheDocument();
		});

		it('should handle very long error messages', () => {
			const longError = 'A'.repeat(1000);
			const message = createErrorMessage({ content: longError });
			const wrapper = render(ErrorMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.textContent).toContain(longError);
		});
	});
});
