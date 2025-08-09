/**
 * Utility types for common TypeScript patterns in n8n
 */

/**
 * Make all properties of T optional recursively
 */
export type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Make all properties of T required recursively
 */
export type DeepRequired<T> = {
	[P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P];
};

/**
 * Extract keys from T that have values assignable to U
 */
export type KeysOfType<T, U> = {
	[K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

/**
 * Make specific keys K of T optional
 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Make specific keys K of T required
 */
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Extract non-function properties from T
 */
export type NonFunctionPropertyNames<T> = {
	[K in keyof T]: T[K] extends (...args: unknown[]) => unknown ? never : K;
}[keyof T];

/**
 * Extract function properties from T
 */
export type FunctionPropertyNames<T> = {
	[K in keyof T]: T[K] extends (...args: unknown[]) => unknown ? K : never;
}[keyof T];

/**
 * Create a type with only non-function properties
 */
export type NonFunctionProperties<T> = Pick<T, NonFunctionPropertyNames<T>>;

/**
 * Create a type with only function properties
 */
export type FunctionProperties<T> = Pick<T, FunctionPropertyNames<T>>;

/**
 * Strict object type that doesn't allow additional properties
 */
export type StrictObject<T> = T & { [K in Exclude<string, keyof T>]?: never };

/**
 * JSON-serializable types
 */
export type JSONValue = string | number | boolean | null | JSONObject | JSONArray;
export type JSONObject = { [key: string]: JSONValue };
export type JSONArray = JSONValue[];

/**
 * Safe property access type that ensures the property exists
 */
export type SafeProperty<T, K extends keyof T> = T[K] extends undefined ? never : T[K];

/**
 * Flatten nested object types into a single level
 */
export type Flatten<T> = T extends object
	? T extends infer O
		? { [K in keyof O]: Flatten<O[K]> }
		: never
	: T;

/**
 * Remove null and undefined from type
 */
export type NonNullable<T> = T extends null | undefined ? never : T;

/**
 * Extract promise type
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

/**
 * Create a branded type for type safety
 */
export type Brand<T, B> = T & { __brand: B };

/**
 * Validation result type
 */
export type ValidationResult<T = unknown> =
	| { valid: true; value: T; errors?: never }
	| { valid: false; errors: string[]; value?: never };

/**
 * Common data transformation types
 */
export type Transform<From, To> = (value: From) => To;
export type AsyncTransform<From, To> = (value: From) => Promise<To>;

/**
 * Event handler type
 */
export type EventHandler<T = unknown> = (event: T) => void;
export type AsyncEventHandler<T = unknown> = (event: T) => Promise<void>;

/**
 * Predicate function type
 */
export type Predicate<T> = (value: T) => boolean;
export type AsyncPredicate<T> = (value: T) => Promise<boolean>;

/**
 * Common n8n data types
 */
export type IDataObject = Record<string, JSONValue>;
export type INodeParameterValue = JSONValue | IDataObject | IDataObject[];

/**
 * Type-safe pick that ensures all keys exist
 */
export type StrictPick<T, K extends keyof T> = {
	[P in K]: T[P];
};

/**
 * Type-safe omit that ensures keys exist before omitting
 */
export type StrictOmit<T, K extends keyof T> = Omit<T, K>;

/**
 * Union to intersection type conversion utility
 */
export type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
	k: infer I,
) => void
	? I
	: never;
