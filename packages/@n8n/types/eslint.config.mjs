import { defineConfig } from 'eslint/config';
import { baseConfig } from '@n8n/eslint-config/base';

export default defineConfig(
	baseConfig,
	{
		languageOptions: {
			parserOptions: {
				project: ['./tsconfig.json', './tsconfig.test.json'],
			},
		},
		rules: {
			'unicorn/filename-case': ['error', { case: 'kebabCase' }],

			// TypeScript safety rules - maintain high standards for type utilities
			'@typescript-eslint/naming-convention': 'error',
			'@typescript-eslint/no-wrapper-object-types': 'error',
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-unsafe-assignment': 'error',
			'@typescript-eslint/no-unsafe-member-access': 'error',
			'@typescript-eslint/no-unsafe-call': 'error',
			'@typescript-eslint/no-unsafe-return': 'error',
			'@typescript-eslint/no-unsafe-argument': 'error',
		},
	},
	{
		// Test file configuration with relaxed rules
		files: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
		languageOptions: {
			parserOptions: {
				project: './tsconfig.test.json',
			},
		},
		rules: {
			// Relax TypeScript safety rules for test files
			'@typescript-eslint/no-unsafe-return': 'warn',
			'@typescript-eslint/no-unsafe-assignment': 'warn',
			'@typescript-eslint/no-unsafe-argument': 'warn',
			'@typescript-eslint/no-unsafe-member-access': 'warn',
			'@typescript-eslint/no-unsafe-call': 'warn',
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/unbound-method': 'warn',
		},
	},
);