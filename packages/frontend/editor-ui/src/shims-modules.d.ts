/**
 * Modules
 */

declare module 'vue-agile';

/**
 * File types
 */

declare module '*.json';
declare module '*.svg';
declare module '*.png';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.gif';
declare module '*.webp';

declare module '*?raw' {
	const content: string;
	export default content;
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

declare module 'v3-infinite-loading' {
	import { Plugin, DefineComponent } from 'vue';

	interface InfiniteLoadingProps {
		target: string;
	}

	export interface Events {
		infinite: (state: { loaded: () => void; complete: () => void }) => void;
	}

	const InfiniteLoading: DefineComponent<InfiniteLoadingProps, {}, {}, {}, {}, {}, {}, Events> &
		Plugin;

	export default InfiniteLoading;
}
