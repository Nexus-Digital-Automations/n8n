import { FullConfig } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { teardownTestDb } from '../integration/helpers/test-database';

/**
 * Global teardown for E2E tests
 * Runs once after all tests complete
 */
async function globalTeardown(config: FullConfig) {
	console.log('🧹 Starting E2E test global teardown...');

	try {
		// Clean up test database
		console.log('📊 Cleaning up test database...');
		await teardownTestDb();

		// Clean up authentication state
		console.log('🔐 Cleaning up authentication state...');
		try {
			await fs.unlink('test-results/auth-state.json');
		} catch {
			// Ignore if file doesn't exist
		}

		// Clean up test fixtures
		console.log('🗂️ Cleaning up test fixtures...');
		try {
			const fixturesDir = path.join(__dirname, 'fixtures');
			const files = await fs.readdir(fixturesDir);

			for (const file of files) {
				await fs.unlink(path.join(fixturesDir, file));
			}

			await fs.rmdir(fixturesDir);
		} catch {
			// Ignore if directory doesn't exist or is not empty
		}

		// Clean up temporary files
		console.log('🧽 Cleaning up temporary files...');
		try {
			const tempFiles = ['/tmp/test-custom-nodes', '/tmp/e2e-test-uploads'];

			for (const tempPath of tempFiles) {
				try {
					const stats = await fs.stat(tempPath);
					if (stats.isDirectory()) {
						await fs.rm(tempPath, { recursive: true, force: true });
					} else {
						await fs.unlink(tempPath);
					}
				} catch {
					// Ignore if path doesn't exist
				}
			}
		} catch {
			// Ignore cleanup errors
		}

		console.log('✅ E2E test global teardown completed successfully');
	} catch (error) {
		console.error('❌ E2E test global teardown failed:', error);
		// Don't throw error in teardown to avoid masking test failures
		console.error('Continuing despite teardown errors...');
	}
}

export default globalTeardown;
