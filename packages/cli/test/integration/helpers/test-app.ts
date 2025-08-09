import express from 'express';
import { Container } from 'typedi';
import bodyParser from 'body-parser';
import multer from 'multer';
import { getConnection } from 'typeorm';

import { CustomNodesController } from '@/controllers/custom-nodes.controller';
import { CustomNodeStorageService } from '@/services/custom-node-storage.service';
import { CustomNodeValidationService } from '@/services/custom-node-validation.service';
import { CustomNodeDeploymentService } from '@/services/custom-node-deployment.service';
import { CustomNodeRuntimeService } from '@/services/custom-node-runtime.service';
import { CustomNodeRepository } from '@/databases/repositories/custom-node.repository';
import { CustomNodeDeploymentRepository } from '@/databases/repositories/custom-node-deployment.repository';
import type { User } from '@/databases/entities/User';

// Mock file upload storage
const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: 50 * 1024 * 1024, // 50MB limit
	},
});

/**
 * Create test Express application with custom nodes routes
 */
export async function createTestApp(testUser?: User): Promise<express.Application> {
	const app = express();

	// Middleware
	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({ extended: true }));

	// Mock authentication middleware
	app.use((req: any, res, next) => {
		if (testUser) {
			req.user = testUser;
		}
		next();
	});

	// Setup dependency injection
	await setupTestServices();

	// Get controller instance
	const controller = Container.get(CustomNodesController);

	// Routes
	const router = express.Router();

	// Custom Nodes routes
	router.get('/custom-nodes', controller.getAllCustomNodes.bind(controller));
	router.post('/custom-nodes', upload.single('file'), controller.uploadCustomNode.bind(controller));
	router.get('/custom-nodes/statistics', controller.getStatistics.bind(controller));
	router.get('/custom-nodes/:id', controller.getCustomNode.bind(controller));
	router.put('/custom-nodes/:id', controller.updateCustomNode.bind(controller));
	router.delete('/custom-nodes/:id', controller.deleteCustomNode.bind(controller));
	router.post('/custom-nodes/:id/validate', controller.validateCustomNode.bind(controller));
	router.post('/custom-nodes/:id/deploy', controller.deployCustomNode.bind(controller));
	router.delete('/custom-nodes/:id/deploy', controller.undeployCustomNode.bind(controller));
	router.get('/custom-nodes/:id/health', controller.getNodeHealth.bind(controller));
	router.post('/custom-nodes/:id/test', controller.testCustomNode.bind(controller));
	router.post('/custom-nodes/:id/hot-reload', controller.hotReloadNode.bind(controller));
	router.get(
		'/custom-nodes/:id/deployments/:deploymentId/logs',
		controller.getDeploymentLogs.bind(controller),
	);

	// Batch operations
	router.post('/custom-nodes/batch/deploy', controller.batchDeploy.bind(controller));
	router.delete('/custom-nodes/batch/deploy', controller.batchUndeploy.bind(controller));
	router.post('/custom-nodes/batch/validate', controller.batchValidate.bind(controller));
	router.delete('/custom-nodes/batch', controller.batchDelete.bind(controller));

	app.use('/rest', router);

	// Error handling middleware
	app.use(
		(error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
			console.error('Test app error:', error);
			res.status(500).json({
				message: error.message,
				stack: process.env.NODE_ENV === 'test' ? error.stack : undefined,
			});
		},
	);

	return app;
}

/**
 * Setup test services with proper dependency injection
 */
async function setupTestServices(): Promise<void> {
	const connection = getConnection();

	// Register repositories
	Container.set(CustomNodeRepository, new CustomNodeRepository(connection));
	Container.set(CustomNodeDeploymentRepository, new CustomNodeDeploymentRepository(connection));

	// Register services with mocked dependencies
	const storageService = new CustomNodeStorageService(
		'/tmp/test-custom-nodes', // Test storage path
		Container.get(CustomNodeRepository),
	);
	Container.set(CustomNodeStorageService, storageService);

	const validationService = new CustomNodeValidationService(
		storageService,
		Container.get(CustomNodeRepository),
	);
	Container.set(CustomNodeValidationService, validationService);

	const runtimeService = new CustomNodeRuntimeService(
		Container.get(CustomNodeRepository),
		Container.get(CustomNodeDeploymentRepository),
	);
	Container.set(CustomNodeRuntimeService, runtimeService);

	const deploymentService = new CustomNodeDeploymentService(
		Container.get(CustomNodeRepository),
		Container.get(CustomNodeDeploymentRepository),
		runtimeService,
		storageService,
	);
	Container.set(CustomNodeDeploymentService, deploymentService);

	// Register controller
	Container.set(
		CustomNodesController,
		new CustomNodesController(
			Container.get(CustomNodeRepository),
			storageService,
			validationService,
			deploymentService,
			runtimeService,
		),
	);
}

/**
 * Create test middleware for authentication
 */
export function createAuthMiddleware(user: User) {
	return (req: any, res: express.Response, next: express.NextFunction) => {
		req.user = user;
		next();
	};
}

/**
 * Create test middleware for error simulation
 */
export function createErrorMiddleware(errorCode: number, errorMessage: string) {
	return (req: express.Request, res: express.Response, next: express.NextFunction) => {
		const error = new Error(errorMessage);
		(error as any).status = errorCode;
		next(error);
	};
}

/**
 * Mock request with multipart file upload
 */
export function createMockMulterRequest(
	fileBuffer: Buffer,
	filename: string,
	mimetype: string = 'application/zip',
) {
	return {
		file: {
			fieldname: 'file',
			originalname: filename,
			encoding: '7bit',
			mimetype,
			buffer: fileBuffer,
			size: fileBuffer.length,
		},
		body: {},
	};
}

/**
 * Helper to create test file buffer
 */
export function createTestFileBuffer(content: string): Buffer {
	return Buffer.from(content, 'utf8');
}

/**
 * Setup test environment variables
 */
export function setupTestEnvironment(): void {
	process.env.NODE_ENV = 'test';
	process.env.N8N_CUSTOM_NODES_PATH = '/tmp/test-custom-nodes';
	process.env.N8N_LOG_LEVEL = 'silent';
}

/**
 * Cleanup test environment
 */
export function cleanupTestEnvironment(): void {
	// Clean up any test-specific environment variables
	delete process.env.N8N_CUSTOM_NODES_PATH;
}

/**
 * Wait for async operations to complete
 */
export function waitForAsyncOperation(ms: number = 1000): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an operation until it succeeds or max attempts reached
 */
export async function retryOperation<T>(
	operation: () => Promise<T>,
	maxAttempts: number = 5,
	delayMs: number = 1000,
): Promise<T> {
	let lastError: Error;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error as Error;
			if (attempt < maxAttempts) {
				await waitForAsyncOperation(delayMs);
			}
		}
	}

	throw lastError!;
}
