/**
 * Data Transformation Module
 *
 * Comprehensive data transformation capabilities for n8n workflows including:
 * - Advanced JSONPath querying with filters and complex expressions
 * - JSON Schema validation with detailed error reporting
 * - Reusable transformation library with common patterns
 * - Visual data mapping helpers for UI integration
 *
 * @module data-transformation
 *
 * @example
 * ```typescript
 * import {
 *   JSONPathQuery,
 *   SchemaValidator,
 *   TransformationLibrary,
 *   VisualMapper,
 *   jsonPathQuery,
 *   validateSchema
 * } from '@/data-transformation';
 *
 * // JSONPath queries
 * const query = new JSONPathQuery(data);
 * const results = query.query('$.users[?(@.active == true)].name');
 *
 * // Schema validation
 * const validator = new SchemaValidator(schema);
 * const validation = validator.validate(data);
 *
 * // Data transformations
 * const library = new TransformationLibrary();
 * const normalized = library.normalizeObject(data, { trim: true, removeNull: true });
 *
 * // Visual mapping
 * const mapper = new VisualMapper();
 * const schema = mapper.inferSchema(data);
 * const suggestions = mapper.suggestMappings(sourceSchema, targetSchema);
 * ```
 */

// JSONPath Query
export {
	JSONPathQuery,
	jsonPathQuery,
	jsonPathMap,
	jsonPathFilter,
	type IJsonPathResult,
	type IJsonPathOptions,
} from './jsonpath-query';

// Schema Validator
export {
	SchemaValidator,
	validateSchema,
	validateSchemaOrThrow,
	type IJsonSchema,
	type IValidationError,
	type IValidationResult,
	type ISchemaValidatorOptions,
} from './schema-validator';

// Transformation Library
export {
	TransformationLibrary,
	transformations,
	type ITransformOptions,
	type ICsvOptions,
	type IJsonToCsvOptions,
	type IXmlOptions,
} from './transformation-library';

// Visual Mapper
export {
	VisualMapper,
	type IFieldMetadata,
	type IMappingRule,
	type IMappingConfig,
	type IMappingSuggestion,
	type IMappingValidationResult,
} from './visual-mapper';
