declare module 'markdown-it-task-lists' {
	import type { PluginWithOptions } from 'markdown-it';

	declare namespace markdownItTaskLists {
		interface Config {
			enabled?: boolean;
			label?: boolean;
			labelAfter?: boolean;
		}
	}

	declare const markdownItTaskLists: PluginWithOptions<markdownItTaskLists.Config>;

	export = markdownItTaskLists;
}

// Vue component type declarations
declare module '*.vue' {
	import type { DefineComponent } from 'vue';
	const component: DefineComponent<any, any, any>;
	export default component;
	// Allow any named exports from Vue components
	export const Props: any;
	export const TableOptions: any;
	export const TableHeader: any;
	export const CanvasEdgeProps: any;
}

// Design System component declarations
declare module './AssistantAvatar.vue' {
	import type { DefineComponent } from 'vue';
	const component: DefineComponent<{}, {}, any>;
	export default component;
}

declare module './AskAssistantButton.vue' {
	import type { DefineComponent } from 'vue';
	const component: DefineComponent<{}, {}, any>;
	export default component;
}

declare module './AskAssistantChat.vue' {
	import type { DefineComponent } from 'vue';
	const component: DefineComponent<{}, {}, any>;
	export default component;
}
