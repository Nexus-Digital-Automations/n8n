import type { IDataObject } from '../interfaces';
import { ExecutionBaseError } from './abstract/execution-base.error';

export interface ExpressionErrorOptions {
	cause?: Error;
	causeDetailed?: string;
	description?: string;
	descriptionKey?: string;
	descriptionTemplate?: string;
	functionality?: 'pairedItem';
	itemIndex?: number;
	messageTemplate?: string;
	nodeCause?: string;
	parameter?: string;
	runIndex?: number;
	type?:
		| 'no_execution_data'
		| 'no_node_execution_data'
		| 'no_input_connection'
		| 'internal'
		| 'paired_item_invalid_info'
		| 'paired_item_no_info'
		| 'paired_item_multiple_matches'
		| 'paired_item_no_connection'
		| 'paired_item_intermediate_nodes';
}

/**
 * Class for instantiating an expression error
 */
// Expression error constants
// eslint-disable-next-line @typescript-eslint/naming-convention
export const EXPRESSION_ERROR_MESSAGES = {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	NODE_NOT_FOUND: 'Error finding the referenced node',
	// eslint-disable-next-line @typescript-eslint/naming-convention
	NODE_REFERENCE_TEMPLATE:
		'Make sure the node you referenced is spelled correctly and is a parent of this node',
	// eslint-disable-next-line @typescript-eslint/naming-convention
	NO_EXECUTION_DATA: 'No execution data available',
} as const;

// eslint-disable-next-line @typescript-eslint/naming-convention
export const EXPRESSION_ERROR_TYPES = {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	PAIRED_ITEM_NO_CONNECTION: 'paired_item_no_connection',
} as const;

// eslint-disable-next-line @typescript-eslint/naming-convention
export const EXPRESSION_DESCRIPTION_KEYS = {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	NODE_NOT_FOUND: 'nodeNotFound',
	// eslint-disable-next-line @typescript-eslint/naming-convention
	NO_NODE_EXECUTION_DATA: 'noNodeExecutionData',
	// eslint-disable-next-line @typescript-eslint/naming-convention
	PAIRED_ITEM_NO_CONNECTION: 'pairedItemNoConnection',
	// eslint-disable-next-line @typescript-eslint/naming-convention
	PAIRED_ITEM_NO_CONNECTION_CODE_NODE: 'pairedItemNoConnectionCodeNode',
} as const;

export class ExpressionError extends ExecutionBaseError {
	constructor(message: string, options?: ExpressionErrorOptions) {
		super(message, { cause: options?.cause, level: 'warning' });

		if (options?.description !== undefined) {
			this.description = options.description;
		}

		const allowedKeys = [
			'causeDetailed',
			'descriptionTemplate',
			'descriptionKey',
			'itemIndex',
			'messageTemplate',
			'nodeCause',
			'parameter',
			'runIndex',
			'type',
		];

		if (options !== undefined) {
			if (options.functionality !== undefined) {
				this.functionality = options.functionality;
			}

			Object.keys(options as IDataObject).forEach((key) => {
				if (allowedKeys.includes(key)) {
					this.context[key] = (options as IDataObject)[key];
				}
			});
		}
	}
}
