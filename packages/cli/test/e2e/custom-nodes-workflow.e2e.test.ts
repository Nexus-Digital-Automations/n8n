import { test, expect, Page, BrowserContext } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { setupTestDb, teardownTestDb } from '../integration/helpers/test-database';
import { createTestApp } from '../integration/helpers/test-app';
import { createMockUser } from '../integration/helpers/test-user';
import type { User } from '@/databases/entities/User';

/**
 * End-to-End tests for Custom Nodes workflow
 * Tests the complete user journey: upload file → validate → deploy → monitor → undeploy
 */

let testApp: any;
let testUser: User;
let baseURL: string;

test.beforeAll(async () => {
	// Setup test database and application
	await setupTestDb();
	testUser = await createMockUser();
	testApp = await createTestApp(testUser);

	// Start test server
	const server = testApp.listen(0);
	const address = server.address();
	baseURL = `http://localhost:${address.port}`;
});

test.afterAll(async () => {
	await teardownTestDb();
	if (testApp) {
		testApp.close();
	}
});

test.describe('Custom Nodes E2E Workflow', () => {
	let context: BrowserContext;
	let page: Page;

	test.beforeEach(async ({ browser }) => {
		context = await browser.newContext({
			baseURL,
			// Mock authentication
			storageState: {
				cookies: [
					{
						name: 'n8n-auth',
						value: `test-session-${testUser.id}`,
						domain: 'localhost',
						path: '/',
						httpOnly: true,
						secure: false,
						sameSite: 'Lax',
					},
				],
				origins: [],
			},
		});
		page = await context.newPage();

		// Create test node file
		const testNodeContent = `
			class TestNode {
				description = {
					displayName: 'E2E Test Node',
					name: 'e2eTestNode',
					group: ['trigger'],
					version: 1,
					description: 'A test node for E2E testing',
					defaults: {
						name: 'E2E Test Node',
					},
					inputs: ['main'],
					outputs: ['main'],
					properties: [
						{
							displayName: 'Message',
							name: 'message',
							type: 'string',
							default: 'Hello from E2E test',
							description: 'The message to return',
						},
					],
				};

				async execute() {
					const items = this.getInputData();
					const message = this.getNodeParameter('message', 0, 'Hello from E2E test');

					return this.prepareOutputData([
						{
							json: { message },
						},
					]);
				}
			}

			module.exports = { nodeClass: TestNode };
		`;

		const testNodePath = path.join(__dirname, 'fixtures', 'e2e-test-node.js');
		await fs.mkdir(path.dirname(testNodePath), { recursive: true });
		await fs.writeFile(testNodePath, testNodeContent);
	});

	test.afterEach(async () => {
		await context.close();

		// Clean up test files
		try {
			await fs.unlink(path.join(__dirname, 'fixtures', 'e2e-test-node.js'));
		} catch {
			// Ignore if file doesn't exist
		}
	});

	test('should complete full custom node workflow', async () => {
		// Step 1: Navigate to Custom Nodes settings page
		await page.goto('/settings/custom-nodes');
		await expect(page.getByText('Custom Nodes')).toBeVisible();
		await expect(page.getByText('Manage custom nodes in your n8n instance')).toBeVisible();

		// Step 2: Click Upload Node button
		const uploadButton = page.getByTestId('upload-custom-node-button');
		await expect(uploadButton).toBeVisible();
		await uploadButton.click();

		// Step 3: Upload modal should open
		await expect(page.getByText('Upload Custom Node')).toBeVisible();
		await expect(page.getByText('Add a custom node to your n8n instance')).toBeVisible();

		// Step 4: Upload file via drag and drop area
		const fileInput = page.locator('input[type="file"]');
		const testFilePath = path.join(__dirname, 'fixtures', 'e2e-test-node.js');

		await fileInput.setInputFiles(testFilePath);

		// Wait for file to be processed
		await expect(page.getByText('e2e-test-node.js')).toBeVisible();

		// Step 5: Fill in metadata form
		await page.getByPlaceholderText('Enter author name').fill('E2E Test Author');
		await page.getByPlaceholderText('Describe your node').fill('This is an end-to-end test node');
		await page.getByPlaceholderText('Enter category').fill('testing');

		// Add tags
		const tagsInput = page.getByPlaceholderText('Add tags');
		await tagsInput.fill('e2e');
		await tagsInput.press('Enter');
		await tagsInput.fill('testing');
		await tagsInput.press('Enter');

		// Step 6: Configure advanced options
		const advancedOptionsButton = page.getByText('Advanced Options');
		await advancedOptionsButton.click();

		// Enable auto-validate
		await page.getByText('Auto-validate after upload').check();

		// Select development environment
		await page.locator('select').selectOption('development');

		// Step 7: Upload the node
		const uploadSubmitButton = page.getByText('Upload').last();
		await expect(uploadSubmitButton).toBeEnabled();
		await uploadSubmitButton.click();

		// Step 8: Wait for upload progress and completion
		await expect(page.getByText('Uploading...')).toBeVisible();
		await expect(page.getByText('Upload Successful')).toBeVisible({ timeout: 10000 });

		// Modal should close automatically
		await expect(page.getByText('Upload Custom Node')).not.toBeVisible({ timeout: 5000 });

		// Step 9: Verify node appears in the list
		await expect(page.getByText('E2E Test Node')).toBeVisible();
		await expect(page.getByText('E2E Test Author')).toBeVisible();
		await expect(page.getByText('testing')).toBeVisible();

		// Find the uploaded node card
		const nodeCard = page.locator('[data-test-id="custom-node-card"]').filter({
			hasText: 'E2E Test Node',
		});
		await expect(nodeCard).toBeVisible();

		// Step 10: Wait for auto-validation to complete
		let validationComplete = false;
		let attempts = 0;
		const maxAttempts = 20;

		while (!validationComplete && attempts < maxAttempts) {
			await page.waitForTimeout(1000);

			const statusBadge = nodeCard.locator('.status-badge');
			const statusText = await statusBadge.textContent();

			if (statusText === 'Validated' || statusText === 'Failed') {
				validationComplete = true;
			}
			attempts++;
		}

		// Verify validation completed successfully
		await expect(nodeCard.locator('.status-badge')).toContainText('Validated');

		// Step 11: Deploy the node
		const nodeDropdown = nodeCard.locator('[data-test-id="node-actions-dropdown"]');
		await nodeDropdown.click();

		const deployAction = page.getByText('Deploy');
		await expect(deployAction).toBeVisible();
		await deployAction.click();

		// Deployment confirmation dialog
		const deployButton = page.getByText('Deploy Node');
		await expect(deployButton).toBeVisible();
		await deployButton.click();

		// Wait for deployment to complete
		await expect(page.getByText('Node Deployed')).toBeVisible({ timeout: 10000 });
		await expect(page.getByText('Node deployed successfully')).toBeVisible();

		// Close success notification
		await page.getByText('Node Deployed').locator('..').getByRole('button').click();

		// Step 12: Verify node is deployed
		await expect(nodeCard.locator('.status-badge')).toContainText('Deployed');

		// Step 13: Monitor node health
		await nodeDropdown.click();
		const healthAction = page.getByText('View Health');
		await expect(healthAction).toBeVisible();
		await healthAction.click();

		// Health modal should open
		await expect(page.getByText('Node Health Status')).toBeVisible();
		await expect(page.getByText('Healthy')).toBeVisible();
		await expect(page.getByText('Memory Usage')).toBeVisible();
		await expect(page.getByText('Uptime')).toBeVisible();

		// Close health modal
		const closeHealthModal = page.getByText('Close');
		await closeHealthModal.click();
		await expect(page.getByText('Node Health Status')).not.toBeVisible();

		// Step 14: Test node execution
		await nodeDropdown.click();
		const testAction = page.getByText('Test Node');
		await expect(testAction).toBeVisible();
		await testAction.click();

		// Test execution modal
		await expect(page.getByText('Test Node Execution')).toBeVisible();

		// Configure test input
		const messageInput = page.getByPlaceholderText('Enter message');
		await messageInput.fill('Hello from E2E test execution');

		const runTestButton = page.getByText('Run Test');
		await runTestButton.click();

		// Wait for test execution
		await expect(page.getByText('Test completed successfully')).toBeVisible({ timeout: 5000 });
		await expect(page.getByText('Hello from E2E test execution')).toBeVisible();

		// Close test modal
		const closeTestModal = page.getByText('Close').last();
		await closeTestModal.click();

		// Step 15: View deployment logs
		await nodeDropdown.click();
		const logsAction = page.getByText('View Logs');
		await expect(logsAction).toBeVisible();
		await logsAction.click();

		// Logs modal should open
		await expect(page.getByText('Deployment Logs')).toBeVisible();
		await expect(page.locator('.log-entry')).toHaveCount.greaterThan(0);

		// Check log filtering
		const logLevelFilter = page.locator('select[name="logLevel"]');
		await logLevelFilter.selectOption('error');
		await page.waitForTimeout(500); // Wait for filter to apply

		// Close logs modal
		const closeLogsModal = page.getByText('Close').first();
		await closeLogsModal.click();
		await expect(page.getByText('Deployment Logs')).not.toBeVisible();

		// Step 16: Hot reload the node
		await nodeDropdown.click();
		const hotReloadAction = page.getByText('Hot Reload');
		await expect(hotReloadAction).toBeVisible();
		await hotReloadAction.click();

		// Confirmation dialog
		const confirmHotReload = page.getByText('Confirm Hot Reload');
		await confirmHotReload.click();

		// Wait for hot reload completion
		await expect(page.getByText('Node Reloaded')).toBeVisible({ timeout: 5000 });
		await expect(page.getByText('Node reloaded successfully')).toBeVisible();

		// Node should still be deployed
		await expect(nodeCard.locator('.status-badge')).toContainText('Deployed');

		// Step 17: Undeploy the node
		await nodeDropdown.click();
		const undeployAction = page.getByText('Undeploy');
		await expect(undeployAction).toBeVisible();
		await undeployAction.click();

		// Undeploy confirmation dialog
		const undeployButton = page.getByText('Undeploy Node');
		await expect(undeployButton).toBeVisible();
		await undeployButton.click();

		// Wait for undeployment
		await expect(page.getByText('Node Undeployed')).toBeVisible({ timeout: 5000 });
		await expect(page.getByText('Node undeployed successfully')).toBeVisible();

		// Step 18: Verify node is back to validated status
		await expect(nodeCard.locator('.status-badge')).toContainText('Validated');

		// Step 19: Delete the node (cleanup)
		await nodeDropdown.click();
		const deleteAction = page.getByText('Delete');
		await expect(deleteAction).toBeVisible();
		await deleteAction.click();

		// Delete confirmation dialog
		const deleteButton = page.getByText('Delete Node');
		await expect(deleteButton).toBeVisible();
		await deleteButton.click();

		// Wait for deletion
		await expect(page.getByText('Node Deleted')).toBeVisible({ timeout: 5000 });
		await expect(page.getByText('Node deleted successfully')).toBeVisible();

		// Node should no longer appear in the list
		await expect(nodeCard).not.toBeVisible();

		// Step 20: Verify statistics updated
		const statsCards = page.locator('.statCard');
		await expect(statsCards).toHaveCount(4);

		// Total should reflect the deletion
		const totalCard = statsCards.filter({ hasText: 'Total Nodes' });
		await expect(totalCard).toBeVisible();
	});

	test('should handle search and filtering workflow', async () => {
		// Create multiple test nodes first
		const nodeNames = ['Search Test Node 1', 'Search Test Node 2', 'Filter Test Node'];
		const nodeCategories = ['search', 'search', 'filter'];

		for (let i = 0; i < nodeNames.length; i++) {
			await uploadTestNode(page, nodeNames[i], nodeCategories[i]);
		}

		// Navigate to custom nodes page
		await page.goto('/settings/custom-nodes');

		// Step 1: Test search functionality
		const searchInput = page.getByPlaceholderText('Search custom nodes...');
		await searchInput.fill('Search Test');
		await page.waitForTimeout(1000); // Wait for search to apply

		// Should show only nodes matching search
		await expect(page.getByText('Search Test Node 1')).toBeVisible();
		await expect(page.getByText('Search Test Node 2')).toBeVisible();
		await expect(page.getByText('Filter Test Node')).not.toBeVisible();

		// Clear search
		await searchInput.clear();
		await page.waitForTimeout(1000);

		// All nodes should be visible again
		await expect(page.getByText('Filter Test Node')).toBeVisible();

		// Step 2: Test category filtering
		const filtersToggle = page.getByText('Filters');
		await filtersToggle.click();

		// Filters panel should open
		await expect(page.getByText('Status')).toBeVisible();
		await expect(page.getByText('Category')).toBeVisible();

		// Select category filter
		const categorySelect = page.locator('select[name="category"]');
		await categorySelect.selectOption('search');
		await page.waitForTimeout(1000);

		// Should show only search category nodes
		await expect(page.getByText('Search Test Node 1')).toBeVisible();
		await expect(page.getByText('Search Test Node 2')).toBeVisible();
		await expect(page.getByText('Filter Test Node')).not.toBeVisible();

		// Step 3: Clear all filters
		const clearFiltersButton = page.getByText('Clear All');
		await clearFiltersButton.click();

		// All nodes should be visible again
		await expect(page.getByText('Filter Test Node')).toBeVisible();

		// Clean up created nodes
		for (const nodeName of nodeNames) {
			await deleteTestNode(page, nodeName);
		}
	});

	test('should handle error scenarios gracefully', async () => {
		await page.goto('/settings/custom-nodes');

		// Test 1: Upload invalid file type
		const uploadButton = page.getByTestId('upload-custom-node-button');
		await uploadButton.click();

		const fileInput = page.locator('input[type="file"]');

		// Create a test file with invalid extension
		const invalidFile = path.join(__dirname, 'fixtures', 'invalid.txt');
		await fs.writeFile(invalidFile, 'This is not a valid node file');

		try {
			await fileInput.setInputFiles(invalidFile);

			// Should show error message
			await expect(page.getByText('Invalid file type')).toBeVisible({ timeout: 5000 });

			// Close modal
			const cancelButton = page.getByText('Cancel');
			await cancelButton.click();
		} finally {
			await fs.unlink(invalidFile);
		}

		// Test 2: Upload file that fails validation
		await uploadButton.click();

		const maliciousFile = path.join(__dirname, 'fixtures', 'malicious.js');
		const maliciousContent = `
			const fs = require('fs');
			class MaliciousNode {
				async execute() {
					// This should fail security validation
					fs.readFileSync('/etc/passwd', 'utf8');
					return [];
				}
			}
			module.exports = { nodeClass: MaliciousNode };
		`;
		await fs.writeFile(maliciousFile, maliciousContent);

		try {
			await fileInput.setInputFiles(maliciousFile);

			// Fill required fields
			await page.getByPlaceholderText('Enter author name').fill('Test Author');

			// Enable auto-validate
			const advancedOptionsButton = page.getByText('Advanced Options');
			await advancedOptionsButton.click();
			await page.getByText('Auto-validate after upload').check();

			// Submit upload
			const uploadSubmitButton = page.getByText('Upload').last();
			await uploadSubmitButton.click();

			// Wait for upload and validation failure
			await expect(page.getByText('Upload Successful')).toBeVisible();
			await page.waitForTimeout(3000); // Wait for validation

			// Node should appear as failed
			const failedNodeCard = page.locator('[data-test-id="custom-node-card"]').filter({
				hasText: 'malicious',
			});
			await expect(failedNodeCard.locator('.status-badge')).toContainText('Failed');

			// Clean up
			await deleteTestNode(page, 'malicious');
		} finally {
			await fs.unlink(maliciousFile);
		}
	});

	test('should handle concurrent operations correctly', async () => {
		await page.goto('/settings/custom-nodes');

		// Upload a test node
		await uploadTestNode(page, 'Concurrent Test Node', 'testing');

		// Find the node
		const nodeCard = page.locator('[data-test-id="custom-node-card"]').filter({
			hasText: 'Concurrent Test Node',
		});

		// Wait for validation
		await expect(nodeCard.locator('.status-badge')).toContainText('Validated');

		// Try to deploy the same node multiple times quickly
		// (This should be handled gracefully by the backend)
		const nodeDropdown = nodeCard.locator('[data-test-id="node-actions-dropdown"]');

		await nodeDropdown.click();
		const deployAction = page.getByText('Deploy');
		await deployAction.click();

		const deployButton = page.getByText('Deploy Node');
		await deployButton.click();

		// Wait for first deployment
		await expect(page.getByText('Node deployed successfully')).toBeVisible();

		// Try to deploy again (should show appropriate message)
		await nodeDropdown.click();
		const secondDeployAction = page.getByText('Deploy');

		if (await secondDeployAction.isVisible()) {
			await secondDeployAction.click();
			// Should show error or info message about already being deployed
			await expect(page.getByText(/already.*deployed|currently.*deployed/)).toBeVisible();
		}

		// Clean up
		await undeployTestNode(page, 'Concurrent Test Node');
		await deleteTestNode(page, 'Concurrent Test Node');
	});

	// Helper functions
	async function uploadTestNode(page: Page, nodeName: string, category: string) {
		const uploadButton = page.getByTestId('upload-custom-node-button');
		await uploadButton.click();

		const testNodeContent = `
			class ${nodeName.replace(/\s/g, '')} {
				description = { displayName: '${nodeName}', name: '${nodeName.toLowerCase().replace(/\s/g, '')}' };
				async execute() { return [{ json: { message: 'test' } }]; }
			}
			module.exports = { nodeClass: ${nodeName.replace(/\s/g, '')} };
		`;

		const testFile = path.join(__dirname, 'fixtures', `${nodeName.replace(/\s/g, '-')}.js`);
		await fs.writeFile(testFile, testNodeContent);

		try {
			const fileInput = page.locator('input[type="file"]');
			await fileInput.setInputFiles(testFile);

			await page.getByPlaceholderText('Enter author name').fill('Test Author');
			await page.getByPlaceholderText('Enter category').fill(category);

			const uploadSubmitButton = page.getByText('Upload').last();
			await uploadSubmitButton.click();

			await expect(page.getByText('Upload Successful')).toBeVisible();
			await page.waitForTimeout(2000); // Wait for validation
		} finally {
			await fs.unlink(testFile);
		}
	}

	async function deleteTestNode(page: Page, nodeName: string) {
		const nodeCard = page.locator('[data-test-id="custom-node-card"]').filter({
			hasText: nodeName,
		});

		if (await nodeCard.isVisible()) {
			const nodeDropdown = nodeCard.locator('[data-test-id="node-actions-dropdown"]');
			await nodeDropdown.click();

			const deleteAction = page.getByText('Delete');
			await deleteAction.click();

			const deleteButton = page.getByText('Delete Node');
			await deleteButton.click();

			await expect(page.getByText('Node deleted successfully')).toBeVisible();
		}
	}

	async function undeployTestNode(page: Page, nodeName: string) {
		const nodeCard = page.locator('[data-test-id="custom-node-card"]').filter({
			hasText: nodeName,
		});

		const nodeDropdown = nodeCard.locator('[data-test-id="node-actions-dropdown"]');
		await nodeDropdown.click();

		const undeployAction = page.getByText('Undeploy');
		if (await undeployAction.isVisible()) {
			await undeployAction.click();

			const undeployButton = page.getByText('Undeploy Node');
			await undeployButton.click();

			await expect(page.getByText('Node undeployed successfully')).toBeVisible();
		}
	}
});
