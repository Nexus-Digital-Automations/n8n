/**
 * Tests for type guard utilities
 */

import {
	isString,
	isNonEmptyString,
	isNumber,
	isBoolean,
	isNull,
	isUndefined,
	isNullOrUndefined,
	isNotNullOrUndefined,
	isObject,
	isPlainObject,
	isArray,
	isNonEmptyArray,
	isFunction,
	isDate,
	isJSONValue,
	isJSONObject,
	isJSONArray,
	hasProperty,
	hasPropertyOfType,
	isNumericString,
	isIntegerString,
	isValidUrl,
	isValidEmail,
	isValidUuid,
	isPromise,
	isError,
	isArrayOf,
	isEnumValue,
	satisfiesAll,
	satisfiesAny,
} from '../type-guards';

describe('Basic Type Guards', () => {
	describe('isString', () => {
		it('should return true for strings', () => {
			expect(isString('')).toBe(true);
			expect(isString('hello')).toBe(true);
			expect(isString('123')).toBe(true);
		});

		it('should return false for non-strings', () => {
			expect(isString(123)).toBe(false);
			expect(isString(true)).toBe(false);
			expect(isString(null)).toBe(false);
			expect(isString(undefined)).toBe(false);
			expect(isString({})).toBe(false);
			expect(isString([])).toBe(false);
		});
	});

	describe('isNonEmptyString', () => {
		it('should return true for non-empty strings', () => {
			expect(isNonEmptyString('hello')).toBe(true);
			expect(isNonEmptyString('a')).toBe(true);
			expect(isNonEmptyString('  text  ')).toBe(true);
		});

		it('should return false for empty or whitespace strings', () => {
			expect(isNonEmptyString('')).toBe(false);
			expect(isNonEmptyString('   ')).toBe(false);
			expect(isNonEmptyString('\t\n')).toBe(false);
		});

		it('should return false for non-strings', () => {
			expect(isNonEmptyString(123)).toBe(false);
			expect(isNonEmptyString(null)).toBe(false);
		});
	});

	describe('isNumber', () => {
		it('should return true for valid numbers', () => {
			expect(isNumber(0)).toBe(true);
			expect(isNumber(123)).toBe(true);
			expect(isNumber(-456)).toBe(true);
			expect(isNumber(3.14)).toBe(true);
		});

		it('should return false for invalid numbers', () => {
			expect(isNumber(NaN)).toBe(false);
			expect(isNumber(Infinity)).toBe(false);
			expect(isNumber(-Infinity)).toBe(false);
			expect(isNumber('123')).toBe(false);
			expect(isNumber(null)).toBe(false);
		});
	});

	describe('isBoolean', () => {
		it('should return true for booleans', () => {
			expect(isBoolean(true)).toBe(true);
			expect(isBoolean(false)).toBe(true);
		});

		it('should return false for non-booleans', () => {
			expect(isBoolean('true')).toBe(false);
			expect(isBoolean(1)).toBe(false);
			expect(isBoolean(0)).toBe(false);
			expect(isBoolean(null)).toBe(false);
		});
	});
});

describe('Null/Undefined Guards', () => {
	describe('isNull', () => {
		it('should return true for null', () => {
			expect(isNull(null)).toBe(true);
		});

		it('should return false for non-null values', () => {
			expect(isNull(undefined)).toBe(false);
			expect(isNull(0)).toBe(false);
			expect(isNull('')).toBe(false);
			expect(isNull(false)).toBe(false);
		});
	});

	describe('isUndefined', () => {
		it('should return true for undefined', () => {
			expect(isUndefined(undefined)).toBe(true);
		});

		it('should return false for non-undefined values', () => {
			expect(isUndefined(null)).toBe(false);
			expect(isUndefined(0)).toBe(false);
			expect(isUndefined('')).toBe(false);
		});
	});

	describe('isNullOrUndefined', () => {
		it('should return true for null or undefined', () => {
			expect(isNullOrUndefined(null)).toBe(true);
			expect(isNullOrUndefined(undefined)).toBe(true);
		});

		it('should return false for other values', () => {
			expect(isNullOrUndefined(0)).toBe(false);
			expect(isNullOrUndefined('')).toBe(false);
			expect(isNullOrUndefined(false)).toBe(false);
		});
	});

	describe('isNotNullOrUndefined', () => {
		it('should return false for null or undefined', () => {
			expect(isNotNullOrUndefined(null)).toBe(false);
			expect(isNotNullOrUndefined(undefined)).toBe(false);
		});

		it('should return true for other values', () => {
			expect(isNotNullOrUndefined(0)).toBe(true);
			expect(isNotNullOrUndefined('')).toBe(true);
			expect(isNotNullOrUndefined(false)).toBe(true);
			expect(isNotNullOrUndefined({})).toBe(true);
		});
	});
});

describe('Object and Array Guards', () => {
	describe('isObject', () => {
		it('should return true for plain objects', () => {
			expect(isObject({})).toBe(true);
			expect(isObject({ key: 'value' })).toBe(true);
		});

		it('should return false for null, arrays, and primitives', () => {
			expect(isObject(null)).toBe(false);
			expect(isObject([])).toBe(false);
			expect(isObject('string')).toBe(false);
			expect(isObject(123)).toBe(false);
		});
	});

	describe('isPlainObject', () => {
		it('should return true for plain objects', () => {
			expect(isPlainObject({})).toBe(true);
			expect(isPlainObject({ key: 'value' })).toBe(true);
			expect(isPlainObject(Object.create(null))).toBe(true);
		});

		it('should return false for class instances', () => {
			class TestClass {}
			expect(isPlainObject(new TestClass())).toBe(false);
			expect(isPlainObject(new Date())).toBe(false);
			expect(isPlainObject(new Error())).toBe(false);
		});
	});

	describe('isArray', () => {
		it('should return true for arrays', () => {
			expect(isArray([])).toBe(true);
			expect(isArray([1, 2, 3])).toBe(true);
			expect(isArray(['a', 'b'])).toBe(true);
		});

		it('should return false for non-arrays', () => {
			expect(isArray({})).toBe(false);
			expect(isArray('string')).toBe(false);
			expect(isArray(null)).toBe(false);
		});
	});

	describe('isNonEmptyArray', () => {
		it('should return true for non-empty arrays', () => {
			expect(isNonEmptyArray([1])).toBe(true);
			expect(isNonEmptyArray([1, 2, 3])).toBe(true);
		});

		it('should return false for empty arrays', () => {
			expect(isNonEmptyArray([])).toBe(false);
		});

		it('should return false for non-arrays', () => {
			expect(isNonEmptyArray('string')).toBe(false);
			expect(isNonEmptyArray({})).toBe(false);
		});
	});
});

describe('Function and Date Guards', () => {
	describe('isFunction', () => {
		it('should return true for functions', () => {
			expect(isFunction(() => {})).toBe(true);
			expect(isFunction(function () {})).toBe(true);
			expect(isFunction(Date.now)).toBe(true);
		});

		it('should return false for non-functions', () => {
			expect(isFunction({})).toBe(false);
			expect(isFunction('string')).toBe(false);
			expect(isFunction(null)).toBe(false);
		});
	});

	describe('isDate', () => {
		it('should return true for valid dates', () => {
			expect(isDate(new Date())).toBe(true);
			expect(isDate(new Date('2023-01-01'))).toBe(true);
		});

		it('should return false for invalid dates', () => {
			expect(isDate(new Date('invalid'))).toBe(false);
			expect(isDate('2023-01-01')).toBe(false);
			expect(isDate(123456789)).toBe(false);
		});
	});
});

describe('JSON Value Guards', () => {
	describe('isJSONValue', () => {
		it('should return true for JSON-serializable values', () => {
			expect(isJSONValue('string')).toBe(true);
			expect(isJSONValue(123)).toBe(true);
			expect(isJSONValue(true)).toBe(true);
			expect(isJSONValue(null)).toBe(true);
			expect(isJSONValue([])).toBe(true);
			expect(isJSONValue([1, 'two', true])).toBe(true);
			expect(isJSONValue({})).toBe(true);
			expect(isJSONValue({ key: 'value', num: 42 })).toBe(true);
		});

		it('should return false for non-JSON values', () => {
			expect(isJSONValue(undefined)).toBe(false);
			expect(isJSONValue(() => {})).toBe(false);
			expect(isJSONValue(Symbol('test'))).toBe(false);
			expect(isJSONValue(new Date())).toBe(false);
		});
	});

	describe('isJSONObject', () => {
		it('should return true for JSON objects', () => {
			expect(isJSONObject({})).toBe(true);
			expect(isJSONObject({ key: 'value', num: 42, bool: true })).toBe(true);
		});

		it('should return false for non-JSON objects', () => {
			expect(isJSONObject([])).toBe(false);
			expect(isJSONObject({ func: () => {} })).toBe(false);
			expect(isJSONObject('string')).toBe(false);
		});
	});

	describe('isJSONArray', () => {
		it('should return true for JSON arrays', () => {
			expect(isJSONArray([])).toBe(true);
			expect(isJSONArray([1, 'two', true, null])).toBe(true);
		});

		it('should return false for non-JSON arrays', () => {
			expect(isJSONArray([() => {}])).toBe(false);
			expect(isJSONArray({})).toBe(false);
			expect(isJSONArray('string')).toBe(false);
		});
	});
});

describe('Property Guards', () => {
	describe('hasProperty', () => {
		it('should return true when property exists', () => {
			const obj = { name: 'test', age: 25 };
			expect(hasProperty(obj, 'name')).toBe(true);
			expect(hasProperty(obj, 'age')).toBe(true);
		});

		it('should return false when property does not exist', () => {
			const obj = { name: 'test' };
			expect(hasProperty(obj, 'age')).toBe(false);
			expect(hasProperty(obj, 'missing')).toBe(false);
		});

		it('should return false for non-objects', () => {
			expect(hasProperty('string', 'length')).toBe(false);
			expect(hasProperty(null, 'prop')).toBe(false);
		});
	});

	describe('hasPropertyOfType', () => {
		it('should return true when property exists and has correct type', () => {
			const obj = { name: 'test', age: 25 };
			expect(hasPropertyOfType(obj, 'name', isString)).toBe(true);
			expect(hasPropertyOfType(obj, 'age', isNumber)).toBe(true);
		});

		it('should return false when property has wrong type', () => {
			const obj = { name: 'test', age: 25 };
			expect(hasPropertyOfType(obj, 'name', isNumber)).toBe(false);
			expect(hasPropertyOfType(obj, 'age', isString)).toBe(false);
		});
	});
});

describe('String Validation Guards', () => {
	describe('isNumericString', () => {
		it('should return true for numeric strings', () => {
			expect(isNumericString('123')).toBe(true);
			expect(isNumericString('0')).toBe(true);
			expect(isNumericString('-456')).toBe(true);
			expect(isNumericString('3.14')).toBe(true);
		});

		it('should return false for non-numeric strings', () => {
			expect(isNumericString('abc')).toBe(false);
			expect(isNumericString('12abc')).toBe(false);
			expect(isNumericString('')).toBe(false);
		});
	});

	describe('isIntegerString', () => {
		it('should return true for integer strings', () => {
			expect(isIntegerString('123')).toBe(true);
			expect(isIntegerString('0')).toBe(true);
			expect(isIntegerString('-456')).toBe(true);
		});

		it('should return false for non-integer strings', () => {
			expect(isIntegerString('3.14')).toBe(false);
			expect(isIntegerString('abc')).toBe(false);
		});
	});

	describe('isValidUrl', () => {
		it('should return true for valid URLs', () => {
			expect(isValidUrl('https://example.com')).toBe(true);
			expect(isValidUrl('http://localhost:3000')).toBe(true);
			expect(isValidUrl('ftp://files.example.com')).toBe(true);
		});

		it('should return false for invalid URLs', () => {
			expect(isValidUrl('not-a-url')).toBe(false);
			expect(isValidUrl('http://')).toBe(false);
			expect(isValidUrl('')).toBe(false);
		});
	});

	describe('isValidEmail', () => {
		it('should return true for valid emails', () => {
			expect(isValidEmail('test@example.com')).toBe(true);
			expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
		});

		it('should return false for invalid emails', () => {
			expect(isValidEmail('invalid-email')).toBe(false);
			expect(isValidEmail('@domain.com')).toBe(false);
			expect(isValidEmail('user@')).toBe(false);
		});
	});

	describe('isValidUuid', () => {
		it('should return true for valid UUIDs', () => {
			expect(isValidUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
			expect(isValidUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
		});

		it('should return false for invalid UUIDs', () => {
			expect(isValidUuid('not-a-uuid')).toBe(false);
			expect(isValidUuid('123e4567-e89b-12d3-a456')).toBe(false);
		});
	});
});

describe('Advanced Guards', () => {
	describe('isPromise', () => {
		it('should return true for promises', () => {
			expect(isPromise(Promise.resolve())).toBe(true);
			expect(isPromise(new Promise(() => {}))).toBe(true);
		});

		it('should return false for non-promises', () => {
			expect(isPromise({})).toBe(false);
			expect(isPromise({ then: 'not a function' })).toBe(false);
		});
	});

	describe('isError', () => {
		it('should return true for Error objects', () => {
			expect(isError(new Error())).toBe(true);
			expect(isError(new TypeError())).toBe(true);
		});

		it('should return false for non-Error objects', () => {
			expect(isError({ message: 'error' })).toBe(false);
			expect(isError('error string')).toBe(false);
		});
	});

	describe('isArrayOf', () => {
		it('should return true when all items match the guard', () => {
			expect(isArrayOf(['a', 'b', 'c'], isString)).toBe(true);
			expect(isArrayOf([1, 2, 3], isNumber)).toBe(true);
			expect(isArrayOf([], isString)).toBe(true);
		});

		it('should return false when some items do not match', () => {
			expect(isArrayOf(['a', 1, 'c'], isString)).toBe(false);
			expect(isArrayOf([1, 'b', 3], isNumber)).toBe(false);
		});
	});

	describe('isEnumValue', () => {
		const testEnumObject = {
			value1: 'value1',
			value2: 'value2',
		} as const;

		const isTestEnumValue = isEnumValue(testEnumObject);

		it('should return true for valid enum values', () => {
			expect(isTestEnumValue('value1')).toBe(true);
			expect(isTestEnumValue('value2')).toBe(true);
		});

		it('should return false for invalid enum values', () => {
			expect(isTestEnumValue('invalid')).toBe(false);
			expect(isTestEnumValue(123)).toBe(false);
		});
	});

	describe('satisfiesAll', () => {
		it('should return true when all guards pass', () => {
			expect(satisfiesAll('test', isString, isNonEmptyString)).toBe(true);
		});

		it('should return false when any guard fails', () => {
			expect(satisfiesAll('', isString, isNonEmptyString)).toBe(false);
			expect(satisfiesAll(123, isString, isNonEmptyString)).toBe(false);
		});
	});

	describe('satisfiesAny', () => {
		it('should return true when any guard passes', () => {
			expect(satisfiesAny('test', isString, isString)).toBe(true);
			expect(satisfiesAny(123, isNumber, isNumber)).toBe(true);
		});

		it('should return false when no guards pass', () => {
			expect(satisfiesAny(true, isString, isString)).toBe(false);
		});
	});
});
