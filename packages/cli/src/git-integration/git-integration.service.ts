import { Logger } from '@n8n/backend-common';
import type { WorkflowEntity } from '@n8n/db';
import { WorkflowRepository } from '@n8n/db';
import { Service } from '@n8n/di';

import { BranchManager } from './branch-manager';
import { DiffEngine } from './diff-engine';
import { GitService } from './git-service';
import { MergeResolver } from './merge-resolver';
import { ReviewSystem } from './review-system';
import type {
	GitConfig,
	SerializedWorkflow,
	WorkflowDiff,
	MergeConflict,
	ConflictResolution,
} from './types';
import { WorkflowSerializer } from './workflow-serializer';

/**
 * Main Git integration orchestrator service
 * Coordinates all Git operations for workflow versioning
 */
@Service()
export class GitIntegrationService {
	private initialized = false;
	private config: GitConfig | null = null;

	constructor(
		private readonly logger: Logger,
		private readonly gitService: GitService,
		private readonly workflowSerializer: WorkflowSerializer,
		private readonly diffEngine: DiffEngine,
		private readonly mergeResolver: MergeResolver,
		private readonly branchManager: BranchManager,
		private readonly reviewSystem: ReviewSystem,
		private readonly workflowRepository: WorkflowRepository,
	) {}

	/**
	 * Initialize Git integration
	 * @param config Git configuration
	 */
	async initialize(config: GitConfig): Promise<void> {
		if (this.initialized) {
			this.logger.warn('Git integration already initialized');
			return;
		}

		this.logger.info('Initializing Git integration for workflow versioning');

		this.config = config;

		// Initialize Git service
		await this.gitService.initialize(config);

		// Initialize serializer
		await this.workflowSerializer.initialize(config.repositoryPath);

		// Initialize review system
		await this.reviewSystem.initialize();

		this.initialized = true;

		this.logger.info('Git integration initialized successfully');
	}

	/**
	 * Check if Git integration is initialized
	 */
	isInitialized(): boolean {
		return this.initialized;
	}

	/**
	 * Save workflow to Git repository
	 * @param workflow Workflow entity
	 * @param commitMessage Optional custom commit message
	 * @param autoCommit Whether to auto-commit (default: true)
	 * @param autoPush Whether to auto-push (default: false)
	 */
	async saveWorkflow(
		workflow: WorkflowEntity,
		commitMessage?: string,
		autoCommit: boolean = true,
		autoPush: boolean = false,
	): Promise<void> {
		this.ensureInitialized();

		this.logger.info('Saving workflow to Git', {
			workflowId: workflow.id,
			workflowName: workflow.name,
			autoCommit,
			autoPush,
		});

		// Serialize workflow to file
		const format = 'json'; // Could be configurable
		const filePath = await this.workflowSerializer.serializeWorkflow(
			workflow,
			this.gitService.getRepositoryPath(),
			format,
		);

		// Stage the file
		await this.gitService.add(filePath);

		// Auto-commit if enabled
		if (autoCommit) {
			const message =
				commitMessage || this.workflowSerializer.generateCommitMessage(workflow, 'updated');
			const result = await this.gitService.commit(message);

			// Update mapping with commit hash
			this.workflowSerializer.updateMappingCommit(workflow.id, result.hash);

			// Auto-push if enabled
			if (autoPush || this.config?.autoPush) {
				await this.gitService.push();
			}
		}

		this.logger.info('Workflow saved to Git successfully', { workflowId: workflow.id });
	}

	/**
	 * Delete workflow from Git repository
	 * @param workflowId Workflow ID
	 * @param commitMessage Optional custom commit message
	 */
	async deleteWorkflow(workflowId: string, commitMessage?: string): Promise<void> {
		this.ensureInitialized();

		this.logger.info('Deleting workflow from Git', { workflowId });

		const filePath = await this.workflowSerializer.deleteWorkflowFile(
			workflowId,
			this.gitService.getRepositoryPath(),
		);

		if (filePath) {
			// Stage deletion
			await this.gitService.add(filePath);

			// Commit
			const message = commitMessage || `Deleted workflow: ${workflowId}`;
			await this.gitService.commit(message);

			// Auto-push if enabled
			if (this.config?.autoPush) {
				await this.gitService.push();
			}
		}
	}

	/**
	 * Load workflow from Git repository
	 * @param workflowId Workflow ID
	 */
	async loadWorkflow(workflowId: string): Promise<SerializedWorkflow | null> {
		this.ensureInitialized();

		const filePath = this.workflowSerializer.getWorkflowFilePath(workflowId);
		if (!filePath) {
			return null;
		}

		return await this.workflowSerializer.deserializeWorkflow(
			filePath,
			this.gitService.getRepositoryPath(),
		);
	}

	/**
	 * Load all workflows from Git repository
	 */
	async loadAllWorkflows(): Promise<SerializedWorkflow[]> {
		this.ensureInitialized();

		return await this.workflowSerializer.deserializeAllWorkflows(
			this.gitService.getRepositoryPath(),
		);
	}

	/**
	 * Sync workflows from Git to database
	 */
	async syncFromGit(): Promise<{ imported: number; updated: number; errors: number }> {
		this.ensureInitialized();

		this.logger.info('Syncing workflows from Git to database');

		const workflows = await this.loadAllWorkflows();
		let imported = 0;
		let updated = 0;
		let errors = 0;

		for (const serializedWorkflow of workflows) {
			try {
				const existing = await this.workflowRepository.findOne({
					where: { id: serializedWorkflow.id },
				});

				const workflowData = this.workflowSerializer.toWorkflowEntity(serializedWorkflow);

				if (existing) {
					// Update existing workflow
					await this.workflowRepository.update(serializedWorkflow.id, workflowData);
					updated++;
					this.logger.debug('Workflow updated from Git', { id: serializedWorkflow.id });
				} else {
					// Create new workflow
					await this.workflowRepository.save(workflowData);
					imported++;
					this.logger.debug('Workflow imported from Git', { id: serializedWorkflow.id });
				}
			} catch (error) {
				errors++;
				this.logger.error('Failed to sync workflow from Git', {
					workflowId: serializedWorkflow.id,
					error: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		}

		this.logger.info('Git sync completed', { imported, updated, errors });

		return { imported, updated, errors };
	}

	/**
	 * Sync workflows from database to Git
	 */
	async syncToGit(): Promise<{ exported: number; errors: number }> {
		this.ensureInitialized();

		this.logger.info('Syncing workflows from database to Git');

		const workflows = await this.workflowRepository.find();
		let exported = 0;
		let errors = 0;

		const filePaths = await this.workflowSerializer.serializeWorkflows(
			workflows,
			this.gitService.getRepositoryPath(),
		);

		// Stage all files
		const paths = Array.from(filePaths.values());
		if (paths.length > 0) {
			try {
				await this.gitService.add(paths);
				exported = paths.length;
			} catch (error) {
				errors++;
				this.logger.error('Failed to stage workflows', {
					error: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		}

		this.logger.info('Database to Git sync completed', { exported, errors });

		return { exported, errors };
	}

	/**
	 * Calculate diff between workflow versions
	 * @param workflowId Workflow ID
	 * @param fromCommit From commit hash
	 * @param toCommit To commit hash (optional, defaults to current)
	 */
	async calculateWorkflowDiff(
		workflowId: string,
		fromCommit: string,
		toCommit?: string,
	): Promise<WorkflowDiff | null> {
		this.ensureInitialized();

		const filePath = this.workflowSerializer.getWorkflowFilePath(workflowId);
		if (!filePath) {
			this.logger.warn('Workflow file path not found', { workflowId });
			return null;
		}

		try {
			// Get workflow content at different commits
			const oldContent = await this.gitService.showFileAtCommit(filePath, fromCommit);
			const newContent = toCommit
				? await this.gitService.showFileAtCommit(filePath, toCommit)
				: await this.gitService.showFileAtCommit(filePath, 'HEAD');

			// Parse workflows
			const oldWorkflow: SerializedWorkflow = JSON.parse(oldContent);
			const newWorkflow: SerializedWorkflow = JSON.parse(newContent);

			// Calculate diff
			return this.diffEngine.calculateDiff(oldWorkflow, newWorkflow);
		} catch (error) {
			this.logger.error('Failed to calculate workflow diff', {
				workflowId,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
			return null;
		}
	}

	/**
	 * Get workflow history
	 * @param workflowId Workflow ID
	 * @param maxCount Maximum number of commits to return
	 */
	async getWorkflowHistory(workflowId: string, maxCount: number = 50): Promise<any[]> {
		this.ensureInitialized();

		const filePath = this.workflowSerializer.getWorkflowFilePath(workflowId);
		if (!filePath) {
			return [];
		}

		return await this.gitService.getLog({ maxCount, file: filePath });
	}

	/**
	 * Create feature branch for workflow development
	 * @param branchName Branch name
	 * @param baseBranch Base branch (optional)
	 */
	async createFeatureBranch(branchName: string, baseBranch?: string): Promise<void> {
		this.ensureInitialized();

		await this.branchManager.createFeatureBranch(branchName, baseBranch);
	}

	/**
	 * Merge workflow changes from branch
	 * @param sourceBranch Source branch
	 * @param targetBranch Target branch
	 */
	async mergeWorkflows(sourceBranch: string, targetBranch?: string): Promise<void> {
		this.ensureInitialized();

		if (targetBranch) {
			await this.branchManager.switchBranch(targetBranch);
		}

		await this.branchManager.mergeBranch(sourceBranch);

		// Auto-push if enabled
		if (this.config?.autoPush) {
			await this.gitService.push();
		}
	}

	/**
	 * Detect merge conflicts in workflows
	 * @param baseCommit Base commit
	 * @param currentCommit Current commit
	 * @param incomingCommit Incoming commit
	 */
	async detectMergeConflicts(
		baseCommit: string,
		currentCommit: string,
		incomingCommit: string,
	): Promise<MergeConflict[]> {
		this.ensureInitialized();

		const conflicts: MergeConflict[] = [];
		const workflows = await this.loadAllWorkflows();

		for (const workflow of workflows) {
			try {
				const filePath = this.workflowSerializer.getWorkflowFilePath(workflow.id);
				if (!filePath) continue;

				// Get workflow at different commits
				const baseContent = await this.gitService.showFileAtCommit(filePath, baseCommit);
				const currentContent = await this.gitService.showFileAtCommit(filePath, currentCommit);
				const incomingContent = await this.gitService.showFileAtCommit(filePath, incomingCommit);

				const baseWorkflow: SerializedWorkflow = JSON.parse(baseContent);
				const currentWorkflow: SerializedWorkflow = JSON.parse(currentContent);
				const incomingWorkflow: SerializedWorkflow = JSON.parse(incomingContent);

				const conflict = this.mergeResolver.detectConflicts(
					baseWorkflow,
					currentWorkflow,
					incomingWorkflow,
				);

				if (conflict) {
					conflicts.push(conflict);
				}
			} catch (error) {
				this.logger.debug('Workflow not found in all commits', {
					workflowId: workflow.id,
				});
			}
		}

		return conflicts;
	}

	/**
	 * Resolve merge conflicts
	 * @param conflict Merge conflict
	 * @param resolution Resolution strategy
	 */
	async resolveMergeConflict(
		conflict: MergeConflict,
		resolution: ConflictResolution,
	): Promise<void> {
		this.ensureInitialized();

		const resolved = this.mergeResolver.resolveConflicts(conflict, resolution);

		// Serialize resolved workflow
		const workflowEntity = this.workflowSerializer.toWorkflowEntity(
			resolved.resolvedWorkflow,
		) as WorkflowEntity;

		await this.saveWorkflow(
			workflowEntity,
			`Resolved merge conflict: ${conflict.workflowName}`,
			true,
			false,
		);
	}

	/**
	 * Push changes to remote repository
	 * @param remoteName Remote name
	 * @param branchName Branch name
	 */
	async push(remoteName?: string, branchName?: string): Promise<void> {
		this.ensureInitialized();

		await this.gitService.push(remoteName, branchName);
	}

	/**
	 * Pull changes from remote repository
	 * @param remoteName Remote name
	 * @param branchName Branch name
	 */
	async pull(remoteName?: string, branchName?: string): Promise<void> {
		this.ensureInitialized();

		await this.gitService.pull(remoteName, branchName);

		// Sync changes from Git to database
		await this.syncFromGit();
	}

	/**
	 * Get repository status
	 */
	async getStatus(): Promise<any> {
		this.ensureInitialized();

		return await this.gitService.getStatus();
	}

	/**
	 * Get current branch
	 */
	async getCurrentBranch(): Promise<string> {
		this.ensureInitialized();

		return await this.branchManager.getCurrentBranch();
	}

	/**
	 * List all branches
	 */
	async listBranches(): Promise<any[]> {
		this.ensureInitialized();

		return await this.branchManager.listBranches();
	}

	/**
	 * Ensure Git integration is initialized
	 */
	private ensureInitialized(): void {
		if (!this.initialized) {
			throw new Error('Git integration not initialized. Call initialize() first.');
		}
	}

	/**
	 * Clean up resources
	 */
	async cleanup(): Promise<void> {
		if (this.initialized) {
			await this.gitService.cleanup();
			this.initialized = false;
			this.config = null;
			this.logger.info('Git integration cleaned up');
		}
	}
}
