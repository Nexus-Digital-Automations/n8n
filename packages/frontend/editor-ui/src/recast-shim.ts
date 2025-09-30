/**
 * Browser-compatible shim for recast package
 *
 * recast requires Node.js modules (os, fs, etc.) which are not available in browsers.
 * This shim provides minimal implementations to allow the code to build for browsers.
 *
 * Note: The expression transformation functionality using AST manipulation
 * is not available in the browser with this shim. Code that depends on it
 * will need to handle the simplified behavior.
 */

import type { ExpressionKind } from 'ast-types/gen/kinds';

/**
 * Helper function from recast/lib/util
 * Used by tournament package Parser.ts
 */
export function getOption<T>(
	options: Record<string, unknown> | undefined,
	key: string,
	defaultValue: T,
): T {
	return (options?.[key] as T) ?? defaultValue;
}

/**
 * Stub parse function - returns a minimal AST structure
 * In browser context, we skip AST transformation
 */
export function parse(_source: string, _options?: unknown): unknown {
	// Return a minimal AST-like structure that won't cause errors
	return {
		type: 'File',
		program: {
			type: 'Program',
			body: [],
		},
	};
}

/**
 * Stub visit function - does nothing in browser context
 */
export function visit(_ast: unknown, _visitor: unknown): void {
	// No-op in browser - AST traversal not supported
}

/**
 * Stub print function - returns the original expression unchanged
 * Since we can't do AST transformation in browser, return input as-is
 */
export function print(_ast: unknown): { code: string } {
	return { code: '' };
}

/**
 * Stub types object with builders
 * Provides minimal AST node builders that create placeholder objects
 */
export const types = {
	builders: {
		identifier: (name: string) => ({ type: 'Identifier', name }),
		memberExpression: (object: unknown, property: unknown) => ({
			type: 'MemberExpression',
			object,
			property,
		}),
		assignmentExpression: (operator: string, left: unknown, right: unknown) => ({
			type: 'AssignmentExpression',
			operator,
			left,
			right,
		}),
		conditionalExpression: (test: unknown, consequent: unknown, alternate: unknown) => ({
			type: 'ConditionalExpression',
			test,
			consequent,
			alternate,
		}),
		binaryExpression: (operator: string, left: unknown, right: unknown) => ({
			type: 'BinaryExpression',
			operator,
			left,
			right,
		}),
		booleanLiteral: (value: boolean) => ({ type: 'BooleanLiteral', value }),
		logicalExpression: (operator: string, left: unknown, right: unknown) => ({
			type: 'LogicalExpression',
			operator,
			left,
			right,
		}),
		sequenceExpression: (expressions: ExpressionKind[]) => ({
			type: 'SequenceExpression',
			expressions,
		}),
		callExpression: (callee: unknown, args: unknown[]) => ({
			type: 'CallExpression',
			callee,
			arguments: args,
		}),
	},
};
