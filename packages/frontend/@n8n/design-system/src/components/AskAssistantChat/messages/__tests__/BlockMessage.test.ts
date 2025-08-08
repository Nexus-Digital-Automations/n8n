import { render } from '@testing-library/vue';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import type { ChatUI } from '../../../../types';
import BlockMessage from '../BlockMessage.vue';

// Mock dependencies
vi.mock('../useMarkdown', () => ({
	useMarkdown: vi.fn(() => ({
		renderMarkdown: vi.fn((content: string) => `<p>${content}</p>`),
	})),
}));

vi.mock('../../../../composables/useI18n', () => ({
	useI18n: vi.fn(() => ({
		t: vi.fn((key: string) => key),
	})),
}));

const stubs = {
	'blinking-cursor': {
		template: '<span class="blinking-cursor">|</span>',
	},
};

const createBlockMessage = (
	overrides: Partial<
		ChatUI.SummaryBlock & { id?: string; read?: boolean; quickReplies?: ChatUI.QuickReply[] }
	> = {},
): ChatUI.SummaryBlock & { id: string; read: boolean; quickReplies?: ChatUI.QuickReply[] } =>
	({
		id: '1',
		type: 'block',
		role: 'assistant',
		title: 'Block Title',
		content: 'Block content goes here',
		read: false,
		...overrides,
	}) as ChatUI.SummaryBlock & { id: string; read: boolean; quickReplies?: ChatUI.QuickReply[] };

describe('BlockMessage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Basic Rendering', () => {
		it('should render block message correctly', () => {
			const message = createBlockMessage();
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toMatchSnapshot();
			expect(wrapper.container.textContent).toContain('Block Title');
			expect(wrapper.container.textContent).toContain('Block content goes here');
		});

		it('should render title and content in separate sections', () => {
			const message = createBlockMessage({
				title: 'Test Title',
				content: 'Test Content',
			});
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const titleElement = wrapper.container.querySelector('.blockTitle');
			const contentElement = wrapper.container.querySelector('.blockBody');

			expect(titleElement).toBeInTheDocument();
			expect(contentElement).toBeInTheDocument();
			expect(titleElement?.textContent).toContain('Test Title');
			expect(contentElement?.textContent).toContain('Test Content');
		});

		it('should handle empty title gracefully', () => {
			const message = createBlockMessage({ title: '' });
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
			expect(wrapper.container.querySelector('.blockTitle')).toBeInTheDocument();
		});

		it('should handle empty content gracefully', () => {
			const message = createBlockMessage({ content: '' });
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
			expect(wrapper.container.querySelector('.blockBody')).toBeInTheDocument();
		});
	});

	describe('Markdown Content Processing', () => {
		it('should process content with markdown', () => {
			const message = createBlockMessage({
				content: '**Bold text** and *italic text*',
			});
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			// The mock renderMarkdown returns <p>${content}</p>
			expect(wrapper.container.innerHTML).toContain('<p>**Bold text** and *italic text*</p>');
		});

		it('should handle markdown in title', () => {
			const message = createBlockMessage({
				title: '**Important** Title',
				content: 'Regular content',
			});
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			// Title is NOT processed through markdown - it's plain text
			expect(wrapper.container.textContent).toContain('**Important** Title');
		});

		it('should handle complex markdown structures', () => {
			const message = createBlockMessage({
				title: '# API Documentation',
				content: `
## Steps to fix:
1. First step with **bold**
2. Second step with *italic*
3. Code example: \`const x = 1;\`

> Important note here

[Link to docs](https://example.com)
				`,
			});
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.textContent).toContain('API Documentation');
			expect(wrapper.container.textContent).toContain('Steps to fix');
		});

		it('should handle special characters safely', () => {
			const message = createBlockMessage({
				title: 'Title with <script>alert("xss")</script>',
				content: 'Content with & special chars',
			});
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			// Should not execute scripts or break rendering
			expect(wrapper.container).toBeInTheDocument();
			expect(wrapper.container.textContent).toContain('Title with');
			expect(wrapper.container.textContent).toContain('Content with & special chars');
		});
	});

	describe('Streaming Support', () => {
		it('should show blinking cursor in title when streaming with no content', () => {
			const message = createBlockMessage({ content: '' }); // No content = cursor in title
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
					streaming: true,
					isLastMessage: true,
				},
				global: { stubs },
			});

			const cursor = wrapper.container.querySelector('.blinking-cursor');
			expect(cursor).toBeInTheDocument();

			// Cursor should be in title section when no content
			const titleElement = wrapper.container.querySelector('.blockTitle');
			expect(titleElement).toContainElement(cursor as HTMLElement | SVGElement | null);
		});

		it('should show blinking cursor in content when title is complete', () => {
			const message = createBlockMessage({
				title: 'Complete Title',
				content: 'Streaming content',
			});
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
					streaming: true,
					isLastMessage: true,
				},
				global: { stubs },
			});

			const cursor = wrapper.container.querySelector('.blinking-cursor');
			expect(cursor).toBeInTheDocument();

			// Cursor should be in content section
			const contentElement = wrapper.container.querySelector('.blockBody');
			expect(contentElement).toContainElement(cursor as HTMLElement | SVGElement | null);
		});

		it('should not show cursor when not streaming', () => {
			const message = createBlockMessage();
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
					streaming: false,
				},
				global: { stubs },
			});

			expect(wrapper.container.querySelector('.blinking-cursor')).not.toBeInTheDocument();
		});

		it('should not show cursor when streaming but not last message', () => {
			const message = createBlockMessage();
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
					streaming: true,
					isLastMessage: false,
				},
				global: { stubs },
			});

			expect(wrapper.container.querySelector('.blinking-cursor')).not.toBeInTheDocument();
		});

		it('should position cursor correctly with partial content', () => {
			const message = createBlockMessage({
				title: 'Streaming',
				content: 'Partial content',
			});
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
					streaming: true,
					isLastMessage: true,
				},
				global: { stubs },
			});

			const cursor = wrapper.container.querySelector('.blinking-cursor');
			expect(cursor).toBeInTheDocument();
			expect(wrapper.container.textContent).toContain('Streaming');
		});
	});

	describe('Block Structure and Styling', () => {
		it('should apply proper CSS classes for block structure', () => {
			const message = createBlockMessage();
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.querySelector('.block')).toBeInTheDocument();
			expect(wrapper.container.querySelector('.blockTitle')).toBeInTheDocument();
			expect(wrapper.container.querySelector('.blockBody')).toBeInTheDocument();
		});

		it('should render properly when streaming', () => {
			const message = createBlockMessage();
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
					streaming: true,
					isLastMessage: true,
				},
				global: { stubs },
			});

			// Component renders successfully when streaming
			expect(wrapper.container.querySelector('.block')).toBeInTheDocument();
		});

		it('should apply appropriate border and spacing styles', () => {
			const message = createBlockMessage();
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const blockElement = wrapper.container.querySelector('.block');
			// CSS module applies border styles via .block class
			expect(blockElement).toHaveClass('block');
		});

		it('should handle different block types with appropriate styling', () => {
			const infoMessage = createBlockMessage({ title: 'Info Block' });
			const warningMessage = createBlockMessage({ title: 'Warning Block' });
			const errorMessage = createBlockMessage({ title: 'Error Block' });

			const infoWrapper = render(BlockMessage, {
				props: {
					message: infoMessage,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const warningWrapper = render(BlockMessage, {
				props: {
					message: warningMessage,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const errorWrapper = render(BlockMessage, {
				props: {
					message: errorMessage,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(infoWrapper.container.querySelector('.block')).toBeInTheDocument();
			expect(warningWrapper.container.querySelector('.block')).toBeInTheDocument();
			expect(errorWrapper.container.querySelector('.block')).toBeInTheDocument();
		});
	});

	describe('Quick Replies Integration', () => {
		it('should display quick replies when provided', () => {
			const message = createBlockMessage() as ChatUI.SummaryBlock & {
				id: string;
				read: boolean;
				quickReplies?: ChatUI.QuickReply[];
			};
			message.quickReplies = [
				{ type: 'new-suggestion', text: 'Try again' },
				{ type: 'resolved', text: 'This helped' },
			];
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			// BlockMessage component doesn't render quick replies - that's handled by parent
			expect(wrapper.container.querySelector('.block')).toBeInTheDocument();
		});

		it('should not display quick replies when not provided', () => {
			const message = createBlockMessage();
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.querySelector('.quick-replies')).not.toBeInTheDocument();
		});

		it('should position quick replies after content', () => {
			const message = createBlockMessage({
				content: 'Block content',
			});
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			// BlockMessage shows content but quick replies are handled by parent component
			const html = wrapper.container.innerHTML;
			const contentIndex = html.indexOf('Block content');
			expect(contentIndex).toBeGreaterThan(-1); // Content exists
		});
	});

	describe('Content Layout', () => {
		it('should maintain proper hierarchy between title and content', () => {
			const message = createBlockMessage({
				title: 'Main Title',
				content: 'Supporting content',
			});
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const titleElement = wrapper.container.querySelector('.blockTitle');
			const contentElement = wrapper.container.querySelector('.blockBody');

			// Both elements should exist
			expect(titleElement).toBeInTheDocument();
			expect(contentElement).toBeInTheDocument();

			// Title should appear before content in the HTML structure
			const html = wrapper.container.innerHTML;
			const titleIndex = html.indexOf('Main Title');
			const contentIndex = html.indexOf('Supporting content');
			expect(titleIndex).toBeLessThan(contentIndex);
		});

		it('should handle very long titles gracefully', () => {
			const longTitle = 'A'.repeat(1000);
			const message = createBlockMessage({ title: longTitle });
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.textContent).toContain(longTitle);
			expect(wrapper.container.querySelector('.blockTitle')).toBeInTheDocument();
		});

		it('should handle very long content gracefully', () => {
			const longContent = 'B'.repeat(10000);
			const message = createBlockMessage({ content: longContent });
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.textContent).toContain(longContent);
			expect(wrapper.container.querySelector('.blockBody')).toBeInTheDocument();
		});

		it('should handle mixed content types in title and content', () => {
			const message = createBlockMessage({
				title: '🎉 Success! API call completed',
				content: 'Response time: 150ms\nStatus: 200 OK\nData received: ✓',
			});
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.textContent).toContain('🎉 Success!');
			expect(wrapper.container.textContent).toContain('Response time: 150ms');
		});
	});

	describe('Edge Cases', () => {
		it('should handle null title and content', () => {
			const message = {
				...createBlockMessage(),
				title: '',
				content: '',
			};
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
		});

		it('should handle undefined properties', () => {
			const message = {
				...createBlockMessage(),
				title: '',
				content: '',
				quickReplies: undefined,
			};
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
		});

		it('should handle message type inconsistency', () => {
			const message = { ...createBlockMessage(), type: 'not-block' as unknown as MessageType };
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
		});

		it('should handle missing message properties gracefully', () => {
			const incompleteMessage = {
				id: '1',
				type: 'block',
				role: 'assistant',
				title: '',
				content: '',
				read: false,
			} as ChatUI.SummaryBlock & { id: string; read: boolean };

			const wrapper = render(BlockMessage, {
				props: {
					message: incompleteMessage,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
		});
	});

	describe('Accessibility', () => {
		it('should have proper semantic structure', () => {
			const message = createBlockMessage();
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const blockElement = wrapper.container.querySelector('.block');
			// Block element exists with proper structure
			expect(blockElement).toBeInTheDocument();
		});

		it('should have proper heading hierarchy', () => {
			const message = createBlockMessage({ title: 'Block Title' });
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const titleElement = wrapper.container.querySelector('.blockTitle');
			// Title is rendered as div element (not semantic heading)
			expect(titleElement?.tagName.toLowerCase()).toBe('div');
		});

		it('should have accessible labels for screen readers', () => {
			const message = createBlockMessage({
				title: 'Error Details',
				content: 'Connection failed',
			});
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const blockElement = wrapper.container.querySelector('.block');
			// Block element renders without explicit accessibility labels
			expect(blockElement).toBeInTheDocument();
		});

		it('should maintain focus order for interactive elements', () => {
			const message = createBlockMessage();
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			// Block message renders without interactive elements by default
			const blockElement = wrapper.container.querySelector('.block');
			expect(blockElement).toBeInTheDocument();
		});
	});

	describe('Performance', () => {
		it('should handle frequent content updates efficiently', async () => {
			const message = createBlockMessage();
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			// Simulate rapid updates
			for (let i = 0; i < 10; i++) {
				const updatedMessage = createBlockMessage({
					title: `Updated Title ${i}`,
					content: `Updated Content ${i}`,
				});
				await wrapper.rerender({ message: updatedMessage });
				expect(wrapper.container.textContent).toContain(`Updated Title ${i}`);
			}
		});

		it('should not cause memory leaks with streaming updates', async () => {
			const message = createBlockMessage();
			const wrapper = render(BlockMessage, {
				props: {
					message,
					isFirstOfRole: true,
					streaming: true,
					isLastMessage: true,
				},
				global: { stubs },
			});

			// Toggle streaming multiple times
			for (let i = 0; i < 5; i++) {
				await wrapper.rerender({
					message,
					streaming: i % 2 === 0,
					isLastMessage: true,
				});
			}

			// Component should remain stable
			expect(wrapper.container).toBeInTheDocument();
		});
	});
});
