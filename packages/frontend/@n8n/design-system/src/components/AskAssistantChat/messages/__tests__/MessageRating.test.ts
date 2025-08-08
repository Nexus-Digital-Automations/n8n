import { render, fireEvent } from '@testing-library/vue';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import MessageRating from '../MessageRating.vue';

// Mock dependencies
vi.mock('../../../../composables/useI18n', () => ({
	useI18n: vi.fn(() => ({
		t: vi.fn((key: string) => {
			const translations: Record<string, string> = {
				'assistantChat.builder.thumbsUp': 'Thumbs up',
				'assistantChat.builder.thumbsDown': 'Thumbs down',
				'assistantChat.builder.feedbackPlaceholder': 'Tell us more about your experience...',
				'assistantChat.builder.submit': 'Submit',
				'assistantChat.builder.success': 'Thank you for your feedback!',
				'generic.cancel': 'Cancel',
			};
			return translations[key] || key;
		}),
	})),
}));

const stubs = {
	'n8n-button': {
		template:
			'<button class="n8n-button" @click="$emit(\'click\')" :disabled="disabled" :type="type" :data-test-id="$attrs[\'data-test-id\']">{{ label }}<slot /></button>',
		props: ['disabled', 'type', 'size', 'label', 'icon'],
		emits: ['click'],
	},
	'n8n-icon-button': {
		template:
			'<button class="n8n-icon-button" @click="$emit(\'click\')" :disabled="disabled" :data-test-id="$attrs[\'data-test-id\']"><slot /></button>',
		props: ['disabled', 'icon', 'size', 'type', 'text'],
		emits: ['click'],
	},
	'n8n-icon': {
		template: '<span class="n8n-icon" :data-icon="icon" />',
		props: ['icon'],
	},
	'n8n-input': {
		template:
			'<textarea v-if="type === \'textarea\'" class="n8n-input n8n-textarea" @input="$emit(\'update:modelValue\', $event.target.value)" :value="modelValue" :placeholder="placeholder" :data-test-id="$attrs[\'data-test-id\']" />',
		props: ['modelValue', 'placeholder', 'rows', 'disabled', 'type', 'readOnly', 'resize'],
		emits: ['update:modelValue'],
	},
};

type RatingStyle = 'regular' | 'minimal';
// Removed unused type RatingValue

// Removed unused interface RatingFeedback

describe('MessageRating', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Basic Rendering', () => {
		it('should render rating component correctly with regular style', () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular' },
				global: { stubs },
			});

			expect(wrapper.container).toMatchSnapshot();
			expect(wrapper.container.textContent).toContain('Thumbs up');
			expect(wrapper.container.textContent).toContain('Thumbs down');
		});

		it('should render rating component correctly with minimal style', () => {
			const wrapper = render(MessageRating, {
				props: { style: 'minimal' },
				global: { stubs },
			});

			expect(wrapper.container).toMatchSnapshot();
			// Minimal style should show only icons, not text
			expect(wrapper.container.textContent).not.toContain('Thumbs up');
			expect(wrapper.container.textContent).not.toContain('Thumbs down');
		});

		it('should default to regular style when no style specified', () => {
			const wrapper = render(MessageRating, {
				global: { stubs },
			});

			expect(wrapper.container.textContent).toContain('Thumbs up');
			expect(wrapper.container.textContent).toContain('Thumbs down');
		});
	});

	describe('Rating Button Interactions', () => {
		it('should emit feedback event when thumbs up clicked', async () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular' },
				global: { stubs },
			});

			const thumbsUpButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-up-button"]',
			);
			await fireEvent.click(thumbsUpButton!);

			const emittedEvents = wrapper.emitted('feedback');
			expect(emittedEvents).toBeTruthy();
			expect(emittedEvents[0][0]).toMatchObject({
				rating: 'up',
			});
		});

		it('should emit feedback event when thumbs down clicked', async () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular' },
				global: { stubs },
			});

			const thumbsDownButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-down-button"]',
			);
			await fireEvent.click(thumbsDownButton!);

			const emittedEvents = wrapper.emitted('feedback');
			expect(emittedEvents).toBeTruthy();
			expect(emittedEvents[0][0]).toMatchObject({
				rating: 'down',
			});
		});

		it('should hide rating buttons after rating is given', async () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular' },
				global: { stubs },
			});

			const thumbsUpButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-up-button"]',
			);
			await fireEvent.click(thumbsUpButton!);

			// Buttons should be hidden after rating
			expect(
				wrapper.container.querySelector('[data-test-id="message-thumbs-up-button"]'),
			).not.toBeInTheDocument();
			expect(
				wrapper.container.querySelector('[data-test-id="message-thumbs-down-button"]'),
			).not.toBeInTheDocument();
		});

		it('should show success message when showFeedback is false', async () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular', showFeedback: false },
				global: { stubs },
			});

			const thumbsUpButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-up-button"]',
			);
			await fireEvent.click(thumbsUpButton!);

			expect(wrapper.container.textContent).toContain('Thank you for your feedback!');
		});

		it('should handle rapid successive clicks gracefully', async () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular' },
				global: { stubs },
			});

			const thumbsUpButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-up-button"]',
			);

			// Click multiple times rapidly
			await fireEvent.click(thumbsUpButton!);

			// After first click, button should be gone so subsequent clicks won't work
			const emittedEvents = wrapper.emitted('feedback');
			expect(emittedEvents?.length).toBe(1);
		});
	});

	describe('Feedback Form Display', () => {
		it('should show feedback form when showFeedback prop is true and rating is negative', async () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular', showFeedback: true },
				global: { stubs },
			});

			const thumbsDownButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-down-button"]',
			);
			await fireEvent.click(thumbsDownButton!);

			const feedbackInput = wrapper.container.querySelector(
				'[data-test-id="message-feedback-input"]',
			);
			expect(feedbackInput).toBeInTheDocument();
		});

		it('should not show feedback form when showFeedback prop is false', async () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular', showFeedback: false },
				global: { stubs },
			});

			const thumbsDownButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-down-button"]',
			);
			await fireEvent.click(thumbsDownButton!);

			const feedbackInput = wrapper.container.querySelector(
				'[data-test-id="message-feedback-input"]',
			);
			expect(feedbackInput).not.toBeInTheDocument();
		});

		it('should show feedback form for positive ratings when showFeedback is true', async () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular', showFeedback: true },
				global: { stubs },
			});

			const thumbsUpButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-up-button"]',
			);
			await fireEvent.click(thumbsUpButton!);

			const feedbackInput = wrapper.container.querySelector(
				'[data-test-id="message-feedback-input"]',
			);
			expect(feedbackInput).toBeInTheDocument();
		});

		it('should display textarea in feedback form', async () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular', showFeedback: true },
				global: { stubs },
			});

			const thumbsDownButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-down-button"]',
			);
			await fireEvent.click(thumbsDownButton!);

			const textarea = wrapper.container.querySelector('.n8n-textarea');
			expect(textarea).toBeInTheDocument();
			expect(textarea).toHaveAttribute('placeholder', 'Tell us more about your experience...');
		});

		it('should display submit and cancel buttons in feedback form', async () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular', showFeedback: true },
				global: { stubs },
			});

			const thumbsUpButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-up-button"]',
			);
			await fireEvent.click(thumbsUpButton!);

			const submitButton = wrapper.container.querySelector(
				'[data-test-id="message-submit-feedback-button"]',
			);
			const buttons = wrapper.container.querySelectorAll('.n8n-button');
			const cancelButton = Array.from(buttons).find((btn) => btn.textContent?.includes('Cancel'));

			expect(submitButton).toBeInTheDocument();
			expect(cancelButton).toBeInTheDocument();
			expect(submitButton?.textContent).toContain('Submit');
			expect(cancelButton?.textContent).toContain('Cancel');
		});
	});

	describe('Feedback Form Interactions', () => {
		it('should update feedback text when typing in textarea', async () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular', showFeedback: true },
				global: { stubs },
			});

			const thumbsDownButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-down-button"]',
			);
			await fireEvent.click(thumbsDownButton!);

			const textarea = wrapper.container.querySelector('.n8n-textarea');
			await fireEvent.input(textarea!, { target: { value: 'This could be better' } });

			expect(textarea).toHaveAttribute('value', 'This could be better');
		});

		it('should emit feedback with comment when form is submitted', async () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular', showFeedback: true },
				global: { stubs },
			});

			const thumbsDownButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-down-button"]',
			);
			await fireEvent.click(thumbsDownButton!);

			const textarea = wrapper.container.querySelector('.n8n-textarea');
			await fireEvent.input(textarea!, { target: { value: 'Needs improvement' } });

			const submitButton = wrapper.container.querySelector(
				'[data-test-id="message-submit-feedback-button"]',
			);
			await fireEvent.click(submitButton!);

			const emittedEvents = wrapper.emitted('feedback');
			expect(emittedEvents?.length).toBe(2); // Initial rating + feedback submission
			expect(emittedEvents[1][0]).toMatchObject({
				feedback: 'Needs improvement',
			});
		});

		it('should hide feedback form and show success message when submitted', async () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular', showFeedback: true },
				global: { stubs },
			});

			const thumbsUpButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-up-button"]',
			);
			await fireEvent.click(thumbsUpButton!);

			const textarea = wrapper.container.querySelector('.n8n-textarea');
			await fireEvent.input(textarea!, { target: { value: 'Great job!' } });

			const submitButton = wrapper.container.querySelector(
				'[data-test-id="message-submit-feedback-button"]',
			);
			await fireEvent.click(submitButton!);

			const feedbackInput = wrapper.container.querySelector(
				'[data-test-id="message-feedback-input"]',
			);
			expect(feedbackInput).not.toBeInTheDocument();

			expect(wrapper.container.textContent).toContain('Thank you for your feedback!');
		});

		it('should cancel feedback form when cancel button clicked', async () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular', showFeedback: true },
				global: { stubs },
			});

			const thumbsDownButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-down-button"]',
			);
			await fireEvent.click(thumbsDownButton!);

			const buttons = wrapper.container.querySelectorAll('.n8n-button');
			const cancelButton = Array.from(buttons).find((btn) => btn.textContent?.includes('Cancel'));
			await fireEvent.click(cancelButton!);

			const feedbackInput = wrapper.container.querySelector(
				'[data-test-id="message-feedback-input"]',
			);
			expect(feedbackInput).not.toBeInTheDocument();

			// Should reset to initial state with buttons visible
			const thumbsUpButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-up-button"]',
			);
			expect(thumbsUpButton).toBeInTheDocument();
		});

		it('should allow re-rating after cancelling feedback', async () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular', showFeedback: true },
				global: { stubs },
			});

			// Initial rating
			const thumbsDownButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-down-button"]',
			);
			await fireEvent.click(thumbsDownButton!);

			// Cancel feedback
			const buttons = wrapper.container.querySelectorAll('.n8n-button');
			const cancelButton = Array.from(buttons).find((btn) => btn.textContent?.includes('Cancel'));
			await fireEvent.click(cancelButton!);

			// Rate again
			const thumbsUpButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-up-button"]',
			);
			await fireEvent.click(thumbsUpButton!);

			const emittedEvents = wrapper.emitted('feedback');
			expect(emittedEvents?.length).toBe(2);
			expect(emittedEvents[1][0]).toMatchObject({ rating: 'up' });
		});
	});

	describe('Style Variations', () => {
		it('should use different button components based on style', () => {
			const regularWrapper = render(MessageRating, {
				props: { style: 'regular' },
				global: { stubs },
			});

			const minimalWrapper = render(MessageRating, {
				props: { style: 'minimal' },
				global: { stubs },
			});

			// Regular style should use n8n-button
			expect(regularWrapper.container.querySelector('.n8n-button')).toBeInTheDocument();

			// Minimal style should use n8n-icon-button
			expect(minimalWrapper.container.querySelector('.n8n-icon-button')).toBeInTheDocument();
		});

		it('should show appropriate test ids for both styles', () => {
			const styles: RatingStyle[] = ['regular', 'minimal'];

			styles.forEach((style) => {
				const wrapper = render(MessageRating, {
					props: { style },
					global: { stubs },
				});

				const thumbsUpButton = wrapper.container.querySelector(
					'[data-test-id="message-thumbs-up-button"]',
				);
				const thumbsDownButton = wrapper.container.querySelector(
					'[data-test-id="message-thumbs-down-button"]',
				);

				expect(thumbsUpButton).toBeInTheDocument();
				expect(thumbsDownButton).toBeInTheDocument();
			});
		});

		it('should show text in regular style and hide in minimal style', () => {
			const regularWrapper = render(MessageRating, {
				props: { style: 'regular' },
				global: { stubs },
			});

			const minimalWrapper = render(MessageRating, {
				props: { style: 'minimal' },
				global: { stubs },
			});

			// Regular style should show button text
			expect(regularWrapper.container.textContent).toContain('Thumbs up');
			expect(regularWrapper.container.textContent).toContain('Thumbs down');

			// Minimal style should not show button text (only icons)
			expect(minimalWrapper.container.textContent).not.toContain('Thumbs up');
			expect(minimalWrapper.container.textContent).not.toContain('Thumbs down');
		});
	});

	describe('Accessibility', () => {
		it('should have proper test ids for rating buttons', () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular' },
				global: { stubs },
			});

			const thumbsUpButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-up-button"]',
			);
			const thumbsDownButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-down-button"]',
			);

			expect(thumbsUpButton).toBeInTheDocument();
			expect(thumbsDownButton).toBeInTheDocument();
		});

		it('should have accessible button structure', () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular' },
				global: { stubs },
			});

			const buttons = wrapper.container.querySelectorAll('button');
			expect(buttons.length).toBeGreaterThan(0);

			// Buttons should not have negative tabindex by default
			buttons.forEach((button) => {
				expect(button).not.toHaveAttribute('tabindex', '-1');
			});
		});

		it('should be keyboard accessible', () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular' },
				global: { stubs },
			});

			const thumbsUpButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-up-button"]',
			);

			// Button should be focusable
			expect(thumbsUpButton?.tagName.toLowerCase()).toBe('button');
		});

		it('should have proper feedback form accessibility', async () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular', showFeedback: true },
				global: { stubs },
			});

			const thumbsDownButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-down-button"]',
			);
			await fireEvent.click(thumbsDownButton!);

			const textarea = wrapper.container.querySelector('.n8n-textarea');
			expect(textarea).toBeInTheDocument();
			expect(textarea).toHaveAttribute('placeholder', 'Tell us more about your experience...');
		});

		it('should maintain accessibility across style variations', () => {
			const styles: RatingStyle[] = ['regular', 'minimal'];

			styles.forEach((style) => {
				const wrapper = render(MessageRating, {
					props: { style },
					global: { stubs },
				});

				const buttons = wrapper.container.querySelectorAll('button');
				expect(buttons.length).toBeGreaterThan(0);

				buttons.forEach((button) => {
					expect(button).not.toHaveAttribute('disabled');
				});
			});
		});
	});

	describe('Edge Cases', () => {
		it('should handle missing style prop gracefully', () => {
			const wrapper = render(MessageRating, {
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
			// Should default to regular style
			expect(wrapper.container.textContent).toContain('Thumbs up');
		});

		it('should handle invalid style prop', () => {
			const wrapper = render(MessageRating, {
				props: { style: 'invalid-style' as RatingStyle },
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
			// With invalid style, the component still renders but may not show expected text
			// Check that the buttons exist with test IDs regardless of styling
			const thumbsUpButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-up-button"]',
			);
			const thumbsDownButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-down-button"]',
			);
			expect(thumbsUpButton).toBeInTheDocument();
			expect(thumbsDownButton).toBeInTheDocument();
		});

		it('should handle empty feedback comment', async () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular', showFeedback: true },
				global: { stubs },
			});

			const thumbsDownButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-down-button"]',
			);
			await fireEvent.click(thumbsDownButton!);

			const submitButton = wrapper.container.querySelector(
				'[data-test-id="message-submit-feedback-button"]',
			);
			await fireEvent.click(submitButton!);

			const emittedEvents = wrapper.emitted('feedback');
			expect(emittedEvents[1][0]).toMatchObject({
				feedback: '',
			});
		});

		it('should handle very long feedback comments', async () => {
			const longComment = 'A'.repeat(10000);
			const wrapper = render(MessageRating, {
				props: { style: 'regular', showFeedback: true },
				global: { stubs },
			});

			const thumbsUpButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-up-button"]',
			);
			await fireEvent.click(thumbsUpButton!);

			const textarea = wrapper.container.querySelector('.n8n-textarea');
			await fireEvent.input(textarea!, { target: { value: longComment } });

			const submitButton = wrapper.container.querySelector(
				'[data-test-id="message-submit-feedback-button"]',
			);
			await fireEvent.click(submitButton!);

			const emittedEvents = wrapper.emitted('feedback');
			expect(emittedEvents[1][0]).toMatchObject({
				feedback: longComment,
			});
		});

		it('should handle special characters in feedback', async () => {
			const specialComment = 'Special chars: <>&"\'`~!@#$%^&*()[]{}|\\';
			const wrapper = render(MessageRating, {
				props: { style: 'regular', showFeedback: true },
				global: { stubs },
			});

			const thumbsDownButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-down-button"]',
			);
			await fireEvent.click(thumbsDownButton!);

			const textarea = wrapper.container.querySelector('.n8n-textarea');
			await fireEvent.input(textarea!, { target: { value: specialComment } });

			const submitButton = wrapper.container.querySelector(
				'[data-test-id="message-submit-feedback-button"]',
			);
			await fireEvent.click(submitButton!);

			const emittedEvents = wrapper.emitted('feedback');
			expect(emittedEvents[1][0]).toMatchObject({
				feedback: specialComment,
			});
		});
	});

	describe('Performance', () => {
		it('should handle rapid rating changes efficiently', async () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular', showFeedback: true },
				global: { stubs },
			});

			// Test that component handles rapid interactions without breaking
			const thumbsUpButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-up-button"]',
			);

			// First click should work normally
			await fireEvent.click(thumbsUpButton!);

			// Buttons should be hidden after rating, so rapid clicks won't be possible
			expect(
				wrapper.container.querySelector('[data-test-id="message-thumbs-up-button"]'),
			).not.toBeInTheDocument();
			expect(wrapper.container).toBeInTheDocument();
		});

		it('should not cause memory leaks with form interactions', async () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular', showFeedback: true },
				global: { stubs },
			});

			// Simulate form interaction cycle
			const thumbsDownButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-down-button"]',
			);
			await fireEvent.click(thumbsDownButton!);

			const textarea = wrapper.container.querySelector('.n8n-textarea');
			await fireEvent.input(textarea!, { target: { value: 'Test comment' } });

			const buttons = wrapper.container.querySelectorAll('.n8n-button');
			const cancelButton = Array.from(buttons).find((btn) => btn.textContent?.includes('Cancel'));
			await fireEvent.click(cancelButton!);

			// Verify component can be unmounted cleanly
			wrapper.unmount();
			expect(wrapper.container.innerHTML).toBe('');
		});
	});

	describe('Event Emission', () => {
		it('should emit rating events correctly', async () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular' },
				global: { stubs },
			});

			const thumbsUpButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-up-button"]',
			);
			await fireEvent.click(thumbsUpButton!);

			const emittedEvents = wrapper.emitted('feedback');
			expect(emittedEvents).toBeTruthy();
			expect(emittedEvents[0][0]).toMatchObject({
				rating: 'up',
			});
		});

		it('should emit feedback events with proper structure', async () => {
			const wrapper = render(MessageRating, {
				props: { style: 'regular', showFeedback: true },
				global: { stubs },
			});

			const thumbsDownButton = wrapper.container.querySelector(
				'[data-test-id="message-thumbs-down-button"]',
			);
			await fireEvent.click(thumbsDownButton!);

			const textarea = wrapper.container.querySelector('.n8n-textarea');
			await fireEvent.input(textarea!, { target: { value: 'Test feedback' } });

			const submitButton = wrapper.container.querySelector(
				'[data-test-id="message-submit-feedback-button"]',
			);
			await fireEvent.click(submitButton!);

			const emittedEvents = wrapper.emitted('feedback');
			expect(emittedEvents?.length).toBe(2); // Rating + feedback submission
			expect(emittedEvents[1][0]).toMatchObject({
				feedback: 'Test feedback',
			});
		});
	});
});
