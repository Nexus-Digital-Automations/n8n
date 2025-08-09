import type { EnsureTypeOptions } from 'n8n-workflow';
import { ExpressionError } from 'n8n-workflow';

export function ensureType(
	toType: EnsureTypeOptions,
	parameterValue: unknown,
	parameterName: string,
	errorOptions?: { itemIndex?: number; runIndex?: number; nodeCause?: string },
): string | number | boolean | object {
	let returnData = parameterValue;

	if (returnData === null) {
		throw new ExpressionError(`Parameter '${parameterName}' must not be null`, errorOptions);
	}

	if (returnData === undefined) {
		throw new ExpressionError(
			`Parameter '${parameterName}' could not be 'undefined'`,
			errorOptions,
		);
	}

	if (['object', 'array', 'json'].includes(toType)) {
		if (typeof returnData !== 'object') {
			// if value is not an object and is string try to parse it, else throw an error
			if (typeof returnData === 'string' && returnData.length) {
				try {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					const parsedValue = JSON.parse(returnData);

					returnData = parsedValue;
				} catch (error) {
					throw new ExpressionError(`Parameter '${parameterName}' could not be parsed`, {
						...errorOptions,
						// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
						description: error.message,
					});
				}
			} else {
				throw new ExpressionError(
					`Parameter '${parameterName}' must be an ${toType}, but we got '${String(parameterValue)}'`,
					errorOptions,
				);
			}
		} else if (toType === 'json') {
			// value is an object, make sure it is valid JSON
			try {
				JSON.stringify(returnData);
			} catch (error) {
				throw new ExpressionError(`Parameter '${parameterName}' is not valid JSON`, {
					...errorOptions,
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
					description: error.message,
				});
			}
		}

		if (toType === 'array' && !Array.isArray(returnData)) {
			// value is not an array, but has to be
			throw new ExpressionError(
				`Parameter '${parameterName}' must be an array, but we got object`,
				errorOptions,
			);
		}
	}

	try {
		if (toType === 'string') {
			if (typeof returnData === 'object') {
				returnData = JSON.stringify(returnData);
			} else {
				// Only stringify primitive values to avoid [object Object]
				if (returnData === null || returnData === undefined) {
					returnData = '';
				} else if (typeof returnData === 'string') {
					// Already a string, no conversion needed
				} else if (typeof returnData === 'number' || typeof returnData === 'boolean') {
					returnData = String(returnData);
				} else {
					// For any other type, convert to string safely
					returnData = JSON.stringify(returnData);
				}
			}
		}

		if (toType === 'number') {
			returnData = Number(returnData);
			if (Number.isNaN(returnData)) {
				throw new ExpressionError(
					`Parameter '${parameterName}' must be a number, but we got '${String(parameterValue)}'`,
					errorOptions,
				);
			}
		}

		if (toType === 'boolean') {
			returnData = Boolean(returnData);
		}
	} catch (error) {
		if (error instanceof ExpressionError) throw error;

		throw new ExpressionError(`Parameter '${parameterName}' could not be converted to ${toType}`, {
			...errorOptions,
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
			description: error.message,
		});
	}

	return returnData as string | number | boolean | object;
}
