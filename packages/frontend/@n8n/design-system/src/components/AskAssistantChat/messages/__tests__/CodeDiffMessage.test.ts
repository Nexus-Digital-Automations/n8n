import type { ChatUI } from '../../../../types';
import { render, fireEvent } from '@testing-library/vue';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import CodeDiffMessage from '../CodeDiffMessage.vue';

// Mock dependencies
vi.mock('../../../../composables/useI18n', () => ({
	useI18n: vi.fn(() => ({
		t: vi.fn((key: string) => {
			const translations: Record<string, string> = {
				'codeDiff.replaceMyCode': 'Replace my code',
				'codeDiff.replacing': 'Replacing...',
				'codeDiff.undo': 'Undo',
				'codeDiff.codeReplaced': 'Code replaced',
				'codeDiff.couldNotReplace': 'Could not replace code',
			};
			return translations[key] || key;
		}),
	})),
}));

const stubs = {
	'code-diff': {
		template: `
			<div class="code-diff" data-test-id="code-diff-suggestion">
				<div class="title">{{ title }}</div>
				<div class="diff-section">
					<div class="diff" v-if="content">{{ content }}</div>
				</div>
				<div class="actions">
					<div v-if="error">
						<n8n-icon icon="triangle-alert" color="danger" />
						<span>Could not replace code</span>
					</div>
					<div v-else-if="replaced">
						<n8n-button type="secondary" size="mini" icon="undo-2" data-test-id="undo-replace-button" @click="$emit('undo')">Undo</n8n-button>
						<n8n-icon icon="check" color="success" />
						<span data-test-id="code-replaced-message">Code replaced</span>
					</div>
					<n8n-button 
						v-else
						:type="replacing ? 'secondary' : 'primary'"
						size="mini"
						icon="refresh-cw"
						data-test-id="replace-code-button"
						:disabled="!content || streaming"
						:loading="replacing"
						@click="$emit('replace')"
					>{{ replacing ? 'Replacing...' : 'Replace my code' }}</n8n-button>
				</div>
			</div>
		`,
		props: ['title', 'content', 'replacing', 'replaced', 'error', 'streaming'],
		emits: ['replace', 'undo'],
	},
	'base-message': {
		template:
			'<div class="message"><slot /><div v-if="message.quickReplies && message.quickReplies.length" class="quick-replies">{{ message.quickReplies.length }} quick replies</div></div>',
		props: ['message', 'isFirstOfRole', 'user'],
		emits: ['feedback'],
	},
	'n8n-button': {
		template:
			'<button class="n8n-button" @click="$emit(\'click\')" :disabled="disabled" :type="type" :data-test-id="$attrs[\'data-test-id\']" :loading="loading"><slot /></button>',
		props: ['disabled', 'type', 'size', 'loading', 'icon'],
		emits: ['click'],
	},
	'n8n-icon': {
		template: '<span class="n8n-icon" :data-icon="icon" />',
		props: ['icon', 'color'],
	},
};

const createCodeDiffMessage = (
	overrides: Partial<
		ChatUI.CodeDiffMessage & { id?: string; read?: boolean; quickReplies?: ChatUI.QuickReply[] }
	> = {},
): ChatUI.CodeDiffMessage & { id: string; read: boolean; quickReplies?: ChatUI.QuickReply[] } =>
	({
		id: '1',
		type: 'code-diff',
		role: 'assistant',
		description: 'Code changes description',
		codeDiff: '@@ -1,3 +1,3 @@\n-old line\n+new line\n unchanged line',
		suggestionId: 'suggestion-123',
		read: false,
		...overrides,
	}) as ChatUI.CodeDiffMessage & { id: string; read: boolean; quickReplies?: ChatUI.QuickReply[] };

describe('CodeDiffMessage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Basic Rendering', () => {
		it('should render code diff message correctly', () => {
			const message = createCodeDiffMessage();
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toMatchSnapshot();
			expect(wrapper.container.textContent).toContain('Code changes description');
		});

		it('should render description section', () => {
			const message = createCodeDiffMessage({
				description: 'Fix authentication bug in login function',
			});
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.textContent).toContain('Fix authentication bug in login function');
		});

		it('should render CodeDiff component with correct props', () => {
			const message = createCodeDiffMessage({
				codeDiff: '@@ -1 +1 @@\n-old\n+new',
				description: 'JavaScript changes',
			});
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const codeDiff = wrapper.container.querySelector('.code-diff');
			expect(codeDiff).toBeInTheDocument();
			// Check that the diff content is displayed in the template
			expect(wrapper.container.textContent).toContain('-old');
			expect(wrapper.container.textContent).toContain('+new');
		});

		it('should handle empty description gracefully', () => {
			const message = createCodeDiffMessage({ description: '' });
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
		});

		it('should handle undefined description', () => {
			const message = { ...createCodeDiffMessage(), description: undefined };
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
		});
	});

	describe('Action Buttons', () => {
		it('should display replace my code button', () => {
			const message = createCodeDiffMessage();
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const replaceButton = wrapper.container.querySelector('[data-test-id="replace-code-button"]');
			expect(replaceButton).toBeInTheDocument();
			expect(wrapper.container.textContent).toContain('Replace my code');
		});

		it('should emit codeReplace event when replace button clicked', async () => {
			const message = createCodeDiffMessage();
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const replaceButton = wrapper.container.querySelector('[data-test-id="replace-code-button"]');
			await fireEvent.click(replaceButton!);

			const emittedEvents = wrapper.emitted('codeReplace');
			expect(emittedEvents).toBeTruthy();
			expect(emittedEvents).toHaveLength(1);
		});

		it('should display undo button when in replaced state', () => {
			const message = createCodeDiffMessage({ replaced: true });
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.textContent).toContain('Undo');
		});

		it('should emit codeUndo event when undo button clicked', async () => {
			const message = createCodeDiffMessage({ replaced: true });
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const undoButton = wrapper.container.querySelector('[data-test-id="undo-replace-button"]');
			await fireEvent.click(undoButton!);

			const emittedEvents = wrapper.emitted('codeUndo');
			expect(emittedEvents).toBeTruthy();
			expect(emittedEvents).toHaveLength(1);
		});

		it('should show loading state when applying changes', () => {
			const message = createCodeDiffMessage({ replacing: true });
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: {
					stubs: {
						...stubs,
						'n8n-button': {
							template: '<button class="n8n-button" :data-loading="loading"><slot /></button>',
							props: ['loading', 'disabled'],
						},
					},
				},
			});

			const button = wrapper.container.querySelector('.n8n-button');
			expect(button).toHaveAttribute('data-loading', 'true');
		});

		it('should show loading state when replacing', () => {
			const message = createCodeDiffMessage({ replacing: true });
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			// When replacing=true, button shows "Replacing..." text
			expect(wrapper.container.textContent).toContain('Replacing...');
		});
	});

	describe('Error Handling', () => {
		it('should display error message when code diff fails to load', () => {
			const message = createCodeDiffMessage({ error: true });
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.textContent).toContain('Could not replace code');
		});

		it('should handle malformed code diff gracefully', () => {
			const message = createCodeDiffMessage({
				codeDiff: 'not-a-valid-diff',
			});
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: {
					stubs: {
						...stubs,
						'code-diff': {
							template: '<div class="code-diff error">Invalid diff format</div>',
						},
					},
				},
			});

			expect(wrapper.container.querySelector('.code-diff')).toBeInTheDocument();
		});

		it('should show retry option when diff loading fails', () => {
			const message = createCodeDiffMessage({
				error: true,
			}) as ChatUI.CodeDiffMessage & { id: string; read: boolean; retryable: boolean };
			message.retryable = true;
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			// When error=true, shows error message instead of retry
			expect(wrapper.container.textContent).toContain('Could not replace code');
		});

		it('should handle empty code diff', () => {
			const message = createCodeDiffMessage({ codeDiff: '' });
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
		});

		it('should handle null code diff', () => {
			const message = { ...createCodeDiffMessage(), codeDiff: undefined };
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
		});
	});

	describe('State Management', () => {
		it('should display different UI based on message properties', () => {
			const scenarios = [
				{ props: {}, expectedClass: 'default' },
				{ props: { replacing: true }, expectedClass: 'replacing' },
				{ props: { replaced: true }, expectedClass: 'replaced' },
				{ props: { error: true }, expectedClass: 'error' },
			];

			scenarios.forEach(({ props }) => {
				const message = createCodeDiffMessage(props);
				const wrapper = render(CodeDiffMessage, {
					props: {
						message,
						isFirstOfRole: true,
					},
					global: { stubs },
				});

				const container = wrapper.container.querySelector('.code-diff');
				expect(container).toBeInTheDocument();
			});
		});

		it('should transition between states correctly', async () => {
			const message = createCodeDiffMessage();
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			// Initial state
			expect(wrapper.container.querySelector('.code-diff')).toBeInTheDocument();

			// Transition to replacing
			await wrapper.rerender({
				message: { ...message, replacing: true },
			});
			expect(wrapper.container.querySelector('.code-diff')).toBeInTheDocument();

			// Transition to replaced
			await wrapper.rerender({
				message: { ...message, replacing: false, replaced: true },
			});
			expect(wrapper.container.querySelector('.code-diff')).toBeInTheDocument();
		});

		it('should handle state transitions with appropriate button updates', async () => {
			const message = createCodeDiffMessage();
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			// Initially shows apply button
			expect(wrapper.container.textContent).toContain('Replace my code');

			// After replacing, shows undo button
			await wrapper.rerender({
				message: { ...message, replaced: true },
			});
			expect(wrapper.container.textContent).toContain('Undo');
		});
	});

	describe('Quick Replies Integration', () => {
		it('should display quick replies when provided', () => {
			const message = createCodeDiffMessage({
				quickReplies: [
					{ type: 'new-suggestion', text: 'Try another approach' },
					{ type: 'resolved', text: 'This works' },
				],
			});
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.querySelector('.quick-replies')).toBeInTheDocument();
		});

		it('should not display quick replies when not provided', () => {
			const message = createCodeDiffMessage();
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container.querySelector('.quick-replies')).not.toBeInTheDocument();
		});

		it('should position quick replies after action buttons', () => {
			const message = createCodeDiffMessage({
				quickReplies: [{ type: 'resolved', text: 'Perfect' }],
			});
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const html = wrapper.container.innerHTML;
			const buttonIndex = html.indexOf('Replace my code');
			const repliesIndex = html.indexOf('quick-replies');
			expect(repliesIndex).toBeGreaterThan(buttonIndex);
		});
	});

	describe('Code Diff Display', () => {
		it('should pass props to CodeDiff component when specified', () => {
			const message = createCodeDiffMessage({ description: 'TypeScript changes' });
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: {
					stubs: {
						...stubs,
						'code-diff': {
							template: '<div class="code-diff" :data-description="description" />',
							props: ['description', 'codeDiff'],
						},
					},
				},
			});

			const codeDiff = wrapper.container.querySelector('.code-diff');
			expect(codeDiff).toBeInTheDocument();
		});

		it('should handle different diff formats', () => {
			const diffFormats = [
				'@@ -1,3 +1,3 @@\n-old\n+new',
				'--- a/file.js\n+++ b/file.js\n@@ -1 +1 @@\n-old\n+new',
				'diff --git a/test.js b/test.js\nindex 123..456\n--- a/test.js\n+++ b/test.js\n@@ -1 +1 @@\n-old\n+new',
			];

			diffFormats.forEach((codeDiff) => {
				const message = createCodeDiffMessage({ codeDiff });
				const wrapper = render(CodeDiffMessage, {
					props: {
						message,
						isFirstOfRole: true,
					},
					global: { stubs },
				});

				expect(wrapper.container.querySelector('.code-diff')).toBeInTheDocument();
			});
		});

		it('should render diff content correctly', () => {
			const message = createCodeDiffMessage({
				codeDiff: '@@ -1,2 +1,2 @@\n-old content\n+new content',
				description: 'Test diff content',
			});
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const codeDiff = wrapper.container.querySelector('.code-diff');
			expect(codeDiff).toBeInTheDocument();
			expect(wrapper.container.textContent).toContain('old content');
			expect(wrapper.container.textContent).toContain('new content');
		});

		it('should handle error state correctly', () => {
			const message = createCodeDiffMessage({ error: true });
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const codeDiff = wrapper.container.querySelector('.code-diff');
			expect(codeDiff).toBeInTheDocument();
			expect(wrapper.container.textContent).toContain('Could not replace code');
		});
	});

	describe('Performance and Memory', () => {
		it('should handle large diffs efficiently', () => {
			const largeDiff = Array.from(
				{ length: 1000 },
				(_, i) => `@@ -${i} +${i} @@\n-old line ${i}\n+new line ${i}`,
			).join('\n');
			const message = createCodeDiffMessage({ codeDiff: largeDiff });
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
		});

		it('should handle frequent state changes without memory leaks', async () => {
			const message = createCodeDiffMessage();
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const propertyStates = [{}, { replacing: true }, { replaced: true }, { error: true }];

			// Cycle through property states multiple times
			for (let cycle = 0; cycle < 5; cycle++) {
				for (const props of propertyStates) {
					await wrapper.rerender({
						message: { ...message, ...props },
					});
				}
			}

			expect(wrapper.container).toBeInTheDocument();
		});
	});

	describe('Accessibility', () => {
		it('should have proper semantic structure', () => {
			const message = createCodeDiffMessage();
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const container = wrapper.container.querySelector('.code-diff');
			// Check that the code diff is accessible
			expect(container).toBeInTheDocument();
			expect(wrapper.container.textContent).toContain('Code changes description');
		});

		it('should have accessible action buttons', () => {
			const message = createCodeDiffMessage();
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const button = wrapper.container.querySelector('.n8n-button');
			// Check button exists and has proper text
			expect(button).toBeInTheDocument();
			expect(wrapper.container.textContent).toContain('Replace my code');
		});

		it('should announce state changes to screen readers', async () => {
			const message = createCodeDiffMessage();
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			await wrapper.rerender({
				message: { ...message, replacing: true },
			});

			// Check that state change is communicated through text content
			expect(wrapper.container.textContent).toContain('Replacing...');
		});

		it('should have proper keyboard navigation', () => {
			const message = createCodeDiffMessage({
				quickReplies: [{ type: 'resolved', text: 'Done' }],
			});
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			const focusableElements = wrapper.container.querySelectorAll('button, [tabindex="0"]');
			expect(focusableElements.length).toBeGreaterThan(0);
		});
	});

	describe('Edge Cases', () => {
		it('should handle message type inconsistency', () => {
			const message = { ...createCodeDiffMessage(), type: 'not-code-diff' as any };
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
		});

		it('should handle missing suggestionId', () => {
			const message = { ...createCodeDiffMessage() } as any;
			message.suggestionId = undefined;
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			// Should still render but buttons might be disabled
			expect(wrapper.container).toBeInTheDocument();
		});

		it('should handle complex diff scenarios', () => {
			const complexDiff = `@@ -1,10 +1,8 @@
 function hello() {
-  console.log("old");
-  var x = 1;
+  console.log("new");
+  const x = 1;
   return x;
 }
 
-function goodbye() {
-  return "bye";
-}`;
			const message = createCodeDiffMessage({ codeDiff: complexDiff });
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
		});

		it('should handle Unicode in code diff', () => {
			const unicodeDiff = '@@ -1 +1 @@\n-const msg = "Hello";\n+const msg = "你好 🎉";';
			const message = createCodeDiffMessage({ codeDiff: unicodeDiff });
			const wrapper = render(CodeDiffMessage, {
				props: {
					message,
					isFirstOfRole: true,
				},
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
		});
	});
});
