import { baseConfig } from '@n8n/eslint-config/base';

export default [
	...baseConfig,
	{
		rules: {
			'unicorn/filename-case': ['error', { case: 'kebabCase' }],
		},
	},
	{
		// Enhanced rules for test files to handle Jest mocks and testing patterns
		files: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
		rules: {
			// Allow Jest mock patterns and testing utilities
			'@typescript-eslint/no-unsafe-assignment': 'warn',
			'@typescript-eslint/no-unsafe-member-access': 'warn', 
			'@typescript-eslint/no-unsafe-call': 'warn',
			'@typescript-eslint/no-unsafe-return': 'warn',
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/unbound-method': 'off',
			// Allow require() imports in test files for dynamic imports
			'@typescript-eslint/no-require-imports': 'warn',
		},
	},
];
