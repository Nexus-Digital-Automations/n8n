/**
 * Validation utilities for data transformation and safety
 */

import isObject from 'lodash/isObject';
import { DateTime } from 'luxon';
import {
	isString,
	isNumber,
	isBoolean,
	isArray,
	isObject as isObjectGuard,
	isValidUrl,
	isValidEmail,
	isValidUuid,
	isJSONValue,
} from './type-guards';
import type { ValidationResult, IDataObject } from './utility-types';

/**
 * Application error for validation failures
 */
export class ValidationError extends Error {
	constructor(
		message: string,
		public readonly value?: unknown,
	) {
		super(message);
		this.name = 'ValidationError';
	}
}

/**
 * Try to parse value as number with error handling
 */
export function tryToParseNumber(value: unknown): number {
	const isValidNumber = !isNaN(Number(value));

	if (!isValidNumber) {
		throw new ValidationError('Failed to parse value to number', value);
	}
	return Number(value);
}

/**
 * Try to parse value as string with error handling
 */
export function tryToParseString(value: unknown): string {
	if (typeof value === 'object') return JSON.stringify(value);
	if (typeof value === 'undefined') return '';
	if (
		typeof value === 'string' ||
		typeof value === 'bigint' ||
		typeof value === 'boolean' ||
		typeof value === 'number'
	) {
		return value.toString();
	}

	return String(value);
}

/**
 * Try to parse value as alphanumeric string
 */
export function tryToParseAlphanumericString(value: unknown): string {
	const parsed = tryToParseString(value);
	// We do not allow special characters, only letters, numbers and underscore
	// Numbers not allowed as the first character
	const regex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
	if (!regex.test(parsed)) {
		throw new ValidationError('Value is not a valid alphanumeric string', value);
	}
	return parsed;
}

/**
 * Try to parse value as boolean
 */
export function tryToParseBoolean(value: unknown): boolean {
	if (typeof value === 'boolean') {
		return value;
	}

	if (typeof value === 'string' && ['true', 'false'].includes(value.toLowerCase())) {
		return value.toLowerCase() === 'true';
	}

	// If value is not a empty string, try to parse it to a number
	if (!(typeof value === 'string' && value.trim() === '')) {
		const num = Number(value);
		if (num === 0) {
			return false;
		} else if (num === 1) {
			return true;
		}
	}

	throw new ValidationError('Failed to parse value as boolean', value);
}

/**
 * Try to parse value as DateTime
 */
export function tryToParseDateTime(value: unknown, defaultZone?: string): DateTime {
	if (DateTime.isDateTime(value) && value.isValid) {
		// Ignore the defaultZone if the value is already a DateTime
		// because DateTime objects already contain the zone information
		return value;
	}

	if (value instanceof Date) {
		const fromJSDate = DateTime.fromJSDate(value, { zone: defaultZone });
		if (fromJSDate.isValid) {
			return fromJSDate;
		}
	}

	const dateString = String(value).trim();

	// Rely on luxon to parse different date formats
	const isoDate = DateTime.fromISO(dateString, { zone: defaultZone, setZone: true });
	if (isoDate.isValid) {
		return isoDate;
	}
	const httpDate = DateTime.fromHTTP(dateString, { zone: defaultZone, setZone: true });
	if (httpDate.isValid) {
		return httpDate;
	}
	const rfc2822Date = DateTime.fromRFC2822(dateString, { zone: defaultZone, setZone: true });
	if (rfc2822Date.isValid) {
		return rfc2822Date;
	}
	const sqlDate = DateTime.fromSQL(dateString, { zone: defaultZone, setZone: true });
	if (sqlDate.isValid) {
		return sqlDate;
	}

	const parsedDateTime = DateTime.fromMillis(Date.parse(dateString), { zone: defaultZone });
	if (parsedDateTime.isValid) {
		return parsedDateTime;
	}

	throw new ValidationError('Value is not a valid date', dateString);
}

/**
 * Try to parse value as time string
 */
export function tryToParseTime(value: unknown): string {
	const isTimeInput = /^\d{2}:\d{2}(:\d{2})?((\-|\+)\d{4})?((\-|\+)\d{1,2}(:\d{2})?)?$/s.test(
		String(value),
	);
	if (!isTimeInput) {
		throw new ValidationError('Value is not a valid time', value);
	}
	return String(value);
}

/**
 * Try to parse value as array
 */
export function tryToParseArray(value: unknown): unknown[] {
	try {
		if (typeof value === 'object' && Array.isArray(value)) {
			return value;
		}

		let parsed: unknown[];
		try {
			parsed = JSON.parse(String(value)) as unknown[];
		} catch (e) {
			parsed = JSON.parse(String(value).replace(/'/g, '"')) as unknown[];
		}

		if (!Array.isArray(parsed)) {
			throw new ValidationError('Value is not a valid array', value);
		}
		return parsed;
	} catch (e) {
		throw new ValidationError('Value is not a valid array', value);
	}
}

/**
 * Try to parse value as object
 */
export function tryToParseObject(value: unknown): object {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return value;
	}
	try {
		const parsed = JSON.parse(String(value));

		if (typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new ValidationError('Value is not a valid object', value);
		}
		return parsed;
	} catch (e) {
		throw new ValidationError('Value is not a valid object', value);
	}
}

/**
 * Try to parse value as URL
 */
export function tryToParseUrl(value: unknown): string {
	if (typeof value === 'string' && !value.includes('://')) {
		value = `http://${value}`;
	}
	const urlPattern = /^(https?|ftp|file):\/\/\S+|www\.\S+/;
	if (!urlPattern.test(String(value))) {
		throw new ValidationError(`The value "${String(value)}" is not a valid url.`, value);
	}
	return String(value);
}

/**
 * Try to parse value as JWT token
 */
export function tryToParseJwt(value: unknown): string {
	const error = new ValidationError(
		`The value "${String(value)}" is not a valid JWT token.`,
		value,
	);

	if (!value) throw error;

	const jwtPattern = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*$/;

	if (!jwtPattern.test(String(value))) throw error;

	return String(value);
}

/**
 * Get value description for error messages
 */
export function getValueDescription<T>(value: T): string {
	if (typeof value === 'object') {
		if (value === null) return "'null'";
		if (Array.isArray(value)) return 'array';
		return 'object';
	}

	return `'${String(value)}'`;
}

/**
 * Validate field type with comprehensive type checking
 */
export function validateFieldType<T>(
	fieldName: string,
	value: unknown,
	validator: (val: unknown) => val is T,
	options: { strict?: boolean; parseStrings?: boolean } = {},
): ValidationResult<T> {
	if (value === null || value === undefined) {
		return { valid: true, value: undefined as any };
	}

	const { strict = false } = options;

	if (validator(value)) {
		return { valid: true, value };
	}

	const defaultErrorMessage = `'${fieldName}' has invalid type: expected valid type but got ${getValueDescription(value)}`;

	if (strict) {
		return { valid: false, errors: [defaultErrorMessage] };
	}

	// Try to coerce the value if not in strict mode
	try {
		if (isString(value)) {
			// Try parsing string values
			if (validator === (isNumber as any)) {
				const parsed = tryToParseNumber(value);
				return { valid: true, value: parsed as T };
			}
			if (validator === (isBoolean as any)) {
				const parsed = tryToParseBoolean(value);
				return { valid: true, value: parsed as T };
			}
			if (validator === (isArray as any)) {
				const parsed = tryToParseArray(value);
				return { valid: true, value: parsed as T };
			}
			if (validator === (isObjectGuard as any)) {
				const parsed = tryToParseObject(value);
				return { valid: true, value: parsed as T };
			}
		}

		return { valid: false, errors: [defaultErrorMessage] };
	} catch (error) {
		const errorMessage = error instanceof ValidationError ? error.message : defaultErrorMessage;
		return { valid: false, errors: [errorMessage] };
	}
}

/**
 * Validate that value is a valid JSON value
 */
export function validateJson(value: unknown): ValidationResult<any> {
	if (isJSONValue(value)) {
		return { valid: true, value };
	}

	try {
		const parsed = JSON.parse(JSON.stringify(value));
		return { valid: true, value: parsed };
	} catch {
		return {
			valid: false,
			errors: ['Value is not JSON serializable'],
		};
	}
}

/**
 * Validate object has required properties
 */
export function validateRequiredProperties<T extends Record<string, unknown>>(
	obj: unknown,
	requiredProperties: (keyof T)[],
): ValidationResult<T> {
	if (!isObjectGuard(obj)) {
		return {
			valid: false,
			errors: ['Value must be an object'],
		};
	}

	const missingProperties = requiredProperties.filter((prop) => !(prop in obj));

	if (missingProperties.length > 0) {
		return {
			valid: false,
			errors: [`Missing required properties: ${missingProperties.join(', ')}`],
		};
	}

	return { valid: true, value: obj as T };
}

/**
 * Create a validator that checks multiple conditions
 */
export function createValidator<T>(
	...validators: Array<(value: unknown) => ValidationResult<T>>
): (value: unknown) => ValidationResult<T> {
	return (value: unknown): ValidationResult<T> => {
		const errors: string[] = [];

		for (const validator of validators) {
			const result = validator(value);
			if (result.valid) {
				return result;
			}
			errors.push(...result.errors);
		}

		return { valid: false, errors };
	};
}

/**
 * Validate array items with a validator
 */
export function validateArrayItems<T>(
	value: unknown,
	itemValidator: (item: unknown) => ValidationResult<T>,
): ValidationResult<T[]> {
	if (!isArray(value)) {
		return {
			valid: false,
			errors: ['Value must be an array'],
		};
	}

	const results: T[] = [];
	const errors: string[] = [];

	value.forEach((item, index) => {
		const result = itemValidator(item);
		if (result.valid) {
			results.push(result.value);
		} else {
			errors.push(`Item at index ${index}: ${result.errors.join(', ')}`);
		}
	});

	if (errors.length > 0) {
		return { valid: false, errors };
	}

	return { valid: true, value: results };
}

/**
 * Safe property getter with validation
 */
export function getSafeProperty<T>(
	obj: unknown,
	property: string | number,
	validator: (value: unknown) => value is T,
): ValidationResult<T> {
	if (!isObjectGuard(obj) && !isArray(obj)) {
		return {
			valid: false,
			errors: ['Target must be an object or array'],
		};
	}

	const value = (obj as any)[property];

	if (validator(value)) {
		return { valid: true, value };
	}

	return {
		valid: false,
		errors: [`Property '${property}' has invalid type`],
	};
}
