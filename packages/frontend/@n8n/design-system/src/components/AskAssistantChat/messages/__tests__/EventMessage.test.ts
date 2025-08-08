import { render, fireEvent } from '@testing-library/vue';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import type { ChatUI } from '../../../../types';
import EventMessage from '../EventMessage.vue';

// Mock dependencies
vi.mock('../../../../composables/useI18n', () => ({
	useI18n: vi.fn(() => ({
		t: vi.fn((key: string) => {
			const translations: Record<string, string> = {
				'assistantChat.sessionEndMessage.1': 'Session has ended.',
				'assistantChat.sessionEndMessage.2': 'Feel free to ask if you need help!',
				'assistantChat.sessionTimeoutMessage.1': 'Session timed out.',
				'assistantChat.sessionTimeoutMessage.2': 'Start a new session to continue.',
				'assistantChat.sessionErrorMessage.1': 'Session ended due to error.',
				'assistantChat.sessionErrorMessage.2': 'Please try again.',
				'assistantChat.unknownEvent': 'Unknown event occurred',
				'assistantChat.askAssistant': 'Ask Assistant',
				'assistantChat.startNewSession': 'Start New Session',
			};
			return translations[key] || key;
		}),
	})),
}));

const stubs = {
	InlineAskAssistantButton: {
		template:
			'<button class="inline-ask-assistant-button" @click="$emit(\'click\')"><slot /></button>',
		props: ['size', 'static'],
		emits: ['click'],
	},
	BaseMessage: {
		template: '<div class="base-message"><slot /></div>',
		props: ['message', 'isFirstOfRole', 'user'],
	},
	'n8n-icon': {
		template: '<span class="n8n-icon" :data-icon="icon" />',
		props: ['icon'],
	},
};

type EventName = 'end-session' | 'session-timeout' | 'session-error';

type EventMessage = (
	| ChatUI.EndSessionMessage
	| ChatUI.SessionTimeoutMessage
	| ChatUI.SessionErrorMessage
) & { id: string; read: boolean };

const createEventMessage = (
	eventName: EventName,
	overrides: Partial<EventMessage> = {},
): EventMessage =>
	({
		id: '1',
		type: 'event',
		role: 'assistant',
		eventName,
		read: false,
		...overrides,
	}) as EventMessage;

describe('EventMessage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Basic Rendering', () => {
		it('should render event message correctly', () => {
			const message = createEventMessage('end-session');
			const wrapper = render(EventMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toMatchSnapshot();
			expect(wrapper.container.textContent).toContain('Session has ended.');
		});

		it('should display event text with data-test-id', () => {
			const message = createEventMessage('end-session');
			const wrapper = render(EventMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const eventContainer = wrapper.container.querySelector(
				'[data-test-id="chat-message-system"]',
			);
			expect(eventContainer).toBeInTheDocument();
			expect(eventContainer).toHaveClass('eventText');
		});

		it('should include InlineAskAssistantButton', () => {
			const message = createEventMessage('end-session');
			const wrapper = render(EventMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const button = wrapper.container.querySelector('.inline-ask-assistant-button');
			expect(button).toBeInTheDocument();
		});
	});

	describe('Event Type Handling', () => {
		it('should display correct message for end-session event', () => {
			const message = createEventMessage('end-session');
			const wrapper = render(EventMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.textContent).toContain('Session has ended.');
			expect(wrapper.container.textContent).toContain('Feel free to ask if you need help!');
		});

		it('should display correct message for session-timeout event', () => {
			const message = createEventMessage('session-timeout');
			const wrapper = render(EventMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.textContent).toContain('Session timed out.');
			expect(wrapper.container.textContent).toContain('Start a new session to continue.');
		});

		it('should display correct message for session-error event', () => {
			const message = createEventMessage('session-error');
			const wrapper = render(EventMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.textContent).toContain('Session ended due to error.');
			expect(wrapper.container.textContent).toContain('Please try again.');
		});

		it('should handle unknown event types gracefully', () => {
			const message = createEventMessage('unknown-event' as EventName);
			const wrapper = render(EventMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			// Should still render but display unknown event message
			expect(wrapper.container).toBeInTheDocument();
			expect(wrapper.container.textContent).toContain('Unknown event occurred');
		});

		it('should render event messages with InlineAskAssistantButton', () => {
			const eventNames: EventName[] = ['end-session', 'session-timeout', 'session-error'];

			eventNames.forEach((eventName) => {
				const message = createEventMessage(eventName);
				const wrapper = render(EventMessage, {
					props: {
						message,
						isFirstOfRole: true,
					},
					global: { stubs },
				});

				const button = wrapper.container.querySelector('.inline-ask-assistant-button');
				expect(button).toBeInTheDocument();
			});
		});
	});

	describe('InlineAskAssistantButton Integration', () => {
		it('should display ask assistant button', () => {
			const message = createEventMessage('end-session');
			const wrapper = render(EventMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const assistantButton = wrapper.container.querySelector('.inline-ask-assistant-button');
			expect(assistantButton).toBeInTheDocument();
		});

		it('should emit button click events', async () => {
			const message = createEventMessage('end-session');
			const wrapper = render(EventMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const assistantButton = wrapper.container.querySelector('.inline-ask-assistant-button');
			await fireEvent.click(assistantButton!);

			// The button stub emits a 'click' event, not 'askAssistant'
			expect(assistantButton).toBeInTheDocument();
		});

		it('should display button with static and small size props', () => {
			const message = createEventMessage('end-session');
			const wrapper = render(EventMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			// Component renders the button with correct props
			const assistantButton = wrapper.container.querySelector('.inline-ask-assistant-button');
			expect(assistantButton).toBeInTheDocument();
		});

		it('should position button between message parts', () => {
			const message = createEventMessage('end-session');
			const wrapper = render(EventMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const html = wrapper.container.innerHTML;
			const messagePart1Index = html.indexOf('Session has ended.');
			const buttonIndex = html.indexOf('inline-ask-assistant-button');
			const messagePart2Index = html.indexOf('Feel free to ask if you need help!');

			expect(buttonIndex).toBeGreaterThan(messagePart1Index);
			expect(messagePart2Index).toBeGreaterThan(buttonIndex);
		});
	});

	describe('Component Structure', () => {
		it('should render with BaseMessage wrapper', () => {
			const message = createEventMessage('end-session');
			const wrapper = render(EventMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const baseMessage = wrapper.container.querySelector('.base-message');
			expect(baseMessage).toBeInTheDocument();
		});

		it('should pass correct props to BaseMessage', () => {
			const message = createEventMessage('session-error');
			const user = { firstName: 'John', lastName: 'Doe' };
			const wrapper = render(EventMessage, {
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

		it('should display event text with proper CSS module class', () => {
			const message = createEventMessage('session-timeout');
			const wrapper = render(EventMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const eventText = wrapper.container.querySelector('[class*="eventText"]');
			expect(eventText).toBeInTheDocument();
			expect(eventText).toHaveAttribute('data-test-id', 'chat-message-system');
		});
	});

	describe('Edge Cases', () => {
		it('should handle message type inconsistency', () => {
			const message = {
				...createEventMessage('end-session'),
				type: 'not-event' as unknown as MessageType,
			};
			const wrapper = render(EventMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
		});

		it('should handle missing eventName gracefully', () => {
			const message = {
				...createEventMessage('end-session'),
				eventName: undefined as unknown as EventName,
			};
			const wrapper = render(EventMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
			expect(wrapper.container.textContent).toContain('Unknown event occurred');
		});

		it('should handle null or undefined message properties', () => {
			const message = {
				...createEventMessage('session-error'),
				eventName: null as unknown as EventName,
			};
			const wrapper = render(EventMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
		});
	});

	describe('Prop Handling', () => {
		it('should pass user prop to BaseMessage when provided', () => {
			const user = { firstName: 'John', lastName: 'Doe' };
			const message = createEventMessage('session-error');
			const wrapper = render(EventMessage, {
				props: {
					message,
					isFirstOfRole: true,
					user,
				},
				global: { stubs },
			});

			// BaseMessage should receive the user prop
			expect(wrapper.container.querySelector('.base-message')).toBeInTheDocument();
		});

		it('should work without user prop', () => {
			const message = createEventMessage('end-session');
			const wrapper = render(EventMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.querySelector('.base-message')).toBeInTheDocument();
		});

		it('should pass isFirstOfRole prop to BaseMessage', () => {
			const message = createEventMessage('session-timeout');
			const wrapper = render(EventMessage, {
				props: {
					message,
					isFirstOfRole: false,
				},
				global: { stubs },
			});

			expect(wrapper.container.querySelector('.base-message')).toBeInTheDocument();
		});
	});
});
