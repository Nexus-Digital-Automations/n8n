import type { ChatUI } from '../../../../types';
import { render, fireEvent } from '@testing-library/vue';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import MessageWrapper from '../MessageWrapper.vue';

// Mock dependencies
vi.mock('../../../../composables/useI18n', () => ({
	useI18n: vi.fn(() => ({
		t: vi.fn((key: string) => key),
	})),
}));

const stubs = {
	TextMessage: {
		template: '<div class="text-message" />',
		props: ['message', 'isFirstOfRole', 'user', 'streaming', 'isLastMessage'],
		emits: ['feedback'],
	},
	BlockMessage: {
		template: '<div class="block-message" />',
		props: ['message', 'isFirstOfRole', 'user', 'streaming', 'isLastMessage'],
		emits: ['feedback'],
	},
	CodeDiffMessage: {
		template: '<div class="code-diff-message" />',
		props: ['message', 'isFirstOfRole', 'user', 'streaming', 'isLastMessage'],
		emits: ['codeReplace', 'codeUndo', 'feedback'],
	},
	ErrorMessage: {
		template: '<div class="error-message" />',
		props: ['message', 'isFirstOfRole', 'user'],
	},
	EventMessage: {
		template: '<div class="event-message" />',
		props: ['message', 'isFirstOfRole', 'user'],
	},
	ToolMessage: {
		template: '<div class="tool-message" />',
		props: ['message', 'isFirstOfRole', 'user', 'streaming', 'isLastMessage'],
		emits: ['feedback'],
	},
};

const mockUser = {
	firstName: 'John',
	lastName: 'Doe',
};

const createMessage = (
	type: string,
	overrides: Partial<ChatUI.AssistantMessage> = {},
): ChatUI.AssistantMessage => ({
	id: '1',
	type: type as any,
	role: 'assistant',
	content: 'Test content',
	read: false,
	...overrides,
});

describe('MessageWrapper', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Component Selection', () => {
		it('should render TextMessage for text type', () => {
			const message = createMessage('text');
			const wrapper = render(MessageWrapper, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: {
					stubs,
				},
			});

			expect(wrapper.container.querySelector('.text-message')).toBeInTheDocument();
		});

		it('should render BlockMessage for block type', () => {
			const message = createMessage('block', {
				title: 'Block Title',
			});
			const wrapper = render(MessageWrapper, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: {
					stubs,
				},
			});

			expect(wrapper.container.querySelector('.block-message')).toBeInTheDocument();
		});

		it('should render CodeDiffMessage for code-diff type', () => {
			const message = createMessage('code-diff', {
				description: 'Code changes',
				codeDiff: '@@ -1 +1 @@\n-old\n+new',
			});
			const wrapper = render(MessageWrapper, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: {
					stubs,
				},
			});

			expect(wrapper.container.querySelector('.code-diff-message')).toBeInTheDocument();
		});

		it('should render ErrorMessage for error type', () => {
			const message = createMessage('error');
			const wrapper = render(MessageWrapper, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: {
					stubs,
				},
			});

			expect(wrapper.container.querySelector('.error-message')).toBeInTheDocument();
		});

		it('should render EventMessage for event type', () => {
			const message = createMessage('event', {
				eventName: 'end-session',
			});
			const wrapper = render(MessageWrapper, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: {
					stubs,
				},
			});

			expect(wrapper.container.querySelector('.event-message')).toBeInTheDocument();
		});

		it('should render ToolMessage for tool type', () => {
			const message = createMessage('tool', {
				toolName: 'test_tool',
				status: 'completed',
			});
			const wrapper = render(MessageWrapper, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: {
					stubs,
				},
			});

			expect(wrapper.container.querySelector('.tool-message')).toBeInTheDocument();
		});

		it('should render nothing for unsupported message types', () => {
			const message = createMessage('agent-suggestion');
			const wrapper = render(MessageWrapper, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: {
					stubs,
				},
			});

			expect(wrapper.container.innerHTML).toBe('<!--v-if-->');
		});

		it('should render nothing for workflow-updated type', () => {
			const message = createMessage('workflow-updated');
			const wrapper = render(MessageWrapper, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: {
					stubs,
				},
			});

			expect(wrapper.container.innerHTML).toBe('<!--v-if-->');
		});
	});

	describe('Props Forwarding', () => {
		it('should forward props to TextMessage', () => {
			const message = createMessage('text');
			const wrapper = render(MessageWrapper, {
				props: {
					message,
					isFirstOfRole: true,
					user: mockUser,
					streaming: true,
					isLastMessage: true,
				},
				global: {
					stubs: {
						...stubs,
						TextMessage: {
							template:
								'<div class="text-message" :data-first-of-role="isFirstOfRole" :data-streaming="streaming" :data-is-last="isLastMessage" />',
							props: ['message', 'isFirstOfRole', 'user', 'streaming', 'isLastMessage'],
						},
					},
				},
			});

			const textMessage = wrapper.container.querySelector('.text-message');
			expect(textMessage).toHaveAttribute('data-first-of-role', 'true');
			expect(textMessage).toHaveAttribute('data-streaming', 'true');
			expect(textMessage).toHaveAttribute('data-is-last', 'true');
		});

		it('should forward props to ErrorMessage', () => {
			const message = createMessage('error');
			const wrapper = render(MessageWrapper, {
				props: {
					message,
					isFirstOfRole: false,
					user: mockUser,
				},
				global: {
					stubs: {
						...stubs,
						ErrorMessage: {
							template: '<div class="error-message" :data-first-of-role="isFirstOfRole" />',
							props: ['message', 'isFirstOfRole', 'user'],
						},
					},
				},
			});

			const errorMessage = wrapper.container.querySelector('.error-message');
			expect(errorMessage).toHaveAttribute('data-first-of-role', 'false');
		});

		it('should forward props to ToolMessage', () => {
			const message = createMessage('tool', {
				toolName: 'test_tool',
				status: 'running',
			});
			const wrapper = render(MessageWrapper, {
				props: {
					message,
					isFirstOfRole: true,
					streaming: false,
					isLastMessage: false,
				},
				global: {
					stubs: {
						...stubs,
						ToolMessage: {
							template:
								'<div class="tool-message" :data-streaming="streaming" :data-is-last="isLastMessage" />',
							props: ['message', 'isFirstOfRole', 'user', 'streaming', 'isLastMessage'],
						},
					},
				},
			});

			const toolMessage = wrapper.container.querySelector('.tool-message');
			expect(toolMessage).toHaveAttribute('data-streaming', 'false');
			expect(toolMessage).toHaveAttribute('data-is-last', 'false');
		});
	});

	describe('Event Forwarding', () => {
		it('should forward feedback events from TextMessage', async () => {
			const message = createMessage('text');
			const wrapper = render(MessageWrapper, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: {
					stubs: {
						...stubs,
						TextMessage: {
							template:
								'<div class="text-message" @click="$emit(\'feedback\', { rating: \'positive\' })" />',
							props: ['message', 'isFirstOfRole', 'user', 'streaming', 'isLastMessage'],
							emits: ['feedback'],
						},
					},
				},
			});

			const textMessage = wrapper.container.querySelector('.text-message');
			await fireEvent.click(textMessage!);

			const emittedEvents = wrapper.emitted('feedback');
			expect(emittedEvents).toBeTruthy();
		});

		it('should forward codeReplace events from CodeDiffMessage', async () => {
			const message = createMessage('code-diff', {
				codeDiff: '@@ -1 +1 @@\n-old\n+new',
			});
			const wrapper = render(MessageWrapper, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: {
					stubs: {
						...stubs,
						CodeDiffMessage: {
							template: '<div class="code-diff-message" @click="$emit(\'codeReplace\')" />',
							props: ['message', 'isFirstOfRole', 'user', 'streaming', 'isLastMessage'],
							emits: ['codeReplace', 'codeUndo', 'feedback'],
						},
					},
				},
			});

			const codeDiffMessage = wrapper.container.querySelector('.code-diff-message');
			await fireEvent.click(codeDiffMessage!);

			const emittedEvents = wrapper.emitted('codeReplace');
			expect(emittedEvents).toBeTruthy();
		});

		it('should forward codeUndo events from CodeDiffMessage', async () => {
			const message = createMessage('code-diff', {
				codeDiff: '@@ -1 +1 @@\n-old\n+new',
			});
			const wrapper = render(MessageWrapper, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: {
					stubs: {
						...stubs,
						CodeDiffMessage: {
							template: '<div class="code-diff-message" @dblclick="$emit(\'codeUndo\')" />',
							props: ['message', 'isFirstOfRole', 'user', 'streaming', 'isLastMessage'],
							emits: ['codeReplace', 'codeUndo', 'feedback'],
						},
					},
				},
			});

			const codeDiffMessage = wrapper.container.querySelector('.code-diff-message');
			await fireEvent.dblClick(codeDiffMessage!);

			const emittedEvents = wrapper.emitted('codeUndo');
			expect(emittedEvents).toBeTruthy();
		});
	});

	describe('Edge Cases', () => {
		it('should handle message with unknown type gracefully', () => {
			const message = createMessage('unknown-type');
			const wrapper = render(MessageWrapper, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: {
					stubs,
				},
			});

			expect(wrapper.container.innerHTML).toBe('<!--v-if-->'); // No component rendered
		});

		it('should handle message without type property', () => {
			const message = {
				id: '1',
				role: 'assistant',
				content: 'Test',
				read: false,
			} as ChatUI.AssistantMessage;

			const wrapper = render(MessageWrapper, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: {
					stubs,
				},
			});

			expect(wrapper.container.innerHTML).toBe('<!--v-if-->'); // No component rendered
		});

		it('should handle null/undefined streaming props', () => {
			const message = createMessage('text');
			const wrapper = render(MessageWrapper, {
				props: {
					message,
					isFirstOfRole: true,
					streaming: false,
					isLastMessage: undefined,
				},
				global: {
					stubs,
				},
			});

			expect(wrapper.container.querySelector('.text-message')).toBeInTheDocument();
		});
	});

	describe('Component Integration', () => {
		it('should render the correct message component', () => {
			const message = createMessage('text');
			const wrapper = render(MessageWrapper, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: {
					stubs,
				},
			});

			const textMessage = wrapper.container.querySelector('.text-message');
			expect(textMessage).toBeInTheDocument();
		});

		it('should pass all required props to child components', () => {
			const message = createMessage('block', {
				title: 'Test Title',
				content: 'Test Content',
			});

			const wrapper = render(MessageWrapper, {
				props: {
					message,
					isFirstOfRole: false,
					streaming: true,
					isLastMessage: false,
				},
				global: {
					stubs: {
						...stubs,
						BlockMessage: {
							template:
								'<div class="block-message" :data-title="message.title" :data-first="isFirstOfRole" :data-streaming="streaming" :data-is-last="isLastMessage" />',
							props: ['message', 'isFirstOfRole', 'user', 'streaming', 'isLastMessage'],
						},
					},
				},
			});

			const blockMessage = wrapper.container.querySelector('.block-message');
			expect(blockMessage).toHaveAttribute('data-title', 'Test Title');
			expect(blockMessage).toHaveAttribute('data-first', 'false');
			expect(blockMessage).toHaveAttribute('data-streaming', 'true');
			expect(blockMessage).toHaveAttribute('data-is-last', 'false');
		});
	});

	describe('Conditional Rendering Logic', () => {
		it('should render appropriate component based on message type switching', async () => {
			const message = createMessage('text');
			const wrapper = render(MessageWrapper, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: {
					stubs,
				},
			});

			// Initial render - text message
			expect(wrapper.container.querySelector('.text-message')).toBeInTheDocument();
			expect(wrapper.container.querySelector('.error-message')).not.toBeInTheDocument();

			// Update to error message
			const errorMessage = createMessage('error');
			await wrapper.rerender({
				message: errorMessage,
				isFirstOfRole: true,
			});

			expect(wrapper.container.querySelector('.text-message')).not.toBeInTheDocument();
			expect(wrapper.container.querySelector('.error-message')).toBeInTheDocument();
		});

		it('should handle rapid message type changes', async () => {
			const initialMessage = createMessage('text');
			const wrapper = render(MessageWrapper, {
				props: {
					message: initialMessage,
					isFirstOfRole: true,
				},
				global: {
					stubs,
				},
			});

			const messageTypes = ['block', 'error', 'event', 'tool', 'text'];

			for (const type of messageTypes) {
				const newMessage = createMessage(type, {
					toolName: type === 'tool' ? 'test_tool' : undefined,
					eventName: type === 'event' ? 'end-session' : undefined,
				});
				await wrapper.rerender({
					message: newMessage,
					isFirstOfRole: true,
				});

				expect(wrapper.container.querySelector(`.${type}-message`)).toBeInTheDocument();
			}
		});
	});
});
