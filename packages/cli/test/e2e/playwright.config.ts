import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Custom Nodes E2E tests
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
	testDir: './',
	/* Run tests in files in parallel */
	fullyParallel: true,
	/* Fail the build on CI if you accidentally left test.only in the source code. */
	forbidOnly: !!process.env.CI,
	/* Retry on CI only */
	retries: process.env.CI ? 2 : 0,
	/* Opt out of parallel tests on CI. */
	workers: process.env.CI ? 1 : undefined,
	/* Reporter to use. See https://playwright.dev/docs/test-reporters */
	reporter: [
		['html', { outputFolder: 'test-results/html-report' }],
		['json', { outputFile: 'test-results/results.json' }],
		['junit', { outputFile: 'test-results/junit.xml' }],
		process.env.CI ? ['github'] : ['list'],
	],
	/* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
	use: {
		/* Base URL to use in actions like `await page.goto('/')`. */
		baseURL: process.env.E2E_BASE_URL || 'http://localhost:5678',

		/* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
		trace: 'on-first-retry',

		/* Take screenshot on failure */
		screenshot: 'only-on-failure',

		/* Record video on failure */
		video: 'retain-on-failure',

		/* Global timeout for each action */
		actionTimeout: 10000,

		/* Global timeout for navigation */
		navigationTimeout: 30000,
	},

	/* Configure projects for major browsers */
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},

		{
			name: 'firefox',
			use: { ...devices['Desktop Firefox'] },
		},

		{
			name: 'webkit',
			use: { ...devices['Desktop Safari'] },
		},

		/* Test against mobile viewports. */
		{
			name: 'Mobile Chrome',
			use: { ...devices['Pixel 5'] },
		},
		{
			name: 'Mobile Safari',
			use: { ...devices['iPhone 12'] },
		},

		/* Test against branded browsers. */
		{
			name: 'Microsoft Edge',
			use: { ...devices['Desktop Edge'], channel: 'msedge' },
		},
		{
			name: 'Google Chrome',
			use: { ...devices['Desktop Chrome'], channel: 'chrome' },
		},
	],

	/* Global setup and teardown */
	globalSetup: require.resolve('./global-setup.ts'),
	globalTeardown: require.resolve('./global-teardown.ts'),

	/* Run your local dev server before starting the tests */
	webServer: process.env.CI
		? undefined
		: {
				command: 'npm run dev',
				url: 'http://localhost:5678',
				reuseExistingServer: !process.env.CI,
				timeout: 120 * 1000, // 2 minutes
			},

	/* Folder for test artifacts such as screenshots, videos, traces, etc. */
	outputDir: 'test-results/',

	/* Maximum time one test can run for. */
	timeout: 60 * 1000, // 1 minute

	/* Maximum time the whole test suite can run */
	globalTimeout: process.env.CI ? 30 * 60 * 1000 : undefined, // 30 minutes on CI

	/* Expect timeout for assertions */
	expect: {
		/* Maximum time expect() should wait for the condition to be met. */
		timeout: 10000,
	},
});
