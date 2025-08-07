// Root ESLint configuration for n8n monorepo
// Optimized for monorepo structure with proper package delegation
import tsParser from '@typescript-eslint/parser';

export default [
	{
		// Global ignores applied to all configurations - PERFORMANCE OPTIMIZED
		ignores: [
			// Build outputs and dependencies (CRITICAL: excludes 6,060+ compiled files)
			'**/node_modules/**',
			'**/dist/**',
			'**/build/**',
			'**/coverage/**',
			'**/coverage-overview.html',
			'**/.turbo/**',
			'**/bin/**',
			'**/templates/**',
			'**/lib/**',
			'**/out/**',
			'**/.next/**',
			'**/.nuxt/**',
			'**/public/build/**',
			
			// Generated and config files (PERFORMANCE: avoids parsing large files)
			'**/*.d.ts',
			'**/*.map',
			'**/*.min.js',
			'**/*.bundle.js',
			'**/*.chunk.js',
			'**/*.json',
			'**/*.md',
			'**/*.yml',
			'**/*.yaml',
			'**/*.xml',
			'**/*.svg',
			'**/*.png',
			'**/*.jpg',
			'**/*.jpeg',
			'**/*.gif',
			'**/*.ico',
			'**/*.woff',
			'**/*.woff2',
			'**/*.ttf',
			'**/*.eot',
			
			// Project specific directories
			'development/**',     // Development documentation
			'patches/**',         // Package patches  
			'scripts/**',         // Build scripts
			'docker/**',
			'docs/**',
			'examples/**',
			'benchmark/**',
			
			// PERFORMANCE CRITICAL: Exclude all test and e2e files (handled by package configs)
			'cypress/**',         // All Cypress files - avoid TypeScript parsing issues
			'**/__tests__/**',
			'**/*.test.ts',
			'**/*.test.js', 
			'**/*.spec.ts',
			'**/*.spec.js',
			'**/*.e2e.ts',
			'**/*.cy.ts',
			'**/test/**',
			'**/tests/**',
			'**/fixtures/**',
			'**/mocks/**',
			'**/__fixtures__/**',
			'**/__mocks__/**',
			'**/test-results/**',
			'**/playwright-report/**',
			
			// Node.js and package manager files (PERFORMANCE: large files)
			'**/package-lock.json',
			'**/yarn.lock',
			'**/pnpm-lock.yaml',
			'**/.pnpm-store/**',
			'**/.yarn/**',
			'**/.npm/**',
			
			// Temporary and cache files
			'.vscode/**',
			'.idea/**',
			'**/.DS_Store',
			'**/.eslintcache',
			'**/.tsbuildinfo',
			'*.log',
			'**/temp/**',
			'**/tmp/**',
			'**/.cache/**',
			
			// PERFORMANCE: Delegate package linting to individual package configs
			'packages/**',        // All package files handled by their own eslint configs
		],
	},
	{
		// PERFORMANCE CRITICAL: Minimal configuration for root-level files only
		// Packages handle their own linting via individual eslint.config.mjs files
		files: ['*.js', '*.mjs', '*.cjs'],
		languageOptions: {
			ecmaVersion: 2024,
			sourceType: 'module',
			parserOptions: {
				// PERFORMANCE: Disable TypeScript project loading at root level
				project: null,
				projectService: false,
			},
		},
		rules: {
			// Essential rules for root-level configuration files (minimal set)
			'no-console': 'warn',
			'no-debugger': 'error',
		},
	},
	{
		// PERFORMANCE: Separate lightweight config for TypeScript files at root
		files: ['*.ts'],
		languageOptions: {
			ecmaVersion: 2024,
			sourceType: 'module',
			parser: tsParser,
			parserOptions: {
				// PERFORMANCE: No project service for root TS files
				project: null,
				projectService: false,
			},
		},
		rules: {
			// Minimal TypeScript rules
			'no-console': 'warn',
			'no-debugger': 'error',
		},
	},
];