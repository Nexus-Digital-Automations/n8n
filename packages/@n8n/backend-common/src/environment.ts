const { NODE_ENV } = process.env;

export const inTest = NODE_ENV === 'test';
export const inProduction = NODE_ENV === 'production';
// For any environment not explicitly "test" or "production", default to development
// This ensures exactly one flag is always true
export const inDevelopment = !inTest && !inProduction;
