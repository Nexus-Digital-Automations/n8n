# @n8n/types

Shared TypeScript type definitions, type guards, and validation utilities for n8n monorepo.

## Overview

This package provides a comprehensive set of TypeScript utilities to ensure type safety and consistent patterns across the n8n codebase. It includes:

- **Utility Types**: Advanced TypeScript type helpers for common patterns
- **Type Guards**: Runtime type checking utilities for safe data access  
- **Validation**: Data transformation and validation functions
- **Node Types**: Comprehensive type definitions for n8n nodes and workflows

## Installation

```bash
npm install @n8n/types
```

## Usage

### Utility Types

```typescript
import type { DeepPartial, Optional, ValidationResult } from '@n8n/types';

// Make all properties optional recursively
type Config = DeepPartial<{
  database: {
    host: string;
    port: number;
  };
}>;

// Make specific keys optional
type User = Optional<{ id: string; name: string; email: string }, 'email'>;

// Validation result type
function validate(data: unknown): ValidationResult<User> {
  // ... validation logic
}
```

### Type Guards

```typescript
import { 
  isString, 
  isNumber, 
  isObject, 
  isArrayOf, 
  hasProperty,
  isValidEmail
} from '@n8n/types';

// Safe type checking
function processData(data: unknown) {
  if (isObject(data) && hasProperty(data, 'email') && isValidEmail(data.email)) {
    // TypeScript knows data.email is a valid email string
    console.log(`Email: ${data.email}`);
  }

  if (isArrayOf(data, isString)) {
    // TypeScript knows data is string[]
    data.forEach(str => console.log(str.toUpperCase()));
  }
}
```

### Validation

```typescript
import { 
  ValidationError,
  tryToParseNumber,
  validateFieldType,
  validateRequiredProperties 
} from '@n8n/types';

// Safe data parsing
try {
  const age = tryToParseNumber("25");
  console.log(age); // 25 (number)
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid number:', error.message);
  }
}

// Field validation
const result = validateFieldType('age', '25', isNumber);
if (result.valid) {
  console.log(result.value); // 25 (number)
} else {
  console.error(result.errors);
}
```

### Node Types

```typescript
import type { 
  NodeParameter, 
  NodeExecutionData, 
  StringParameter,
  OptionsParameter 
} from '@n8n/types';

// Define node parameters
const parameters: NodeParameter[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    required: true,
    default: 'get',
    options: [
      { name: 'Get', value: 'get' },
      { name: 'Create', value: 'create' }
    ]
  } as OptionsParameter,
  {
    displayName: 'Name',
    name: 'name',
    type: 'string',
    required: true,
    default: ''
  } as StringParameter
];

// Process execution data
function processExecutionData(data: NodeExecutionData[]): void {
  data.forEach(item => {
    // TypeScript knows the structure of item.json, item.binary, etc.
    console.log(item.json);
  });
}
```

## Type Safety Patterns

### Safe Property Access

```typescript
import { getSafeProperty, isString } from '@n8n/types';

function getUserName(user: unknown): string | null {
  const nameResult = getSafeProperty(user, 'name', isString);
  return nameResult.valid ? nameResult.value : null;
}
```

### Array Validation

```typescript
import { validateArrayItems, isNumber } from '@n8n/types';

function processNumbers(data: unknown): number[] {
  const result = validateArrayItems(data, (item) => 
    validateFieldType('item', item, isNumber)
  );
  
  if (result.valid) {
    return result.value;
  } else {
    throw new Error(`Invalid numbers: ${result.errors.join(', ')}`);
  }
}
```

### Composite Validation

```typescript
import { createValidator, isObject, hasProperty, isString, isNumber } from '@n8n/types';

const isUser = createValidator(
  (value): ValidationResult<User> => {
    if (!isObject(value)) {
      return { valid: false, errors: ['Must be an object'] };
    }
    
    if (!hasProperty(value, 'name') || !isString(value.name)) {
      return { valid: false, errors: ['Must have string name property'] };
    }
    
    if (!hasProperty(value, 'age') || !isNumber(value.age)) {
      return { valid: false, errors: ['Must have number age property'] };
    }
    
    return { valid: true, value: value as User };
  }
);
```

## API Reference

### Utility Types

- `DeepPartial<T>` - Make all properties optional recursively
- `DeepRequired<T>` - Make all properties required recursively  
- `Optional<T, K>` - Make specific keys optional
- `ValidationResult<T>` - Result type for validation functions
- `IDataObject` - n8n data object type
- `JSONValue` - JSON-serializable value types

### Type Guards

- `isString(value)` - Check if value is string
- `isNumber(value)` - Check if value is number
- `isObject(value)` - Check if value is object
- `isArray(value)` - Check if value is array
- `hasProperty(obj, key)` - Check if object has property
- `isValidEmail(value)` - Check if value is valid email
- `isValidUrl(value)` - Check if value is valid URL

### Validation Functions

- `tryToParseNumber(value)` - Parse value as number with errors
- `tryToParseString(value)` - Parse value as string  
- `tryToParseBoolean(value)` - Parse value as boolean
- `validateFieldType(name, value, guard)` - Validate field with type guard
- `validateJson(value)` - Validate JSON-serializable value

### Node Types

- `NodeParameter` - Base node parameter types
- `NodeExecutionData` - Node execution data structure
- `NodeMetadata` - Node metadata and configuration
- `NodeConnectionType` - Node connection types

## Contributing

When adding new types or utilities:

1. Add comprehensive JSDoc comments
2. Include type guards for runtime checking
3. Provide validation functions where appropriate
4. Add tests for new functionality
5. Update this README with usage examples

## License

Same as n8n core - see LICENSE.md in repository root.