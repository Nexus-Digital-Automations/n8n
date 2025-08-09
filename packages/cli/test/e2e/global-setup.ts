import { chromium, FullConfig } from '@playwright/test';
import { setupTestDb } from '../integration/helpers/test-database';
import { createMockUser } from '../integration/helpers/test-user';

/**
 * Global setup for E2E tests
 * Runs once before all tests
 */
async function globalSetup(config: FullConfig) {
	console.log('🚀 Starting E2E test global setup...');

	try {
		// Setup test database
		console.log('📊 Setting up test database...');
		await setupTestDb();

		// Create test user
		console.log('👤 Creating test user...');
		const testUser = await createMockUser({
			email: 'e2e-test@n8n.io',
			firstName: 'E2E',
			lastName: 'Test User',
			role: 'owner',
		});

		// Setup authentication state
		console.log('🔐 Setting up authentication state...');
		const browser = await chromium.launch();
		const context = await browser.newContext();
		const page = await context.newPage();

		// Navigate to login page and authenticate
		const baseURL = config.projects[0].use?.baseURL || 'http://localhost:5678';
		await page.goto(`${baseURL}/signin`);

		// Fill login form (mock authentication)
		await page.fill('input[name="email"]', testUser.email);
		await page.fill('input[name="password"]', 'test-password');
		await page.click('button[type="submit"]');

		// Wait for successful login
		await page.waitForURL(`${baseURL}/workflow/**`, { timeout: 30000 });

		// Save authentication state
		await context.storageState({ path: 'test-results/auth-state.json' });

		await browser.close();

		console.log('✅ E2E test global setup completed successfully');
	} catch (error) {
		console.error('❌ E2E test global setup failed:', error);
		throw error;
	}
}

export default globalSetup;
