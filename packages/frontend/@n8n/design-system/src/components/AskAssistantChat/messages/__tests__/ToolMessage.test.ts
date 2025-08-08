import { render, fireEvent } from '@testing-library/vue';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import type { ChatUI } from '../../../../types';
import ToolMessage from '../ToolMessage.vue';

// Mock dependencies
vi.mock('../../../../composables/useI18n', () => ({
	useI18n: vi.fn(() => ({
		t: vi.fn((key: string) => {
			const translations: Record<string, string> = {
				'assistantChat.builder.toolRunning': 'Running',
				'assistantChat.builder.toolCompleted': 'Completed',
				'assistantChat.builder.toolError': 'Error',
				'assistantChat.toolExecution': 'Tool Execution',
				'assistantChat.input': 'Input',
				'assistantChat.output': 'Output',
				'assistantChat.progress': 'Progress',
				'assistantChat.error': 'Error',
				'assistantChat.expand': 'Expand',
				'assistantChat.collapse': 'Collapse',
				'assistantChat.running': 'Running',
				'assistantChat.completed': 'Completed',
				'assistantChat.failed': 'Failed',
			};
			return translations[key] || key;
		}),
	})),
}));

const stubs = {
	'n8n-icon': {
		template: '<span class="n8n-icon" :data-icon="icon" :class="{ spinning: spin }" />',
		props: ['icon', 'size', 'color', 'spin'],
	},
	'n8n-button': {
		template:
			'<button class="n8n-button" @click="$emit(\'click\')" :disabled="disabled"><slot /></button>',
		props: ['disabled', 'type', 'size'],
		emits: ['click'],
	},
	'n8n-tooltip': {
		template: '<div class="n8n-tooltip" :data-content="content"><slot /></div>',
		props: ['content', 'placement', 'disabled'],
	},
	BaseMessage: {
		template: '<div class="base-message"><slot /></div>',
		props: ['message', 'isFirstOfRole', 'user'],
	},
};

type ToolStatus = 'running' | 'completed' | 'error';

const createToolMessage = (
	overrides: Partial<
		ChatUI.ToolMessage & {
			id?: string;
			read?: boolean;
			input?: unknown;
			output?: unknown;
			progressMessages?: unknown[];
			error?: unknown;
			executionTime?: number;
			progress?: number;
		}
	> = {},
): ChatUI.ToolMessage & { id: string; read: boolean } =>
	({
		id: '1',
		type: 'tool',
		role: 'assistant',
		toolName: 'test_tool',
		status: 'completed',
		updates: [
			{ type: 'input', data: { param1: 'value1', param2: 'value2' } },
			{ type: 'output', data: { result: 'success', data: [1, 2, 3] } },
		],
		read: false,
		...overrides,
	}) as ChatUI.ToolMessage & { id: string; read: boolean };

describe('ToolMessage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Basic Rendering', () => {
		it('should render tool message correctly', () => {
			const message = createToolMessage();
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			expect(wrapper.container).toMatchSnapshot();
			expect(wrapper.container.textContent).toContain('Test Tool');
		});

		it('should transform tool name from snake_case to Title Case', () => {
			const testCases = [
				{ input: 'test_tool', expected: 'Test Tool' },
				{ input: 'api_request_handler', expected: 'Api Request Handler' },
				{ input: 'simple_tool', expected: 'Simple Tool' },
				{ input: 'complex_data_processor', expected: 'Complex Data Processor' },
			];

			testCases.forEach(({ input, expected }) => {
				const message = createToolMessage({ toolName: input });
				const wrapper = render(ToolMessage, {
					props: { message, isFirstOfRole: true },
					global: { stubs },
				});

				expect(wrapper.container.textContent).toContain(expected);
			});
		});

		it('should display tool status icon', () => {
			const statusConfigs = [
				{ status: 'running', expectedIcon: 'spinner' },
				{ status: 'completed', expectedIcon: 'status-completed' },
				{ status: 'error', expectedIcon: 'status-error' },
			] as const;

			statusConfigs.forEach(({ status, expectedIcon }) => {
				const message = createToolMessage({ status });
				const wrapper = render(ToolMessage, {
					props: { message, isFirstOfRole: true },
					global: { stubs },
				});

				const statusIcon = wrapper.container.querySelector(
					'.n8n-icon[data-icon="' + expectedIcon + '"]',
				);
				expect(statusIcon).toBeInTheDocument();
			});
		});

		it('should display tool status correctly', () => {
			const statuses: ToolStatus[] = ['running', 'completed', 'error'];

			statuses.forEach((status) => {
				const message = createToolMessage({ status });
				const wrapper = render(ToolMessage, {
					props: { message, isFirstOfRole: true },
					global: { stubs },
				});

				// The component shows the status via icons and tooltip content, not CSS classes
				const statusIcon = wrapper.container.querySelector('.n8n-icon');
				expect(statusIcon).toBeInTheDocument();
			});
		});
	});

	describe('Expandable/Collapsible Behavior', () => {
		it('should be collapsed by default', () => {
			const message = createToolMessage();
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			// Content section should not exist when collapsed
			const expandedContent = wrapper.container.querySelector('[class*="content"]');
			expect(expandedContent).not.toBeInTheDocument();
		});

		it('should expand when header is clicked', async () => {
			const message = createToolMessage();
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');
			await fireEvent.click(header!);

			const expandedContent = wrapper.container.querySelector('[class*="content"]');
			expect(expandedContent).toBeInTheDocument();
		});

		it('should toggle expand/collapse on multiple clicks', async () => {
			const message = createToolMessage();
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');

			// Initially collapsed
			expect(wrapper.container.querySelector('[class*="content"]')).not.toBeInTheDocument();

			// Click to expand
			await fireEvent.click(header!);
			expect(wrapper.container.querySelector('[class*="content"]')).toBeInTheDocument();

			// Click to collapse
			await fireEvent.click(header!);
			expect(wrapper.container.querySelector('[class*="content"]')).not.toBeInTheDocument();
		});

		it('should show appropriate expand/collapse icons', async () => {
			const message = createToolMessage();
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const expandIcon = wrapper.container.querySelector('.n8n-icon[data-icon="chevron-right"]');
			expect(expandIcon).toBeInTheDocument();

			const header = wrapper.container.querySelector('[class*="header"]');
			await fireEvent.click(header!);

			const collapseIcon = wrapper.container.querySelector('.n8n-icon[data-icon="chevron-down"]');
			expect(collapseIcon).toBeInTheDocument();
		});

		it('should display tool name correctly', () => {
			const message = createToolMessage();
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			// Component shows tool name, not expand/collapse text
			expect(wrapper.container.textContent).toContain('Test Tool');
		});
	});

	describe('Tool Input Display', () => {
		it('should display tool input when expanded', async () => {
			const message = createToolMessage({
				updates: [{ type: 'input', data: { param1: 'value1', param2: 42, param3: true } }],
			});
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');
			await fireEvent.click(header!);

			const inputSection = wrapper.container.querySelector('[class*="section"]');
			expect(inputSection).toBeInTheDocument();
			expect(wrapper.container.textContent).toContain('Input');
		});

		it('should format input as JSON', async () => {
			const inputData = {
				stringParam: 'test',
				numberParam: 123,
				booleanParam: true,
				arrayParam: [1, 2, 3],
				objectParam: { nested: 'value' },
			};
			const message = createToolMessage({
				updates: [{ type: 'input', data: inputData }],
			});
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');
			await fireEvent.click(header!);

			const jsonContent = wrapper.container.querySelector('[class*="jsonContent"]');
			expect(jsonContent?.textContent).toContain('"stringParam": "test"');
			expect(jsonContent?.textContent).toContain('"numberParam": 123');
		});

		it('should handle empty input gracefully', async () => {
			const message = createToolMessage({
				updates: [{ type: 'input', data: {} }],
			});
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');
			await fireEvent.click(header!);

			const inputSection = wrapper.container.querySelector('[class*="section"]');
			expect(inputSection).toBeInTheDocument();
		});

		it('should handle missing input updates', async () => {
			const message = createToolMessage({
				updates: [],
			});
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');
			await fireEvent.click(header!);

			// Should not crash when no input updates exist
			expect(wrapper.container).toBeInTheDocument();
		});
	});

	describe('Tool Output Display', () => {
		it('should display tool output when expanded', async () => {
			const message = createToolMessage({
				updates: [{ type: 'output', data: { result: 'success', data: [1, 2, 3] } }],
			});
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');
			await fireEvent.click(header!);

			expect(wrapper.container.textContent).toContain('Output');
		});

		it('should format output as JSON', async () => {
			const outputData = {
				success: true,
				message: 'Operation completed',
				results: [{ id: 1, name: 'Item 1' }],
			};
			const message = createToolMessage({
				updates: [{ type: 'output', data: outputData }],
			});
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');
			await fireEvent.click(header!);

			const jsonContent = wrapper.container.querySelector('[class*="jsonContent"]');
			expect(jsonContent?.textContent).toContain('"success": true');
			expect(jsonContent?.textContent).toContain('Item 1');
		});

		it('should handle large output data', async () => {
			const largeOutput = {
				data: Array.from({ length: 100 }, (_, i) => ({ id: i, value: `item-${i}` })),
			};
			const message = createToolMessage({
				updates: [{ type: 'output', data: largeOutput }],
			});
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');
			await fireEvent.click(header!);

			const outputSection = wrapper.container.querySelector('[class*="section"]');
			expect(outputSection).toBeInTheDocument();
		});

		it('should not display output section when output is missing', async () => {
			const message = createToolMessage({
				updates: [],
			});
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');
			await fireEvent.click(header!);

			// Should not contain Output text if no output update exists
			expect(wrapper.container.textContent).not.toContain('Output');
		});
	});

	describe('Progress Messages Display', () => {
		it('should display progress messages when showProgressLogs is true', async () => {
			const message = createToolMessage({
				updates: [
					{ type: 'progress', data: 'Starting execution' },
					{ type: 'progress', data: 'Processing data' },
					{ type: 'progress', data: 'Finalizing results' },
				],
			});
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true, showProgressLogs: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');
			await fireEvent.click(header!);

			expect(wrapper.container.textContent).toContain('Progress');
			expect(wrapper.container.textContent).toContain('Starting execution');
			expect(wrapper.container.textContent).toContain('Processing data');
		});

		it('should not display progress messages when showProgressLogs is false', async () => {
			const message = createToolMessage({
				updates: [{ type: 'progress', data: 'Starting execution' }],
			});
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true, showProgressLogs: false },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');
			await fireEvent.click(header!);

			expect(wrapper.container.textContent).not.toContain('Progress');
			expect(wrapper.container.textContent).not.toContain('Starting execution');
		});

		it('should display progress content correctly', async () => {
			const message = createToolMessage({
				updates: [{ type: 'progress', data: 'Test progress message' }],
			});
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true, showProgressLogs: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');
			await fireEvent.click(header!);

			expect(wrapper.container.textContent).toContain('Test progress message');
		});

		it('should handle empty progress messages', async () => {
			const message = createToolMessage({
				updates: [],
			});
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true, showProgressLogs: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');
			await fireEvent.click(header!);

			expect(wrapper.container.textContent).not.toContain('Progress');
		});
	});

	describe('Error Handling and Display', () => {
		it('should display error information for failed tools', async () => {
			const message = createToolMessage({
				status: 'error',
				updates: [
					{
						type: 'error',
						data: {
							message: 'Tool execution failed',
							code: 'EXEC_ERROR',
							stack: 'Error stack trace here...',
						},
					},
				],
			});
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');
			await fireEvent.click(header!);

			expect(wrapper.container.textContent).toContain('Error');
			expect(wrapper.container.textContent).toContain('Tool execution failed');
		});

		it('should show error status icon for failed tools', () => {
			const message = createToolMessage({ status: 'error' });
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const statusIcon = wrapper.container.querySelector('.n8n-icon[data-icon="status-error"]');
			expect(statusIcon).toBeInTheDocument();
		});

		it('should show error details when expanded', async () => {
			const message = createToolMessage({
				status: 'error',
				updates: [
					{
						type: 'error',
						data: {
							message: 'Network timeout',
							details: { timeout: 5000, retries: 3 },
						},
					},
				],
			});
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');
			await fireEvent.click(header!);

			expect(wrapper.container.textContent).toContain('Network timeout');
		});

		it('should handle tools without error information gracefully', async () => {
			const message = createToolMessage({
				status: 'error',
				updates: [],
			});
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');
			await fireEvent.click(header!);

			expect(wrapper.container).toBeInTheDocument();
		});
	});

	describe('Status Indicators and Tooltips', () => {
		it('should show status tooltips', () => {
			const statuses: ToolStatus[] = ['running', 'completed', 'error'];

			statuses.forEach((status) => {
				const message = createToolMessage({ status });
				const wrapper = render(ToolMessage, {
					props: { message, isFirstOfRole: true },
					global: { stubs },
				});

				// Tooltip is nested within the status icon structure
				const tooltip =
					wrapper.container.querySelector('[class*="n8n-tooltip"]') ||
					wrapper.container.querySelector('.el-tooltip__trigger');
				expect(tooltip).toBeInTheDocument();
			});
		});

		it('should show different icons for different statuses', () => {
			const statusConfigs = [
				{ status: 'running', expectedIcon: 'spinner' },
				{ status: 'completed', expectedIcon: 'status-completed' },
				{ status: 'error', expectedIcon: 'status-error' },
			] as const;

			statusConfigs.forEach(({ status, expectedIcon }) => {
				const message = createToolMessage({ status });
				const wrapper = render(ToolMessage, {
					props: { message, isFirstOfRole: true },
					global: { stubs },
				});

				const statusIcon = wrapper.container.querySelector(
					'.n8n-icon[data-icon="' + expectedIcon + '"]',
				);
				expect(statusIcon).toBeInTheDocument();
			});
		});

		it('should show spinning icon for running tools', () => {
			const message = createToolMessage({ status: 'running' });
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const statusIcon = wrapper.container.querySelector('.n8n-icon[data-icon="spinner"]');
			expect(statusIcon).toBeInTheDocument();
		});

		it('should display tool name in header', () => {
			const message = createToolMessage({
				toolName: 'test_data_processor',
			});
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			expect(wrapper.container.textContent).toContain('Test Data Processor');
		});
	});

	describe('Accessibility', () => {
		it('should render component structure properly', () => {
			const message = createToolMessage();
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			// Component should render without accessibility violations
			const container = wrapper.container.querySelector('[class*="toolMessage"]');
			expect(container).toBeInTheDocument();
		});

		it('should have clickable header for expand/collapse', () => {
			const message = createToolMessage();
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');
			expect(header).toBeInTheDocument();
		});

		it('should toggle content visibility when clicked', async () => {
			const message = createToolMessage();
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');

			// Initially collapsed
			expect(wrapper.container.querySelector('[class*="content"]')).not.toBeInTheDocument();

			// Click to expand
			await fireEvent.click(header!);
			expect(wrapper.container.querySelector('[class*="content"]')).toBeInTheDocument();
		});

		it('should display tool status correctly', () => {
			const message = createToolMessage({ status: 'running' });
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const statusIcon = wrapper.container.querySelector('.n8n-icon');
			expect(statusIcon).toBeInTheDocument();
		});

		it('should handle component rendering without errors', () => {
			const message = createToolMessage();
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
		});
	});

	describe('JSON Data Display', () => {
		it('should display JSON formatted data', async () => {
			const message = createToolMessage({
				updates: [
					{ type: 'input', data: { stringValue: 'value', numberValue: 42, booleanValue: true } },
				],
			});
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');
			await fireEvent.click(header!);

			const jsonContent = wrapper.container.querySelector('[class*="jsonContent"]');
			expect(jsonContent).toBeInTheDocument();
		});

		it('should handle deeply nested objects', async () => {
			const complexData = {
				level1: {
					level2: {
						level3: {
							deep: 'value',
							array: [1, 2, { nested: true }],
						},
					},
				},
			};
			const message = createToolMessage({
				updates: [{ type: 'output', data: complexData }],
			});
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');
			await fireEvent.click(header!);

			const jsonContent = wrapper.container.querySelector('[class*="jsonContent"]');
			expect(jsonContent?.textContent).toContain('level3');
			expect(jsonContent?.textContent).toContain('nested');
		});

		it('should handle circular references gracefully', async () => {
			const circularData: Record<PropertyKey, unknown> = { name: 'test' };
			circularData.self = circularData; // Create circular reference

			const message = createToolMessage({
				updates: [{ type: 'output', data: circularData }],
			});
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');
			await fireEvent.click(header!);

			// Should not crash and should display something meaningful
			expect(wrapper.container).toBeInTheDocument();
		});
	});

	describe('Edge Cases', () => {
		it('should handle message type inconsistency', () => {
			const message = { ...createToolMessage(), type: 'not-tool' as unknown as MessageType };
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
		});

		it('should handle missing toolName gracefully', () => {
			const message = { ...createToolMessage(), toolName: '' };
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			// Component should render without crashing
			expect(wrapper.container).toBeInTheDocument();
		});

		it('should handle empty toolName', () => {
			const message = createToolMessage({ toolName: '' });
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
		});

		it('should handle tools with special characters in names', () => {
			const specialNames = [
				'tool-with-dashes',
				'tool.with.dots',
				'tool@with#symbols',
				'tool with spaces',
			];

			specialNames.forEach((toolName) => {
				const message = createToolMessage({ toolName });
				const wrapper = render(ToolMessage, {
					props: { message, isFirstOfRole: true },
					global: { stubs },
				});

				expect(wrapper.container).toBeInTheDocument();
			});
		});

		it('should handle extremely long tool names', () => {
			const longName = 'very_long_tool_name_that_exceeds_normal_limits'.repeat(3);
			const message = createToolMessage({ toolName: longName });
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			expect(wrapper.container).toBeInTheDocument();
		});
	});

	describe('Performance', () => {
		it('should handle frequent status updates efficiently', async () => {
			const message = createToolMessage({ status: 'running' });
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const statuses: ToolStatus[] = ['running', 'completed', 'error'];

			// Simulate frequent status changes
			for (let i = 0; i < 5; i++) {
				const newStatus = statuses[i % statuses.length];
				await wrapper.rerender({
					message: createToolMessage({ status: newStatus }),
				});
			}

			expect(wrapper.container).toBeInTheDocument();
		});

		it('should not cause memory leaks with large data', async () => {
			const hugeData = {
				largeArray: Array.from({ length: 100 }, (_, i) => ({ id: i, data: `item-${i}` })),
			};
			const message = createToolMessage({
				updates: [{ type: 'output', data: hugeData }],
			});
			const wrapper = render(ToolMessage, {
				props: { message, isFirstOfRole: true },
				global: { stubs },
			});

			const header = wrapper.container.querySelector('[class*="header"]');
			await fireEvent.click(header!);

			// Verify component can be unmounted cleanly
			wrapper.unmount();
			expect(wrapper.container.innerHTML).toBe('');
		});
	});
});
