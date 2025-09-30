/**
 * Reusable Data Transformation Library
 *
 * Provides a comprehensive collection of reusable data transformation functions
 * including common patterns like date formatting, data normalization, string
 * manipulation, and type conversions for workflow automation.
 *
 * @module transformation-library
 *
 * @example
 * ```typescript
 * import { TransformationLibrary } from './transformation-library';
 *
 * const library = new TransformationLibrary();
 *
 * // Date formatting
 * const formatted = library.formatDate(new Date(), 'YYYY-MM-DD');
 *
 * // Data normalization
 * const normalized = library.normalizeObject(data, { removeNull: true, trim: true });
 *
 * // CSV to JSON
 * const json = library.csvToJson(csvString);
 * ```
 */

import { ApplicationError } from '../errors';

/**
 * Transformation options
 */
export interface ITransformOptions {
	/** Remove null values */
	removeNull?: boolean;
	/** Remove undefined values */
	removeUndefined?: boolean;
	/** Trim string values */
	trim?: boolean;
	/** Convert keys to camelCase */
	camelCaseKeys?: boolean;
	/** Convert keys to snake_case */
	snakeCaseKeys?: boolean;
	/** Lowercase string values */
	lowercase?: boolean;
	/** Uppercase string values */
	uppercase?: boolean;
	/** Remove empty strings */
	removeEmpty?: boolean;
}

/**
 * CSV parsing options
 */
export interface ICsvOptions {
	/** Field delimiter */
	delimiter?: string;
	/** Quote character */
	quote?: string;
	/** Escape character */
	escape?: string;
	/** Skip empty lines */
	skipEmptyLines?: boolean;
	/** Treat first row as headers */
	headers?: boolean;
	/** Custom header names */
	headerNames?: string[];
}

/**
 * JSON to CSV options
 */
export interface IJsonToCsvOptions {
	/** Field delimiter */
	delimiter?: string;
	/** Include headers */
	includeHeaders?: boolean;
	/** Custom header names */
	headers?: string[];
	/** Quote all fields */
	quoteAll?: boolean;
}

/**
 * XML parsing options
 */
export interface IXmlOptions {
	/** Trim whitespace */
	trim?: boolean;
	/** Normalize tags */
	normalize?: boolean;
	/** Merge attributes */
	mergeAttrs?: boolean;
	/** Explicit array */
	explicitArray?: boolean;
}

/**
 * Comprehensive data transformation library
 */
export class TransformationLibrary {
	private readonly logger: (message: string, context?: Record<string, unknown>) => void;

	constructor(logger?: (message: string, context?: Record<string, unknown>) => void) {
		this.logger = logger ?? (() => {});
		this.logger('TransformationLibrary initialized');
	}

	// ==================== Date & Time Transformations ====================

	/**
	 * Format date using template string
	 *
	 * Supported tokens:
	 * - YYYY: 4-digit year
	 * - YY: 2-digit year
	 * - MM: 2-digit month
	 * - DD: 2-digit day
	 * - HH: 2-digit hours (24h)
	 * - mm: 2-digit minutes
	 * - ss: 2-digit seconds
	 * - SSS: 3-digit milliseconds
	 *
	 * @example
	 * ```typescript
	 * formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')
	 * // Returns: "2024-01-15 14:30:45"
	 * ```
	 */
	formatDate(date: Date | string | number, format: string): string {
		const d = new Date(date);

		if (isNaN(d.getTime())) {
			throw new ApplicationError('Invalid date', { extra: { date } });
		}

		const tokens: Record<string, string> = {
			YYYY: String(d.getFullYear()),
			YY: String(d.getFullYear()).slice(-2),
			MM: String(d.getMonth() + 1).padStart(2, '0'),
			DD: String(d.getDate()).padStart(2, '0'),
			HH: String(d.getHours()).padStart(2, '0'),
			mm: String(d.getMinutes()).padStart(2, '0'),
			ss: String(d.getSeconds()).padStart(2, '0'),
			SSS: String(d.getMilliseconds()).padStart(3, '0'),
		};

		let result = format;
		Object.entries(tokens).forEach(([token, value]) => {
			result = result.replace(new RegExp(token, 'g'), value);
		});

		return result;
	}

	/**
	 * Parse date string with format
	 */
	parseDate(dateString: string, format: string): Date {
		// Simple implementation for common formats
		if (format === 'YYYY-MM-DD') {
			const [year, month, day] = dateString.split('-').map(Number);
			return new Date(year, month - 1, day);
		}

		if (format === 'MM/DD/YYYY') {
			const [month, day, year] = dateString.split('/').map(Number);
			return new Date(year, month - 1, day);
		}

		// Fallback to native parsing
		return new Date(dateString);
	}

	/**
	 * Add time to date
	 */
	addTime(
		date: Date | string,
		amount: number,
		unit: 'years' | 'months' | 'days' | 'hours' | 'minutes' | 'seconds',
	): Date {
		const d = new Date(date);

		switch (unit) {
			case 'years':
				d.setFullYear(d.getFullYear() + amount);
				break;
			case 'months':
				d.setMonth(d.getMonth() + amount);
				break;
			case 'days':
				d.setDate(d.getDate() + amount);
				break;
			case 'hours':
				d.setHours(d.getHours() + amount);
				break;
			case 'minutes':
				d.setMinutes(d.getMinutes() + amount);
				break;
			case 'seconds':
				d.setSeconds(d.getSeconds() + amount);
				break;
		}

		return d;
	}

	/**
	 * Get relative time string
	 */
	relativeTime(date: Date | string): string {
		const d = new Date(date);
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffSec = Math.floor(diffMs / 1000);
		const diffMin = Math.floor(diffSec / 60);
		const diffHour = Math.floor(diffMin / 60);
		const diffDay = Math.floor(diffHour / 24);

		if (diffDay > 30) return `${Math.floor(diffDay / 30)} months ago`;
		if (diffDay > 0) return `${diffDay} days ago`;
		if (diffHour > 0) return `${diffHour} hours ago`;
		if (diffMin > 0) return `${diffMin} minutes ago`;
		if (diffSec > 0) return `${diffSec} seconds ago`;
		return 'just now';
	}

	// ==================== String Transformations ====================

	/**
	 * Convert string to camelCase
	 */
	camelCase(str: string): string {
		return str
			.replace(/[^a-zA-Z0-9]+(.)/g, (_: string, chr: string) => chr.toUpperCase())
			.replace(/^[A-Z]/, (chr: string) => chr.toLowerCase());
	}

	/**
	 * Convert string to snake_case
	 */
	snakeCase(str: string): string {
		return str
			.replace(/([A-Z])/g, '_$1')
			.toLowerCase()
			.replace(/^_/, '')
			.replace(/[^a-z0-9]+/g, '_');
	}

	/**
	 * Convert string to kebab-case
	 */
	kebabCase(str: string): string {
		return str
			.replace(/([A-Z])/g, '-$1')
			.toLowerCase()
			.replace(/^-/, '')
			.replace(/[^a-z0-9]+/g, '-');
	}

	/**
	 * Convert string to PascalCase
	 */
	pascalCase(str: string): string {
		return str
			.replace(/[^a-zA-Z0-9]+(.)/g, (_: string, chr: string) => chr.toUpperCase())
			.replace(/^[a-z]/, (chr: string) => chr.toUpperCase());
	}

	/**
	 * Truncate string with ellipsis
	 */
	truncate(str: string, maxLength: number, suffix = '...'): string {
		if (str.length <= maxLength) return str;
		return str.slice(0, maxLength - suffix.length) + suffix;
	}

	/**
	 * Slugify string for URLs
	 */
	slugify(str: string): string {
		return str
			.toLowerCase()
			.trim()
			.replace(/[^\w\s-]/g, '')
			.replace(/[\s_-]+/g, '-')
			.replace(/^-+|-+$/g, '');
	}

	/**
	 * Extract numbers from string
	 */
	extractNumbers(str: string): number[] {
		const matches = str.match(/-?\d+\.?\d*/g);
		return matches ? matches.map(Number) : [];
	}

	/**
	 * Extract emails from string
	 */
	extractEmails(str: string): string[] {
		const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
		return str.match(emailRegex) ?? [];
	}

	/**
	 * Extract URLs from string
	 */
	extractUrls(str: string): string[] {
		const urlRegex = /https?:\/\/[^\s]+/g;
		return str.match(urlRegex) ?? [];
	}

	// ==================== Object Transformations ====================

	/**
	 * Normalize object with transformation options
	 */
	normalizeObject<T extends Record<string, unknown>>(obj: T, options: ITransformOptions = {}): T {
		const result = { ...obj };

		Object.keys(result).forEach((key) => {
			let value = result[key];

			// Remove null/undefined
			if (options.removeNull && value === null) {
				delete result[key];
				return;
			}
			if (options.removeUndefined && value === undefined) {
				delete result[key];
				return;
			}

			// String transformations
			if (typeof value === 'string') {
				let stringValue = value;
				if (options.trim) stringValue = stringValue.trim();
				if (options.lowercase) stringValue = stringValue.toLowerCase();
				if (options.uppercase) stringValue = stringValue.toUpperCase();
				if (options.removeEmpty && stringValue === '') {
					delete result[key];
					return;
				}
				value = stringValue;
			}

			// Recursive normalization
			if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
				value = this.normalizeObject(value as Record<string, unknown>, options);
			}

			(result as Record<string, unknown>)[key] = value;
		});

		// Key transformations
		if (options.camelCaseKeys || options.snakeCaseKeys) {
			const newResult: Record<string, unknown> = {};
			Object.entries(result).forEach(([key, value]) => {
				const newKey = options.camelCaseKeys ? this.camelCase(key) : this.snakeCase(key);
				newResult[newKey] = value;
			});
			return newResult as T;
		}

		return result;
	}

	/**
	 * Flatten nested object
	 *
	 * @example
	 * ```typescript
	 * flattenObject({ a: { b: { c: 1 } } })
	 * // Returns: { 'a.b.c': 1 }
	 * ```
	 */
	flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
		const result: Record<string, unknown> = {};

		Object.entries(obj).forEach(([key, value]) => {
			const newKey = prefix ? `${prefix}.${key}` : key;

			if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
				Object.assign(result, this.flattenObject(value as Record<string, unknown>, newKey));
			} else {
				result[newKey] = value;
			}
		});

		return result;
	}

	/**
	 * Unflatten object
	 *
	 * @example
	 * ```typescript
	 * unflattenObject({ 'a.b.c': 1 })
	 * // Returns: { a: { b: { c: 1 } } }
	 * ```
	 */
	unflattenObject(obj: Record<string, unknown>): Record<string, unknown> {
		const result: Record<string, unknown> = {};

		Object.entries(obj).forEach(([key, value]) => {
			const keys = key.split('.');
			let current = result;

			keys.forEach((k, i) => {
				if (i === keys.length - 1) {
					current[k] = value;
				} else {
					current[k] = current[k] ?? {};
					current = current[k] as Record<string, unknown>;
				}
			});
		});

		return result;
	}

	/**
	 * Pick specific keys from object
	 */
	pick<T extends Record<string, unknown>>(obj: T, keys: string[]): Partial<T> {
		const result: Partial<T> = {};
		keys.forEach((key) => {
			if (key in obj) {
				result[key as keyof T] = obj[key as keyof T];
			}
		});
		return result;
	}

	/**
	 * Omit specific keys from object
	 */
	omit<T extends Record<string, unknown>>(obj: T, keys: string[]): Partial<T> {
		const result = { ...obj };
		keys.forEach((key) => {
			delete result[key as keyof T];
		});
		return result;
	}

	/**
	 * Merge objects deeply
	 */
	deepMerge<T extends Record<string, unknown>>(target: T, ...sources: Array<Partial<T>>): T {
		if (!sources.length) return target;

		const source = sources.shift();
		if (!source) return target;

		Object.keys(source).forEach((key) => {
			const targetValue = target[key as keyof T];
			const sourceValue = source[key as keyof T];

			if (
				typeof targetValue === 'object' &&
				targetValue !== null &&
				typeof sourceValue === 'object' &&
				sourceValue !== null
			) {
				target[key as keyof T] = this.deepMerge(
					{ ...targetValue } as Record<string, unknown>,
					sourceValue as Record<string, unknown>,
				) as T[keyof T];
			} else if (sourceValue !== undefined) {
				target[key as keyof T] = sourceValue;
			}
		});

		return this.deepMerge(target, ...sources);
	}

	// ==================== Array Transformations ====================

	/**
	 * Group array items by key
	 */
	groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
		return array.reduce(
			(result, item) => {
				const groupKey = String(item[key]);
				if (!result[groupKey]) {
					result[groupKey] = [];
				}
				result[groupKey].push(item);
				return result;
			},
			{} as Record<string, T[]>,
		);
	}

	/**
	 * Sort array by key
	 */
	sortBy<T>(array: T[], key: keyof T, order: 'asc' | 'desc' = 'asc'): T[] {
		return [...array].sort((a, b) => {
			const aVal = a[key];
			const bVal = b[key];

			if (aVal < bVal) return order === 'asc' ? -1 : 1;
			if (aVal > bVal) return order === 'asc' ? 1 : -1;
			return 0;
		});
	}

	/**
	 * Remove duplicates from array
	 */
	unique<T>(array: T[]): T[] {
		return Array.from(new Set(array));
	}

	/**
	 * Remove duplicates by key
	 */
	uniqueBy<T>(array: T[], key: keyof T): T[] {
		const seen = new Set();
		return array.filter((item) => {
			const value = item[key];
			if (seen.has(value)) {
				return false;
			}
			seen.add(value);
			return true;
		});
	}

	/**
	 * Chunk array into smaller arrays
	 */
	chunk<T>(array: T[], size: number): T[][] {
		const chunks: T[][] = [];
		for (let i = 0; i < array.length; i += size) {
			chunks.push(array.slice(i, i + size));
		}
		return chunks;
	}

	// ==================== Format Conversions ====================

	/**
	 * Convert CSV string to JSON array
	 */
	csvToJson(csv: string, options: ICsvOptions = {}): Array<Record<string, string>> {
		const {
			delimiter = ',',
			quote = '"',
			skipEmptyLines = true,
			headers = true,
			headerNames,
		} = options;

		const lines = csv.split('\n').filter((line) => !skipEmptyLines || line.trim());
		if (lines.length === 0) return [];

		const parseRow = (row: string): string[] => {
			const values: string[] = [];
			let current = '';
			let inQuote = false;

			for (let i = 0; i < row.length; i++) {
				const char = row[i];

				if (char === quote) {
					if (inQuote && row[i + 1] === quote) {
						current += quote;
						i++;
					} else {
						inQuote = !inQuote;
					}
				} else if (char === delimiter && !inQuote) {
					values.push(current.trim());
					current = '';
				} else {
					current += char;
				}
			}

			values.push(current.trim());
			return values;
		};

		const headerRow = headers ? parseRow(lines[0]) : (headerNames ?? []);
		const dataRows = lines.slice(headers ? 1 : 0);

		return dataRows.map((row) => {
			const values = parseRow(row);
			const obj: Record<string, string> = {};
			headerRow.forEach((header, i) => {
				obj[header] = values[i] ?? '';
			});
			return obj;
		});
	}

	/**
	 * Convert JSON array to CSV string
	 */
	jsonToCsv(data: Array<Record<string, unknown>>, options: IJsonToCsvOptions = {}): string {
		if (data.length === 0) return '';

		const { delimiter = ',', includeHeaders = true, headers, quoteAll = false } = options;

		const allHeaders = headers ?? Object.keys(data[0]);

		const escapeValue = (value: unknown): string => {
			const str = String(value ?? '');
			const needsQuotes =
				quoteAll || str.includes(delimiter) || str.includes('"') || str.includes('\n');

			if (needsQuotes) {
				return `"${str.replace(/"/g, '""')}"`;
			}
			return str;
		};

		const rows: string[] = [];

		if (includeHeaders) {
			rows.push(allHeaders.map(escapeValue).join(delimiter));
		}

		data.forEach((item) => {
			const values = allHeaders.map((header) => escapeValue(item[header]));
			rows.push(values.join(delimiter));
		});

		return rows.join('\n');
	}

	/**
	 * Convert XML string to JSON (simplified implementation)
	 */
	xmlToJson(xml: string, options: IXmlOptions = {}): Record<string, unknown> {
		const { trim = true } = options;

		// This is a simplified implementation
		// For production use, consider using xml2js or fast-xml-parser
		const parseNode = (xmlStr: string): Record<string, unknown> => {
			const tagRegex = /<(\w+)([^>]*)>(.*?)<\/\1>/gs;
			const result: Record<string, unknown> = {};

			let match;
			while ((match = tagRegex.exec(xmlStr)) !== null) {
				const [, tagName, , content] = match;
				const trimmedContent = trim ? content.trim() : content;

				if (trimmedContent.includes('<')) {
					result[tagName] = parseNode(trimmedContent);
				} else {
					result[tagName] = trimmedContent;
				}
			}

			return result;
		};

		return parseNode(xml);
	}

	/**
	 * Convert JSON to XML (simplified implementation)
	 */
	jsonToXml(json: Record<string, unknown>, rootTag = 'root'): string {
		const buildXml = (obj: Record<string, unknown>, indent = ''): string => {
			return Object.entries(obj)
				.map(([key, value]) => {
					if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
						return `${indent}<${key}>\n${buildXml(value as Record<string, unknown>, indent + '  ')}\n${indent}</${key}>`;
					} else if (Array.isArray(value)) {
						return value
							.map((item) => {
								if (typeof item === 'object') {
									return `${indent}<${key}>\n${buildXml(item as Record<string, unknown>, indent + '  ')}\n${indent}</${key}>`;
								}
								return `${indent}<${key}>${item}</${key}>`;
							})
							.join('\n');
					} else {
						return `${indent}<${key}>${String(value)}</${key}>`;
					}
				})
				.join('\n');
		};

		return `<?xml version="1.0" encoding="UTF-8"?>\n<${rootTag}>\n${buildXml(json, '  ')}\n</${rootTag}>`;
	}

	// ==================== Type Conversions ====================

	/**
	 * Safe JSON parse with fallback
	 */
	safeJsonParse<T = unknown>(str: string, fallback: T): T {
		try {
			return JSON.parse(str) as T;
		} catch {
			return fallback;
		}
	}

	/**
	 * Convert value to boolean
	 */
	toBoolean(value: unknown): boolean {
		if (typeof value === 'boolean') return value;
		if (typeof value === 'string') {
			const lower = value.toLowerCase().trim();
			return lower === 'true' || lower === '1' || lower === 'yes';
		}
		if (typeof value === 'number') return value !== 0;
		return Boolean(value);
	}

	/**
	 * Convert value to number with fallback
	 */
	toNumber(value: unknown, fallback = 0): number {
		const num = Number(value);
		return isNaN(num) ? fallback : num;
	}

	/**
	 * Convert bytes to human-readable string
	 */
	formatBytes(bytes: number, decimals = 2): string {
		if (bytes === 0) return '0 Bytes';

		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));

		return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
	}

	/**
	 * Parse human-readable bytes string
	 */
	parseBytes(str: string): number {
		const match = str.match(/^(\d+(?:\.\d+)?)\s*([KMGTP]?B)$/i);
		if (!match) return 0;

		const [, value, unit] = match;
		const multipliers: Record<string, number> = {
			B: 1,
			KB: 1024,
			MB: 1024 ** 2,
			GB: 1024 ** 3,
			TB: 1024 ** 4,
			PB: 1024 ** 5,
		};

		return parseFloat(value) * (multipliers[unit.toUpperCase()] ?? 1);
	}
}

/**
 * Singleton instance for convenience
 */
export const transformations = new TransformationLibrary();
