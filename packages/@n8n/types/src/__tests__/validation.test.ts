/**
 * Tests for validation utilities
 */

import { DateTime } from 'luxon';

import { isString, isNumber } from '../type-guards';
import {
	ValidationError,
	tryToParseNumber,
	tryToParseString,
	tryToParseAlphanumericString,
	tryToParseBoolean,
	tryToParseDateTime,
	tryToParseTime,
	tryToParseArray,
	tryToParseObject,
	tryToParseUrl,
	tryToParseJwt,
	getValueDescription,
	validateFieldType,
	validateJson,
	validateRequiredProperties,
	createValidator,
	validateArrayItems,
	getSafeProperty,
} from '../validation';

describe('ValidationError', () => {
	it('should create error with message and value', () => {
		const error = new ValidationError('Test error', 'test value');
		expect(error.message).toBe('Test error');
		expect(error.name).toBe('ValidationError');
		expect(error.value).toBe('test value');
	});

	it('should be instance of Error', () => {
		const error = new ValidationError('Test error');
		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(ValidationError);
	});
});

describe('Parse Functions', () => {
	describe('tryToParseNumber', () => {
		it('should parse valid numbers', () => {
			expect(tryToParseNumber('123')).toBe(123);
			expect(tryToParseNumber(456)).toBe(456);
			expect(tryToParseNumber('3.14')).toBe(3.14);
			expect(tryToParseNumber('-42')).toBe(-42);
		});

		it('should throw ValidationError for invalid numbers', () => {
			expect(() => tryToParseNumber('abc')).toThrow(ValidationError);
			expect(() => tryToParseNumber('12abc')).toThrow(ValidationError);
			expect(() => tryToParseNumber({})).toThrow(ValidationError);
		});
	});

	describe('tryToParseString', () => {
		it('should convert values to strings', () => {
			expect(tryToParseString('hello')).toBe('hello');
			expect(tryToParseString(123)).toBe('123');
			expect(tryToParseString(true)).toBe('true');
			expect(tryToParseString(false)).toBe('false');
		});

		it('should handle special cases', () => {
			expect(tryToParseString(undefined)).toBe('');
			expect(tryToParseString({ key: 'value' })).toBe('{"key":"value"}');
			expect(tryToParseString([1, 2, 3])).toBe('[1,2,3]');
		});
	});

	describe('tryToParseAlphanumericString', () => {
		it('should accept valid alphanumeric strings', () => {
			expect(tryToParseAlphanumericString('test123')).toBe('test123');
			expect(tryToParseAlphanumericString('validName_123')).toBe('validName_123');
			expect(tryToParseAlphanumericString('_underscore')).toBe('_underscore');
		});

		it('should reject invalid alphanumeric strings', () => {
			expect(() => tryToParseAlphanumericString('123invalid')).toThrow(ValidationError);
			expect(() => tryToParseAlphanumericString('invalid-name')).toThrow(ValidationError);
			expect(() => tryToParseAlphanumericString('invalid name')).toThrow(ValidationError);
		});
	});

	describe('tryToParseBoolean', () => {
		it('should parse boolean values', () => {
			expect(tryToParseBoolean(true)).toBe(true);
			expect(tryToParseBoolean(false)).toBe(false);
		});

		it('should parse boolean strings', () => {
			expect(tryToParseBoolean('true')).toBe(true);
			expect(tryToParseBoolean('True')).toBe(true);
			expect(tryToParseBoolean('FALSE')).toBe(false);
		});

		it('should parse numeric values', () => {
			expect(tryToParseBoolean(1)).toBe(true);
			expect(tryToParseBoolean(0)).toBe(false);
			expect(tryToParseBoolean('1')).toBe(true);
			expect(tryToParseBoolean('0')).toBe(false);
		});

		it('should throw ValidationError for invalid values', () => {
			expect(() => tryToParseBoolean('maybe')).toThrow(ValidationError);
			expect(() => tryToParseBoolean(2)).toThrow(ValidationError);
			expect(() => tryToParseBoolean({})).toThrow(ValidationError);
		});
	});

	describe('tryToParseDateTime', () => {
		it('should parse DateTime objects', () => {
			const dt = DateTime.now();
			expect(tryToParseDateTime(dt)).toBe(dt);
		});

		it('should parse Date objects', () => {
			const date = new Date('2023-01-01');
			const result = tryToParseDateTime(date);
			expect(DateTime.isDateTime(result)).toBe(true);
			expect(result.isValid).toBe(true);
		});

		it('should parse ISO strings', () => {
			const result = tryToParseDateTime('2023-01-01T00:00:00.000Z');
			expect(DateTime.isDateTime(result)).toBe(true);
			expect(result.isValid).toBe(true);
		});

		it('should throw ValidationError for invalid dates', () => {
			expect(() => tryToParseDateTime('invalid-date')).toThrow(ValidationError);
			expect(() => tryToParseDateTime('not a date')).toThrow(ValidationError);
		});
	});

	describe('tryToParseTime', () => {
		it('should parse valid time strings', () => {
			expect(tryToParseTime('14:30')).toBe('14:30');
			expect(tryToParseTime('09:15:30')).toBe('09:15:30');
			expect(tryToParseTime('12:00:00+0200')).toBe('12:00:00+0200');
		});

		it('should throw ValidationError for invalid time strings', () => {
			expect(() => tryToParseTime('invalid-time')).toThrow(ValidationError);
			expect(() => tryToParseTime('25:00')).toThrow(ValidationError);
		});
	});

	describe('tryToParseArray', () => {
		it('should return arrays as-is', () => {
			const arr = [1, 2, 3];
			expect(tryToParseArray(arr)).toBe(arr);
		});

		it('should parse JSON array strings', () => {
			expect(tryToParseArray('[1,2,3]')).toEqual([1, 2, 3]);
			expect(tryToParseArray('["a","b"]')).toEqual(['a', 'b']);
		});

		it('should handle single quotes', () => {
			expect(tryToParseArray("['a','b']")).toEqual(['a', 'b']);
		});

		it('should throw ValidationError for invalid arrays', () => {
			expect(() => tryToParseArray('not an array')).toThrow(ValidationError);
			expect(() => tryToParseArray('{}')).toThrow(ValidationError);
		});
	});

	describe('tryToParseObject', () => {
		it('should return objects as-is', () => {
			const obj = { key: 'value' };
			expect(tryToParseObject(obj)).toBe(obj);
		});

		it('should parse JSON object strings', () => {
			expect(tryToParseObject('{"key":"value"}')).toEqual({ key: 'value' });
		});

		it('should throw ValidationError for invalid objects', () => {
			expect(() => tryToParseObject('not an object')).toThrow(ValidationError);
			expect(() => tryToParseObject('[]')).toThrow(ValidationError);
		});
	});

	describe('tryToParseUrl', () => {
		it('should parse valid URLs', () => {
			expect(tryToParseUrl('https://example.com')).toBe('https://example.com');
			expect(tryToParseUrl('http://localhost:3000')).toBe('http://localhost:3000');
		});

		it('should add http prefix for URLs without protocol', () => {
			expect(tryToParseUrl('example.com')).toBe('http://example.com');
			expect(tryToParseUrl('www.example.com')).toBe('http://www.example.com');
		});

		it('should throw ValidationError for invalid URLs', () => {
			expect(() => tryToParseUrl('not-a-url')).toThrow(ValidationError);
			expect(() => tryToParseUrl('')).toThrow(ValidationError);
		});
	});

	describe('tryToParseJwt', () => {
		it('should parse valid JWT tokens', () => {
			const validJwt =
				'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
			expect(tryToParseJwt(validJwt)).toBe(validJwt);
		});

		it('should throw ValidationError for invalid JWTs', () => {
			expect(() => tryToParseJwt('invalid.jwt')).toThrow(ValidationError);
			expect(() => tryToParseJwt('not-a-jwt')).toThrow(ValidationError);
			expect(() => tryToParseJwt('')).toThrow(ValidationError);
		});
	});
});

describe('Utility Functions', () => {
	describe('getValueDescription', () => {
		it('should describe different value types', () => {
			expect(getValueDescription('hello')).toBe("'hello'");
			expect(getValueDescription(123)).toBe("'123'");
			expect(getValueDescription(null)).toBe("'null'");
			expect(getValueDescription([])).toBe('array');
			expect(getValueDescription({})).toBe('object');
		});
	});
});

describe('Validation Functions', () => {
	describe('validateFieldType', () => {
		it('should validate correct types', () => {
			const result = validateFieldType('test', 'hello', isString);
			expect(result.valid).toBe(true);
			expect(result.value).toBe('hello');
		});

		it('should return errors for incorrect types', () => {
			const result = validateFieldType('test', 123, isString);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain("'test' has invalid type: expected valid type but got '123'");
		});

		it('should handle null and undefined', () => {
			const result1 = validateFieldType('test', null, isString);
			expect(result1.valid).toBe(true);
			expect(result1.value).toBeUndefined();

			const result2 = validateFieldType('test', undefined, isString);
			expect(result2.valid).toBe(true);
			expect(result2.value).toBeUndefined();
		});

		it('should coerce values in non-strict mode', () => {
			const result = validateFieldType('age', '25', isNumber);
			expect(result.valid).toBe(true);
			expect(result.value).toBe(25);
		});

		it('should not coerce values in strict mode', () => {
			const result = validateFieldType('age', '25', isNumber, { strict: true });
			expect(result.valid).toBe(false);
			expect(result.errors).toBeDefined();
		});
	});

	describe('validateJson', () => {
		it('should validate JSON values', () => {
			expect(validateJson('string').valid).toBe(true);
			expect(validateJson(123).valid).toBe(true);
			expect(validateJson({ key: 'value' }).valid).toBe(true);
			expect(validateJson([1, 2, 3]).valid).toBe(true);
		});

		it('should handle non-JSON values', () => {
			const result = validateJson(undefined);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Value is not JSON serializable');
		});
	});

	describe('validateRequiredProperties', () => {
		it('should validate objects with required properties', () => {
			const obj = { name: 'test', age: 25 };
			const result = validateRequiredProperties(obj, ['name', 'age']);
			expect(result.valid).toBe(true);
			expect(result.value).toBe(obj);
		});

		it('should fail for missing properties', () => {
			const obj = { name: 'test' };
			const result = validateRequiredProperties(obj, ['name', 'age']);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Missing required properties: age');
		});

		it('should fail for non-objects', () => {
			const result = validateRequiredProperties('not an object', ['name']);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Value must be an object');
		});
	});

	describe('createValidator', () => {
		it('should create composite validator', () => {
			const validator = createValidator(
				(value: unknown) =>
					isString(value) ? { valid: true, value } : { valid: false, errors: ['Not a string'] },
				(value: unknown) =>
					(value as string).length > 0
						? { valid: true, value }
						: { valid: false, errors: ['Empty string'] },
			);

			expect(validator('hello').valid).toBe(true);
			expect(validator('').valid).toBe(false);
			expect(validator(123).valid).toBe(false);
		});
	});

	describe('validateArrayItems', () => {
		it('should validate array items', () => {
			const validator = (
				item: unknown,
			): { valid: true; value: string } | { valid: false; errors: string[] } =>
				isString(item)
					? { valid: true as const, value: item }
					: { valid: false as const, errors: ['Not a string'] };

			const result = validateArrayItems(['a', 'b', 'c'], validator);
			expect(result.valid).toBe(true);
			if (result.valid) {
				expect(result.value).toEqual(['a', 'b', 'c']);
			}
		});

		it('should fail for invalid items', () => {
			const validator = (
				item: unknown,
			): { valid: true; value: string } | { valid: false; errors: string[] } =>
				isString(item)
					? { valid: true as const, value: item }
					: { valid: false as const, errors: ['Not a string'] };

			const result = validateArrayItems(['a', 123, 'c'], validator);
			expect(result.valid).toBe(false);
			if (!result.valid) {
				expect(result.errors).toContain('Item at index 1: Not a string');
			}
		});

		it('should fail for non-arrays', () => {
			const validator = (
				item: unknown,
			): { valid: true; value: unknown } | { valid: false; errors: string[] } => ({
				valid: true as const,
				value: item,
			});
			const result = validateArrayItems('not an array', validator);
			expect(result.valid).toBe(false);
			if (!result.valid) {
				expect(result.errors).toContain('Value must be an array');
			}
		});
	});

	describe('getSafeProperty', () => {
		it('should get valid properties', () => {
			const obj = { name: 'test', age: 25 };
			const result = getSafeProperty(obj, 'name', isString);
			expect(result.valid).toBe(true);
			expect(result.value).toBe('test');
		});

		it('should fail for properties with wrong type', () => {
			const obj = { name: 'test', age: 25 };
			const result = getSafeProperty(obj, 'age', isString);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain("Property 'age' has invalid type");
		});

		it('should work with arrays', () => {
			const arr = ['a', 'b', 'c'];
			const result = getSafeProperty(arr, 1, isString);
			expect(result.valid).toBe(true);
			expect(result.value).toBe('b');
		});

		it('should fail for non-objects/arrays', () => {
			const result = getSafeProperty('string', 0, isString);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Target must be an object or array');
		});
	});
});
