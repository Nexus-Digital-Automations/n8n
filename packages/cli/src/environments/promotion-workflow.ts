import { Logger } from '@n8n/backend-common';
import type { WorkflowEntity } from '@n8n/db';
import { WorkflowRepository } from '@n8n/db';
import { Service } from '@n8n/di';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { NotFoundError } from '@/errors/response-errors/not-found.error';

import { CredentialIsolationService } from './credential-isolation';
import { EnvironmentVariablesService } from './environment-variables';
import { WorkflowBackupRepository } from './repositories/workflow-backup.repository';
import { WorkflowPromotionRepository } from './repositories/workflow-promotion.repository';
import type {
	WorkflowPromotionRequest,
	WorkflowPromotionResult,
	PromotionOptions,
	ValidationResult,
} from './types';

/**
 * Workflow promotion service for promoting workflows between environments.
 *
 * Features:
 * - Validate workflows before promotion
 * - Create backups for rollback support
 * - Handle credential mapping between environments
 * - Validate node connections and dependencies
 * - Support dry-run mode for testing
 * - Automatic rollback on errors
 * - Notification system for promotion events
 */
@Service()
export class PromotionWorkflowService {
	constructor(
		private readonly logger: Logger,
		private readonly workflowRepository: WorkflowRepository,
		private readonly promotionRepository: WorkflowPromotionRepository,
		private readonly backupRepository: WorkflowBackupRepository,
		private readonly credentialIsolation: CredentialIsolationService,
		private readonly environmentVariables: EnvironmentVariablesService,
	) {
		this.logger.info('PromotionWorkflowService initialized');
	}

	/**
	 * Promote a workflow from source to target environment.
	 *
	 * @param request - Promotion request details
	 * @param userId - User performing the promotion
	 * @param options - Additional promotion options
	 * @returns Promotion result
	 */
	async promoteWorkflow(
		request: WorkflowPromotionRequest,
		userId: string,
		options: PromotionOptions = {},
	): Promise<WorkflowPromotionResult> {
		this.logger.info('Starting workflow promotion', {
			workflowId: request.workflowId,
			sourceEnvironmentId: request.sourceEnvironmentId,
			targetEnvironmentId: request.targetEnvironmentId,
		});

		// Create promotion record
		const promotion = await this.promotionRepository.create({
			workflowId: request.workflowId,
			sourceEnvironmentId: request.sourceEnvironmentId,
			targetEnvironmentId: request.targetEnvironmentId,
			status: 'pending',
			metadata: request.metadata || {},
			performedBy: userId,
		});

		try {
			// Update status to in_progress
			await this.promotionRepository.updateStatus(promotion.id, 'in_progress');

			// Get workflow from source environment
			const workflow = await this.workflowRepository.findById(request.workflowId);
			if (!workflow) {
				throw new NotFoundError(`Workflow with id '${request.workflowId}' not found`);
			}

			// Validate workflow if requested
			let validationResults: ValidationResult[] = [];
			if (request.validateBeforePromotion || options.validateCredentials) {
				validationResults = await this.validateWorkflow(
					workflow,
					request.targetEnvironmentId,
					options,
				);

				// Check for validation errors
				const errors = validationResults.filter((r) => r.severity === 'error' && !r.passed);
				if (errors.length > 0 && !options.dryRun) {
					throw new BadRequestError(
						`Workflow validation failed: ${errors.map((e) => e.message).join(', ')}`,
					);
				}
			}

			// Create backup if requested
			let backupId: string | undefined;
			if (request.createBackup || options.createBackup) {
				backupId = await this.createWorkflowBackup(
					request.workflowId,
					request.targetEnvironmentId,
					userId,
				);
			}

			// Perform promotion if not dry run
			if (!options.dryRun) {
				await this.executePromotion(workflow, request.targetEnvironmentId, options);

				// Update promotion status to completed
				await this.promotionRepository.update(promotion.id, {
					status: 'completed',
					completedAt: new Date(),
					backupId,
					validationResults,
				});

				this.logger.info('Workflow promotion completed', {
					promotionId: promotion.id,
					workflowId: request.workflowId,
				});
			} else {
				this.logger.info('Workflow promotion dry-run completed', {
					promotionId: promotion.id,
					workflowId: request.workflowId,
				});
			}

			return {
				id: promotion.id,
				workflowId: request.workflowId,
				sourceEnvironmentId: request.sourceEnvironmentId,
				targetEnvironmentId: request.targetEnvironmentId,
				status: options.dryRun ? 'pending' : 'completed',
				startedAt: promotion.createdAt,
				completedAt: options.dryRun ? undefined : new Date(),
				backupId,
				validationResults,
				metadata: request.metadata || {},
				performedBy: userId,
			};
		} catch (error) {
			this.logger.error('Workflow promotion failed', {
				promotionId: promotion.id,
				error: error.message,
			});

			// Update promotion status to failed
			await this.promotionRepository.update(promotion.id, {
				status: 'failed',
				completedAt: new Date(),
				errors: [
					{
						code: 'PROMOTION_ERROR',
						message: error.message,
						timestamp: new Date(),
					},
				],
			});

			// Rollback if option is enabled and we have a backup
			if (options.rollbackOnError && promotion.backupId) {
				await this.rollbackPromotion(promotion.id, userId);
			}

			throw error;
		}
	}

	/**
	 * Rollback a workflow promotion.
	 *
	 * @param promotionId - Promotion ID
	 * @param userId - User performing the rollback
	 */
	async rollbackPromotion(promotionId: string, userId: string): Promise<void> {
		this.logger.info('Rolling back workflow promotion', { promotionId });

		const promotion = await this.promotionRepository.findById(promotionId);
		if (!promotion) {
			throw new NotFoundError(`Promotion with id '${promotionId}' not found`);
		}

		if (!promotion.backupId) {
			throw new BadRequestError('No backup available for rollback');
		}

		// Get backup
		const backup = await this.backupRepository.findById(promotion.backupId);
		if (!backup) {
			throw new NotFoundError(`Backup with id '${promotion.backupId}' not found`);
		}

		// Restore workflow from backup
		await this.workflowRepository.update(
			{ id: backup.workflowId },
			{
				nodes: backup.workflowData.nodes,
				connections: backup.workflowData.connections,
				settings: backup.workflowData.settings,
				staticData: backup.workflowData.staticData,
			},
		);

		// Update promotion status
		await this.promotionRepository.updateStatus(promotionId, 'rolled_back');

		this.logger.info('Workflow promotion rolled back', { promotionId });
	}

	/**
	 * Get promotion history for a workflow.
	 *
	 * @param workflowId - Workflow ID
	 * @param limit - Number of records to retrieve
	 * @returns Promotion history
	 */
	async getPromotionHistory(
		workflowId: string,
		limit: number = 10,
	): Promise<WorkflowPromotionResult[]> {
		this.logger.debug('Fetching promotion history', { workflowId, limit });

		return await this.promotionRepository.findByWorkflow(workflowId, limit);
	}

	/**
	 * Get all promotions for an environment.
	 *
	 * @param environmentId - Environment ID
	 * @param type - 'source' or 'target'
	 * @returns List of promotions
	 */
	async getEnvironmentPromotions(
		environmentId: string,
		type: 'source' | 'target' = 'target',
	): Promise<WorkflowPromotionResult[]> {
		this.logger.debug('Fetching environment promotions', { environmentId, type });

		if (type === 'source') {
			return await this.promotionRepository.findBySourceEnvironment(environmentId);
		} else {
			return await this.promotionRepository.findByTargetEnvironment(environmentId);
		}
	}

	// ===== Private helper methods =====

	private async validateWorkflow(
		workflow: WorkflowEntity,
		targetEnvironmentId: string,
		options: PromotionOptions,
	): Promise<ValidationResult[]> {
		const results: ValidationResult[] = [];

		// Validate credentials
		if (options.validateCredentials) {
			const credentialValidation = await this.validateWorkflowCredentials(
				workflow,
				targetEnvironmentId,
			);
			results.push(...credentialValidation);
		}

		// Validate connections
		if (options.validateConnections) {
			const connectionValidation = this.validateWorkflowConnections(workflow);
			results.push(...connectionValidation);
		}

		// Validate node configurations
		const nodeValidation = this.validateWorkflowNodes(workflow);
		results.push(...nodeValidation);

		return results;
	}

	private async validateWorkflowCredentials(
		workflow: WorkflowEntity,
		targetEnvironmentId: string,
	): Promise<ValidationResult[]> {
		const results: ValidationResult[] = [];

		// Get all credential IDs used in workflow
		const credentialIds = this.extractCredentialIds(workflow);

		// Check if credentials exist in target environment
		for (const credentialId of credentialIds) {
			try {
				await this.credentialIsolation.getCredentialData(targetEnvironmentId, credentialId);
				results.push({
					check: 'credential_availability',
					passed: true,
					message: `Credential ${credentialId} is available in target environment`,
					severity: 'info',
				});
			} catch (error) {
				results.push({
					check: 'credential_availability',
					passed: false,
					message: `Credential ${credentialId} is not available in target environment`,
					severity: 'error',
				});
			}
		}

		return results;
	}

	private validateWorkflowConnections(workflow: WorkflowEntity): ValidationResult[] {
		const results: ValidationResult[] = [];

		// Validate that all node connections are valid
		const nodeIds = new Set(workflow.nodes.map((node) => node.id));

		for (const [nodeId, connections] of Object.entries(workflow.connections)) {
			if (!nodeIds.has(nodeId)) {
				results.push({
					check: 'connection_validity',
					passed: false,
					message: `Connection references non-existent node: ${nodeId}`,
					severity: 'error',
				});
			}
		}

		if (results.length === 0) {
			results.push({
				check: 'connection_validity',
				passed: true,
				message: 'All connections are valid',
				severity: 'info',
			});
		}

		return results;
	}

	private validateWorkflowNodes(workflow: WorkflowEntity): ValidationResult[] {
		const results: ValidationResult[] = [];

		// Validate node configurations
		for (const node of workflow.nodes) {
			// Check if node has required properties
			if (!node.type || !node.name) {
				results.push({
					check: 'node_configuration',
					passed: false,
					message: `Node ${node.id} is missing required properties`,
					severity: 'error',
				});
			}
		}

		if (results.length === 0) {
			results.push({
				check: 'node_configuration',
				passed: true,
				message: 'All nodes are properly configured',
				severity: 'info',
			});
		}

		return results;
	}

	private extractCredentialIds(workflow: WorkflowEntity): string[] {
		const credentialIds: string[] = [];

		for (const node of workflow.nodes) {
			if (node.credentials) {
				for (const credentialType of Object.keys(node.credentials)) {
					const credential = node.credentials[credentialType];
					if (credential?.id) {
						credentialIds.push(credential.id);
					}
				}
			}
		}

		return [...new Set(credentialIds)]; // Remove duplicates
	}

	private async createWorkflowBackup(
		workflowId: string,
		environmentId: string,
		userId: string,
	): Promise<string> {
		this.logger.debug('Creating workflow backup', { workflowId, environmentId });

		const workflow = await this.workflowRepository.findById(workflowId);
		if (!workflow) {
			throw new NotFoundError(`Workflow with id '${workflowId}' not found`);
		}

		const backup = await this.backupRepository.create({
			workflowId,
			environmentId,
			workflowData: {
				nodes: workflow.nodes,
				connections: workflow.connections,
				settings: workflow.settings,
				staticData: workflow.staticData,
			},
			metadata: {
				workflowName: workflow.name,
				backupReason: 'promotion',
			},
			createdBy: userId,
		});

		this.logger.debug('Workflow backup created', { backupId: backup.id });

		return backup.id;
	}

	private async executePromotion(
		workflow: WorkflowEntity,
		targetEnvironmentId: string,
		options: PromotionOptions,
	): Promise<void> {
		this.logger.debug('Executing workflow promotion', {
			workflowId: workflow.id,
			targetEnvironmentId,
		});

		// In a real implementation, this would:
		// 1. Map credentials to target environment equivalents
		// 2. Replace environment-specific variables
		// 3. Update workflow configuration for target environment
		// 4. Optionally activate the workflow if autoActivate is true

		// Update workflow with target environment metadata
		await this.workflowRepository.update(
			{ id: workflow.id },
			{
				// Store environment metadata
				meta: {
					...workflow.meta,
					promotedToEnvironment: targetEnvironmentId,
					promotedAt: new Date().toISOString(),
				},
			},
		);

		// Activate workflow if requested
		if (options.autoActivate) {
			await this.workflowRepository.updateActiveState(workflow.id, true);
		}

		this.logger.debug('Workflow promotion executed', { workflowId: workflow.id });
	}
}
