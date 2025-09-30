/**
 * Advanced JSONPath Query Support
 *
 * Provides comprehensive JSONPath querying capabilities with filtering, mapping,
 * and complex expressions for data transformation workflows.
 *
 * @module jsonpath-query
 *
 * @example
 * ```typescript
 * import { JSONPathQuery } from './jsonpath-query';
 *
 * const data = {
 *   users: [
 *     { name: 'Alice', age: 30, active: true },
 *     { name: 'Bob', age: 25, active: false },
 *     { name: 'Charlie', age: 35, active: true }
 *   ]
 * };
 *
 * const query = new JSONPathQuery(data);
 * const activeUsers = query.query('$.users[?(@.active == true)]');
 * // Returns: [{ name: 'Alice', age: 30, active: true }, { name: 'Charlie', age: 35, active: true }]
 * ```
 */

import { ApplicationError } from '../errors';

/**
 * JSONPath query result interface
 */
export interface IJsonPathResult {
	/** The matched value(s) */
	value: unknown;
	/** The path to the matched value */
	path: string;
	/** The parent object containing the value */
	parent: unknown;
	/** The property key in the parent object */
	parentProperty: string | number;
}

/**
 * JSONPath query options
 */
export interface IJsonPathOptions {
	/** Return result paths instead of values */
	resultType?: 'value' | 'path' | 'all';
	/** Wrap single results in an array */
	wrap?: boolean;
	/** Use case-insensitive matching for property names */
	caseInsensitive?: boolean;
	/** Maximum recursion depth for recursive descent */
	maxDepth?: number;
}

/**
 * Advanced JSONPath query engine with filtering and mapping support
 */
export class JSONPathQuery {
	private readonly data: unknown;
	private readonly logger: (message: string, context?: Record<string, unknown>) => void;

	/**
	 * Creates a new JSONPath query instance
	 * @param data - The data to query
	 * @param logger - Optional logger function
	 */
	constructor(
		data: unknown,
		logger?: (message: string, context?: Record<string, unknown>) => void,
	) {
		this.data = data;
		this.logger = logger ?? (() => {});
		this.logger('JSONPathQuery initialized', { dataType: typeof data });
	}

	/**
	 * Execute a JSONPath query against the data
	 *
	 * Supported JSONPath syntax:
	 * - `$` - Root object
	 * - `.property` or `['property']` - Child property
	 * - `[index]` - Array index
	 * - `[*]` - All array elements
	 * - `..property` - Recursive descent
	 * - `[start:end:step]` - Array slice
	 * - `[?(@.property == value)]` - Filter expression
	 *
	 * @param path - JSONPath expression
	 * @param options - Query options
	 * @returns Query results
	 *
	 * @example
	 * ```typescript
	 * query.query('$.users[*].name'); // Get all user names
	 * query.query('$.users[?(@.age > 25)]'); // Filter users by age
	 * query.query('$..email'); // Find all email fields recursively
	 * ```
	 */
	query(path: string, options: IJsonPathOptions = {}): unknown {
		const startTime = Date.now();
		this.logger('JSONPath query started', { path, options });

		try {
			const results = this.executeQuery(path, options);
			const duration = Date.now() - startTime;

			this.logger('JSONPath query completed', {
				path,
				resultCount: Array.isArray(results) ? results.length : 1,
				duration,
			});

			return results;
		} catch (error) {
			const duration = Date.now() - startTime;
			this.logger('JSONPath query failed', {
				path,
				error: error instanceof Error ? error.message : String(error),
				duration,
			});
			throw new ApplicationError('JSONPath query execution failed', {
				extra: { path, error: error instanceof Error ? error.message : String(error) },
			});
		}
	}

	/**
	 * Execute query and return detailed results with paths
	 */
	queryWithPaths(path: string, options: IJsonPathOptions = {}): IJsonPathResult[] {
		const mergedOptions = { ...options, resultType: 'all' as const };
		const results = this.executeQuery(path, mergedOptions);
		return Array.isArray(results) ? (results as IJsonPathResult[]) : [results as IJsonPathResult];
	}

	/**
	 * Map over query results and transform them
	 *
	 * @example
	 * ```typescript
	 * query.map('$.users[*]', (user: any) => ({
	 *   fullName: `${user.firstName} ${user.lastName}`,
	 *   age: user.age
	 * }));
	 * ```
	 */
	map<T, R>(path: string, transform: (value: T, index: number) => R): R[] {
		const results = this.query(path);
		const values = Array.isArray(results) ? results : [results];
		return values.map((value, index) => transform(value as T, index));
	}

	/**
	 * Filter query results
	 */
	filter<T>(path: string, predicate: (value: T, index: number) => boolean): T[] {
		const results = this.query(path);
		const values = Array.isArray(results) ? results : [results];
		return values.filter((value, index) => predicate(value as T, index)) as T[];
	}

	/**
	 * Get the first matching result
	 */
	first(path: string): unknown {
		const results = this.query(path);
		return Array.isArray(results) ? results[0] : results;
	}

	/**
	 * Get the last matching result
	 */
	last(path: string): unknown {
		const results = this.query(path);
		return Array.isArray(results) ? results[results.length - 1] : results;
	}

	/**
	 * Count matching results
	 */
	count(path: string): number {
		const results = this.query(path);
		return Array.isArray(results) ? results.length : results !== undefined ? 1 : 0;
	}

	/**
	 * Check if any results match the path
	 */
	exists(path: string): boolean {
		try {
			const results = this.query(path);
			return results !== undefined && (!Array.isArray(results) || results.length > 0);
		} catch {
			return false;
		}
	}

	/**
	 * Internal query execution logic
	 */
	private executeQuery(path: string, options: IJsonPathOptions): unknown {
		// Normalize path
		const normalizedPath = this.normalizePath(path);
		const tokens = this.tokenizePath(normalizedPath);

		// Execute query
		let results: IJsonPathResult[] = [
			{
				value: this.data,
				path: '$',
				parent: null,
				parentProperty: '',
			},
		];

		for (const token of tokens) {
			results = this.applyToken(results, token, options);
		}

		// Format results based on options
		return this.formatResults(results, options);
	}

	/**
	 * Normalize JSONPath expression
	 */
	private normalizePath(path: string): string {
		// Ensure path starts with $
		if (!path.startsWith('$')) {
			path = '$' + path;
		}
		return path.trim();
	}

	/**
	 * Tokenize JSONPath expression
	 */
	private tokenizePath(path: string): string[] {
		const tokens: string[] = [];
		let current = '';
		let depth = 0;
		let inBracket = false;
		let inQuote = false;
		let quoteChar = '';

		for (let i = 0; i < path.length; i++) {
			const char = path[i];

			if ((char === '"' || char === "'") && !inQuote) {
				inQuote = true;
				quoteChar = char;
				current += char;
			} else if (char === quoteChar && inQuote) {
				inQuote = false;
				quoteChar = '';
				current += char;
			} else if (char === '[' && !inQuote) {
				if (current && current !== '$') {
					tokens.push(current);
					current = '';
				}
				inBracket = true;
				depth++;
				current += char;
			} else if (char === ']' && !inQuote) {
				depth--;
				current += char;
				if (depth === 0 && inBracket) {
					tokens.push(current);
					current = '';
					inBracket = false;
				}
			} else if (char === '.' && !inQuote && !inBracket) {
				if (current && current !== '$') {
					tokens.push(current);
				}
				current = '';
			} else {
				current += char;
			}
		}

		if (current && current !== '$') {
			tokens.push(current);
		}

		return tokens.filter((t) => t.length > 0);
	}

	/**
	 * Apply a token to current results
	 */
	private applyToken(
		results: IJsonPathResult[],
		token: string,
		options: IJsonPathOptions,
	): IJsonPathResult[] {
		const newResults: IJsonPathResult[] = [];

		for (const result of results) {
			if (token.startsWith('..')) {
				// Recursive descent
				const property = token.slice(2);
				newResults.push(...this.recursiveDescent(result, property, options));
			} else if (token.startsWith('[') && token.endsWith(']')) {
				// Bracket notation
				newResults.push(...this.applyBracketNotation(result, token, options));
			} else {
				// Property access
				newResults.push(...this.applyPropertyAccess(result, token, options));
			}
		}

		return newResults;
	}

	/**
	 * Apply recursive descent
	 */
	private recursiveDescent(
		result: IJsonPathResult,
		property: string,
		options: IJsonPathOptions,
		depth = 0,
	): IJsonPathResult[] {
		const maxDepth = options.maxDepth ?? 50;
		if (depth > maxDepth) {
			return [];
		}

		const results: IJsonPathResult[] = [];
		const { value } = result;

		if (typeof value === 'object' && value !== null) {
			for (const [key, val] of Object.entries(value)) {
				if (this.matchProperty(key, property, options)) {
					results.push({
						value: val,
						path: `${result.path}.${key}`,
						parent: value,
						parentProperty: key,
					});
				}

				// Recurse into nested objects
				const nested = this.recursiveDescent(
					{
						value: val,
						path: `${result.path}.${key}`,
						parent: value,
						parentProperty: key,
					},
					property,
					options,
					depth + 1,
				);
				results.push(...nested);
			}
		}

		return results;
	}

	/**
	 * Apply bracket notation
	 */
	private applyBracketNotation(
		result: IJsonPathResult,
		token: string,
		options: IJsonPathOptions,
	): IJsonPathResult[] {
		const content = token.slice(1, -1);
		const { value } = result;

		// Wildcard
		if (content === '*') {
			return this.applyWildcard(result);
		}

		// Filter expression
		if (content.startsWith('?(')) {
			return this.applyFilter(result, content.slice(2, -1));
		}

		// Array slice
		if (content.includes(':')) {
			return this.applySlice(result, content);
		}

		// Array index or property name
		const index = parseInt(content, 10);
		if (!isNaN(index) && Array.isArray(value)) {
			const actualIndex = index < 0 ? value.length + index : index;
			if (actualIndex >= 0 && actualIndex < value.length) {
				return [
					{
						value: value[actualIndex],
						path: `${result.path}[${actualIndex}]`,
						parent: value,
						parentProperty: actualIndex,
					},
				];
			}
		} else if (typeof value === 'object' && value !== null) {
			const key = content.replace(/^['"]|['"]$/g, '');
			if (key in value) {
				return [
					{
						value: (value as Record<string, unknown>)[key],
						path: `${result.path}['${key}']`,
						parent: value,
						parentProperty: key,
					},
				];
			}
		}

		return [];
	}

	/**
	 * Apply wildcard operator
	 */
	private applyWildcard(result: IJsonPathResult): IJsonPathResult[] {
		const { value } = result;
		const results: IJsonPathResult[] = [];

		if (Array.isArray(value)) {
			value.forEach((item, index) => {
				results.push({
					value: item,
					path: `${result.path}[${index}]`,
					parent: value,
					parentProperty: index,
				});
			});
		} else if (typeof value === 'object' && value !== null) {
			Object.entries(value).forEach(([key, val]) => {
				results.push({
					value: val,
					path: `${result.path}.${key}`,
					parent: value,
					parentProperty: key,
				});
			});
		}

		return results;
	}

	/**
	 * Apply filter expression
	 */
	private applyFilter(result: IJsonPathResult, expression: string): IJsonPathResult[] {
		const { value } = result;
		if (!Array.isArray(value)) {
			return [];
		}

		const results: IJsonPathResult[] = [];

		for (let i = 0; i < value.length; i++) {
			const item: unknown = value[i];
			if (this.evaluateFilter(item, expression)) {
				results.push({
					value: item,
					path: `${result.path}[${i}]`,
					parent: value,
					parentProperty: i,
				});
			}
		}

		return results;
	}

	/**
	 * Evaluate filter expression
	 */
	private evaluateFilter(item: unknown, expression: string): boolean {
		try {
			// Parse expression: @.property operator value
			const match = expression.match(/^@\.(\w+)\s*(==|!=|>|<|>=|<=)\s*(.+)$/);
			if (!match) {
				return false;
			}

			const [, property, operator, valueStr] = match;
			const itemValue = (item as Record<string, unknown>)?.[property];
			const compareValue = this.parseValue(valueStr.trim());

			switch (operator) {
				case '==':
					return itemValue === compareValue;
				case '!=':
					return itemValue !== compareValue;
				case '>':
					return (itemValue as number) > (compareValue as number);
				case '<':
					return (itemValue as number) < (compareValue as number);
				case '>=':
					return (itemValue as number) >= (compareValue as number);
				case '<=':
					return (itemValue as number) <= (compareValue as number);
				default:
					return false;
			}
		} catch {
			return false;
		}
	}

	/**
	 * Parse value from string
	 */
	private parseValue(str: string): unknown {
		if (str === 'true') return true;
		if (str === 'false') return false;
		if (str === 'null') return null;
		if (str.match(/^['"].*['"]$/)) return str.slice(1, -1);
		const num = Number(str);
		if (!isNaN(num)) return num;
		return str;
	}

	/**
	 * Apply array slice
	 */
	private applySlice(result: IJsonPathResult, slice: string): IJsonPathResult[] {
		const { value } = result;
		if (!Array.isArray(value)) {
			return [];
		}

		const parts = slice.split(':');
		const start = parts[0] ? parseInt(parts[0], 10) : 0;
		const end = parts[1] ? parseInt(parts[1], 10) : value.length;
		const step = parts[2] ? parseInt(parts[2], 10) : 1;

		const results: IJsonPathResult[] = [];
		for (let i = start; i < end && i < value.length; i += step) {
			results.push({
				value: value[i],
				path: `${result.path}[${i}]`,
				parent: value,
				parentProperty: i,
			});
		}

		return results;
	}

	/**
	 * Apply property access
	 */
	private applyPropertyAccess(
		result: IJsonPathResult,
		property: string,
		options: IJsonPathOptions,
	): IJsonPathResult[] {
		const { value } = result;

		if (typeof value !== 'object' || value === null) {
			return [];
		}

		for (const [key, val] of Object.entries(value)) {
			if (this.matchProperty(key, property, options)) {
				return [
					{
						value: val,
						path: `${result.path}.${key}`,
						parent: value,
						parentProperty: key,
					},
				];
			}
		}

		return [];
	}

	/**
	 * Match property name
	 */
	private matchProperty(key: string, pattern: string, options: IJsonPathOptions): boolean {
		if (options.caseInsensitive) {
			return key.toLowerCase() === pattern.toLowerCase();
		}
		return key === pattern;
	}

	/**
	 * Format results based on options
	 */
	private formatResults(results: IJsonPathResult[], options: IJsonPathOptions): unknown {
		if (results.length === 0) {
			return options.wrap ? [] : undefined;
		}

		switch (options.resultType) {
			case 'path':
				return results.length === 1 && !options.wrap ? results[0].path : results.map((r) => r.path);
			case 'all':
				return results.length === 1 && !options.wrap ? results[0] : results;
			case 'value':
			default:
				return results.length === 1 && !options.wrap
					? results[0].value
					: results.map((r) => r.value);
		}
	}
}

/**
 * Convenience function to query data with JSONPath
 *
 * @example
 * ```typescript
 * const result = jsonPathQuery(data, '$.users[?(@.active == true)].name');
 * ```
 */
export function jsonPathQuery(data: unknown, path: string, options?: IJsonPathOptions): unknown {
	const query = new JSONPathQuery(data);
	return query.query(path, options);
}

/**
 * Convenience function to map over JSONPath results
 */
export function jsonPathMap<T, R>(
	data: unknown,
	path: string,
	transform: (value: T, index: number) => R,
): R[] {
	const query = new JSONPathQuery(data);
	return query.map(path, transform);
}

/**
 * Convenience function to filter JSONPath results
 */
export function jsonPathFilter<T>(
	data: unknown,
	path: string,
	predicate: (value: T, index: number) => boolean,
): T[] {
	const query = new JSONPathQuery(data);
	return query.filter(path, predicate);
}
