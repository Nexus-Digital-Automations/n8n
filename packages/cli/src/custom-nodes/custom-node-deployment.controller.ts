import { Delete, Get, Patch, Post, RestController, GlobalScope } from '@n8n/decorators';
import type { CustomNodeDeployment } from '@n8n/db';
import { Response } from 'express';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { InternalServerError } from '@/errors/response-errors/internal-server.error';
import { NotFoundError } from '@/errors/response-errors/not-found.error';
import { EventService } from '@/events/event.service';
import { Push } from '@/push';
import type { AuthenticatedRequest } from '@/requests';

import { CustomNodeDeploymentService } from '@/services/custom-node-deployment.service';
import type {
	DeploymentOptions,
	DeploymentResult,
	RuntimeNodeInfo,
} from '@/services/custom-node-deployment.service';
import { CustomNodeRuntimeService } from '@/services/custom-node-runtime.service';

type CustomNodeDeploymentRequest = AuthenticatedRequest<{}, any, any, any>;

export interface DeployNodeRequest {
	environment?: 'staging' | 'production';
	version?: string;
	rollback?: boolean;
	force?: boolean;
	skipValidation?: boolean;
	options?: {
		restartWorkflows?: boolean;
		gracefulShutdown?: boolean;
		timeout?: number;
	};
}

export interface UndeployNodeQuery {
	environment?: string;
	force?: string;
}

export interface DeploymentStatusResponse {
	deployment: CustomNodeDeployment;
	logs: string[];
	runtimeInfo?: RuntimeNodeInfo;
}

export interface RuntimeStatusResponse {
	nodeId: string;
	deploymentStatus: string;
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
	deploymentHistory: CustomNodeDeployment[];
}

@RestController('/custom-nodes')
export class CustomNodeDeploymentController {
	constructor(
		private readonly push: Push,
		private readonly deploymentService: CustomNodeDeploymentService,
		private readonly runtimeService: CustomNodeRuntimeService,
		private readonly eventService: EventService,
	) {}

	@Post('/:id/deploy')
	@GlobalScope('customNode:deploy')
	async deployCustomNode(req: CustomNodeDeploymentRequest): Promise<DeploymentResult> {
		const { id } = req.params;
		const deployRequest = req.body as DeployNodeRequest;

		if (!id) {
			throw new BadRequestError('Node ID is required');
		}

		try {
			const options: DeploymentOptions = {
				environment: deployRequest.environment || 'production',
				config: deployRequest.options || {},
				force: deployRequest.force || false,
				skipValidation: deployRequest.skipValidation || false,
			};

			const result = await this.deploymentService.deployCustomNode(id, options, req.user.id);

			// Emit event for audit logging
			this.eventService.emit('custom-node-deployed', {
				user: req.user,
				nodeId: id,
				deploymentId: result.deploymentId,
				environment: options.environment,
				force: options.force,
			});

			// Broadcast deployment status to connected frontends
			this.push.broadcast({
				type: 'customNodeDeploymentStatus',
				data: {
					nodeId: id,
					deploymentId: result.deploymentId,
					status: result.status,
					environment: options.environment,
				},
			});

			return result;
		} catch (error) {
			this.eventService.emit('custom-node-deployment-failed', {
				user: req.user,
				nodeId: id,
				error: error.message,
			});

			throw new InternalServerError(
				`Deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				{ cause: error },
			);
		}
	}

	@Delete('/:id/deploy')
	@GlobalScope('customNode:deploy')
	async undeployCustomNode(req: CustomNodeDeploymentRequest): Promise<DeploymentResult> {
		const { id } = req.params;
		const { environment = 'production', force = 'false' } = req.query as UndeployNodeQuery;

		if (!id) {
			throw new BadRequestError('Node ID is required');
		}

		try {
			const result = await this.deploymentService.undeployCustomNode(
				id,
				environment as any,
				force === 'true',
			);

			// Emit event for audit logging
			this.eventService.emit('custom-node-undeployed', {
				user: req.user,
				nodeId: id,
				deploymentId: result.deploymentId,
				environment,
				force: force === 'true',
			});

			// Broadcast undeployment status to connected frontends
			this.push.broadcast({
				type: 'customNodeDeploymentStatus',
				data: {
					nodeId: id,
					deploymentId: result.deploymentId,
					status: result.status,
					environment,
				},
			});

			return result;
		} catch (error) {
			this.eventService.emit('custom-node-undeployment-failed', {
				user: req.user,
				nodeId: id,
				error: error.message,
			});

			throw new InternalServerError(
				`Undeployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				{ cause: error },
			);
		}
	}

	@Get('/deployments/:deploymentId/status')
	@GlobalScope('customNode:read')
	async getDeploymentStatus(req: CustomNodeDeploymentRequest): Promise<DeploymentStatusResponse> {
		const { deploymentId } = req.params;

		if (!deploymentId) {
			throw new BadRequestError('Deployment ID is required');
		}

		try {
			const status = await this.deploymentService.getDeploymentStatus(deploymentId);
			return status;
		} catch (error) {
			if (error instanceof NotFoundError) {
				throw error;
			}
			throw new InternalServerError(
				`Failed to get deployment status: ${error instanceof Error ? error.message : 'Unknown error'}`,
				{ cause: error },
			);
		}
	}

	@Get('/:id/runtime-status')
	@GlobalScope('customNode:read')
	async getRuntimeStatus(req: CustomNodeDeploymentRequest): Promise<RuntimeStatusResponse> {
		const { id } = req.params;

		if (!id) {
			throw new BadRequestError('Node ID is required');
		}

		try {
			// Get deployment status
			const deploymentStatus = await this.deploymentService.getDeploymentStatus(id);

			// Get runtime information
			const loadedNodeInfo = this.runtimeService.getLoadedNodeInfo(
				deploymentStatus.deployment.node.name,
			);
			const nodeHealth = this.runtimeService.getNodeHealth(deploymentStatus.deployment.node.name);

			// Get deployment history
			// TODO: Implement deployment history query in repository
			const deploymentHistory: CustomNodeDeployment[] = [];

			const response: RuntimeStatusResponse = {
				nodeId: id,
				deploymentStatus: deploymentStatus.deployment.status,
				runtime: {
					isLoaded: !!loadedNodeInfo,
					version: loadedNodeInfo?.version || 'unknown',
					loadedAt: loadedNodeInfo?.loadedAt.toISOString(),
					instances: 1, // TODO: Track actual instances
					memory: nodeHealth?.memoryUsage
						? {
								used: `${Math.round(nodeHealth.memoryUsage.used / 1024 / 1024)}MB`,
								peak: `${Math.round(nodeHealth.memoryUsage.peak / 1024 / 1024)}MB`,
							}
						: undefined,
					performance: nodeHealth?.executionStats
						? {
								executionCount: nodeHealth.executionStats.count,
								averageExecutionTime: Math.round(nodeHealth.executionStats.averageTime),
								errorRate: Math.round(nodeHealth.executionStats.errorRate * 100) / 100,
							}
						: undefined,
				},
				health: {
					status: nodeHealth?.isHealthy ? 'healthy' : 'unhealthy',
					lastCheck: nodeHealth?.lastCheck.toISOString() || new Date().toISOString(),
					issues: nodeHealth?.issues || [],
				},
				deploymentHistory,
			};

			return response;
		} catch (error) {
			if (error instanceof NotFoundError) {
				throw error;
			}
			throw new InternalServerError(
				`Failed to get runtime status: ${error instanceof Error ? error.message : 'Unknown error'}`,
				{ cause: error },
			);
		}
	}

	@Post('/:id/hot-reload')
	@GlobalScope('customNode:deploy')
	async hotReloadNode(
		req: CustomNodeDeploymentRequest,
	): Promise<{ success: boolean; message: string }> {
		const { id } = req.params;

		if (!id) {
			throw new BadRequestError('Node ID is required');
		}

		try {
			await this.deploymentService.hotReloadNode(id);

			// Emit event for audit logging
			this.eventService.emit('custom-node-hot-reloaded', {
				user: req.user,
				nodeId: id,
				reloadedAt: new Date(),
			});

			// Broadcast hot reload event to connected frontends
			this.push.broadcast({
				type: 'customNodeHotReloaded',
				data: {
					nodeId: id,
					reloadedAt: new Date().toISOString(),
				},
			});

			return {
				success: true,
				message: 'Node hot reloaded successfully',
			};
		} catch (error) {
			this.eventService.emit('custom-node-hot-reload-failed', {
				user: req.user,
				nodeId: id,
				error: error.message,
			});

			throw new InternalServerError(
				`Hot reload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				{ cause: error },
			);
		}
	}

	@Get('/runtime/nodes')
	@GlobalScope('customNode:read')
	async listDeployedNodes(req: CustomNodeDeploymentRequest): Promise<RuntimeNodeInfo[]> {
		try {
			const deployedNodes = await this.deploymentService.listDeployedNodes();
			return deployedNodes;
		} catch (error) {
			throw new InternalServerError(
				`Failed to list deployed nodes: ${error instanceof Error ? error.message : 'Unknown error'}`,
				{ cause: error },
			);
		}
	}

	@Post('/deployments/:deploymentId/cancel')
	@GlobalScope('customNode:deploy')
	async cancelDeployment(
		req: CustomNodeDeploymentRequest,
	): Promise<{ success: boolean; message: string }> {
		const { deploymentId } = req.params;

		if (!deploymentId) {
			throw new BadRequestError('Deployment ID is required');
		}

		try {
			await this.deploymentService.cancelDeployment(deploymentId);

			// Emit event for audit logging
			this.eventService.emit('custom-node-deployment-cancelled', {
				user: req.user,
				deploymentId,
				cancelledAt: new Date(),
			});

			// Broadcast cancellation to connected frontends
			this.push.broadcast({
				type: 'customNodeDeploymentCancelled',
				data: {
					deploymentId,
					cancelledAt: new Date().toISOString(),
				},
			});

			return {
				success: true,
				message: 'Deployment cancelled successfully',
			};
		} catch (error) {
			throw new InternalServerError(
				`Failed to cancel deployment: ${error instanceof Error ? error.message : 'Unknown error'}`,
				{ cause: error },
			);
		}
	}

	@Post('/cleanup')
	@GlobalScope('customNode:manage')
	async cleanupOldDeployments(req: CustomNodeDeploymentRequest): Promise<{
		success: boolean;
		cleanedCount: number;
		message: string;
	}> {
		const { daysOld = 30 } = req.body as { daysOld?: number };

		try {
			const cleanedCount = await this.deploymentService.cleanupOldDeployments(daysOld);

			// Emit event for audit logging
			this.eventService.emit('custom-node-deployments-cleaned', {
				user: req.user,
				cleanedCount,
				daysOld,
				cleanedAt: new Date(),
			});

			return {
				success: true,
				cleanedCount,
				message: `Successfully cleaned ${cleanedCount} old deployment(s)`,
			};
		} catch (error) {
			throw new InternalServerError(
				`Failed to cleanup deployments: ${error instanceof Error ? error.message : 'Unknown error'}`,
				{ cause: error },
			);
		}
	}

	// Batch deployment operations
	@Post('/batch/deploy')
	@GlobalScope('customNode:deploy')
	async batchDeploy(req: CustomNodeDeploymentRequest): Promise<{
		success: boolean;
		results: Array<{ id: string; success: boolean; error?: string; deploymentId?: string }>;
	}> {
		const {
			nodeIds,
			environment = 'production',
			force = false,
			maxConcurrency = 3,
		} = req.body as {
			nodeIds: string[];
			environment?: 'staging' | 'production';
			force?: boolean;
			maxConcurrency?: number;
		};

		if (!nodeIds || !Array.isArray(nodeIds)) {
			throw new BadRequestError('NodeIds array is required');
		}

		const results = [];
		const concurrencyLimit = Math.min(maxConcurrency, 5); // Cap at 5 concurrent deployments

		// Process deployments in batches
		for (let i = 0; i < nodeIds.length; i += concurrencyLimit) {
			const batch = nodeIds.slice(i, i + concurrencyLimit);

			const batchPromises = batch.map(async (nodeId) => {
				try {
					const options: DeploymentOptions = {
						environment,
						force,
						skipValidation: false,
					};

					const result = await this.deploymentService.deployCustomNode(
						nodeId,
						options,
						req.user.id,
					);

					return {
						id: nodeId,
						success: true,
						deploymentId: result.deploymentId,
					};
				} catch (error) {
					return {
						id: nodeId,
						success: false,
						error: error instanceof Error ? error.message : 'Unknown error',
					};
				}
			});

			const batchResults = await Promise.all(batchPromises);
			results.push(...batchResults);
		}

		// Emit batch deployment event
		this.eventService.emit('custom-node-batch-deployment', {
			user: req.user,
			nodeIds,
			environment,
			results,
			completedAt: new Date(),
		});

		return {
			success: true,
			results,
		};
	}
}
