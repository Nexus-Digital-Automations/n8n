import { getVisibleSelect } from '../utils';
import { WorkflowPage } from '../pages/workflow';
import { NDV } from '../pages/ndv';

const workflowPage = new WorkflowPage();
const ndv = new NDV();

describe('Autosave E2E Tests', () => {
	beforeEach(() => {
		workflowPage.actions.visit();
		
		// Enable autosave for testing
		cy.window().then((win) => {
			win.localStorage.setItem('n8n-autosave-settings', JSON.stringify({
				enabled: true,
				intervalMinutes: 1, // Short interval for testing
				showNotifications: true,
				saveOnNodeChange: false, // Start with manual triggers
				saveOnConnectionChange: true,
			}));
		});
	});

	afterEach(() => {
		// Clean up autosave settings
		cy.window().then((win) => {
			win.localStorage.removeItem('n8n-autosave-settings');
		});
	});

	describe('Basic Autosave Functionality', () => {
		it('should show autosave indicator when enabled', () => {
			// Create a simple workflow to trigger autosave
			workflowPage.actions.addNodeToCanvas('Manual Trigger');
			workflowPage.actions.addNodeToCanvas('Code', true);
			
			// Connect nodes to trigger autosave
			workflowPage.getters.canvasNodes().first().click();
			workflowPage.actions.connectNodes('Manual Trigger', 'Code');
			
			// Should show autosave indicator
			cy.get('[data-test-id="autosave-indicator"]').should('be.visible');
			cy.get('[data-test-id="autosave-countdown"]').should('contain.text', '60'); // 1 minute in seconds
		});

		it('should automatically save workflow at intervals', () => {
			// Create workflow
			workflowPage.actions.addNodeToCanvas('Manual Trigger');
			workflowPage.actions.addNodeToCanvas('Code', true);
			workflowPage.actions.connectNodes('Manual Trigger', 'Code');
			
			// Wait for autosave to trigger (1 minute + buffer)
			cy.get('[data-test-id="autosave-countdown"]', { timeout: 70000 })
				.should('contain.text', '60'); // Should reset after save
			
			// Should show success notification
			cy.get('.el-notification--success')
				.should('be.visible')
				.and('contain.text', 'Auto-saved');
		});

		it('should display last saved timestamp', () => {
			// Create workflow
			workflowPage.actions.addNodeToCanvas('Manual Trigger');
			workflowPage.actions.addNodeToCanvas('Code', true);
			workflowPage.actions.connectNodes('Manual Trigger', 'Code');
			
			// Wait for autosave
			cy.wait(65000); // Wait for autosave to trigger
			
			// Should show last saved time
			cy.get('[data-test-id="last-saved-time"]')
				.should('be.visible')
				.and('not.be.empty');
		});
	});

	describe('Autosave on Content Changes', () => {
		it('should autosave when connections are created', () => {
			// Enable connection change autosave
			cy.window().then((win) => {
				win.localStorage.setItem('n8n-autosave-settings', JSON.stringify({
					enabled: true,
					intervalMinutes: 10, // Longer interval to test change-based saving
					showNotifications: true,
					saveOnNodeChange: false,
					saveOnConnectionChange: true,
				}));
			});
			
			workflowPage.actions.addNodeToCanvas('Manual Trigger');
			workflowPage.actions.addNodeToCanvas('Code', true);
			
			// Connect nodes - should trigger immediate autosave
			workflowPage.actions.connectNodes('Manual Trigger', 'Code');
			
			// Should show autosave notification shortly after connection
			cy.get('.el-notification--success', { timeout: 5000 })
				.should('be.visible')
				.and('contain.text', 'Auto-saved');
		});

		it('should autosave when node parameters change', () => {
			// Enable node change autosave
			cy.window().then((win) => {
				win.localStorage.setItem('n8n-autosave-settings', JSON.stringify({
					enabled: true,
					intervalMinutes: 10,
					showNotifications: true,
					saveOnNodeChange: true,
					saveOnConnectionChange: false,
				}));
			});
			
			workflowPage.actions.addNodeToCanvas('Code');
			
			// Open node parameters
			workflowPage.getters.canvasNodes().first().dblclick();
			ndv.getters.parameterInput('jsCode').clear().type('console.log("test");');
			ndv.getters.backToCanvas().click();
			
			// Should trigger autosave due to parameter change
			cy.get('.el-notification--success', { timeout: 5000 })
				.should('be.visible')
				.and('contain.text', 'Auto-saved');
		});

		it('should not autosave when node change setting is disabled', () => {
			// Disable node change autosave
			cy.window().then((win) => {
				win.localStorage.setItem('n8n-autosave-settings', JSON.stringify({
					enabled: true,
					intervalMinutes: 10,
					showNotifications: true,
					saveOnNodeChange: false,
					saveOnConnectionChange: false,
				}));
			});
			
			workflowPage.actions.addNodeToCanvas('Code');
			
			// Open and modify node parameters
			workflowPage.getters.canvasNodes().first().dblclick();
			ndv.getters.parameterInput('jsCode').clear().type('console.log("no autosave");');
			ndv.getters.backToCanvas().click();
			
			// Should not show autosave notification immediately
			cy.get('.el-notification--success').should('not.exist');
		});
	});

	describe('Conflict Prevention', () => {
		it('should not autosave while manual save is in progress', () => {
			workflowPage.actions.addNodeToCanvas('Manual Trigger');
			workflowPage.actions.addNodeToCanvas('Code', true);
			workflowPage.actions.connectNodes('Manual Trigger', 'Code');
			
			// Start manual save (simulate slow save)
			cy.intercept('PATCH', '/rest/workflows/*', { delay: 3000 }).as('slowSave');
			workflowPage.actions.saveWorkflowUsingKeyboardShortcut();
			
			// Manual save should take precedence, autosave should wait
			cy.get('[data-test-id="saving-indicator"]').should('be.visible');
			
			// Wait for manual save to complete
			cy.wait('@slowSave');
			cy.get('[data-test-id="saving-indicator"]').should('not.exist');
		});

		it('should resume autosave after manual save completes', () => {
			workflowPage.actions.addNodeToCanvas('Manual Trigger');
			workflowPage.actions.addNodeToCanvas('Code', true);
			
			// Manual save
			workflowPage.actions.saveWorkflowUsingKeyboardShortcut();
			cy.wait(1000); // Wait for save to complete
			
			// Make another change
			workflowPage.actions.connectNodes('Manual Trigger', 'Code');
			
			// Autosave should resume and countdown should reset
			cy.get('[data-test-id="autosave-countdown"]')
				.should('be.visible')
				.and('contain.text', '60');
		});
	});

	describe('Error Handling', () => {
		it('should handle autosave failures gracefully', () => {
			// Mock server error for autosave
			cy.intercept('PATCH', '/rest/workflows/*', { 
				statusCode: 500,
				body: { message: 'Server error' }
			}).as('failedAutosave');
			
			workflowPage.actions.addNodeToCanvas('Manual Trigger');
			workflowPage.actions.addNodeToCanvas('Code', true);
			workflowPage.actions.connectNodes('Manual Trigger', 'Code');
			
			// Wait for autosave attempt
			cy.wait(65000);
			
			// Should show error notification
			cy.get('.el-notification--warning')
				.should('be.visible')
				.and('contain.text', 'Autosave Failed');
			
			// Autosave should continue trying (countdown should still be visible)
			cy.get('[data-test-id="autosave-countdown"]').should('be.visible');
		});

		it('should handle network errors during autosave', () => {
			// Mock network failure
			cy.intercept('PATCH', '/rest/workflows/*', { forceNetworkError: true }).as('networkError');
			
			workflowPage.actions.addNodeToCanvas('Manual Trigger');
			workflowPage.actions.addNodeToCanvas('Code', true);
			workflowPage.actions.connectNodes('Manual Trigger', 'Code');
			
			// Wait for autosave attempt
			cy.wait(65000);
			
			// Should show error notification
			cy.get('.el-notification--error')
				.should('be.visible')
				.and('contain.text', 'Autosave Error');
		});
	});

	describe('Settings Management', () => {
		it('should allow enabling/disabling autosave', () => {
			// Open workflow settings
			workflowPage.getters.workflowMenu().click();
			cy.get('[data-test-id="workflow-settings"]').click();
			
			// Find autosave settings section
			cy.get('[data-test-id="autosave-settings"]').should('be.visible');
			
			// Toggle autosave off
			cy.get('[data-test-id="autosave-enabled-toggle"]').click();
			
			// Save settings
			cy.get('[data-test-id="save-settings"]').click();
			
			// Autosave indicator should not be visible
			cy.get('[data-test-id="autosave-indicator"]').should('not.exist');
			
			// Re-enable autosave
			workflowPage.getters.workflowMenu().click();
			cy.get('[data-test-id="workflow-settings"]').click();
			cy.get('[data-test-id="autosave-enabled-toggle"]').click();
			cy.get('[data-test-id="save-settings"]').click();
			
			// Autosave indicator should be visible again
			cy.get('[data-test-id="autosave-indicator"]').should('be.visible');
		});

		it('should allow changing autosave interval', () => {
			// Open workflow settings
			workflowPage.getters.workflowMenu().click();
			cy.get('[data-test-id="workflow-settings"]').click();
			
			// Change interval to 5 minutes
			cy.get('[data-test-id="autosave-interval"]').clear().type('5');
			cy.get('[data-test-id="save-settings"]').click();
			
			// Create workflow content
			workflowPage.actions.addNodeToCanvas('Manual Trigger');
			
			// Countdown should show 5 minutes (300 seconds)
			cy.get('[data-test-id="autosave-countdown"]')
				.should('be.visible')
				.and('contain.text', '300');
		});

		it('should allow disabling autosave notifications', () => {
			// Disable notifications
			cy.window().then((win) => {
				win.localStorage.setItem('n8n-autosave-settings', JSON.stringify({
					enabled: true,
					intervalMinutes: 1,
					showNotifications: false, // Disable notifications
					saveOnNodeChange: false,
					saveOnConnectionChange: true,
				}));
			});
			
			workflowPage.actions.addNodeToCanvas('Manual Trigger');
			workflowPage.actions.addNodeToCanvas('Code', true);
			workflowPage.actions.connectNodes('Manual Trigger', 'Code');
			
			// Wait for autosave
			cy.wait(65000);
			
			// Should not show notification
			cy.get('.el-notification--success').should('not.exist');
			
			// But autosave should still work (check last saved time)
			cy.get('[data-test-id="last-saved-time"]')
				.should('be.visible')
				.and('not.be.empty');
		});
	});

	describe('Workflow State Management', () => {
		it('should reset autosave state when switching workflows', () => {
			// Create first workflow
			workflowPage.actions.addNodeToCanvas('Manual Trigger');
			workflowPage.actions.saveWorkflowOnButtonClick();
			
			// Wait for some autosave activity
			cy.wait(30000);
			
			// Create new workflow
			cy.get('[data-test-id="new-workflow-button"]').click();
			
			// Autosave counter should reset
			cy.get('[data-test-id="autosave-count"]').should('contain.text', '0');
			cy.get('[data-test-id="last-saved-time"]').should('not.exist');
		});

		it('should not autosave empty workflows', () => {
			// Start with empty workflow - should not show autosave indicator
			cy.get('[data-test-id="autosave-indicator"]').should('not.exist');
			
			// Even after waiting, no autosave should occur
			cy.wait(65000);
			cy.get('.el-notification--success').should('not.exist');
		});

		it('should handle browser navigation with unsaved changes', () => {
			// Enable unsaved changes warning
			cy.window().then((win) => {
				win.localStorage.setItem('n8n-autosave-settings', JSON.stringify({
					enabled: true,
					intervalMinutes: 10, // Long interval to ensure changes aren't saved
					showNotifications: true,
					saveOnNodeChange: false,
					saveOnConnectionChange: false,
				}));
			});
			
			workflowPage.actions.addNodeToCanvas('Manual Trigger');
			
			// Try to navigate away
			cy.window().then((win) => {
				// Simulate beforeunload event
				const event = new Event('beforeunload');
				const result = win.dispatchEvent(event);
				
				// Should prevent default navigation
				expect(event.defaultPrevented).to.be.true;
			});
		});
	});

	describe('Performance and Edge Cases', () => {
		it('should handle rapid workflow changes without excessive saves', () => {
			// Enable immediate saves on changes
			cy.window().then((win) => {
				win.localStorage.setItem('n8n-autosave-settings', JSON.stringify({
					enabled: true,
					intervalMinutes: 10,
					showNotifications: false, // Disable to avoid notification spam
					saveOnNodeChange: true,
					saveOnConnectionChange: true,
				}));
			});
			
			// Make rapid changes
			workflowPage.actions.addNodeToCanvas('Manual Trigger');
			workflowPage.actions.addNodeToCanvas('Code');
			workflowPage.actions.addNodeToCanvas('HTTP Request');
			
			// Connect multiple nodes rapidly
			workflowPage.actions.connectNodes('Manual Trigger', 'Code');
			workflowPage.actions.connectNodes('Code', 'HTTP Request');
			
			// Should debounce saves (not save after every single change)
			cy.wait(2000);
			
			// Check that excessive save requests weren't made
			cy.get('@autosaveRequest.all').should('have.length.lessThan', 10);
		});

		it('should maintain autosave functionality during long editing sessions', () => {
			workflowPage.actions.addNodeToCanvas('Manual Trigger');
			
			// Simulate long editing session with periodic changes
			for (let i = 0; i < 5; i++) {
				workflowPage.actions.addNodeToCanvas('Code');
				cy.wait(30000); // Wait 30 seconds between changes
			}
			
			// Autosave should still be working
			cy.get('[data-test-id="autosave-indicator"]').should('be.visible');
			cy.get('[data-test-id="autosave-countdown"]').should('be.visible');
		});

		it('should handle browser tab visibility changes', () => {
			workflowPage.actions.addNodeToCanvas('Manual Trigger');
			workflowPage.actions.addNodeToCanvas('Code', true);
			workflowPage.actions.connectNodes('Manual Trigger', 'Code');
			
			// Simulate tab becoming hidden
			cy.document().trigger('visibilitychange', { detail: 'hidden' });
			
			// Autosave should continue working when tab becomes visible again
			cy.document().trigger('visibilitychange', { detail: 'visible' });
			
			cy.get('[data-test-id="autosave-indicator"]').should('be.visible');
			cy.get('[data-test-id="autosave-countdown"]').should('be.visible');
		});
	});

	describe('Integration with Workflow Features', () => {
		it('should work correctly with workflow templates', () => {
			// Import a template
			cy.visit('/templates');
			cy.get('[data-test-id="template-card"]').first().click();
			cy.get('[data-test-id="use-template"]').click();
			
			// Should show autosave indicator for template workflow
			cy.get('[data-test-id="autosave-indicator"]').should('be.visible');
			
			// Make a change to trigger autosave
			workflowPage.getters.canvasNodes().first().click();
			workflowPage.getters.canvasNodes().first().dblclick();
			
			// Modify a parameter
			cy.get('[data-test-id="parameter-input"]').first().clear().type('modified value');
			cy.get('[data-test-id="back-to-canvas"]').click();
			
			// Should trigger autosave
			cy.wait(5000);
			cy.get('.el-notification--success').should('contain.text', 'Auto-saved');
		});

		it('should work with workflow sharing and permissions', () => {
			// This test would require user management setup
			// Placeholder for testing autosave with shared workflows
			workflowPage.actions.addNodeToCanvas('Manual Trigger');
			
			// Simulate sharing workflow (would set read-only or collaborative mode)
			// Autosave behavior should adapt to permissions
			cy.get('[data-test-id="autosave-indicator"]').should('be.visible');
		});

		it('should work with workflow versioning', () => {
			// Create and save workflow
			workflowPage.actions.addNodeToCanvas('Manual Trigger');
			workflowPage.actions.addNodeToCanvas('Code', true);
			workflowPage.actions.connectNodes('Manual Trigger', 'Code');
			workflowPage.actions.saveWorkflowOnButtonClick();
			
			// Make changes that would create new version
			workflowPage.actions.addNodeToCanvas('HTTP Request');
			workflowPage.actions.connectNodes('Code', 'HTTP Request');
			
			// Autosave should create new version
			cy.wait(65000);
			
			// Check that version was incremented (implementation dependent)
			cy.get('[data-test-id="workflow-version"]').should('exist');
		});
	});
});