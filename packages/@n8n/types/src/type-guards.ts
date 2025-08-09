/**
 * Type guard utilities for safe type checking and data access
 */

import type { IDataObject, JSONValue, JSONObject, JSONArray } from './utility-types';

/**
 * Check if value is a string
 */
export function isString(value: unknown): value is string {
	return typeof value === 'string';
}

/**
 * Check if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
	return isString(value) && value.trim().length > 0;
}

/**
 * Check if value is a number
 */
export function isNumber(value: unknown): value is number {
	return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Check if value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
	return typeof value === 'boolean';
}

/**
 * Check if value is null
 */
export function isNull(value: unknown): value is null {
	return value === null;
}

/**
 * Check if value is undefined
 */
export function isUndefined(value: unknown): value is undefined {
	return value === undefined;
}

/**
 * Check if value is null or undefined
 */
export function isNullOrUndefined(value: unknown): value is null | undefined {
	return value === null || value === undefined;
}

/**
 * Check if value is not null or undefined
 */
export function isNotNullOrUndefined<T>(value: T | null | undefined): value is T {
	return value !== null && value !== undefined;
}

/**
 * Check if value is an object (not null, not array)
 */
export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if value is a plain object (not class instance, not array, not null)
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (!isObject(value)) {
		return false;
	}

	// Check if it's a plain object by examining its prototype
	const proto = Object.getPrototypeOf(value) as unknown;
	return proto === null || proto === Object.prototype;
}

/**
 * Check if value is an array
 */
export function isArray(value: unknown): value is unknown[] {
	return Array.isArray(value);
}

/**
 * Check if value is a non-empty array
 */
export function isNonEmptyArray<T>(value: T[]): value is [T, ...T[]];
export function isNonEmptyArray(value: unknown): value is [unknown, ...unknown[]];
export function isNonEmptyArray(value: unknown): value is [unknown, ...unknown[]] {
	return isArray(value) && value.length > 0;
}

/**
 * Check if value is a function
 */
export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
	return typeof value === 'function';
}

/**
 * Check if value is a Date object
 */
export function isDate(value: unknown): value is Date {
	return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Check if value is a valid JSON value
 */
export function isJSONValue(value: unknown): value is JSONValue {
	if (isString(value) || isNumber(value) || isBoolean(value) || isNull(value)) {
		return true;
	}

	if (isArray(value)) {
		return value.every(isJSONValue);
	}

	if (isPlainObject(value)) {
		return Object.values(value).every(isJSONValue);
	}

	return false;
}

/**
 * Check if value is a JSON object
 */
export function isJSONObject(value: unknown): value is JSONObject {
	return isPlainObject(value) && Object.values(value).every(isJSONValue);
}

/**
 * Check if value is a JSON array
 */
export function isJSONArray(value: unknown): value is JSONArray {
	return isArray(value) && value.every(isJSONValue);
}

/**
 * Check if value is an IDataObject (n8n data object)
 */
export function isDataObject(value: unknown): value is IDataObject {
	return isJSONObject(value);
}

/**
 * Check if value has a specific property
 */
export function hasProperty<T extends PropertyKey>(
	value: unknown,
	property: T,
): value is Record<T, unknown> {
	return isObject(value) && property in value;
}

/**
 * Check if value has a property with a specific type
 */
export function hasPropertyOfType<T extends PropertyKey, V>(
	value: unknown,
	property: T,
	typeGuard: (val: unknown) => val is V,
): value is Record<T, V> {
	return hasProperty(value, property) && typeGuard(value[property]);
}

/**
 * Check if value is a string that represents a valid number
 */
export function isNumericString(value: unknown): value is string {
	return isString(value) && value.trim() !== '' && !isNaN(Number(value)) && isFinite(Number(value));
}

/**
 * Check if value is a string that represents a valid integer
 */
export function isIntegerString(value: unknown): value is string {
	return isNumericString(value) && Number.isInteger(Number(value));
}

/**
 * Check if value is a valid URL string
 */
export function isValidUrl(value: unknown): value is string {
	if (!isString(value)) {
		return false;
	}

	try {
		new URL(value);
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if value is a valid email string
 */
export function isValidEmail(value: unknown): value is string {
	if (!isString(value)) {
		return false;
	}

	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(value);
}

/**
 * Check if value is a valid UUID string
 */
export function isValidUuid(value: unknown): value is string {
	if (!isString(value)) {
		return false;
	}

	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	return uuidRegex.test(value);
}

/**
 * Check if value is a Promise
 */
export function isPromise<T = unknown>(value: unknown): value is Promise<T> {
	return (
		isObject(value) &&
		hasProperty(value, 'then') &&
		isFunction(value.then) &&
		hasProperty(value, 'catch') &&
		isFunction(value.catch)
	);
}

/**
 * Check if value is an Error object
 */
export function isError(value: unknown): value is Error {
	return value instanceof Error;
}

/**
 * Check if all values in array satisfy the type guard
 */
export function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
	return isArray(value) && value.every(guard);
}

/**
 * Check if value is an object with all values satisfying the type guard
 */
export function isRecordOf<T>(
	value: unknown,
	guard: (item: unknown) => item is T,
): value is Record<string, T> {
	return isObject(value) && Object.values(value).every(guard);
}

/**
 * Create a type guard that checks for specific enum values
 */
export function isEnumValue<T extends Record<string, string | number>>(
	enumObject: T,
): (value: unknown) => value is T[keyof T] {
	const enumValues = Object.values(enumObject);
	return (value: unknown): value is T[keyof T] => enumValues.includes(value as string | number);
}

/**
 * Narrow an unknown type to T if it passes all provided guards
 */
export function satisfiesAll<T>(
	value: unknown,
	...guards: Array<(val: unknown) => boolean>
): value is T {
	return guards.every((guard) => guard(value));
}

/**
 * Check if value satisfies at least one of the provided guards
 */
export function satisfiesAny<T>(
	value: unknown,
	...guards: Array<(val: unknown) => val is T>
): value is T {
	return guards.some((guard) => guard(value));
}
