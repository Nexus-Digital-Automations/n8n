import { nodeConfig } from '@n8n/eslint-config/node';

export default [
	...nodeConfig,
	{
		ignores: [
			'scripts/**/*.mjs',
			'dist/**',
			'coverage/**',
			'node_modules/**',
			'eslint.config.*', // ESLint config files can use default exports
		],
	},
	{
		rules: {
			// Custom overrides for CLI package
			complexity: 'warn',
			// Disable n8n-local-rules until they are properly configured
			'n8n-local-rules/misplaced-n8n-typeorm-import': 'off',
			'n8n-local-rules/no-type-unsafe-event-emitter': 'off',
			
			// Progressive ESLint enforcement - Phase 1: Quick wins (promoted to error)
			'no-fallthrough': 'error',
			'no-case-declarations': 'error',
			
			// TODO: Remove these temporary warnings - Phase 2: Medium-term fixes needed
			'no-ex-assign': 'warn',
			'no-unsafe-optional-chaining': 'warn',
			'no-empty': 'warn',
			'no-async-promise-executor': 'warn',
			'no-useless-escape': 'warn',
			'prefer-const': 'warn',
		},
	},
];
