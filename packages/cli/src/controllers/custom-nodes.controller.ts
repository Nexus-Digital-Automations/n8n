import type { Response } from 'express';
import { Container } from '@n8n/di';
import type {
	CustomNode,
	CustomNodeDeployment,
	CustomNodeRepository,
	CustomNodeDeploymentRepository,
} from '@n8n/db';
import type { CustomNodeStatus, DeploymentStatus } from '@n8n/db';

import { Get, Post, Put, Delete, RestController, GlobalScope } from '@/decorators';
import { AuthenticatedRequest } from '@/requests';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { NotFoundError } from '@/errors/response-errors/not-found.error';
import { CustomNodeStorageService } from '@/services/custom-node-storage.service';
import { CustomNodeDeploymentService } from '@/services/custom-node-deployment.service';
import type {
	CustomNodeCreateRequest,
	CustomNodeListQuery,
	FileUploadOptions,
	ValidationOptions,
} from '@/services/custom-node-storage.service';
import type { DeploymentOptions } from '@/services/custom-node-deployment.service';

interface CustomNodeUpdateRequest {
	name?: string;
	description?: string;
	category?: string;
	tags?: string[];
	status?: CustomNodeStatus;
}

interface CustomNodeDeploymentRequest {
	nodeId: string;
	environment: 'development' | 'staging' | 'production';
	config?: Record<string, unknown>;
}

interface BulkOperationRequest {
	nodeIds: string[];
	action: 'deploy' | 'undeploy' | 'delete' | 'validate';
	force?: boolean;
}

@RestController('/custom-nodes')
export class CustomNodesController {
	private customNodeRepository = Container.get(CustomNodeRepository);
	private deploymentRepository = Container.get(CustomNodeDeploymentRepository);
	private storageService = Container.get(CustomNodeStorageService);
	private deploymentService = Container.get(CustomNodeDeploymentService);

	/**
	 * GET /custom-nodes
	 * List custom nodes with filtering and pagination
	 */
	@Get('/')
	@GlobalScope('customNode:list')
	async listCustomNodes(req: AuthenticatedRequest, res: Response) {
		const query: CustomNodeListQuery = {
			status: req.query.status as CustomNodeStatus | CustomNodeStatus[],
			category: req.query.category as string,
			authorId: req.query.authorId as string,
			search: req.query.search as string,
			tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
			limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
			offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
			sortBy: (req.query.sortBy as 'name' | 'createdAt' | 'version' | 'status') || 'createdAt',
			sortOrder: (req.query.sortOrder as 'ASC' | 'DESC') || 'DESC',
		};

		// Validate query parameters
		if (query.limit && (query.limit < 1 || query.limit > 100)) {
			throw new BadRequestError('Limit must be between 1 and 100');
		}

		if (query.offset && query.offset < 0) {
			throw new BadRequestError('Offset must be non-negative');
		}

		const result = await this.storageService.listCustomNodes(query);

		res.json({
			success: true,
			data: result,
			pagination: {
				limit: query.limit,
				offset: query.offset,
				total: result.total,
				hasMore: (query.offset || 0) + (query.limit || 50) < result.total,
			},
		});
	}

	/**
	 * POST /custom-nodes
	 * Create a new custom node
	 */
	@Post('/')
	@GlobalScope('customNode:create')
	async createCustomNode(req: AuthenticatedRequest, res: Response) {
		const {
			name,
			version,
			description,
			category,
			tags,
			validateOnly = false,
			validationOptions = {},
		} = req.body;

		// Validate required fields
		if (!name || !version) {
			throw new BadRequestError('Name and version are required');
		}

		// Validate name format (alphanumeric with hyphens/underscores)
		if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
			throw new BadRequestError('Name can only contain letters, numbers, hyphens, and underscores');
		}

		// Validate version format (semver)
		if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/.test(version)) {
			throw new BadRequestError('Version must follow semantic versioning format (e.g., 1.0.0)');
		}

		// Handle file upload from multipart form data
		const file = req.file
			? {
					buffer: req.file.buffer,
					originalName: req.file.originalname,
					mimeType: req.file.mimetype,
				}
			: undefined;

		const createRequest: CustomNodeCreateRequest = {
			name: name.trim(),
			version: version.trim(),
			description: description?.trim(),
			category: category?.trim(),
			tags: Array.isArray(tags) ? tags.map((tag: string) => tag.trim()) : [],
			authorId: req.user.id,
			file,
			validateOnly: Boolean(validateOnly),
			validationOptions: validationOptions as ValidationOptions,
		};

		const customNode = await this.storageService.createCustomNode(createRequest);

		res.status(201).json({
			success: true,
			data: {
				id: customNode.id,
				name: customNode.name,
				version: customNode.version,
				status: customNode.status,
				description: customNode.description,
				category: customNode.category,
				tags: customNode.tags,
				createdAt: customNode.createdAt,
				fileSize: customNode.fileSize,
			},
		});
	}

	/**
	 * GET /custom-nodes/:id
	 * Get a specific custom node
	 */
	@Get('/:id')
	@GlobalScope('customNode:read')
	async getCustomNode(req: AuthenticatedRequest, res: Response) {
		const { id } = req.params;

		if (!id) {
			throw new BadRequestError('Node ID is required');
		}

		const customNode = await this.storageService.getCustomNode(id);

		// Check permissions - users can only see their own nodes or public ones
		if (customNode.authorId !== req.user.id && !req.user.hasGlobalScope('customNode:readAll')) {
			throw new NotFoundError('Custom node not found');
		}

		res.json({
			success: true,
			data: customNode,
		});
	}

	/**
	 * PUT /custom-nodes/:id
	 * Update a custom node
	 */
	@Put('/:id')
	@GlobalScope('customNode:update')
	async updateCustomNode(req: AuthenticatedRequest, res: Response) {
		const { id } = req.params;
		const updates: CustomNodeUpdateRequest = req.body;

		if (!id) {
			throw new BadRequestError('Node ID is required');
		}

		// Get existing node to check permissions
		const existingNode = await this.storageService.getCustomNode(id);
		if (existingNode.authorId !== req.user.id && !req.user.hasGlobalScope('customNode:updateAll')) {
			throw new NotFoundError('Custom node not found');
		}

		// Handle file update from multipart form data
		const file = req.file
			? {
					buffer: req.file.buffer,
					originalName: req.file.originalname,
					mimeType: req.file.mimetype,
				}
			: undefined;

		// Validate updates
		if (updates.name && !/^[a-zA-Z0-9_-]+$/.test(updates.name)) {
			throw new BadRequestError('Name can only contain letters, numbers, hyphens, and underscores');
		}

		const updatedNode = await this.storageService.updateCustomNode(id, updates, file);

		res.json({
			success: true,
			data: {
				id: updatedNode.id,
				name: updatedNode.name,
				version: updatedNode.version,
				status: updatedNode.status,
				description: updatedNode.description,
				category: updatedNode.category,
				tags: updatedNode.tags,
				updatedAt: updatedNode.updatedAt,
			},
		});
	}

	/**
	 * DELETE /custom-nodes/:id
	 * Delete a custom node
	 */
	@Delete('/:id')
	@GlobalScope('customNode:delete')
	async deleteCustomNode(req: AuthenticatedRequest, res: Response) {
		const { id } = req.params;
		const { force = false } = req.query;

		if (!id) {
			throw new BadRequestError('Node ID is required');
		}

		// Check permissions
		const existingNode = await this.storageService.getCustomNode(id);
		if (existingNode.authorId !== req.user.id && !req.user.hasGlobalScope('customNode:deleteAll')) {
			throw new NotFoundError('Custom node not found');
		}

		await this.storageService.deleteCustomNode(id, Boolean(force));

		res.json({
			success: true,
			message: 'Custom node deleted successfully',
		});
	}

	/**
	 * POST /custom-nodes/:id/validate
	 * Manually validate a custom node
	 */
	@Post('/:id/validate')
	@GlobalScope('customNode:validate')
	async validateCustomNode(req: AuthenticatedRequest, res: Response) {
		const { id } = req.params;
		const validationOptions: ValidationOptions = req.body.options || {};

		if (!id) {
			throw new BadRequestError('Node ID is required');
		}

		const results = await this.storageService.validateCustomNode(id, validationOptions);

		res.json({
			success: true,
			data: {
				nodeId: id,
				validationResults: results,
			},
		});
	}

	/**
	 * POST /custom-nodes/:id/deploy
	 * Deploy a custom node
	 */
	@Post('/:id/deploy')
	@GlobalScope('customNode:deploy')
	async deployCustomNode(req: AuthenticatedRequest, res: Response) {
		const { id } = req.params;
		const {
			environment = 'production',
			config = {},
			force = false,
			skipValidation = false,
		}: CustomNodeDeploymentRequest & {
			force?: boolean;
			skipValidation?: boolean;
		} = req.body;

		if (!id) {
			throw new BadRequestError('Node ID is required');
		}

		// Validate environment
		if (!['development', 'staging', 'production'].includes(environment)) {
			throw new BadRequestError('Environment must be development, staging, or production');
		}

		const deploymentOptions: DeploymentOptions = {
			environment,
			config,
			force: Boolean(force),
			skipValidation: Boolean(skipValidation),
		};

		const result = await this.deploymentService.deployCustomNode(
			id,
			deploymentOptions,
			req.user.id,
		);

		res.status(202).json({
			success: true,
			data: result,
		});
	}

	/**
	 * DELETE /custom-nodes/:id/deploy
	 * Undeploy a custom node
	 */
	@Delete('/:id/deploy')
	@GlobalScope('customNode:deploy')
	async undeployCustomNode(req: AuthenticatedRequest, res: Response) {
		const { id } = req.params;
		const { environment = 'production', force = false } = req.query;

		if (!id) {
			throw new BadRequestError('Node ID is required');
		}

		const result = await this.deploymentService.undeployCustomNode(
			id,
			environment as 'development' | 'staging' | 'production',
			Boolean(force),
		);

		res.json({
			success: true,
			data: result,
		});
	}

	/**
	 * GET /custom-nodes/:id/deployments
	 * Get deployment history for a node
	 */
	@Get('/:id/deployments')
	@GlobalScope('customNode:read')
	async getNodeDeployments(req: AuthenticatedRequest, res: Response) {
		const { id } = req.params;
		const { limit = 10 } = req.query;

		if (!id) {
			throw new BadRequestError('Node ID is required');
		}

		const deploymentStatus = await this.storageService.getDeploymentStatus(id);

		res.json({
			success: true,
			data: deploymentStatus,
		});
	}

	/**
	 * GET /custom-nodes/categories
	 * Get available categories
	 */
	@Get('/categories')
	@GlobalScope('customNode:list')
	async getAvailableCategories(req: AuthenticatedRequest, res: Response) {
		const categories = await this.customNodeRepository.getAvailableCategories();

		res.json({
			success: true,
			data: categories,
		});
	}

	/**
	 * GET /custom-nodes/tags
	 * Get available tags
	 */
	@Get('/tags')
	@GlobalScope('customNode:list')
	async getAvailableTags(req: AuthenticatedRequest, res: Response) {
		const tags = await this.customNodeRepository.getAvailableTags();

		res.json({
			success: true,
			data: tags,
		});
	}

	/**
	 * GET /custom-nodes/stats
	 * Get statistics for custom nodes
	 */
	@Get('/stats')
	@GlobalScope('customNode:list')
	async getCustomNodeStats(req: AuthenticatedRequest, res: Response) {
		const { authorId } = req.query;

		let stats;
		if (authorId) {
			// Get stats for specific author
			stats = await this.customNodeRepository.getStatsByAuthor(authorId as string);
		} else {
			// Get overall stats - would need to implement this method
			stats = {
				total: await this.customNodeRepository.count({ where: { isActive: true } }),
				deployed: await this.customNodeRepository.count({
					where: { status: 'deployed', isActive: true },
				}),
				validated: await this.customNodeRepository.count({
					where: { status: 'validated', isActive: true },
				}),
				failed: await this.customNodeRepository.count({
					where: { status: 'failed', isActive: true },
				}),
			};
		}

		res.json({
			success: true,
			data: stats,
		});
	}

	/**
	 * POST /custom-nodes/bulk
	 * Bulk operations on multiple nodes
	 */
	@Post('/bulk')
	@GlobalScope('customNode:update')
	async bulkOperation(req: AuthenticatedRequest, res: Response) {
		const { nodeIds, action, force = false }: BulkOperationRequest = req.body;

		if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length === 0) {
			throw new BadRequestError('Node IDs array is required');
		}

		if (!['deploy', 'undeploy', 'delete', 'validate'].includes(action)) {
			throw new BadRequestError('Invalid action');
		}

		if (nodeIds.length > 50) {
			throw new BadRequestError('Maximum 50 nodes can be processed in bulk');
		}

		// Get all nodes and check permissions
		const nodes = await this.customNodeRepository.findByIds(nodeIds);
		const unauthorizedNodes = nodes.filter(
			(node) => node.authorId !== req.user.id && !req.user.hasGlobalScope('customNode:updateAll'),
		);

		if (unauthorizedNodes.length > 0) {
			throw new BadRequestError(
				`You don't have permission to modify ${unauthorizedNodes.length} of the selected nodes`,
			);
		}

		const results: Array<{ nodeId: string; success: boolean; error?: string }> = [];

		// Process each node
		for (const nodeId of nodeIds) {
			try {
				switch (action) {
					case 'validate':
						await this.storageService.validateCustomNode(nodeId, {});
						results.push({ nodeId, success: true });
						break;

					case 'delete':
						await this.storageService.deleteCustomNode(nodeId, force);
						results.push({ nodeId, success: true });
						break;

					case 'deploy':
					case 'undeploy':
						// These would need implementation with the deployment system
						results.push({
							nodeId,
							success: false,
							error: 'Bulk deployment operations not yet implemented',
						});
						break;
				}
			} catch (error) {
				results.push({
					nodeId,
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		}

		const successCount = results.filter((r) => r.success).length;

		res.json({
			success: true,
			data: {
				action,
				totalRequested: nodeIds.length,
				successCount,
				failureCount: nodeIds.length - successCount,
				results,
			},
		});
	}
}
