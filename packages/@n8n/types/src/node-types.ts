/**
 * Common node type definitions and patterns for n8n
 */

import type { IDataObject, JSONValue } from './utility-types';

/**
 * Common node execution states
 */
export type NodeExecutionStatus = 'new' | 'running' | 'success' | 'error' | 'canceled' | 'waiting';

/**
 * Node connection types
 */
export type NodeConnectionType =
	| 'main'
	| 'ai_languageModel'
	| 'ai_memory'
	| 'ai_tool'
	| 'ai_document'
	| 'ai_retriever'
	| 'ai_vectorStore';

/**
 * Node parameter types
 */
export type NodeParameterType =
	| 'string'
	| 'number'
	| 'boolean'
	| 'collection'
	| 'fixedCollection'
	| 'options'
	| 'multiOptions'
	| 'json'
	| 'notice'
	| 'hidden'
	| 'resourceLocator'
	| 'resourceMapper'
	| 'filter'
	| 'assignmentCollection'
	| 'dateTime'
	| 'color'
	| 'credentials'
	| 'curlImport'
	| 'workflowTemplate'
	| 'code';

/**
 * Resource locator mode types
 */
export type ResourceLocatorMode = 'list' | 'search' | 'url' | 'id';

/**
 * Base node parameter interface
 */
export interface BaseNodeParameter {
	displayName: string;
	name: string;
	type: NodeParameterType;
	required?: boolean;
	default?: JSONValue;
	placeholder?: string;
	hint?: string;
	description?: string;
	displayOptions?: {
		show?: IDataObject;
		hide?: IDataObject;
	};
	routing?: IDataObject;
	extractValue?: IDataObject;
	typeOptions?: IDataObject;
}

/**
 * String parameter
 */
export interface StringParameter extends BaseNodeParameter {
	type: 'string';
	default?: string;
	typeOptions?: {
		rows?: number;
		password?: boolean;
		editor?: string;
		loadOptionsDependsOn?: string[];
		multipleValues?: boolean;
		multipleValueButtonText?: string;
	};
}

/**
 * Number parameter
 */
export interface NumberParameter extends BaseNodeParameter {
	type: 'number';
	default?: number;
	typeOptions?: {
		minValue?: number;
		maxValue?: number;
		numberStepSize?: number;
		numberPrecision?: number;
	};
}

/**
 * Boolean parameter
 */
export interface BooleanParameter extends BaseNodeParameter {
	type: 'boolean';
	default?: boolean;
}

/**
 * Options parameter
 */
export interface OptionsParameter extends BaseNodeParameter {
	type: 'options';
	default?: string | number;
	options: Array<{
		name: string;
		value: string | number;
		description?: string;
		action?: string;
		routing?: IDataObject;
	}>;
	typeOptions?: {
		loadOptionsMethod?: string;
		loadOptionsDependsOn?: string[];
	};
}

/**
 * Multi-options parameter
 */
export interface MultiOptionsParameter extends BaseNodeParameter {
	type: 'multiOptions';
	default?: Array<string | number>;
	options: Array<{
		name: string;
		value: string | number;
		description?: string;
	}>;
	typeOptions?: {
		loadOptionsMethod?: string;
		loadOptionsDependsOn?: string[];
	};
}

/**
 * Collection parameter
 */
export interface CollectionParameter extends BaseNodeParameter {
	type: 'collection';
	default?: IDataObject;
	options: NodeParameter[];
	typeOptions?: {
		multipleValues?: boolean;
		multipleValueButtonText?: string;
	};
}

/**
 * Fixed collection parameter
 */
export interface FixedCollectionParameter extends BaseNodeParameter {
	type: 'fixedCollection';
	default?: IDataObject;
	options: Array<{
		name: string;
		displayName: string;
		values: NodeParameter[];
	}>;
	typeOptions?: {
		multipleValues?: boolean;
		multipleValueButtonText?: string;
	};
}

/**
 * Resource locator parameter
 */
export interface ResourceLocatorParameter extends BaseNodeParameter {
	type: 'resourceLocator';
	default?: {
		mode: ResourceLocatorMode;
		value: string;
	};
	modes: Array<{
		displayName: string;
		name: ResourceLocatorMode;
		type: 'list' | 'search' | 'url';
		placeholder?: string;
		hint?: string;
		validation?: Array<{
			type: string;
			properties?: IDataObject;
		}>;
		learnMoreUrl?: string;
		extractValue?: IDataObject;
		search?: IDataObject;
		url?: string;
	}>;
}

/**
 * JSON parameter
 */
export interface JsonParameter extends BaseNodeParameter {
	type: 'json';
	default?: string | IDataObject;
	typeOptions?: {
		rows?: number;
		alwaysOpenEditWindow?: boolean;
		editor?: string;
		validateJSON?: boolean;
	};
}

/**
 * Code parameter
 */
export interface CodeParameter extends BaseNodeParameter {
	type: 'code';
	default?: string;
	typeOptions?: {
		editor?: 'javascript' | 'python' | 'json' | 'htmlmixed' | 'sql';
		rows?: number;
	};
}

/**
 * Credentials parameter
 */
export interface CredentialsParameter extends BaseNodeParameter {
	type: 'credentials';
	default?: string;
	credentialTypes: Array<{
		name: string;
		displayName: string;
	}>;
}

/**
 * DateTime parameter
 */
export interface DateTimeParameter extends BaseNodeParameter {
	type: 'dateTime';
	default?: string;
	typeOptions?: {
		dateTimePickerOptions?: {
			format?: string;
			timezone?: string;
		};
	};
}

/**
 * Union of all node parameter types
 */
export type NodeParameter =
	| StringParameter
	| NumberParameter
	| BooleanParameter
	| OptionsParameter
	| MultiOptionsParameter
	| CollectionParameter
	| FixedCollectionParameter
	| ResourceLocatorParameter
	| JsonParameter
	| CodeParameter
	| CredentialsParameter
	| DateTimeParameter
	| BaseNodeParameter;

/**
 * Node property option
 */
export interface NodePropertyOption {
	name: string;
	value: string | number;
	description?: string;
	action?: string;
	routing?: IDataObject;
}

/**
 * Node property collection
 */
export interface NodePropertyCollection {
	displayName: string;
	name: string;
	values: NodeParameter[];
}

/**
 * Node execution data
 */
export interface NodeExecutionData {
	json: IDataObject;
	binary?: {
		[key: string]: {
			data: string;
			mimeType: string;
			fileName?: string;
			fileExtension?: string;
			directory?: string;
			fileSize?: string;
		};
	};
	pairedItem?:
		| {
				item: number;
				input?: number;
		  }
		| Array<{
				item: number;
				input?: number;
		  }>;
	error?: NodeExecutionError;
}

/**
 * Node execution error
 */
export interface NodeExecutionError {
	message: string;
	stack?: string;
	name?: string;
	description?: string;
	context?: IDataObject;
	cause?: unknown;
	timestamp?: number;
	node?: {
		id: string;
		name: string;
		type: string;
	};
}

/**
 * Node execution result
 */
export interface NodeExecutionResult {
	data?: NodeExecutionData[][];
	error?: NodeExecutionError;
	outputOverride?: IDataObject;
	pairedItem?: {
		item: number;
		input?: number;
	};
}

/**
 * Node input data
 */
export interface NodeInputData {
	main?: NodeExecutionData[][];
	aiLanguageModel?: NodeExecutionData[][];
	ai_memory?: NodeExecutionData[][];
	ai_tool?: NodeExecutionData[][];
	ai_document?: NodeExecutionData[][];
	ai_retriever?: NodeExecutionData[][];
	aiVectorStore?: NodeExecutionData[][];
}

/**
 * Node context data
 */
export interface NodeContext {
	node: {
		id: string;
		name: string;
		type: string;
		position: [number, number];
		parameters: IDataObject;
		credentials?: IDataObject;
	};
	workflow: {
		id: string;
		name: string;
		active: boolean;
		settings?: IDataObject;
	};
	execution: {
		id: string;
		mode: 'cli' | 'error' | 'integrated' | 'internal' | 'manual' | 'retry' | 'trigger' | 'webhook';
		startedAt: Date;
		stoppedAt?: Date;
		status: NodeExecutionStatus;
	};
	environment?: IDataObject;
}

/**
 * Node metadata interface
 */
export interface NodeMetadata {
	version: number | number[];
	description: string;
	displayName: string;
	name: string;
	group: string[];
	icon?: string;
	iconUrl?: string;
	subtitle?: string;
	codex?: {
		categories?: string[];
		subcategories?: IDataObject;
		resources?: {
			primaryDocumentation?: Array<{
				url: string;
			}>;
			credentialDocumentation?: Array<{
				url: string;
			}>;
		};
	};
	defaults: {
		name: string;
		color?: string;
	};
	eventTriggerDescription?: string;
	activationMessage?: string;
	inputs:
		| string[]
		| Array<{
				displayName?: string;
				type: NodeConnectionType;
				required?: boolean;
				maxConnections?: number;
		  }>;
	outputs:
		| string[]
		| Array<{
				displayName?: string;
				type: NodeConnectionType;
		  }>;
	outputNames?: string[];
	properties: NodeParameter[];
	credentials?: Array<{
		name: string;
		displayName?: string;
		required?: boolean;
		displayOptions?: {
			show?: IDataObject;
			hide?: IDataObject;
		};
	}>;
	requestDefaults?: {
		returnFullResponse?: boolean;
		baseURL?: string;
		url?: string;
		headers?: IDataObject;
	};
	requestOperations?: IDataObject;
	polling?: boolean;
	triggerPanel?: {
		header?: string;
		executionsHelp?: {
			inactive?: string;
			active?: string;
		};
		activationHint?: string;
	};
	webhooks?: Array<{
		name: string;
		httpMethod: string;
		responseMode?: string;
		path: string;
		webhookDescription?: {
			[key: string]: string;
		};
	}>;
	maxNodes?: number;
	supportsCORS?: boolean;
	hidden?: boolean;
}

/**
 * Common node operation types
 */
export type NodeOperationType =
	| 'create'
	| 'read'
	| 'update'
	| 'delete'
	| 'list'
	| 'search'
	| 'get'
	| 'execute';

/**
 * API operation definition
 */
export interface ApiOperation {
	operation: NodeOperationType;
	resource?: string;
	description: string;
	requestMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	endpoint: string;
	parameters?: NodeParameter[];
	authentication?: string[];
}

/**
 * Node credential test interface
 */
export interface CredentialTest {
	request: {
		baseURL?: string;
		url?: string;
		method?: string;
		headers?: IDataObject;
		body?: IDataObject;
		qs?: IDataObject;
	};
	rules?: Array<{
		type: 'responseSuccessBody' | 'responseCode';
		properties: IDataObject;
	}>;
}

/**
 * Webhook response modes
 */
export type WebhookResponseMode = 'onReceived' | 'lastNode' | 'responseNode';

/**
 * Node version information
 */
export interface NodeVersion {
	version: number;
	displayName?: string;
	description?: string;
	defaults?: IDataObject;
	properties?: NodeParameter[];
}

/**
 * Versioned node type
 */
export interface VersionedNodeType {
	description: NodeMetadata;
	nodeVersions: {
		[version: number]: NodeVersion;
	};
}

/**
 * Load options method result
 */
export interface LoadOptionsResult {
	name: string;
	value: string | number;
	description?: string;
}

/**
 * Resource mapping field
 */
export interface ResourceMappingField {
	id: string;
	displayName: string;
	required?: boolean;
	defaultMatch?: boolean;
	display?: boolean;
	type?: 'string' | 'number' | 'boolean' | 'dateTime' | 'options';
	options?: Array<{
		name: string;
		value: string | number;
	}>;
	canBeUsedToMatch?: boolean;
	removed?: boolean;
}
