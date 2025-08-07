import { defineConfig } from 'eslint/config';
import { baseConfig } from '@n8n/eslint-config/base';

export default defineConfig(
	baseConfig,
	{
		rules: {
			'unicorn/filename-case': ['error', { case: 'kebabCase' }],

			// TODO: Remove this
			'@typescript-eslint/naming-convention': 'warn',
			'@typescript-eslint/no-wrapper-object-types': 'warn',
			
			// Relax some strict rules for logger and runtime code
			'@typescript-eslint/restrict-plus-operands': 'warn',
			'@typescript-eslint/restrict-template-expressions': 'warn',
		},
	},
	{
		// Enhanced test file configuration with more comprehensive rules
		files: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
		rules: {
			// n8n-specific rules
			'n8n-local-rules/no-uncaught-json-parse': 'warn',
			
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
			
			// Additional TypeScript rules for test flexibility
			'@typescript-eslint/restrict-plus-operands': 'warn',
			'@typescript-eslint/restrict-template-expressions': 'warn',
			'@typescript-eslint/no-unsafe-enum-comparison': 'warn',
			'@typescript-eslint/require-await': 'warn',
		},
	},
);
