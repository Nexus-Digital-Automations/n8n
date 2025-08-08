import { baseConfig } from '@n8n/eslint-config/base';

export default [
	...baseConfig,
	{
		rules: {
			'unicorn/filename-case': ['error', { case: 'kebabCase' }],

			// Disable naming convention warnings for role-based property names
			// These are legitimate business domain names (global:owner, project:admin, etc.)
			'@typescript-eslint/naming-convention': 'off',

			// TODO: Remove this
			'import-x/order': 'warn',
		},
	},
];
