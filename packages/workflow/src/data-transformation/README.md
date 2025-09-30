# Data Transformation Module

Enhanced data transformation capabilities for n8n workflows.

## Overview

This module provides comprehensive data transformation utilities for n8n, including:

- **JSONPath Query Engine**: Advanced querying with filters, wildcards, and recursive descent
- **Schema Validator**: JSON Schema Draft-07 validation with detailed error reporting
- **Transformation Library**: Reusable transformations for common data manipulation patterns
- **Visual Mapper**: Schema inference and intelligent field mapping suggestions

## Installation

The module is automatically included with the `n8n-workflow` package:

```typescript
import {
  JSONPathQuery,
  SchemaValidator,
  TransformationLibrary,
  VisualMapper,
  jsonPathQuery,
  validateSchema
} from 'n8n-workflow';
```

## Features

### 1. JSONPath Query Engine

Advanced JSONPath querying with support for complex expressions:

#### Supported Syntax

- `$` - Root object
- `.property` or `['property']` - Child property
- `[index]` - Array index
- `[*]` - All array elements
- `..property` - Recursive descent (find all nested occurrences)
- `[start:end:step]` - Array slice
- `[?(@.property == value)]` - Filter expression

#### Usage Examples

```typescript
import { JSONPathQuery, jsonPathQuery } from 'n8n-workflow';

const data = {
  users: [
    { name: 'Alice', age: 30, active: true, email: 'alice@example.com' },
    { name: 'Bob', age: 25, active: false, email: 'bob@example.com' },
    { name: 'Charlie', age: 35, active: true, email: 'charlie@example.com' }
  ],
  metadata: {
    total: 3,
    updated: '2024-01-15'
  }
};

// Basic queries
const query = new JSONPathQuery(data);

// Get all user names
const names = query.query('$.users[*].name');
// Returns: ['Alice', 'Bob', 'Charlie']

// Filter users by condition
const activeUsers = query.query('$.users[?(@.active == true)]');
// Returns: [{ name: 'Alice', age: 30, ... }, { name: 'Charlie', age: 35, ... }]

// Recursive descent - find all email fields
const emails = query.query('$..email');
// Returns: ['alice@example.com', 'bob@example.com', 'charlie@example.com']

// Array slicing
const firstTwo = query.query('$.users[0:2]');
// Returns: First 2 users

// Convenience functions
const result = jsonPathQuery(data, '$.users[0].name');
// Returns: 'Alice'

// Map over results
const ages = query.map('$.users[*]', (user: any) => user.age * 2);
// Returns: [60, 50, 70]

// Filter results
const adults = query.filter('$.users[*]', (user: any) => user.age >= 30);
// Returns: [Alice, Charlie]

// Utility methods
query.first('$.users[*]');  // First user
query.last('$.users[*]');   // Last user
query.count('$.users[*]');  // Count: 3
query.exists('$.metadata');  // true
```

### 2. Schema Validator

JSON Schema Draft-07 validation with comprehensive error reporting:

#### Features

- Full JSON Schema Draft-07 support
- Type validation (string, number, boolean, object, array, null)
- String constraints (minLength, maxLength, pattern, format)
- Number constraints (minimum, maximum, exclusiveMinimum, exclusiveMaximum)
- Array constraints (minItems, maxItems, uniqueItems)
- Object constraints (required, properties, additionalProperties)
- Combined schemas (oneOf, anyOf, allOf, not)
- Conditional validation (if/then/else)
- Format validation (email, uri, uuid, date, date-time, ipv4, ipv6)
- Type coercion support
- Detailed error messages with paths

#### Usage Examples

```typescript
import { SchemaValidator, validateSchema } from 'n8n-workflow';

// Define schema
const userSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    age: { type: 'number', minimum: 0, maximum: 150 },
    email: { type: 'string', format: 'email' },
    address: {
      type: 'object',
      properties: {
        city: { type: 'string' },
        zipCode: { type: 'string', pattern: '^\\d{5}$' }
      },
      required: ['city']
    }
  },
  required: ['name', 'email']
};

// Validate data
const validator = new SchemaValidator(userSchema);

const validData = {
  name: 'Alice',
  age: 30,
  email: 'alice@example.com',
  address: { city: 'New York', zipCode: '10001' }
};

const result = validator.validate(validData);
console.log(result.valid); // true

// Invalid data
const invalidData = {
  name: '',  // Too short
  age: -5,   // Below minimum
  email: 'invalid-email',  // Invalid format
  // missing required 'address.city'
};

const invalidResult = validator.validate(invalidData);
console.log(invalidResult.valid); // false
console.log(invalidResult.errorSummary);
// Validation failed with 3 error(s):
//   - name: String length must be at least 1
//   - age: Number must be at least 0
//   - email: String does not match format: email

// Convenience function
const quickResult = validateSchema(data, schema);

// Validate or throw
try {
  validator.validateOrThrow(data);
} catch (error) {
  console.error('Validation failed:', error.message);
}

// Validate specific property
const emailResult = validator.validateProperty(data, 'email');
```

### 3. Transformation Library

Reusable transformations for common data manipulation patterns:

#### Date & Time Transformations

```typescript
import { TransformationLibrary, transformations } from 'n8n-workflow';

const library = new TransformationLibrary();

// Format dates
library.formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss');
// Returns: "2024-01-15 14:30:45"

// Parse dates
library.parseDate('2024-01-15', 'YYYY-MM-DD');

// Add time
library.addTime(new Date(), 7, 'days');

// Relative time
library.relativeTime(new Date(Date.now() - 3600000));
// Returns: "1 hours ago"
```

#### String Transformations

```typescript
// Case conversions
library.camelCase('hello-world');      // "helloWorld"
library.snakeCase('helloWorld');       // "hello_world"
library.kebabCase('HelloWorld');       // "hello-world"
library.pascalCase('hello_world');     // "HelloWorld"

// Utilities
library.truncate('Long text...', 10);  // "Long te..."
library.slugify('Hello World!');       // "hello-world"

// Extraction
library.extractNumbers('Price: $99.99');    // [99.99]
library.extractEmails(text);                // ['email@example.com']
library.extractUrls(text);                  // ['https://example.com']
```

#### Object Transformations

```typescript
// Normalize
library.normalizeObject(data, {
  removeNull: true,
  trim: true,
  camelCaseKeys: true
});

// Flatten/Unflatten
library.flattenObject({ a: { b: { c: 1 } } });
// Returns: { 'a.b.c': 1 }

library.unflattenObject({ 'a.b.c': 1 });
// Returns: { a: { b: { c: 1 } } }

// Pick/Omit
library.pick(obj, ['name', 'email']);
library.omit(obj, ['password', 'secret']);

// Deep merge
library.deepMerge(target, source1, source2);
```

#### Array Transformations

```typescript
// Group by property
library.groupBy(users, 'role');
// Returns: { admin: [...], user: [...] }

// Sort
library.sortBy(users, 'age', 'desc');

// Remove duplicates
library.unique([1, 2, 2, 3]);           // [1, 2, 3]
library.uniqueBy(users, 'email');       // Unique by email

// Chunk
library.chunk([1, 2, 3, 4, 5], 2);
// Returns: [[1, 2], [3, 4], [5]]
```

#### Format Conversions

```typescript
// CSV to JSON
const csvString = 'name,age\nAlice,30\nBob,25';
library.csvToJson(csvString);
// Returns: [{ name: 'Alice', age: '30' }, { name: 'Bob', age: '25' }]

// JSON to CSV
library.jsonToCsv([
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 }
]);
// Returns: "name,age\nAlice,30\nBob,25"

// XML conversions
library.xmlToJson(xmlString);
library.jsonToXml(jsonData, 'root');
```

#### Type Conversions

```typescript
// Safe parsing
library.safeJsonParse('invalid', { default: 'value' });

// Type conversions
library.toBoolean('true');              // true
library.toNumber('123', 0);             // 123

// Byte formatting
library.formatBytes(1024);              // "1 KB"
library.parseBytes('1.5 MB');           // 1572864
```

### 4. Visual Mapper

Schema inference and intelligent field mapping for visual interfaces:

#### Schema Inference

```typescript
import { VisualMapper } from 'n8n-workflow';

const mapper = new VisualMapper();

// Infer schema from sample data
const data = {
  name: 'Alice',
  age: 30,
  email: 'alice@example.com',
  address: {
    city: 'New York',
    zipCode: '10001'
  }
};

const schema = mapper.inferSchema(data);
// Returns field metadata with types, formats, and nested structure

// Convert to JSON Schema
const jsonSchema = mapper.toJsonSchema(schema, 'User');
```

#### Intelligent Mapping Suggestions

```typescript
// Get mapping suggestions
const sourceSchema = mapper.inferSchema(sourceData);
const targetSchema = mapper.inferSchema(targetStructure);

const suggestions = mapper.suggestMappings(sourceSchema, targetSchema);
// Returns: [
//   {
//     sourcePath: 'firstName',
//     targetPath: 'name.first',
//     confidence: 0.85,
//     reason: 'Similar field names',
//     suggestedTransform: undefined
//   },
//   ...
// ]

// Auto-generate mapping
const mapping = mapper.autoGenerateMapping(sourceSchema, targetSchema, 0.7);
```

#### Apply Mappings

```typescript
// Apply mapping configuration
const result = mapper.applyMapping(sourceData, {
  rules: [
    { sourcePath: 'firstName', targetPath: 'name.first' },
    { sourcePath: 'lastName', targetPath: 'name.last' },
    {
      sourcePath: 'age',
      targetPath: 'ageInYears',
      transform: 'toNumber'
    },
    {
      sourcePath: 'missing',
      targetPath: 'status',
      defaultValue: 'active'
    }
  ],
  validateTypes: true
});

// Validate mapping configuration
const validation = mapper.validateMapping(sourceSchema, targetSchema, mapping);
if (!validation.valid) {
  console.log('Unmapped fields:', validation.unmappedTarget);
  console.log('Errors:', validation.errors);
}
```

## Integration Examples

### Example 1: Data Validation Workflow

```typescript
import { SchemaValidator, JSONPathQuery } from 'n8n-workflow';

// Define schema for webhook data
const webhookSchema = {
  type: 'object',
  properties: {
    event: { type: 'string', enum: ['created', 'updated', 'deleted'] },
    data: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        timestamp: { type: 'string', format: 'date-time' }
      },
      required: ['id', 'timestamp']
    }
  },
  required: ['event', 'data']
};

// Validate incoming webhook
const validator = new SchemaValidator(webhookSchema);
const result = validator.validate(webhookData);

if (!result.valid) {
  throw new Error(`Invalid webhook data: ${result.errorSummary}`);
}

// Extract relevant data
const query = new JSONPathQuery(webhookData);
const eventType = query.first('$.event');
const dataIds = query.query('$.data[*].id');
```

### Example 2: Data Transformation Pipeline

```typescript
import { TransformationLibrary, VisualMapper } from 'n8n-workflow';

const library = new TransformationLibrary();
const mapper = new VisualMapper();

// Step 1: Parse CSV input
const csvData = library.csvToJson(csvInput);

// Step 2: Normalize data
const normalized = csvData.map(row =>
  library.normalizeObject(row, {
    trim: true,
    removeEmpty: true,
    camelCaseKeys: true
  })
);

// Step 3: Transform dates
const transformed = normalized.map(row => ({
  ...row,
  createdAt: library.formatDate(row.createdAt, 'YYYY-MM-DD'),
  updatedAt: library.formatDate(row.updatedAt, 'YYYY-MM-DD')
}));

// Step 4: Map to target schema
const sourceSchema = mapper.inferSchema(transformed[0]);
const mapping = mapper.autoGenerateMapping(sourceSchema, targetSchema);
const finalData = transformed.map(row => mapper.applyMapping(row, mapping));
```

### Example 3: Complex JSONPath Queries

```typescript
import { JSONPathQuery } from 'n8n-workflow';

const orderData = {
  orders: [
    {
      id: 1,
      customer: { name: 'Alice', tier: 'gold' },
      items: [
        { product: 'Widget', price: 10.99, qty: 2 },
        { product: 'Gadget', price: 25.50, qty: 1 }
      ],
      total: 47.48
    },
    {
      id: 2,
      customer: { name: 'Bob', tier: 'silver' },
      items: [
        { product: 'Widget', price: 10.99, qty: 1 }
      ],
      total: 10.99
    }
  ]
};

const query = new JSONPathQuery(orderData);

// Find all gold tier customer orders
const goldOrders = query.query('$.orders[?(@.customer.tier == "gold")]');

// Get all product names from all orders
const products = query.query('$..items[*].product');

// Calculate total revenue
const totals = query.query('$.orders[*].total');
const revenue = totals.reduce((sum, t) => sum + t, 0);

// Find orders with high-value items
const expensiveOrders = query.query('$.orders[?(@.items[*].price > 20)]');
```

## Performance Considerations

### JSONPath Query

- Recursive descent (`..`) can be expensive on large nested structures
- Use `maxDepth` option to limit recursion depth
- Filter expressions are evaluated for each array item
- Consider caching query instances for repeated operations

### Schema Validator

- Schema compilation is done once at instantiation
- Validation is fast for simple schemas
- Complex combined schemas (oneOf, anyOf) require multiple validations
- Use `coerceTypes: false` if type safety is critical

### Transformation Library

- Most transformations are O(n) complexity
- Deep operations (flatten, deepMerge) traverse entire object tree
- CSV parsing handles large files efficiently
- Consider streaming for very large datasets

## Type Safety

All modules are fully typed with TypeScript:

```typescript
import type {
  IJsonPathOptions,
  IJsonSchema,
  IValidationResult,
  ITransformOptions,
  IMappingConfig,
  IFieldMetadata
} from 'n8n-workflow';
```

## Error Handling

All modules use n8n's `ApplicationError` for consistent error reporting:

```typescript
try {
  const result = query.query('$.invalid.path');
} catch (error) {
  if (error instanceof ApplicationError) {
    console.error(error.message);
    console.error(error.extra);
  }
}
```

## Best Practices

1. **Validate Early**: Use schema validation at workflow entry points
2. **Reuse Instances**: Create query and validator instances once and reuse
3. **Handle Errors**: Always wrap transformations in try-catch blocks
4. **Test Mappings**: Validate mapping configurations before applying to production data
5. **Use Type Guards**: Leverage TypeScript types for safer code
6. **Optimize Queries**: Use specific paths instead of recursive descent when possible
7. **Cache Results**: Store frequently-used query results

## Testing

Example test cases:

```typescript
import { JSONPathQuery, SchemaValidator, TransformationLibrary } from 'n8n-workflow';

describe('Data Transformation', () => {
  it('should query with JSONPath', () => {
    const data = { users: [{ name: 'Alice' }] };
    const query = new JSONPathQuery(data);
    expect(query.first('$.users[0].name')).toBe('Alice');
  });

  it('should validate schema', () => {
    const schema = { type: 'string', minLength: 1 };
    const validator = new SchemaValidator(schema);
    expect(validator.validate('hello').valid).toBe(true);
    expect(validator.validate('').valid).toBe(false);
  });

  it('should transform data', () => {
    const library = new TransformationLibrary();
    expect(library.camelCase('hello-world')).toBe('helloWorld');
  });
});
```

## License

Part of n8n - Licensed under the Sustainable Use License

## Support

For issues and questions:
- GitHub: https://github.com/n8n-io/n8n
- Documentation: https://docs.n8n.io
- Community: https://community.n8n.io