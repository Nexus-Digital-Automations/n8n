import { Delete, Get, Patch, Post, RestController, GlobalScope } from '@n8n/decorators';
import type { CustomNode, ValidationResults } from '@n8n/db';
import { Response } from 'express';
import multer from 'multer';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { InternalServerError } from '@/errors/response-errors/internal-server.error';
import { NotFoundError } from '@/errors/response-errors/not-found.error';
import { EventService } from '@/events/event.service';
import { Push } from '@/push';
import type { AuthenticatedRequest } from '@/requests';

import { CustomNodeStorageService } from './custom-node-storage.service';
import { CustomNodeValidationService } from './custom-node-validation.service';

type CustomNodeRequest = AuthenticatedRequest<{}, any, any, any>;

export interface CreateCustomNodeRequest {
	name: string;
	version: string;
	description?: string;
	category?: string;
	tags?: string[];
	validateOnly?: boolean;
	skipTests?: boolean;
}

export interface ListCustomNodesQuery {
	status?: string;
	category?: string;
	author?: string;
	search?: string;
	tags?: string;
	limit?: string;
	offset?: string;
	sortBy?: string;
	sortOrder?: string;
}

export interface UpdateCustomNodeRequest {
	name?: string;
	description?: string;
	category?: string;
	tags?: string[];
	version?: string;
}

export interface DeleteCustomNodeQuery {
	force?: string;
	cleanup?: string;
}

export interface CustomNodeResponse extends CustomNode {
	deploymentInfo?: {
		deployedVersion: string;
		deploymentStatus: 'deploying' | 'deployed' | 'failed';
		lastDeployment: string;
		rollbackAvailable: boolean;
	};
}

export interface ListCustomNodesResponse {
	nodes: CustomNode[];
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

@RestController('/custom-nodes')
export class CustomNodesController {
	private readonly upload: multer.Multer;

	constructor(
		private readonly push: Push,
		private readonly storageService: CustomNodeStorageService,
		private readonly validationService: CustomNodeValidationService,
		private readonly eventService: EventService,
	) {
		this.upload = this.storageService.getMulterConfig();
	}

	@Post('/')
	@GlobalScope('customNode:create')
	async createCustomNode(req: CustomNodeRequest, res: Response) {
		// Handle file upload
		return new Promise<CustomNode>((resolve, reject) => {
			this.upload.single('file')(req, res, async (err) => {
				if (err) {
					return reject(new BadRequestError(`File upload error: ${err.message}`));
				}

				try {
					const { name, version, description, category, tags, validateOnly, skipTests } =
						req.body as CreateCustomNodeRequest;

					if (!name) {
						throw new BadRequestError('Node name is required');
					}

					if (!version) {
						throw new BadRequestError('Node version is required');
					}

					const file = req.file;
					const options = {
						name,
						version,
						description,
						authorId: req.user.id,
						category,
						tags: typeof tags === 'string' ? tags.split(',').map((t) => t.trim()) : tags,
						file: file?.buffer,
						fileName: file?.originalname,
						validateOnly: validateOnly === 'true',
						skipTests: skipTests === 'true',
					};

					const customNode = await this.storageService.createCustomNode(options);

					// Emit event for audit logging
					this.eventService.emit('custom-node-created', {
						user: req.user,
						nodeId: customNode.id,
						nodeName: customNode.name,
						nodeVersion: customNode.version,
						validateOnly: options.validateOnly,
					});

					// Start validation if not validate-only
					if (!options.validateOnly) {
						// Run validation in background
						void this.validationService.validateCustomNode(customNode.id).catch((error) => {
							this.eventService.emit('custom-node-validation-failed', {
								user: req.user,
								nodeId: customNode.id,
								error: error.message,
							});
						});

						// Broadcast to connected frontends
						this.push.broadcast({
							type: 'customNodeCreated',
							data: {
								id: customNode.id,
								name: customNode.name,
								version: customNode.version,
								status: customNode.status,
							},
						});
					}

					resolve(customNode);
				} catch (error) {
					reject(
						error instanceof Error ? error : new InternalServerError('Unknown error occurred'),
					);
				}
			});
		});
	}

	@Get('/')
	@GlobalScope('customNode:list')
	async getCustomNodes(req: CustomNodeRequest): Promise<ListCustomNodesResponse> {
		const {
			status,
			category,
			author,
			search,
			tags,
			limit = '20',
			offset = '0',
			sortBy = 'createdAt',
			sortOrder = 'desc',
		} = req.query as ListCustomNodesQuery;

		const filters = {
			status: status || undefined,
			category,
			authorId: author,
			search,
			tags: tags ? tags.split(',').map((t) => t.trim()) : undefined,
		};

		const pagination = {
			limit: Math.min(parseInt(limit, 10), 100), // Max 100 items
			offset: parseInt(offset, 10),
			sortBy: sortBy as any,
			sortOrder: sortOrder as any,
		};

		const result = await this.storageService.findCustomNodes(filters, pagination);

		return {
			...result,
			limit: pagination.limit,
			offset: pagination.offset,
		};
	}

	@Get('/:id')
	@GlobalScope('customNode:read')
	async getCustomNodeById(req: CustomNodeRequest): Promise<CustomNodeResponse> {
		const { id } = req.params;

		if (!id) {
			throw new BadRequestError('Node ID is required');
		}

		const customNode = await this.storageService.findCustomNodeById(id);

		// Add deployment info if available
		const response: CustomNodeResponse = { ...customNode };

		if (customNode.deployments && customNode.deployments.length > 0) {
			const latestDeployment = customNode.deployments[0];
			response.deploymentInfo = {
				deployedVersion: latestDeployment.version,
				deploymentStatus: latestDeployment.status as any,
				lastDeployment: latestDeployment.deployedAt?.toISOString() || '',
				rollbackAvailable: latestDeployment.rollbackAvailable,
			};
		}

		return response;
	}

	@Patch('/:id')
	@GlobalScope('customNode:update')
	async updateCustomNode(req: CustomNodeRequest, res: Response) {
		const { id } = req.params;

		if (!id) {
			throw new BadRequestError('Node ID is required');
		}

		// Handle file upload for updates
		return new Promise<CustomNode>((resolve, reject) => {
			this.upload.single('file')(req, res, async (err) => {
				if (err) {
					return reject(new BadRequestError(`File upload error: ${err.message}`));
				}

				try {
					const updates = req.body as UpdateCustomNodeRequest;
					const file = req.file;

					const updateOptions = {
						...updates,
						tags:
							typeof updates.tags === 'string'
								? updates.tags.split(',').map((t) => t.trim())
								: updates.tags,
						file: file?.buffer,
						fileName: file?.originalname,
					};

					const updatedNode = await this.storageService.updateCustomNode(id, updateOptions);

					// Emit event for audit logging
					this.eventService.emit('custom-node-updated', {
						user: req.user,
						nodeId: updatedNode.id,
						nodeName: updatedNode.name,
						nodeVersion: updatedNode.version,
						updates,
					});

					// Broadcast to connected frontends
					this.push.broadcast({
						type: 'customNodeUpdated',
						data: {
							id: updatedNode.id,
							name: updatedNode.name,
							version: updatedNode.version,
							status: updatedNode.status,
						},
					});

					resolve(updatedNode);
				} catch (error) {
					reject(
						error instanceof Error ? error : new InternalServerError('Unknown error occurred'),
					);
				}
			});
		});
	}

	@Delete('/:id')
	@GlobalScope('customNode:delete')
	async deleteCustomNode(req: CustomNodeRequest): Promise<{ success: boolean }> {
		const { id } = req.params;
		const { force, cleanup } = req.query as DeleteCustomNodeQuery;

		if (!id) {
			throw new BadRequestError('Node ID is required');
		}

		// Get node info before deletion for event logging
		const node = await this.storageService.findCustomNodeById(id);

		const options = {
			force: force === 'true',
			cleanup: cleanup === 'true',
		};

		await this.storageService.deleteCustomNode(id, options);

		// Emit event for audit logging
		this.eventService.emit('custom-node-deleted', {
			user: req.user,
			nodeId: node.id,
			nodeName: node.name,
			nodeVersion: node.version,
			force: options.force,
		});

		// Broadcast to connected frontends
		this.push.broadcast({
			type: 'customNodeDeleted',
			data: {
				id: node.id,
				name: node.name,
				version: node.version,
			},
		});

		return { success: true };
	}

	@Post('/:id/validate')
	@GlobalScope('customNode:validate')
	async validateCustomNode(req: CustomNodeRequest): Promise<ValidationResults> {
		const { id } = req.params;

		if (!id) {
			throw new BadRequestError('Node ID is required');
		}

		try {
			const results = await this.validationService.validateCustomNode(id);

			// Emit event for audit logging
			this.eventService.emit('custom-node-validated', {
				user: req.user,
				nodeId: id,
				success: results.syntax && results.security && results.dependencies,
				results,
			});

			// Broadcast validation results
			this.push.broadcast({
				type: 'customNodeValidated',
				data: {
					id,
					results,
				},
			});

			return results;
		} catch (error) {
			throw new InternalServerError(
				`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				{ cause: error },
			);
		}
	}

	@Get('/:id/validation-results')
	@GlobalScope('customNode:read')
	async getValidationResults(req: CustomNodeRequest): Promise<ValidationResults | null> {
		const { id } = req.params;

		if (!id) {
			throw new BadRequestError('Node ID is required');
		}

		const results = await this.validationService.getValidationResults(id);

		if (!results) {
			throw new NotFoundError('No validation results found for this node');
		}

		return results;
	}

	@Get('/statistics/summary')
	@GlobalScope('customNode:read')
	async getStatistics(req: CustomNodeRequest): Promise<{
		total: number;
		byStatus: Record<string, number>;
		byCategory: Record<string, number>;
		active: number;
	}> {
		return await this.storageService.getCustomNodeStatistics();
	}

	// Batch operations endpoint
	@Post('/batch')
	@GlobalScope('customNode:manage')
	async batchOperations(req: CustomNodeRequest): Promise<{
		success: boolean;
		results: Array<{ id: string; success: boolean; error?: string }>;
	}> {
		const {
			operation,
			nodeIds,
			options = {},
		} = req.body as {
			operation: 'validate' | 'delete';
			nodeIds: string[];
			options?: Record<string, any>;
		};

		if (!operation || !nodeIds || !Array.isArray(nodeIds)) {
			throw new BadRequestError('Operation and nodeIds array are required');
		}

		const results = [];

		for (const nodeId of nodeIds) {
			try {
				switch (operation) {
					case 'validate':
						await this.validationService.validateCustomNode(nodeId);
						results.push({ id: nodeId, success: true });
						break;
					case 'delete':
						await this.storageService.deleteCustomNode(nodeId, options);
						results.push({ id: nodeId, success: true });
						break;
					default:
						results.push({ id: nodeId, success: false, error: 'Unknown operation' });
				}
			} catch (error) {
				results.push({
					id: nodeId,
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		}

		// Emit batch operation event
		this.eventService.emit('custom-node-batch-operation', {
			user: req.user,
			operation,
			nodeIds,
			results,
		});

		return {
			success: true,
			results,
		};
	}
}
