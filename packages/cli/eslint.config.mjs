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
			// TODO: Remove these temporary warnings
			'no-ex-assign': 'warn',
			'no-case-declarations': 'warn',
			'no-fallthrough': 'warn',
			'no-unsafe-optional-chaining': 'warn',
			'no-empty': 'warn',
			'no-async-promise-executor': 'warn',
			'no-useless-escape': 'warn',
			'prefer-const': 'warn',
		},
	},
];
