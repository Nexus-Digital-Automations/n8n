/**
 * JSON Schema Validation with Detailed Error Reporting
 *
 * Provides comprehensive JSON Schema validation capabilities with detailed
 * error messages and validation context for data transformation workflows.
 *
 * @module schema-validator
 *
 * @example
 * ```typescript
 * import { SchemaValidator } from './schema-validator';
 *
 * const schema = {
 *   type: 'object',
 *   properties: {
 *     name: { type: 'string', minLength: 1 },
 *     age: { type: 'number', minimum: 0 },
 *     email: { type: 'string', format: 'email' }
 *   },
 *   required: ['name', 'email']
 * };
 *
 * const validator = new SchemaValidator(schema);
 * const result = validator.validate({ name: 'Alice', age: 30, email: 'alice@example.com' });
 * console.log(result.valid); // true
 * ```
 */

import { ApplicationError } from '../errors';

/**
 * JSON Schema type definition (Draft-07)
 */
export interface IJsonSchema {
	$schema?: string;
	$id?: string;
	type?: 'null' | 'boolean' | 'object' | 'array' | 'number' | 'string' | 'integer';
	properties?: Record<string, IJsonSchema>;
	items?: IJsonSchema | IJsonSchema[];
	required?: string[];
	enum?: unknown[];
	const?: unknown;
	minimum?: number;
	maximum?: number;
	exclusiveMinimum?: number;
	exclusiveMaximum?: number;
	minLength?: number;
	maxLength?: number;
	pattern?: string;
	format?: string;
	minItems?: number;
	maxItems?: number;
	uniqueItems?: boolean;
	minProperties?: number;
	maxProperties?: number;
	additionalProperties?: boolean | IJsonSchema;
	oneOf?: IJsonSchema[];
	anyOf?: IJsonSchema[];
	allOf?: IJsonSchema[];
	not?: IJsonSchema;
	if?: IJsonSchema;
	then?: IJsonSchema;
	else?: IJsonSchema;
	title?: string;
	description?: string;
	default?: unknown;
	examples?: unknown[];
	[key: string]: unknown;
}

/**
 * Validation error details
 */
export interface IValidationError {
	/** Path to the invalid property */
	path: string;
	/** Error message */
	message: string;
	/** The validation keyword that failed */
	keyword: string;
	/** The schema that was violated */
	schema: IJsonSchema | unknown;
	/** The actual value that failed validation */
	value: unknown;
	/** Additional error parameters */
	params?: Record<string, unknown>;
}

/**
 * Validation result
 */
export interface IValidationResult {
	/** Whether validation passed */
	valid: boolean;
	/** Array of validation errors (empty if valid) */
	errors: IValidationError[];
	/** Human-readable summary of errors */
	errorSummary?: string;
}

/**
 * Schema validator options
 */
export interface ISchemaValidatorOptions {
	/** Allow additional properties not defined in schema */
	allowAdditionalProperties?: boolean;
	/** Remove additional properties instead of failing */
	removeAdditional?: boolean;
	/** Coerce types (e.g., "123" to 123) */
	coerceTypes?: boolean;
	/** Use strict validation */
	strict?: boolean;
	/** Custom error messages */
	messages?: Record<string, string>;
}

/**
 * Comprehensive JSON Schema validator with detailed error reporting
 */
export class SchemaValidator {
	private readonly schema: IJsonSchema;
	private readonly options: ISchemaValidatorOptions;
	private readonly logger: (message: string, context?: Record<string, unknown>) => void;

	/**
	 * Creates a new schema validator
	 * @param schema - JSON Schema to validate against
	 * @param options - Validator options
	 * @param logger - Optional logger function
	 */
	constructor(
		schema: IJsonSchema,
		options: ISchemaValidatorOptions = {},
		logger?: (message: string, context?: Record<string, unknown>) => void,
	) {
		this.schema = schema;
		this.options = {
			allowAdditionalProperties: false,
			removeAdditional: false,
			coerceTypes: false,
			strict: true,
			...options,
		};
		this.logger = logger ?? (() => {});
		this.logger('SchemaValidator initialized', { schema: schema.title ?? 'unnamed' });
	}

	/**
	 * Validate data against the schema
	 *
	 * @param data - Data to validate
	 * @returns Validation result with detailed errors
	 *
	 * @example
	 * ```typescript
	 * const result = validator.validate({ name: 'Alice', age: 30 });
	 * if (!result.valid) {
	 *   console.log(result.errorSummary);
	 *   result.errors.forEach(error => {
	 *     console.log(`${error.path}: ${error.message}`);
	 *   });
	 * }
	 * ```
	 */
	validate(data: unknown): IValidationResult {
		const startTime = Date.now();
		this.logger('Validation started', { dataType: typeof data });

		const errors: IValidationError[] = [];
		let processedData = data;

		if (this.options.coerceTypes) {
			processedData = this.coerceTypes(data, this.schema);
		}

		this.validateSchema(processedData, this.schema, '', errors);

		const valid = errors.length === 0;
		const duration = Date.now() - startTime;

		this.logger('Validation completed', {
			valid,
			errorCount: errors.length,
			duration,
		});

		return {
			valid,
			errors,
			errorSummary: valid ? undefined : this.formatErrorSummary(errors),
		};
	}

	/**
	 * Validate and throw error if invalid
	 */
	validateOrThrow(data: unknown): void {
		const result = this.validate(data);
		if (!result.valid) {
			throw new ApplicationError('Schema validation failed', {
				extra: {
					errors: result.errors,
					summary: result.errorSummary,
				},
			});
		}
	}

	/**
	 * Validate specific property path
	 */
	validateProperty(data: unknown, propertyPath: string): IValidationResult {
		const pathParts = propertyPath.split('.');
		let currentData: unknown = data;
		let currentSchema = this.schema;

		for (const part of pathParts) {
			if (
				typeof currentData !== 'object' ||
				currentData === null ||
				!(part in (currentData as Record<string, unknown>))
			) {
				return {
					valid: false,
					errors: [
						{
							path: propertyPath,
							message: `Property not found: ${propertyPath}`,
							keyword: 'propertyNotFound',
							schema: currentSchema,
							value: currentData,
						},
					],
					errorSummary: `Property not found: ${propertyPath}`,
				};
			}

			currentData = (currentData as Record<string, unknown>)[part];
			currentSchema = currentSchema.properties?.[part] ?? currentSchema;
		}

		const errors: IValidationError[] = [];
		this.validateSchema(currentData, currentSchema, propertyPath, errors);

		return {
			valid: errors.length === 0,
			errors,
			errorSummary: errors.length > 0 ? this.formatErrorSummary(errors) : undefined,
		};
	}

	/**
	 * Get schema for specific property path
	 */
	getPropertySchema(propertyPath: string): IJsonSchema | undefined {
		const pathParts = propertyPath.split('.');
		let currentSchema = this.schema;

		for (const part of pathParts) {
			if (!currentSchema.properties?.[part]) {
				return undefined;
			}
			currentSchema = currentSchema.properties[part];
		}

		return currentSchema;
	}

	/**
	 * Internal validation logic
	 */
	private validateSchema(
		data: unknown,
		schema: IJsonSchema,
		path: string,
		errors: IValidationError[],
	): void {
		// Type validation
		if (schema.type) {
			this.validateType(data, schema.type, path, errors);
		}

		// Enum validation
		if (schema.enum) {
			this.validateEnum(data, schema.enum, path, errors);
		}

		// Const validation
		if (schema.const !== undefined) {
			this.validateConst(data, schema.const, path, errors);
		}

		// Type-specific validations
		if (typeof data === 'string') {
			this.validateString(data, schema, path, errors);
		} else if (typeof data === 'number') {
			this.validateNumber(data, schema, path, errors);
		} else if (Array.isArray(data)) {
			this.validateArray(data, schema, path, errors);
		} else if (typeof data === 'object' && data !== null) {
			this.validateObject(data as Record<string, unknown>, schema, path, errors);
		}

		// Conditional schemas
		if (schema.if) {
			this.validateConditional(data, schema, path, errors);
		}

		// Combined schemas
		if (schema.oneOf) {
			this.validateOneOf(data, schema.oneOf, path, errors);
		}
		if (schema.anyOf) {
			this.validateAnyOf(data, schema.anyOf, path, errors);
		}
		if (schema.allOf) {
			this.validateAllOf(data, schema.allOf, path, errors);
		}
		if (schema.not) {
			this.validateNot(data, schema.not, path, errors);
		}
	}

	/**
	 * Validate type
	 */
	private validateType(
		data: unknown,
		expectedType: string,
		path: string,
		errors: IValidationError[],
	): void {
		const actualType = this.getType(data);

		if (actualType !== expectedType) {
			// Allow integer to match number
			if (expectedType === 'integer' && actualType === 'number' && Number.isInteger(data)) {
				return;
			}

			errors.push({
				path,
				message: `Expected type ${expectedType}, got ${actualType}`,
				keyword: 'type',
				schema: { type: expectedType },
				value: data,
			});
		}
	}

	/**
	 * Get type of value
	 */
	private getType(value: unknown): string {
		if (value === null) return 'null';
		if (Array.isArray(value)) return 'array';
		return typeof value;
	}

	/**
	 * Validate enum
	 */
	private validateEnum(
		data: unknown,
		enumValues: unknown[],
		path: string,
		errors: IValidationError[],
	): void {
		if (!enumValues.includes(data)) {
			errors.push({
				path,
				message: `Value must be one of: ${enumValues.map((v) => JSON.stringify(v)).join(', ')}`,
				keyword: 'enum',
				schema: { enum: enumValues },
				value: data,
				params: { allowedValues: enumValues },
			});
		}
	}

	/**
	 * Validate const
	 */
	private validateConst(
		data: unknown,
		constValue: unknown,
		path: string,
		errors: IValidationError[],
	): void {
		if (data !== constValue) {
			errors.push({
				path,
				message: `Value must equal ${JSON.stringify(constValue)}`,
				keyword: 'const',
				schema: { const: constValue },
				value: data,
			});
		}
	}

	/**
	 * Validate string
	 */
	private validateString(
		data: string,
		schema: IJsonSchema,
		path: string,
		errors: IValidationError[],
	): void {
		if (schema.minLength !== undefined && data.length < schema.minLength) {
			errors.push({
				path,
				message: `String length must be at least ${schema.minLength}`,
				keyword: 'minLength',
				schema: { minLength: schema.minLength },
				value: data,
				params: { minLength: schema.minLength, actualLength: data.length },
			});
		}

		if (schema.maxLength !== undefined && data.length > schema.maxLength) {
			errors.push({
				path,
				message: `String length must not exceed ${schema.maxLength}`,
				keyword: 'maxLength',
				schema: { maxLength: schema.maxLength },
				value: data,
				params: { maxLength: schema.maxLength, actualLength: data.length },
			});
		}

		if (schema.pattern) {
			const regex = new RegExp(schema.pattern);
			if (!regex.test(data)) {
				errors.push({
					path,
					message: `String does not match pattern: ${schema.pattern}`,
					keyword: 'pattern',
					schema: { pattern: schema.pattern },
					value: data,
				});
			}
		}

		if (schema.format) {
			this.validateFormat(data, schema.format, path, errors);
		}
	}

	/**
	 * Validate string format
	 */
	private validateFormat(
		data: string,
		format: string,
		path: string,
		errors: IValidationError[],
	): void {
		const formatValidators: Record<string, RegExp> = {
			email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
			uri: /^https?:\/\/.+/,
			uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
			date: /^\d{4}-\d{2}-\d{2}$/,
			'date-time': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/,
			ipv4: /^(\d{1,3}\.){3}\d{1,3}$/,
			ipv6: /^([0-9a-f]{0,4}:){7}[0-9a-f]{0,4}$/i,
		};

		const validator = formatValidators[format];
		if (validator && !validator.test(data)) {
			errors.push({
				path,
				message: `String does not match format: ${format}`,
				keyword: 'format',
				schema: { format },
				value: data,
			});
		}
	}

	/**
	 * Validate number
	 */
	private validateNumber(
		data: number,
		schema: IJsonSchema,
		path: string,
		errors: IValidationError[],
	): void {
		if (schema.minimum !== undefined && data < schema.minimum) {
			errors.push({
				path,
				message: `Number must be at least ${schema.minimum}`,
				keyword: 'minimum',
				schema: { minimum: schema.minimum },
				value: data,
			});
		}

		if (schema.maximum !== undefined && data > schema.maximum) {
			errors.push({
				path,
				message: `Number must not exceed ${schema.maximum}`,
				keyword: 'maximum',
				schema: { maximum: schema.maximum },
				value: data,
			});
		}

		if (schema.exclusiveMinimum !== undefined && data <= schema.exclusiveMinimum) {
			errors.push({
				path,
				message: `Number must be greater than ${schema.exclusiveMinimum}`,
				keyword: 'exclusiveMinimum',
				schema: { exclusiveMinimum: schema.exclusiveMinimum },
				value: data,
			});
		}

		if (schema.exclusiveMaximum !== undefined && data >= schema.exclusiveMaximum) {
			errors.push({
				path,
				message: `Number must be less than ${schema.exclusiveMaximum}`,
				keyword: 'exclusiveMaximum',
				schema: { exclusiveMaximum: schema.exclusiveMaximum },
				value: data,
			});
		}
	}

	/**
	 * Validate array
	 */
	private validateArray(
		data: unknown[],
		schema: IJsonSchema,
		path: string,
		errors: IValidationError[],
	): void {
		if (schema.minItems !== undefined && data.length < schema.minItems) {
			errors.push({
				path,
				message: `Array must have at least ${schema.minItems} items`,
				keyword: 'minItems',
				schema: { minItems: schema.minItems },
				value: data,
			});
		}

		if (schema.maxItems !== undefined && data.length > schema.maxItems) {
			errors.push({
				path,
				message: `Array must not have more than ${schema.maxItems} items`,
				keyword: 'maxItems',
				schema: { maxItems: schema.maxItems },
				value: data,
			});
		}

		if (schema.uniqueItems) {
			const seen = new Set();
			const duplicates: unknown[] = [];
			data.forEach((item) => {
				const key = JSON.stringify(item);
				if (seen.has(key)) {
					duplicates.push(item);
				}
				seen.add(key);
			});

			if (duplicates.length > 0) {
				errors.push({
					path,
					message: 'Array items must be unique',
					keyword: 'uniqueItems',
					schema: { uniqueItems: true },
					value: data,
					params: { duplicates },
				});
			}
		}

		// Validate items
		if (schema.items !== undefined) {
			const items = schema.items;
			if (Array.isArray(items)) {
				// Tuple validation
				const itemsArray: IJsonSchema[] = items;
				data.forEach((item, index) => {
					if (index < itemsArray.length) {
						this.validateSchema(item, itemsArray[index], `${path}[${index}]`, errors);
					}
				});
			} else {
				// All items same schema
				const itemSchema: IJsonSchema = items;
				data.forEach((item, index) => {
					this.validateSchema(item, itemSchema, `${path}[${index}]`, errors);
				});
			}
		}
	}

	/**
	 * Validate object
	 */
	private validateObject(
		data: Record<string, unknown>,
		schema: IJsonSchema,
		path: string,
		errors: IValidationError[],
	): void {
		const keys = Object.keys(data);

		if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
			errors.push({
				path,
				message: `Object must have at least ${schema.minProperties} properties`,
				keyword: 'minProperties',
				schema: { minProperties: schema.minProperties },
				value: data,
			});
		}

		if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) {
			errors.push({
				path,
				message: `Object must not have more than ${schema.maxProperties} properties`,
				keyword: 'maxProperties',
				schema: { maxProperties: schema.maxProperties },
				value: data,
			});
		}

		// Required properties
		if (schema.required) {
			schema.required.forEach((prop) => {
				if (!(prop in data)) {
					errors.push({
						path: path ? `${path}.${prop}` : prop,
						message: `Required property missing: ${prop}`,
						keyword: 'required',
						schema: { required: schema.required },
						value: data,
						params: { missingProperty: prop },
					});
				}
			});
		}

		// Validate properties
		if (schema.properties) {
			Object.entries(schema.properties).forEach(([prop, propSchema]) => {
				if (prop in data) {
					this.validateSchema(data[prop], propSchema, path ? `${path}.${prop}` : prop, errors);
				}
			});
		}

		// Additional properties
		if (schema.additionalProperties === false && !this.options.allowAdditionalProperties) {
			const allowedProps = new Set(Object.keys(schema.properties ?? {}));
			const additionalProps = keys.filter((key) => !allowedProps.has(key));

			if (additionalProps.length > 0) {
				errors.push({
					path,
					message: `Additional properties not allowed: ${additionalProps.join(', ')}`,
					keyword: 'additionalProperties',
					schema: { additionalProperties: false },
					value: data,
					params: { additionalProperties: additionalProps },
				});
			}
		}
	}

	/**
	 * Validate conditional schemas
	 */
	private validateConditional(
		data: unknown,
		schema: IJsonSchema,
		path: string,
		errors: IValidationError[],
	): void {
		if (!schema.if) return;

		const ifErrors: IValidationError[] = [];
		this.validateSchema(data, schema.if, path, ifErrors);

		if (ifErrors.length === 0 && schema.then) {
			this.validateSchema(data, schema.then, path, errors);
		} else if (ifErrors.length > 0 && schema.else) {
			this.validateSchema(data, schema.else, path, errors);
		}
	}

	/**
	 * Validate oneOf
	 */
	private validateOneOf(
		data: unknown,
		schemas: IJsonSchema[],
		path: string,
		errors: IValidationError[],
	): void {
		const validCount = schemas.filter((schema) => {
			const schemaErrors: IValidationError[] = [];
			this.validateSchema(data, schema, path, schemaErrors);
			return schemaErrors.length === 0;
		}).length;

		if (validCount !== 1) {
			errors.push({
				path,
				message: `Data must match exactly one schema (matched ${validCount})`,
				keyword: 'oneOf',
				schema: { oneOf: schemas },
				value: data,
			});
		}
	}

	/**
	 * Validate anyOf
	 */
	private validateAnyOf(
		data: unknown,
		schemas: IJsonSchema[],
		path: string,
		errors: IValidationError[],
	): void {
		const validCount = schemas.filter((schema) => {
			const schemaErrors: IValidationError[] = [];
			this.validateSchema(data, schema, path, schemaErrors);
			return schemaErrors.length === 0;
		}).length;

		if (validCount === 0) {
			errors.push({
				path,
				message: 'Data must match at least one schema',
				keyword: 'anyOf',
				schema: { anyOf: schemas },
				value: data,
			});
		}
	}

	/**
	 * Validate allOf
	 */
	private validateAllOf(
		data: unknown,
		schemas: IJsonSchema[],
		path: string,
		errors: IValidationError[],
	): void {
		schemas.forEach((schema) => {
			this.validateSchema(data, schema, path, errors);
		});
	}

	/**
	 * Validate not
	 */
	private validateNot(
		data: unknown,
		schema: IJsonSchema,
		path: string,
		errors: IValidationError[],
	): void {
		const schemaErrors: IValidationError[] = [];
		this.validateSchema(data, schema, path, schemaErrors);

		if (schemaErrors.length === 0) {
			errors.push({
				path,
				message: 'Data must not match schema',
				keyword: 'not',
				schema: { not: schema },
				value: data,
			});
		}
	}

	/**
	 * Coerce types based on schema
	 */
	private coerceTypes(data: unknown, schema: IJsonSchema): unknown {
		if (schema.type === 'number' && typeof data === 'string') {
			const num = Number(data);
			if (!isNaN(num)) return num;
		}

		if (schema.type === 'integer' && typeof data === 'string') {
			const num = parseInt(data, 10);
			if (!isNaN(num)) return num;
		}

		if (schema.type === 'boolean' && typeof data === 'string') {
			if (data === 'true') return true;
			if (data === 'false') return false;
		}

		if (schema.type === 'string' && typeof data === 'number') {
			return String(data);
		}

		return data;
	}

	/**
	 * Format error summary
	 */
	private formatErrorSummary(errors: IValidationError[]): string {
		const summary = errors
			.map((error) => `  - ${error.path || 'root'}: ${error.message}`)
			.join('\n');
		return `Validation failed with ${errors.length} error(s):\n${summary}`;
	}
}

/**
 * Convenience function to validate data against a schema
 *
 * @example
 * ```typescript
 * const result = validateSchema(data, schema);
 * if (!result.valid) {
 *   console.error(result.errorSummary);
 * }
 * ```
 */
export function validateSchema(
	data: unknown,
	schema: IJsonSchema,
	options?: ISchemaValidatorOptions,
): IValidationResult {
	const validator = new SchemaValidator(schema, options);
	return validator.validate(data);
}

/**
 * Convenience function to validate and throw on error
 */
export function validateSchemaOrThrow(
	data: unknown,
	schema: IJsonSchema,
	options?: ISchemaValidatorOptions,
): void {
	const validator = new SchemaValidator(schema, options);
	validator.validateOrThrow(data);
}
