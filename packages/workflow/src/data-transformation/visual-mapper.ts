/**
 * Visual Data Mapping Interface Helpers
 *
 * Provides utilities for building visual data mapping interfaces, including
 * schema introspection, field suggestions, and mapping validation for
 * drag-and-drop style data transformation UIs.
 *
 * @module visual-mapper
 *
 * @example
 * ```typescript
 * import { VisualMapper } from './visual-mapper';
 *
 * const mapper = new VisualMapper();
 *
 * // Analyze source data structure
 * const sourceSchema = mapper.inferSchema(sourceData);
 *
 * // Suggest mappings to target schema
 * const suggestions = mapper.suggestMappings(sourceSchema, targetSchema);
 *
 * // Apply mapping
 * const result = mapper.applyMapping(sourceData, mapping);
 * ```
 */

import { ApplicationError } from '../errors';
import type { IJsonSchema } from './schema-validator';

/**
 * Field metadata for visual mapping
 */
export interface IFieldMetadata {
	/** Field path (e.g., "user.address.city") */
	path: string;
	/** Field name */
	name: string;
	/** Inferred data type */
	type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'unknown';
	/** Whether field is nullable */
	nullable: boolean;
	/** Whether field is an array */
	isArray: boolean;
	/** Sample values */
	samples?: unknown[];
	/** Nested fields (for objects) */
	children?: IFieldMetadata[];
	/** Description or hint */
	description?: string;
	/** Detected format (email, date, url, etc.) */
	format?: string;
}

/**
 * Mapping rule between source and target fields
 */
export interface IMappingRule {
	/** Source field path */
	sourcePath: string;
	/** Target field path */
	targetPath: string;
	/** Optional transformation function name */
	transform?: string;
	/** Optional transformation parameters */
	transformParams?: Record<string, unknown>;
	/** Optional default value if source is missing */
	defaultValue?: unknown;
	/** Whether mapping is required */
	required?: boolean;
}

/**
 * Complete mapping configuration
 */
export interface IMappingConfig {
	/** Mapping rules */
	rules: IMappingRule[];
	/** Whether to allow unmapped source fields */
	allowUnmappedSource?: boolean;
	/** Whether to allow unmapped target fields */
	allowUnmappedTarget?: boolean;
	/** Whether to validate types */
	validateTypes?: boolean;
}

/**
 * Mapping suggestion with confidence score
 */
export interface IMappingSuggestion {
	/** Source field path */
	sourcePath: string;
	/** Target field path */
	targetPath: string;
	/** Confidence score (0-1) */
	confidence: number;
	/** Reason for suggestion */
	reason: string;
	/** Suggested transformation */
	suggestedTransform?: string;
}

/**
 * Mapping validation result
 */
export interface IMappingValidationResult {
	/** Whether mapping is valid */
	valid: boolean;
	/** Validation errors */
	errors: Array<{
		rule: IMappingRule;
		message: string;
	}>;
	/** Unmapped source fields */
	unmappedSource: string[];
	/** Unmapped target fields */
	unmappedTarget: string[];
}

/**
 * Visual data mapper with schema inference and mapping suggestions
 */
export class VisualMapper {
	private readonly logger: (message: string, context?: Record<string, unknown>) => void;

	constructor(logger?: (message: string, context?: Record<string, unknown>) => void) {
		this.logger = logger ?? (() => {});
		this.logger('VisualMapper initialized');
	}

	// ==================== Schema Inference ====================

	/**
	 * Infer schema structure from sample data
	 *
	 * @param data - Sample data to analyze
	 * @param options - Inference options
	 * @returns Inferred field metadata
	 *
	 * @example
	 * ```typescript
	 * const schema = mapper.inferSchema({
	 *   name: 'Alice',
	 *   age: 30,
	 *   address: { city: 'NYC', zip: '10001' }
	 * });
	 * ```
	 */
	inferSchema(
		data: unknown,
		options: { maxSamples?: number; detectFormats?: boolean } = {},
	): IFieldMetadata[] {
		const { maxSamples = 10, detectFormats = true } = options;
		const startTime = Date.now();

		this.logger('Schema inference started', { dataType: typeof data });

		const fields = this.analyzeValue(data, '', [], maxSamples, detectFormats);
		const duration = Date.now() - startTime;

		this.logger('Schema inference completed', {
			fieldCount: fields.length,
			duration,
		});

		return fields;
	}

	/**
	 * Convert inferred schema to JSON Schema
	 */
	toJsonSchema(fields: IFieldMetadata[], title?: string): IJsonSchema {
		const schema: IJsonSchema = {
			$schema: 'http://json-schema.org/draft-07/schema#',
			type: 'object',
			properties: {},
		};

		if (title) {
			schema.title = title;
		}

		const buildProperties = (fieldList: IFieldMetadata[]): Record<string, IJsonSchema> => {
			const properties: Record<string, IJsonSchema> = {};

			fieldList.forEach((field) => {
				const fieldSchema: IJsonSchema = {
					type: field.type as IJsonSchema['type'],
				};

				if (field.description) {
					fieldSchema.description = field.description;
				}

				if (field.format) {
					fieldSchema.format = field.format;
				}

				if (field.isArray) {
					properties[field.name] = {
						type: 'array',
						items: fieldSchema,
					};
				} else if (field.children && field.children.length > 0) {
					fieldSchema.properties = buildProperties(field.children);
					properties[field.name] = fieldSchema;
				} else {
					properties[field.name] = fieldSchema;
				}
			});

			return properties;
		};

		schema.properties = buildProperties(fields);
		return schema;
	}

	// ==================== Mapping Suggestions ====================

	/**
	 * Suggest field mappings between source and target schemas
	 *
	 * @param sourceFields - Source schema fields
	 * @param targetFields - Target schema fields
	 * @returns Array of mapping suggestions sorted by confidence
	 *
	 * @example
	 * ```typescript
	 * const suggestions = mapper.suggestMappings(sourceSchema, targetSchema);
	 * suggestions.forEach(s => {
	 *   console.log(`${s.sourcePath} -> ${s.targetPath} (${s.confidence})`);
	 * });
	 * ```
	 */
	suggestMappings(
		sourceFields: IFieldMetadata[],
		targetFields: IFieldMetadata[],
	): IMappingSuggestion[] {
		const startTime = Date.now();
		this.logger('Mapping suggestion started', {
			sourceFieldCount: sourceFields.length,
			targetFieldCount: targetFields.length,
		});

		const suggestions: IMappingSuggestion[] = [];
		const sourcePaths = this.flattenFields(sourceFields);
		const targetPaths = this.flattenFields(targetFields);

		targetPaths.forEach((targetField) => {
			const matches = sourcePaths
				.map((sourceField) => ({
					sourceField,
					targetField,
					score: this.calculateMatchScore(sourceField, targetField),
				}))
				.filter((match) => match.score > 0)
				.sort((a, b) => b.score - a.score);

			if (matches.length > 0) {
				const bestMatch = matches[0];
				suggestions.push({
					sourcePath: bestMatch.sourceField.path,
					targetPath: bestMatch.targetField.path,
					confidence: bestMatch.score,
					reason: this.getMatchReason(bestMatch.sourceField, bestMatch.targetField),
					suggestedTransform: this.suggestTransform(bestMatch.sourceField, bestMatch.targetField),
				});
			}
		});

		const duration = Date.now() - startTime;
		this.logger('Mapping suggestion completed', {
			suggestionCount: suggestions.length,
			duration,
		});

		return suggestions.sort((a, b) => b.confidence - a.confidence);
	}

	/**
	 * Auto-generate mapping configuration from suggestions
	 */
	autoGenerateMapping(
		sourceFields: IFieldMetadata[],
		targetFields: IFieldMetadata[],
		minConfidence = 0.7,
	): IMappingConfig {
		const suggestions = this.suggestMappings(sourceFields, targetFields);

		const rules: IMappingRule[] = suggestions
			.filter((s) => s.confidence >= minConfidence)
			.map((s) => ({
				sourcePath: s.sourcePath,
				targetPath: s.targetPath,
				transform: s.suggestedTransform,
				required: false,
			}));

		return {
			rules,
			allowUnmappedSource: true,
			allowUnmappedTarget: false,
			validateTypes: true,
		};
	}

	// ==================== Mapping Application ====================

	/**
	 * Apply mapping configuration to transform data
	 *
	 * @param sourceData - Source data to transform
	 * @param mapping - Mapping configuration
	 * @returns Transformed data
	 *
	 * @example
	 * ```typescript
	 * const result = mapper.applyMapping(sourceData, {
	 *   rules: [
	 *     { sourcePath: 'firstName', targetPath: 'name.first' },
	 *     { sourcePath: 'lastName', targetPath: 'name.last' }
	 *   ]
	 * });
	 * ```
	 */
	applyMapping(sourceData: unknown, mapping: IMappingConfig): unknown {
		const startTime = Date.now();
		this.logger('Applying mapping', { ruleCount: mapping.rules.length });

		const result: Record<string, unknown> = {};

		mapping.rules.forEach((rule) => {
			const sourceValue = this.getValueByPath(sourceData, rule.sourcePath);

			if (sourceValue === undefined) {
				if (rule.defaultValue !== undefined) {
					this.setValueByPath(result, rule.targetPath, rule.defaultValue);
				} else if (rule.required) {
					throw new ApplicationError('Required source field missing', {
						extra: { sourcePath: rule.sourcePath },
					});
				}
				return;
			}

			let transformedValue: unknown = sourceValue;

			if (rule.transform) {
				transformedValue = this.applyTransform(sourceValue, rule.transform, rule.transformParams);
			}

			this.setValueByPath(result, rule.targetPath, transformedValue);
		});

		const duration = Date.now() - startTime;
		this.logger('Mapping applied', { duration });

		return result;
	}

	/**
	 * Validate mapping configuration
	 */
	validateMapping(
		sourceFields: IFieldMetadata[],
		targetFields: IFieldMetadata[],
		mapping: IMappingConfig,
	): IMappingValidationResult {
		const errors: Array<{ rule: IMappingRule; message: string }> = [];
		const sourcePaths = new Set(this.flattenFields(sourceFields).map((f) => f.path));
		const targetPaths = new Set(this.flattenFields(targetFields).map((f) => f.path));
		const mappedSourcePaths = new Set<string>();
		const mappedTargetPaths = new Set<string>();

		mapping.rules.forEach((rule) => {
			mappedSourcePaths.add(rule.sourcePath);
			mappedTargetPaths.add(rule.targetPath);

			// Validate source path exists
			if (!sourcePaths.has(rule.sourcePath)) {
				errors.push({
					rule,
					message: `Source path not found: ${rule.sourcePath}`,
				});
			}

			// Validate target path exists
			if (!targetPaths.has(rule.targetPath)) {
				errors.push({
					rule,
					message: `Target path not found: ${rule.targetPath}`,
				});
			}

			// Validate types if enabled
			if (mapping.validateTypes) {
				const sourceField = this.flattenFields(sourceFields).find(
					(f) => f.path === rule.sourcePath,
				);
				const targetField = this.flattenFields(targetFields).find(
					(f) => f.path === rule.targetPath,
				);

				if (sourceField && targetField && sourceField.type !== targetField.type) {
					if (!rule.transform) {
						errors.push({
							rule,
							message: `Type mismatch: ${sourceField.type} -> ${targetField.type} (transform needed)`,
						});
					}
				}
			}
		});

		const unmappedSource = Array.from(sourcePaths).filter((p) => !mappedSourcePaths.has(p));
		const unmappedTarget = Array.from(targetPaths).filter((p) => !mappedTargetPaths.has(p));

		if (!mapping.allowUnmappedTarget && unmappedTarget.length > 0) {
			unmappedTarget.forEach((path) => {
				errors.push({
					rule: { sourcePath: '', targetPath: path },
					message: `Target field not mapped: ${path}`,
				});
			});
		}

		return {
			valid: errors.length === 0,
			errors,
			unmappedSource,
			unmappedTarget,
		};
	}

	// ==================== Helper Methods ====================

	/**
	 * Analyze value and extract metadata
	 */
	private analyzeValue(
		value: unknown,
		path: string,
		samples: unknown[],
		maxSamples: number,
		detectFormats: boolean,
	): IFieldMetadata[] {
		const fields: IFieldMetadata[] = [];

		if (Array.isArray(value)) {
			// Analyze array items
			const itemSamples = value.slice(0, maxSamples);
			const itemType = this.inferType(itemSamples[0]);

			if (itemType === 'object' && itemSamples[0]) {
				const children = this.analyzeValue(
					itemSamples[0],
					path,
					itemSamples,
					maxSamples,
					detectFormats,
				);
				fields.push(
					...children.map((child) => ({
						...child,
						isArray: true,
					})),
				);
			}
		} else if (typeof value === 'object' && value !== null) {
			// Analyze object properties
			Object.entries(value).forEach(([key, val]) => {
				const fieldPath = path ? `${path}.${key}` : key;
				const fieldType = this.inferType(val);
				const isArray = Array.isArray(val);

				const field: IFieldMetadata = {
					path: fieldPath,
					name: key,
					type: fieldType,
					nullable: val === null,
					isArray,
					samples: samples.length > 0 ? samples.slice(0, maxSamples) : [val],
				};

				if (detectFormats && fieldType === 'string') {
					field.format = this.detectFormat(val as string);
				}

				if (fieldType === 'object' && !isArray) {
					field.children = this.analyzeValue(val, fieldPath, [val], maxSamples, detectFormats);
				}

				fields.push(field);
			});
		}

		return fields;
	}

	/**
	 * Infer type from value
	 */
	private inferType(value: unknown): IFieldMetadata['type'] {
		if (value === null) return 'null';
		if (Array.isArray(value)) return 'array';

		const jsType = typeof value;
		if (jsType === 'string' || jsType === 'number' || jsType === 'boolean' || jsType === 'object') {
			return jsType;
		}

		return 'unknown';
	}

	/**
	 * Detect string format
	 */
	private detectFormat(value: string): string | undefined {
		if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email';
		if (/^https?:\/\/.+/.test(value)) return 'uri';
		if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
		if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return 'date-time';
		if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
			return 'uuid';
		return undefined;
	}

	/**
	 * Flatten nested fields into flat list
	 */
	private flattenFields(fields: IFieldMetadata[]): IFieldMetadata[] {
		const result: IFieldMetadata[] = [];

		const flatten = (fieldList: IFieldMetadata[]): void => {
			fieldList.forEach((field) => {
				result.push(field);
				if (field.children) {
					flatten(field.children);
				}
			});
		};

		flatten(fields);
		return result;
	}

	/**
	 * Calculate match score between two fields
	 */
	private calculateMatchScore(source: IFieldMetadata, target: IFieldMetadata): number {
		let score = 0;

		// Exact name match
		if (source.name === target.name) {
			score += 0.5;
		}

		// Similar name (edit distance)
		const nameSimilarity = this.stringSimilarity(
			source.name.toLowerCase(),
			target.name.toLowerCase(),
		);
		score += nameSimilarity * 0.3;

		// Type compatibility
		if (source.type === target.type) {
			score += 0.2;
		} else if (this.isTypeCompatible(source.type, target.type)) {
			score += 0.1;
		}

		// Format match
		if (source.format && source.format === target.format) {
			score += 0.1;
		}

		return Math.min(score, 1);
	}

	/**
	 * Calculate string similarity (Levenshtein distance based)
	 */
	private stringSimilarity(str1: string, str2: string): number {
		const longer = str1.length > str2.length ? str1 : str2;
		const shorter = str1.length > str2.length ? str2 : str1;

		if (longer.length === 0) return 1.0;

		const distance = this.levenshteinDistance(longer, shorter);
		return (longer.length - distance) / longer.length;
	}

	/**
	 * Calculate Levenshtein distance
	 */
	private levenshteinDistance(str1: string, str2: string): number {
		const matrix: number[][] = [];

		for (let i = 0; i <= str2.length; i++) {
			matrix[i] = [i];
		}

		for (let j = 0; j <= str1.length; j++) {
			matrix[0][j] = j;
		}

		for (let i = 1; i <= str2.length; i++) {
			for (let j = 1; j <= str1.length; j++) {
				if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
					matrix[i][j] = matrix[i - 1][j - 1];
				} else {
					matrix[i][j] = Math.min(
						matrix[i - 1][j - 1] + 1,
						matrix[i][j - 1] + 1,
						matrix[i - 1][j] + 1,
					);
				}
			}
		}

		return matrix[str2.length][str1.length];
	}

	/**
	 * Check if types are compatible
	 */
	private isTypeCompatible(sourceType: string, targetType: string): boolean {
		const compatibilityMap: Record<string, string[]> = {
			string: ['number', 'boolean'],
			number: ['string'],
			boolean: ['string', 'number'],
		};

		return compatibilityMap[sourceType]?.includes(targetType) ?? false;
	}

	/**
	 * Get match reason
	 */
	private getMatchReason(source: IFieldMetadata, target: IFieldMetadata): string {
		if (source.name === target.name) return 'Exact name match';
		if (source.type === target.type) return 'Compatible types with similar names';
		return 'Similar field names';
	}

	/**
	 * Suggest transformation
	 */
	private suggestTransform(source: IFieldMetadata, target: IFieldMetadata): string | undefined {
		if (source.type === target.type) return undefined;

		if (source.type === 'string' && target.type === 'number') return 'toNumber';
		if (source.type === 'number' && target.type === 'string') return 'toString';
		if (source.type === 'string' && target.type === 'boolean') return 'toBoolean';

		return undefined;
	}

	/**
	 * Get value by path
	 */
	private getValueByPath(obj: unknown, path: string): unknown {
		const keys = path.split('.');
		let current = obj;

		for (const key of keys) {
			if (typeof current !== 'object' || current === null) {
				return undefined;
			}
			current = (current as Record<string, unknown>)[key];
		}

		return current;
	}

	/**
	 * Set value by path
	 */
	private setValueByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
		const keys = path.split('.');
		let current: Record<string, unknown> = obj;

		for (let i = 0; i < keys.length - 1; i++) {
			const key = keys[i];
			const currentValue = current[key];
			if (currentValue === undefined || typeof currentValue !== 'object' || currentValue === null) {
				current[key] = {} as Record<string, unknown>;
			}
			current = current[key] as Record<string, unknown>;
		}

		const lastKey = keys[keys.length - 1];
		current[lastKey] = value;
	}

	/**
	 * Apply transformation
	 */
	private applyTransform(
		value: unknown,
		transform: string,
		params?: Record<string, unknown>,
	): unknown {
		switch (transform) {
			case 'toNumber':
				return Number(value);
			case 'toString':
				return String(value);
			case 'toBoolean':
				return Boolean(value);
			case 'uppercase':
				return typeof value === 'string' ? value.toUpperCase() : value;
			case 'lowercase':
				return typeof value === 'string' ? value.toLowerCase() : value;
			case 'trim':
				return typeof value === 'string' ? value.trim() : value;
			default:
				return value;
		}
	}
}
