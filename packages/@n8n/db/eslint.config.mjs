import { defineConfig } from 'eslint/config';
import { baseConfig } from '@n8n/eslint-config/base';

export default defineConfig(
	baseConfig,
	{
		rules: {
			'unicorn/filename-case': ['error', { case: 'kebabCase' }],

			// TODO: Remove this
			'@typescript-eslint/naming-convention': 'warn',
			'@typescript-eslint/no-unsafe-member-access': 'warn',
			'@typescript-eslint/no-unsafe-assignment': 'warn',
			'@typescript-eslint/prefer-nullish-coalescing': 'warn',
			'@typescript-eslint/unbound-method': 'warn',
			'@typescript-eslint/no-base-to-string': 'warn',
			'@typescript-eslint/require-await': 'warn',
			'@typescript-eslint/no-unsafe-call': 'warn',
			'@typescript-eslint/no-unsafe-function-type': 'warn',
			'@typescript-eslint/no-empty-object-type': 'warn',
			'@typescript-eslint/no-restricted-types': 'warn',
			'no-useless-escape': 'warn',
			'no-empty': 'warn',
			
			// Additional production code flexibility for technical debt
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-unsafe-return': 'warn',
		},
	},
	{
		// Enhanced test file configuration for comprehensive test coverage
		files: ['**/*.test.ts', '**/__tests__/**/*.ts', '**/*.spec.ts'],
		rules: {
			// TypeScript safety rules - relaxed for test files
			'@typescript-eslint/no-unsafe-return': 'warn',
			'@typescript-eslint/no-unsafe-assignment': 'warn',
			'@typescript-eslint/no-unsafe-argument': 'warn',
			'@typescript-eslint/no-unsafe-member-access': 'warn',
			'@typescript-eslint/no-unsafe-call': 'warn',
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/unbound-method': 'warn',
			
			// Allow require() imports in test files for Jest mocks and dynamic imports
			'@typescript-eslint/no-require-imports': 'warn',
			
			// Additional rules for test flexibility
			'@typescript-eslint/restrict-plus-operands': 'warn',
			'@typescript-eslint/restrict-template-expressions': 'warn',
			'@typescript-eslint/no-unsafe-enum-comparison': 'warn',
			'@typescript-eslint/require-await': 'warn',
		},
	},
	{
		files: ['./src/migrations/**/*.ts'],
		rules: {
			'unicorn/filename-case': 'off',
		},
	},
);
