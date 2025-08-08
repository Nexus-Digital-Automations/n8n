import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { AuthenticatedRequest, type User } from '@n8n/db';
import { Delete, Get, Patch, Post, RestController, GlobalScope } from '@n8n/decorators';
import { Request } from 'express';
import { Request as ExpressRequest } from 'express';
import type { IDataObject } from 'n8n-workflow';
import { ApplicationError } from 'n8n-workflow';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { InternalServerError } from '@/errors/response-errors/internal-server.error';
import { NotFoundError } from '@/errors/response-errors/not-found.error';
import { EventService } from '@/events/event.service';
import { Push } from '@/push';
import { CustomNodeService } from '@/services/custom-node.service';
import { CustomNodeValidationService } from '@/services/custom-node-validation.service';
import { CustomNodeDeploymentService } from '@/services/custom-node-deployment.service';

// Request/Response Types
export interface CreateNodeRequest {
	// File upload (multipart)
	file?: Express.Multer.File;
	
	// Or JSON payload for remote/git sources
	source?: {
		type: 'git' | 'url' | 'npm';
		location: string;
		version?: string;
		credentials?: {
			token?: string;
			username?: string;
			password?: string;
		};
	};
	
	// Metadata
	name: string;
	description?: string;
	version: string;
	tags?: string[];
	category?: string;
	
	// Validation options
	validateOnly?: boolean; // Only validate, don't store
	skipTests?: boolean;
}

export interface CreateNodeResponse {
	id: string;
	name: string;
	version: string;
	status: 'validating' | 'validated' | 'failed';
	validationResults: {
		syntax: boolean;
		dependencies: boolean;
		security: boolean;
		tests: boolean;
		warnings: string[];
		errors: string[];
	};
	metadata: {
		nodeTypes: string[];
		author: string;
		license: string;
		fileSize: string;
		dependencies: string[];
	};
	uploadedAt: string;
	validatedAt?: string;
}

export interface ListNodesQuery {
	status?: 'all' | 'validated' | 'deployed' | 'failed';
	category?: string;
	author?: string;
	search?: string;
	tags?: string; // comma-separated
	limit?: number;
	offset?: number;
	sortBy?: 'name' | 'createdAt' | 'version' | 'status';
	sortOrder?: 'asc' | 'desc';
}

export interface CustomNodeSummary {
	id: string;
	name: string;
	version: string;
	status: 'uploaded' | 'validating' | 'validated' | 'deployed' | 'failed';
	description: string;
	author: string;
	category: string;
	tags: string[];
	nodeTypes: string[];
	createdAt: string;
	updatedAt: string;
	deployedAt?: string;
	isActive: boolean;
}

export interface ListNodesResponse {
	nodes: CustomNodeSummary[];
	total: number;
	limit: number;
	offset: number;
	filters: {
		categories: string[];
		authors: string[];
		tags: string[];
		statuses: string[];
	};
}

export interface NodeDetailsResponse extends CustomNodeSummary {
	validationResults: {
		syntax: boolean;
		dependencies: boolean;
		security: boolean;
		tests: boolean;
		warnings: string[];
		errors: string[];
	};
	metadata: {
		nodeTypes: string[];
		author: string;
		license: string;
		fileSize: string;
		dependencies: string[];
		[key: string]: any;
	};
	deploymentInfo?: {
		deployedVersion: string;
		deploymentStatus: 'deploying' | 'deployed' | 'failed';
		lastDeployment: string;
		rollbackAvailable: boolean;
	};
	files: Array<{
		name: string;
		size: number;
		type: string;
		path: string;
	}>;
	dependencies: Array<{
		name: string;
		version: string;
		resolved: boolean;
	}>;
	testResults?: {
		passed: number;
		failed: number;
		coverage?: number;
		details: any[];
	};
}

export interface UpdateNodeRequest {
	name?: string;
	description?: string;
	tags?: string[];
	category?: string;
	// File update
	file?: Express.Multer.File;
	version?: string;
	
	// Metadata updates
	metadata?: {
		[key: string]: any;
	};
}

export interface DeleteNodeQuery {
	force?: boolean; // Force delete even if deployed
	cleanup?: boolean; // Remove runtime instances
}

export interface DeployNodeRequest {
	environment?: 'staging' | 'production';
	version?: string; // Deploy specific version
	rollback?: boolean; // Rollback to previous version
	options?: {
		restartWorkflows?: boolean;
		gracefulShutdown?: boolean;
		timeout?: number; // seconds
	};
}

export interface DeployNodeResponse {
	deploymentId: string;
	nodeId: string;
	version: string;
	status: 'queued' | 'deploying' | 'deployed' | 'failed';
	environment: string;
	startedAt: string;
	estimatedDuration?: number;
	message?: string;
}

export interface NodeStatusResponse {
	nodeId: string;
	deploymentStatus: 'not-deployed' | 'deploying' | 'deployed' | 'failed' | 'rollback-available';
	runtime: {
		isLoaded: boolean;
		version: string;
		loadedAt?: string;
		instances: number;
		memory?: {
			used: string;
			peak: string;
		};
		performance?: {
			executionCount: number;
			averageExecutionTime: number;
			errorRate: number;
		};
	};
	health: {
		status: 'healthy' | 'degraded' | 'unhealthy';
		lastCheck: string;
		issues: string[];
	};
	deploymentHistory: Array<{
		id: string;
		version: string;
		environment: string;
		deployedAt: string;
		status: string;
		deployedBy: string;
	}>;
}

export interface BatchOperationRequest {
	operation: 'deploy' | 'undeploy' | 'delete' | 'validate';
	nodeIds: string[];
	options?: {
		environment?: string;
		force?: boolean;
		parallel?: boolean;
		maxConcurrency?: number;
	};
}

// Custom Node Scopes for Authorization
export const CustomNodeScopes = {
	'customNode:create': 'Upload and create custom nodes',
	'customNode:read': 'View custom nodes and their details',
	'customNode:update': 'Modify existing custom nodes', 
	'customNode:delete': 'Remove custom nodes',
	'customNode:deploy': 'Deploy nodes to runtime',
	'customNode:manage': 'Full custom node management',
	'customNode:admin': 'Administrative operations'
} as const;

@RestController('/api/custom-nodes')
export class CustomNodesController {
	constructor(
		private readonly push: Push,
		private readonly customNodeService: CustomNodeService,
		private readonly validationService: CustomNodeValidationService,
		private readonly deploymentService: CustomNodeDeploymentService,
		private readonly eventService: EventService,
		private readonly logger: Logger,
		private readonly globalConfig: GlobalConfig,
	) {}

	/**
	 * Upload and validate custom node files
	 * POST /api/custom-nodes
	 */
	@Post('/')
	@GlobalScope('customNode:create')
	async createNode(req: AuthenticatedRequest<{}, CreateNodeResponse, CreateNodeRequest>) {
		const { name, description, version, tags, category, validateOnly, skipTests, source } = req.body;
		const file = req.file;

		if (!name || !version) {
			throw new BadRequestError('Node name and version are required');
		}

		if (!file && !source) {
			throw new BadRequestError('Either file upload or source configuration is required');
		}

		this.logger.debug('Custom node creation requested', {
			name,
			version,
			userId: req.user.id,
			hasFile: !!file,
			hasSource: !!source,
			validateOnly: !!validateOnly,
		});

		try {
			// Check if node with same name and version already exists
			const existingNode = await this.customNodeService.findByNameAndVersion(name, version);
			if (existingNode) {
				throw new BadRequestError(`Node "${name}" version "${version}" already exists`);
			}

			// Create node record
			const nodeData = {
				name,
				description,
				version,
				tags: tags || [],
				category: category || 'custom',
				authorId: req.user.id,
				status: 'validating' as const,
			};

			const node = await this.customNodeService.create(nodeData, file, source);

			// Start validation process
			const validationResults = await this.validationService.validateNode(node.id, {
				skipTests: !!skipTests,
			});

			// Update node status based on validation
			const updatedNode = await this.customNodeService.updateValidationResults(
				node.id,
				validationResults
			);

			// Only store if not validate-only mode
			if (!validateOnly && validationResults.syntax && validationResults.dependencies) {
				await this.customNodeService.updateStatus(node.id, 'validated');
			}

			// Emit event for audit logging
			this.eventService.emit('custom-node-created', {
				user: req.user,
				nodeId: node.id,
				nodeName: name,
				version,
				success: validationResults.syntax && validationResults.dependencies,
				validateOnly: !!validateOnly,
			});

			this.logger.debug('Custom node creation completed', {
				nodeId: node.id,
				name,
				version,
				userId: req.user.id,
				validationSuccess: validationResults.syntax && validationResults.dependencies,
			});

			return {
				id: node.id,
				name: node.name,
				version: node.version,
				status: updatedNode.status,
				validationResults,
				metadata: updatedNode.metadata,
				uploadedAt: node.createdAt.toISOString(),
				validatedAt: updatedNode.validatedAt?.toISOString(),
			};

		} catch (error) {
			this.logger.error('Custom node creation failed', {
				name,
				version,
				userId: req.user.id,
				error: error instanceof Error ? error.message : String(error),
			});

			if (error instanceof BadRequestError || error instanceof ApplicationError) {
				throw error;
			}

			throw new InternalServerError(
				`Failed to create custom node: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * List custom nodes with filtering and pagination
	 * GET /api/custom-nodes
	 */
	@Get('/')
	@GlobalScope('customNode:read')
	async listNodes(req: AuthenticatedRequest<{}, ListNodesResponse, {}, ListNodesQuery>) {
		const {
			status = 'all',
			category,
			author,
			search,
			tags,
			limit = 20,
			offset = 0,
			sortBy = 'createdAt',
			sortOrder = 'desc'
		} = req.query;

		this.logger.debug('Custom nodes list requested', {
			userId: req.user.id,
			filters: { status, category, author, search, tags },
			pagination: { limit, offset },
			sort: { sortBy, sortOrder },
		});

		try {
			const filters = {
				status: status !== 'all' ? status : undefined,
				category,
				author,
				search,
				tags: tags ? tags.split(',').map(t => t.trim()) : undefined,
			};

			const { nodes, total, availableFilters } = await this.customNodeService.list({
				filters,
				pagination: { limit: Math.min(limit, 100), offset: Math.max(offset, 0) },
				sort: { sortBy, sortOrder },
				userId: req.user.id,
			});

			return {
				nodes,
				total,
				limit: Math.min(limit, 100),
				offset: Math.max(offset, 0),
				filters: availableFilters,
			};

		} catch (error) {
			this.logger.error('Failed to list custom nodes', {
				userId: req.user.id,
				error: error instanceof Error ? error.message : String(error),
			});

			throw new InternalServerError(
				`Failed to list nodes: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Get detailed information about a specific node
	 * GET /api/custom-nodes/:id
	 */
	@Get('/:id')
	@GlobalScope('customNode:read')
	async getNodeDetails(req: AuthenticatedRequest<{ id: string }, NodeDetailsResponse>) {
		const { id } = req.params;

		this.logger.debug('Node details requested', {
			nodeId: id,
			userId: req.user.id,
		});

		try {
			const node = await this.customNodeService.findById(id);
			if (!node) {
				throw new NotFoundError(`Custom node with id "${id}" not found`);
			}

			// Get deployment information if applicable
			const deploymentInfo = await this.deploymentService.getDeploymentInfo(id);

			// Get test results if available
			const testResults = await this.validationService.getTestResults(id);

			return {
				...node,
				deploymentInfo,
				testResults,
			};

		} catch (error) {
			this.logger.error('Failed to get node details', {
				nodeId: id,
				userId: req.user.id,
				error: error instanceof Error ? error.message : String(error),
			});

			if (error instanceof NotFoundError) {
				throw error;
			}

			throw new InternalServerError(
				`Failed to get node details: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Update an existing custom node
	 * PUT /api/custom-nodes/:id
	 */
	@Patch('/:id')
	@GlobalScope('customNode:update')
	async updateNode(req: AuthenticatedRequest<{ id: string }, NodeDetailsResponse, UpdateNodeRequest>) {
		const { id } = req.params;
		const { name, description, tags, category, version, metadata, file } = req.body;

		this.logger.debug('Node update requested', {
			nodeId: id,
			userId: req.user.id,
			hasFile: !!file,
		});

		try {
			const existingNode = await this.customNodeService.findById(id);
			if (!existingNode) {
				throw new NotFoundError(`Custom node with id "${id}" not found`);
			}

			// Check permissions - users can only update their own nodes unless admin
			if (existingNode.authorId !== req.user.id && !req.user.isOwner) {
				throw new BadRequestError('You can only update nodes you created');
			}

			// If version is being updated, check for conflicts
			if (version && version !== existingNode.version) {
				const conflictNode = await this.customNodeService.findByNameAndVersion(existingNode.name, version);
				if (conflictNode && conflictNode.id !== id) {
					throw new BadRequestError(`Version "${version}" already exists for node "${existingNode.name}"`);
				}
			}

			const updateData: Partial<UpdateNodeRequest> = {
				...(name && { name }),
				...(description !== undefined && { description }),
				...(tags && { tags }),
				...(category && { category }),
				...(version && { version }),
				...(metadata && { metadata }),
			};

			let updatedNode = await this.customNodeService.update(id, updateData, file);

			// Re-validate if file was updated
			if (file) {
				const validationResults = await this.validationService.validateNode(id);
				updatedNode = await this.customNodeService.updateValidationResults(id, validationResults);
			}

			// Emit event for audit logging
			this.eventService.emit('custom-node-updated', {
				user: req.user,
				nodeId: id,
				nodeName: updatedNode.name,
				version: updatedNode.version,
				changes: Object.keys(updateData),
				hasFileUpdate: !!file,
			});

			// Get full details for response
			return await this.getNodeDetails({
				...req,
				params: { id },
			} as AuthenticatedRequest<{ id: string }, NodeDetailsResponse>);

		} catch (error) {
			this.logger.error('Failed to update node', {
				nodeId: id,
				userId: req.user.id,
				error: error instanceof Error ? error.message : String(error),
			});

			if (error instanceof NotFoundError || error instanceof BadRequestError) {
				throw error;
			}

			throw new InternalServerError(
				`Failed to update node: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Delete a custom node
	 * DELETE /api/custom-nodes/:id
	 */
	@Delete('/:id')
	@GlobalScope('customNode:delete')
	async deleteNode(req: AuthenticatedRequest<{ id: string }, void, {}, DeleteNodeQuery>) {
		const { id } = req.params;
		const { force = false, cleanup = true } = req.query;

		this.logger.debug('Node deletion requested', {
			nodeId: id,
			userId: req.user.id,
			force,
			cleanup,
		});

		try {
			const node = await this.customNodeService.findById(id);
			if (!node) {
				throw new NotFoundError(`Custom node with id "${id}" not found`);
			}

			// Check permissions
			if (node.authorId !== req.user.id && !req.user.isOwner) {
				throw new BadRequestError('You can only delete nodes you created');
			}

			// Check if node is deployed and handle accordingly
			const deploymentInfo = await this.deploymentService.getDeploymentInfo(id);
			if (deploymentInfo && deploymentInfo.deploymentStatus === 'deployed' && !force) {
				throw new BadRequestError(
					'Node is currently deployed. Use force=true to delete anyway or undeploy first'
				);
			}

			// Cleanup runtime instances if requested and deployed
			if (cleanup && deploymentInfo?.deploymentStatus === 'deployed') {
				await this.deploymentService.undeploy(id);
			}

			// Delete the node
			await this.customNodeService.delete(id);

			// Broadcast to connected frontends
			this.push.broadcast({
				type: 'customNodeDeleted',
				data: {
					nodeId: id,
					nodeName: node.name,
					version: node.version,
				},
			});

			// Emit event for audit logging
			this.eventService.emit('custom-node-deleted', {
				user: req.user,
				nodeId: id,
				nodeName: node.name,
				version: node.version,
				force,
				cleanup,
			});

			this.logger.debug('Node deletion completed', {
				nodeId: id,
				userId: req.user.id,
				nodeName: node.name,
			});

		} catch (error) {
			this.logger.error('Failed to delete node', {
				nodeId: id,
				userId: req.user.id,
				error: error instanceof Error ? error.message : String(error),
			});

			if (error instanceof NotFoundError || error instanceof BadRequestError) {
				throw error;
			}

			throw new InternalServerError(
				`Failed to delete node: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Deploy node to runtime environment
	 * POST /api/custom-nodes/:id/deploy
	 */
	@Post('/:id/deploy')
	@GlobalScope('customNode:deploy')
	async deployNode(req: AuthenticatedRequest<{ id: string }, DeployNodeResponse, DeployNodeRequest>) {
		const { id } = req.params;
		const { environment = 'production', version, rollback = false, options } = req.body;

		this.logger.debug('Node deployment requested', {
			nodeId: id,
			userId: req.user.id,
			environment,
			version,
			rollback,
		});

		try {
			const node = await this.customNodeService.findById(id);
			if (!node) {
				throw new NotFoundError(`Custom node with id "${id}" not found`);
			}

			// Check if node is validated
			if (node.status !== 'validated') {
				throw new BadRequestError('Node must be validated before deployment');
			}

			// Start deployment process
			const deployment = await this.deploymentService.deploy(id, {
				environment,
				version: version || node.version,
				rollback,
				options,
				userId: req.user.id,
			});

			// Broadcast deployment started
			this.push.broadcast({
				type: 'customNodeDeploymentStarted',
				data: {
					nodeId: id,
					deploymentId: deployment.id,
					nodeName: node.name,
					version: deployment.version,
					environment,
				},
			});

			// Emit event for audit logging
			this.eventService.emit('custom-node-deployment-started', {
				user: req.user,
				nodeId: id,
				deploymentId: deployment.id,
				nodeName: node.name,
				version: deployment.version,
				environment,
				rollback,
			});

			return {
				deploymentId: deployment.id,
				nodeId: id,
				version: deployment.version,
				status: deployment.status,
				environment,
				startedAt: deployment.startedAt.toISOString(),
				estimatedDuration: deployment.estimatedDuration,
				message: deployment.message,
			};

		} catch (error) {
			this.logger.error('Failed to deploy node', {
				nodeId: id,
				userId: req.user.id,
				error: error instanceof Error ? error.message : String(error),
			});

			if (error instanceof NotFoundError || error instanceof BadRequestError) {
				throw error;
			}

			throw new InternalServerError(
				`Failed to deploy node: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Get node deployment status and runtime information
	 * GET /api/custom-nodes/:id/status
	 */
	@Get('/:id/status')
	@GlobalScope('customNode:read')
	async getNodeStatus(req: AuthenticatedRequest<{ id: string }, NodeStatusResponse>) {
		const { id } = req.params;

		this.logger.debug('Node status requested', {
			nodeId: id,
			userId: req.user.id,
		});

		try {
			const node = await this.customNodeService.findById(id);
			if (!node) {
				throw new NotFoundError(`Custom node with id "${id}" not found`);
			}

			const status = await this.deploymentService.getStatus(id);

			return status;

		} catch (error) {
			this.logger.error('Failed to get node status', {
				nodeId: id,
				userId: req.user.id,
				error: error instanceof Error ? error.message : String(error),
			});

			if (error instanceof NotFoundError) {
				throw error;
			}

			throw new InternalServerError(
				`Failed to get node status: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Perform batch operations on multiple nodes
	 * POST /api/custom-nodes/batch
	 */
	@Post('/batch')
	@GlobalScope('customNode:manage')
	async batchOperation(req: AuthenticatedRequest<{}, any, BatchOperationRequest>) {
		const { operation, nodeIds, options } = req.body;

		if (!operation || !nodeIds || nodeIds.length === 0) {
			throw new BadRequestError('Operation and nodeIds are required');
		}

		if (nodeIds.length > 50) {
			throw new BadRequestError('Maximum 50 nodes allowed per batch operation');
		}

		this.logger.debug('Batch operation requested', {
			operation,
			nodeCount: nodeIds.length,
			userId: req.user.id,
			options,
		});

		try {
			const results = await this.customNodeService.batchOperation(operation, nodeIds, {
				...options,
				userId: req.user.id,
			});

			// Emit event for audit logging
			this.eventService.emit('custom-node-batch-operation', {
				user: req.user,
				operation,
				nodeIds,
				successCount: results.filter(r => r.success).length,
				totalCount: results.length,
			});

			return {
				operation,
				totalNodes: nodeIds.length,
				results,
				summary: {
					successful: results.filter(r => r.success).length,
					failed: results.filter(r => !r.success).length,
				},
				executedAt: new Date().toISOString(),
				executedBy: req.user.id,
			};

		} catch (error) {
			this.logger.error('Batch operation failed', {
				operation,
				nodeCount: nodeIds.length,
				userId: req.user.id,
				error: error instanceof Error ? error.message : String(error),
			});

			throw new InternalServerError(
				`Batch operation failed: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Get available node templates for scaffolding
	 * GET /api/custom-nodes/templates
	 */
	@Get('/templates')
	@GlobalScope('customNode:read')
	async getTemplates(req: AuthenticatedRequest) {
		this.logger.debug('Node templates requested', {
			userId: req.user.id,
		});

		try {
			const templates = await this.customNodeService.getTemplates();
			return { templates };

		} catch (error) {
			this.logger.error('Failed to get templates', {
				userId: req.user.id,
				error: error instanceof Error ? error.message : String(error),
			});

			throw new InternalServerError(
				`Failed to get templates: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Generate node code from template
	 * POST /api/custom-nodes/templates/:templateId/generate
	 */
	@Post('/templates/:templateId/generate')
	@GlobalScope('customNode:create')
	async generateFromTemplate(req: AuthenticatedRequest<{ templateId: string }, any, { parameters: IDataObject }>) {
		const { templateId } = req.params;
		const { parameters } = req.body;

		this.logger.debug('Node generation from template requested', {
			templateId,
			userId: req.user.id,
		});

		try {
			const generatedNode = await this.customNodeService.generateFromTemplate(templateId, parameters);

			// Emit event for audit logging
			this.eventService.emit('custom-node-generated-from-template', {
				user: req.user,
				templateId,
				generatedNodeName: generatedNode.name,
			});

			return generatedNode;

		} catch (error) {
			this.logger.error('Failed to generate node from template', {
				templateId,
				userId: req.user.id,
				error: error instanceof Error ? error.message : String(error),
			});

			if (error instanceof NotFoundError || error instanceof BadRequestError) {
				throw error;
			}

			throw new InternalServerError(
				`Failed to generate from template: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Import nodes from external source
	 * POST /api/custom-nodes/import
	 */
	@Post('/import')
	@GlobalScope('customNode:create')
	async importNodes(req: AuthenticatedRequest<{}, any, { source: string; format: 'json' | 'zip'; data: any }>) {
		const { source, format, data } = req.body;

		this.logger.debug('Node import requested', {
			source,
			format,
			userId: req.user.id,
		});

		try {
			const importResults = await this.customNodeService.importNodes(source, format, data, req.user.id);

			// Emit event for audit logging
			this.eventService.emit('custom-nodes-imported', {
				user: req.user,
				source,
				format,
				importedCount: importResults.successful.length,
				failedCount: importResults.failed.length,
			});

			return importResults;

		} catch (error) {
			this.logger.error('Failed to import nodes', {
				source,
				format,
				userId: req.user.id,
				error: error instanceof Error ? error.message : String(error),
			});

			throw new InternalServerError(
				`Failed to import nodes: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Export node for external use
	 * GET /api/custom-nodes/:id/export
	 */
	@Get('/:id/export')
	@GlobalScope('customNode:read')
	async exportNode(req: AuthenticatedRequest<{ id: string }, any, {}, { format?: 'json' | 'zip' }>) {
		const { id } = req.params;
		const { format = 'json' } = req.query;

		this.logger.debug('Node export requested', {
			nodeId: id,
			format,
			userId: req.user.id,
		});

		try {
			const node = await this.customNodeService.findById(id);
			if (!node) {
				throw new NotFoundError(`Custom node with id "${id}" not found`);
			}

			const exportData = await this.customNodeService.exportNode(id, format);

			// Emit event for audit logging
			this.eventService.emit('custom-node-exported', {
				user: req.user,
				nodeId: id,
				nodeName: node.name,
				format,
			});

			return exportData;

		} catch (error) {
			this.logger.error('Failed to export node', {
				nodeId: id,
				format,
				userId: req.user.id,
				error: error instanceof Error ? error.message : String(error),
			});

			if (error instanceof NotFoundError) {
				throw error;
			}

			throw new InternalServerError(
				`Failed to export node: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}
}