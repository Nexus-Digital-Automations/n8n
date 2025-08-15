/**
 * MCP Browser Testing Configuration for n8n
 * Enhanced browser testing infrastructure using MCP tools
 */

const MCP_BROWSER_CONFIG = {
  // Server configuration
  server: {
    url: 'http://localhost:5678',
    waitTime: 5000,
    retryAttempts: 3
  },

  // Browser configurations for different MCP tools
  browsers: {
    playwright: {
      browser: 'chromium',
      headless: false,
      viewport: { width: 1536, height: 960 },
      timeout: 30000,
      screenshotDir: './mcp-test-screenshots/playwright',
      videoDir: './mcp-test-videos/playwright'
    },
    puppeteer: {
      headless: false,
      viewport: { width: 1536, height: 960 },
      timeout: 30000,
      screenshotDir: './mcp-test-screenshots/puppeteer',
      videoDir: './mcp-test-videos/puppeteer'
    }
  },

  // Test scenarios for comprehensive feature validation
  testScenarios: [
    {
      id: 'initial-load',
      name: 'Initial Application Load',
      description: 'Verify n8n loads without JavaScript errors',
      actions: [
        { type: 'navigate', url: 'http://localhost:5678' },
        { type: 'waitForSelector', selector: '[data-test-id="main-content"]' },
        { type: 'screenshot', name: 'initial-load' },
        { type: 'checkConsoleErrors' }
      ]
    },
    {
      id: 'setup-flow',
      name: 'Initial Setup Flow',
      description: 'Complete n8n initial setup wizard',
      actions: [
        { type: 'navigate', url: 'http://localhost:5678/setup' },
        { type: 'waitForSelector', selector: '[data-test-id="setup-form"]' },
        { type: 'fill', selector: '[data-test-id="setup-email"]', value: 'test@example.com' },
        { type: 'fill', selector: '[data-test-id="setup-firstName"]', value: 'Test' },
        { type: 'fill', selector: '[data-test-id="setup-lastName"]', value: 'User' },
        { type: 'fill', selector: '[data-test-id="setup-password"]', value: 'TestPassword123!' },
        { type: 'screenshot', name: 'setup-form-filled' },
        { type: 'click', selector: '[data-test-id="setup-submit"]' },
        { type: 'waitForNavigation' }
      ]
    },
    {
      id: 'workflow-creation',
      name: 'Workflow Creation and Editor',
      description: 'Create new workflow and test editor functionality',
      actions: [
        { type: 'navigate', url: 'http://localhost:5678/workflow/new' },
        { type: 'waitForSelector', selector: '[data-test-id="canvas"]' },
        { type: 'screenshot', name: 'new-workflow-canvas' },
        { type: 'click', selector: '[data-test-id="add-first-step"]' },
        { type: 'waitForSelector', selector: '[data-test-id="node-creator"]' },
        { type: 'screenshot', name: 'node-creator-open' }
      ]
    },
    {
      id: 'codemirror-test',
      name: 'CodeMirror Editor Functionality',
      description: 'Test expression editors and code functionality',
      actions: [
        { type: 'navigate', url: 'http://localhost:5678/workflow/new' },
        { type: 'waitForSelector', selector: '[data-test-id="canvas"]' },
        { type: 'addNode', nodeType: 'Set' },
        { type: 'openNodeDetail' },
        { type: 'waitForSelector', selector: '.cm-editor' },
        { type: 'screenshot', name: 'codemirror-editor' },
        { type: 'checkCodeMirrorFunctionality' }
      ]
    },
    {
      id: 'workflow-execution',
      name: 'Workflow Execution',
      description: 'Test workflow execution and data flow',
      actions: [
        { type: 'createBasicWorkflow' },
        { type: 'click', selector: '[data-test-id="execute-workflow"]' },
        { type: 'waitForExecution' },
        { type: 'screenshot', name: 'workflow-executed' },
        { type: 'verifyExecutionResults' }
      ]
    },
    {
      id: 'authentication-flow',
      name: 'Authentication and Session Management',
      description: 'Test login, logout, and session handling',
      actions: [
        { type: 'logout' },
        { type: 'navigate', url: 'http://localhost:5678/signin' },
        { type: 'waitForSelector', selector: '[data-test-id="signin-form"]' },
        { type: 'fill', selector: '[data-test-id="email"]', value: 'test@example.com' },
        { type: 'fill', selector: '[data-test-id="password"]', value: 'TestPassword123!' },
        { type: 'click', selector: '[data-test-id="signin-submit"]' },
        { type: 'waitForNavigation' },
        { type: 'screenshot', name: 'logged-in-dashboard' }
      ]
    }
  ],

  // Success criteria for validation
  successCriteria: {
    noJavaScriptErrors: 'No console errors during page load',
    codemirrorFunctional: 'CodeMirror editors load and function properly', 
    workflowExecution: 'Workflows can be created and executed',
    authenticationWorks: 'Login/logout flows work correctly',
    nodeCreatorWorks: 'Node creator opens and nodes can be added',
    dataFlowWorks: 'Data flows between nodes correctly'
  },

  // Error tracking
  errorPatterns: [
    /deserialize/i,
    /codemirror/i,
    /lezer/i,
    /grammar/i,
    /vue.*error/i,
    /uncaught.*error/i
  ]
};

module.exports = MCP_BROWSER_CONFIG;