/**
 * Tests for utility types - compile-time type checking
 */

import type {
	DeepPartial,
	DeepRequired,
	KeysOfType,
	Optional,
	NonFunctionPropertyNames,
	FunctionPropertyNames,
	JSONValue,
	JSONObject,
	JSONArray,
	Brand,
	ValidationResult,
	Transform,
	AsyncTransform,
	EventHandler,
	AsyncEventHandler,
	Predicate,
	AsyncPredicate,
	IDataObject,
	INodeParameterValue,
	StrictPick,
	StrictOmit,
	UnionToIntersection,
} from '../utility-types';

describe('Utility Types', () => {
	// These tests are primarily compile-time tests
	// They ensure types work correctly during TypeScript compilation

	describe('DeepPartial', () => {
		it('should make all properties optional recursively', () => {
			interface TestInterface {
				name: string;
				age: number;
				address: {
					street: string;
					city: string;
				};
			}

			type PartialTest = DeepPartial<TestInterface>;

			// This should compile without errors
			const partialObj: PartialTest = {
				name: 'test',
				address: {
					street: 'Main St',
					// city is optional
				},
				// age is optional
			};

			expect(partialObj.name).toBe('test');
		});
	});

	describe('DeepRequired', () => {
		it('should make all properties required recursively', () => {
			interface TestInterface {
				name?: string;
				age?: number;
				address?: {
					street?: string;
					city?: string;
				};
			}

			type RequiredTest = DeepRequired<TestInterface>;

			// This should compile - all properties are now required
			const requiredObj: RequiredTest = {
				name: 'test',
				age: 25,
				address: {
					street: 'Main St',
					city: 'Test City',
				},
			};

			expect(requiredObj.name).toBe('test');
		});
	});

	describe('KeysOfType', () => {
		it('should extract keys of specific type', () => {
			interface TestInterface {
				name: string;
				age: number;
				isActive: boolean;
				email: string;
			}

			type StringKeys = KeysOfType<TestInterface, string>;
			// Should be 'name' | 'email'

			const stringKey1: StringKeys = 'name';
			const stringKey2: StringKeys = 'email';

			expect(stringKey1).toBe('name');
			expect(stringKey2).toBe('email');
		});
	});

	describe('Optional', () => {
		it('should make specific keys optional', () => {
			interface TestInterface {
				name: string;
				age: number;
				email: string;
			}

			type OptionalEmail = Optional<TestInterface, 'email'>;

			// This should compile - email is optional
			const obj: OptionalEmail = {
				name: 'test',
				age: 25,
				// email is optional
			};

			expect(obj.name).toBe('test');
		});
	});

	describe('Function Property Types', () => {
		it('should extract function and non-function properties', () => {
			interface TestInterface {
				name: string;
				age: number;
				getName: () => string;
				setAge: (age: number) => void;
			}

			type NonFuncKeys = NonFunctionPropertyNames<TestInterface>;
			type FuncKeys = FunctionPropertyNames<TestInterface>;

			const nonFuncKey: NonFuncKeys = 'name';
			const funcKey: FuncKeys = 'getName';

			expect(nonFuncKey).toBe('name');
			expect(funcKey).toBe('getName');
		});
	});

	describe('JSON Types', () => {
		it('should work with JSON values', () => {
			const jsonString: JSONValue = 'hello';
			const jsonNumber: JSONValue = 42;
			const jsonBoolean: JSONValue = true;
			const jsonNull: JSONValue = null;
			const jsonArray: JSONArray = [1, 'two', true, null];
			const jsonObject: JSONObject = { key: 'value', num: 42 };

			expect(jsonString).toBe('hello');
			expect(jsonNumber).toBe(42);
			expect(jsonBoolean).toBe(true);
			expect(jsonNull).toBe(null);
			expect(jsonArray).toHaveLength(4);
			expect(jsonObject.key).toBe('value');
		});
	});

	describe('ValidationResult', () => {
		it('should work with success and error states', () => {
			const successResult: ValidationResult<string> = {
				valid: true,
				value: 'success',
			};

			const errorResult: ValidationResult<string> = {
				valid: false,
				errors: ['Error message'],
			};

			expect(successResult.valid).toBe(true);
			if (successResult.valid) {
				expect(successResult.value).toBe('success');
			}

			expect(errorResult.valid).toBe(false);
			if (!errorResult.valid) {
				expect(errorResult.errors).toContain('Error message');
			}
		});
	});

	describe('Transform Types', () => {
		it('should work with transform functions', async () => {
			const stringToNumber: Transform<string, number> = (str) => parseInt(str, 10);
			const asyncStringToNumber: AsyncTransform<string, number> = async (str) => {
				// Simulate async work
				await new Promise((resolve) => setTimeout(resolve, 1));
				return parseInt(str, 10);
			};

			expect(stringToNumber('42')).toBe(42);

			const result = await asyncStringToNumber('42');
			expect(result).toBe(42);
		});
	});

	describe('Event Handler Types', () => {
		it('should work with event handlers', () => {
			const syncHandler: EventHandler<string> = (event) => {
				console.log(event);
			};

			const asyncHandler: AsyncEventHandler<string> = async (event) => {
				// Simulate async work
				await new Promise((resolve) => setTimeout(resolve, 1));
				console.log(event);
			};

			expect(typeof syncHandler).toBe('function');
			expect(typeof asyncHandler).toBe('function');
		});
	});

	describe('Predicate Types', () => {
		it('should work with predicate functions', async () => {
			const isPositive: Predicate<number> = (num) => num > 0;
			const isPositiveAsync: AsyncPredicate<number> = async (num) => {
				// Simulate async work
				await new Promise((resolve) => setTimeout(resolve, 1));
				return num > 0;
			};

			expect(isPositive(5)).toBe(true);
			expect(isPositive(-1)).toBe(false);

			const result = await isPositiveAsync(5);
			expect(result).toBe(true);
		});
	});

	describe('n8n Data Types', () => {
		it('should work with n8n data objects', () => {
			const dataObject: IDataObject = {
				name: 'test',
				count: 42,
				active: true,
				tags: ['tag1', 'tag2'],
			};

			const parameterValue: INodeParameterValue = 'string value';
			const parameterObject: INodeParameterValue = dataObject;
			const parameterArray: INodeParameterValue = [dataObject];

			expect(dataObject.name).toBe('test');
			expect(parameterValue).toBe('string value');
			expect(parameterObject).toBe(dataObject);
			expect(Array.isArray(parameterArray)).toBe(true);
		});
	});

	describe('Brand Types', () => {
		it('should create branded types', () => {
			type UserId = Brand<string, 'UserId'>;
			type ProductId = Brand<string, 'ProductId'>;

			const userId: UserId = 'user123' as UserId;
			const productId: ProductId = 'product456' as ProductId;

			// These would be compile-time errors if uncommented:
			// const wrongAssignment: UserId = productId; // Error!

			expect(userId).toBe('user123');
			expect(productId).toBe('product456');
		});
	});

	describe('Strict Types', () => {
		it('should work with strict pick and omit', () => {
			interface TestInterface {
				name: string;
				age: number;
				email: string;
			}

			type PickedType = StrictPick<TestInterface, 'name' | 'email'>;
			type OmittedType = StrictOmit<TestInterface, 'email'>;

			const picked: PickedType = {
				name: 'test',
				email: 'test@example.com',
			};

			const omitted: OmittedType = {
				name: 'test',
				age: 25,
			};

			expect(picked.name).toBe('test');
			expect(omitted.age).toBe(25);
		});
	});

	describe('Union to Intersection', () => {
		it('should convert union types to intersection', () => {
			type Union = { a: string } | { b: number };
			type Intersection = UnionToIntersection<Union>;

			// This would be { a: string } & { b: number }
			const intersectionObj: Intersection = {
				a: 'test',
				b: 42,
			};

			expect(intersectionObj.a).toBe('test');
			expect(intersectionObj.b).toBe(42);
		});
	});

	describe('Runtime Type Validation', () => {
		it('should validate types at runtime', () => {
			// Helper function to test ValidationResult type discrimination
			function processResult<T>(result: ValidationResult<T>): T | null {
				if (result.valid) {
					return result.value;
				} else {
					console.error('Validation errors:', result.errors);
					return null;
				}
			}

			const successResult: ValidationResult<string> = {
				valid: true,
				value: 'success',
			};

			const errorResult: ValidationResult<string> = {
				valid: false,
				errors: ['Error occurred'],
			};

			expect(processResult(successResult)).toBe('success');
			expect(processResult(errorResult)).toBe(null);
		});
	});
});
