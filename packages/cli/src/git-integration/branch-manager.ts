import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import type { BranchInfo } from './types';
import { GitService } from './git-service';

/**
 * Git branch management service
 * Handles branch operations for workflow development
 */
@Service()
export class BranchManager {
	constructor(
		private readonly logger: Logger,
		private readonly gitService: GitService,
	) {}

	/**
	 * Create a new feature branch
	 * @param branchName Branch name
	 * @param baseBranch Base branch (default: current branch)
	 * @param checkout Whether to checkout the new branch
	 */
	async createFeatureBranch(
		branchName: string,
		baseBranch?: string,
		checkout: boolean = true,
	): Promise<void> {
		this.logger.info('Creating feature branch', {
			branchName,
			baseBranch,
			checkout,
		});

		// Validate branch name
		this.validateBranchName(branchName);

		// Checkout base branch if specified
		if (baseBranch) {
			const currentBranch = await this.gitService.getCurrentBranch();
			if (currentBranch !== baseBranch) {
				await this.gitService.checkout(baseBranch);
			}
		}

		// Create the branch
		await this.gitService.createBranch(branchName, checkout);

		this.logger.info('Feature branch created successfully', { branchName });
	}

	/**
	 * Delete a branch
	 * @param branchName Branch name
	 * @param force Force deletion even if not merged
	 */
	async deleteBranch(branchName: string, force: boolean = false): Promise<void> {
		this.logger.info('Deleting branch', { branchName, force });

		// Ensure we're not on the branch we want to delete
		const currentBranch = await this.gitService.getCurrentBranch();
		if (currentBranch === branchName) {
			throw new Error(`Cannot delete current branch: ${branchName}`);
		}

		// Get Git instance from service
		const git = (this.gitService as any).git;
		if (!git) {
			throw new Error('Git service not initialized');
		}

		// Delete the branch
		const args = force ? ['-D', branchName] : ['-d', branchName];
		await git.branch(args);

		this.logger.info('Branch deleted successfully', { branchName });
	}

	/**
	 * Switch to a different branch
	 * @param branchName Branch name
	 * @param createIfNotExists Create branch if it doesn't exist
	 */
	async switchBranch(branchName: string, createIfNotExists: boolean = false): Promise<void> {
		this.logger.info('Switching branch', { branchName, createIfNotExists });

		const branches = await this.gitService.getBranches();
		const branchExists = branches.includes(branchName);

		if (!branchExists && createIfNotExists) {
			await this.gitService.createBranch(branchName, true);
		} else if (!branchExists) {
			throw new Error(`Branch does not exist: ${branchName}`);
		} else {
			await this.gitService.checkout(branchName);
		}

		this.logger.info('Branch switched successfully', { branchName });
	}

	/**
	 * Get list of all branches with details
	 */
	async listBranches(): Promise<BranchInfo[]> {
		this.logger.debug('Listing all branches');

		const branches = await this.gitService.getBranches();
		const currentBranch = await this.gitService.getCurrentBranch();
		const branchInfos: BranchInfo[] = [];

		for (const branchName of branches) {
			try {
				const info = await this.getBranchInfo(branchName);
				branchInfos.push({
					...info,
					current: branchName === currentBranch,
				});
			} catch (error) {
				this.logger.error('Failed to get branch info', {
					branchName,
					error: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		}

		return branchInfos;
	}

	/**
	 * Get information about a specific branch
	 * @param branchName Branch name
	 */
	async getBranchInfo(branchName: string): Promise<BranchInfo> {
		const git = (this.gitService as any).git;
		if (!git) {
			throw new Error('Git service not initialized');
		}

		// Get last commit on branch
		const log = await git.log({ maxCount: 1, from: branchName });
		const lastCommit = log.latest;

		if (!lastCommit) {
			throw new Error(`No commits found on branch: ${branchName}`);
		}

		const currentBranch = await this.gitService.getCurrentBranch();

		const info: BranchInfo = {
			name: branchName,
			current: branchName === currentBranch,
			lastCommit: lastCommit.hash,
			lastCommitMessage: lastCommit.message,
			lastCommitAuthor: lastCommit.author_name,
			lastCommitDate: new Date(lastCommit.date),
		};

		// Try to get ahead/behind info if remote tracking branch exists
		try {
			await this.gitService.fetch();
			const status = await git.status([branchName]);
			info.ahead = status.ahead;
			info.behind = status.behind;
		} catch (error) {
			// Remote tracking branch might not exist
			this.logger.debug('Could not get ahead/behind info', { branchName });
		}

		return info;
	}

	/**
	 * Merge branch into current branch
	 * @param branchName Branch to merge
	 * @param squash Whether to squash commits
	 */
	async mergeBranch(branchName: string, squash: boolean = false): Promise<void> {
		this.logger.info('Merging branch', { branchName, squash });

		const currentBranch = await this.gitService.getCurrentBranch();

		if (currentBranch === branchName) {
			throw new Error('Cannot merge branch into itself');
		}

		// Check for uncommitted changes
		const hasChanges = await this.gitService.hasUncommittedChanges();
		if (hasChanges) {
			throw new Error('Cannot merge with uncommitted changes. Commit or stash changes first.');
		}

		// Perform merge
		const result = await this.gitService.merge(branchName);

		if (!result.success) {
			this.logger.error('Merge failed with conflicts', {
				conflicts: result.conflicts,
			});
			throw new Error(`Merge conflict: ${result.conflicts.length} conflicted files`);
		}

		this.logger.info('Branch merged successfully', {
			branchName,
			mergedFiles: result.mergedFiles,
		});
	}

	/**
	 * Rebase current branch onto another branch
	 * @param baseBranch Branch to rebase onto
	 */
	async rebaseBranch(baseBranch: string): Promise<void> {
		this.logger.info('Rebasing onto branch', { baseBranch });

		const git = (this.gitService as any).git;
		if (!git) {
			throw new Error('Git service not initialized');
		}

		const currentBranch = await this.gitService.getCurrentBranch();

		if (currentBranch === baseBranch) {
			throw new Error('Cannot rebase branch onto itself');
		}

		// Check for uncommitted changes
		const hasChanges = await this.gitService.hasUncommittedChanges();
		if (hasChanges) {
			throw new Error('Cannot rebase with uncommitted changes. Commit or stash changes first.');
		}

		try {
			await git.rebase([baseBranch]);
			this.logger.info('Rebase completed successfully');
		} catch (error) {
			this.logger.error('Rebase failed', {
				error: error instanceof Error ? error.message : 'Unknown error',
			});
			throw new Error('Rebase failed. Please resolve conflicts manually.');
		}
	}

	/**
	 * Get current branch name
	 */
	async getCurrentBranch(): Promise<string> {
		return await this.gitService.getCurrentBranch();
	}

	/**
	 * Check if branch exists
	 * @param branchName Branch name
	 */
	async branchExists(branchName: string): Promise<boolean> {
		const branches = await this.gitService.getBranches();
		return branches.includes(branchName);
	}

	/**
	 * Rename a branch
	 * @param oldName Old branch name
	 * @param newName New branch name
	 */
	async renameBranch(oldName: string, newName: string): Promise<void> {
		this.logger.info('Renaming branch', { oldName, newName });

		// Validate new branch name
		this.validateBranchName(newName);

		const git = (this.gitService as any).git;
		if (!git) {
			throw new Error('Git service not initialized');
		}

		const currentBranch = await this.gitService.getCurrentBranch();
		const isCurrentBranch = currentBranch === oldName;

		// Rename the branch
		if (isCurrentBranch) {
			await git.branch(['-m', newName]);
		} else {
			await git.branch(['-m', oldName, newName]);
		}

		this.logger.info('Branch renamed successfully', { oldName, newName });
	}

	/**
	 * Get branch protection status
	 * @param branchName Branch name
	 */
	async isBranchProtected(branchName: string): Promise<boolean> {
		// This would typically check against a configuration
		// For now, protect main/master branches by default
		const protectedBranches = ['main', 'master', 'production'];
		return protectedBranches.includes(branchName);
	}

	/**
	 * Create branch naming convention helper
	 * @param type Branch type (feature, bugfix, hotfix, etc.)
	 * @param name Branch description
	 */
	generateBranchName(type: 'feature' | 'bugfix' | 'hotfix' | 'release', name: string): string {
		const sanitized = name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');

		return `${type}/${sanitized}`;
	}

	/**
	 * Validate branch name
	 * @param branchName Branch name
	 */
	private validateBranchName(branchName: string): void {
		// Git branch name rules
		const invalidPatterns = [
			/^\./, // Cannot start with dot
			/\.\.+/, // Cannot contain consecutive dots
			/\/\//, // Cannot contain consecutive slashes
			/[~^:?*\[\]\\]/, // Cannot contain certain special characters
			/^@$/, // Cannot be @
			/\.$/, // Cannot end with dot
			/\.lock$/, // Cannot end with .lock
			/@{/, // Cannot contain @{
		];

		for (const pattern of invalidPatterns) {
			if (pattern.test(branchName)) {
				throw new Error(`Invalid branch name: ${branchName}`);
			}
		}

		if (branchName.length === 0) {
			throw new Error('Branch name cannot be empty');
		}

		if (branchName.length > 255) {
			throw new Error('Branch name too long (max 255 characters)');
		}
	}

	/**
	 * Stash uncommitted changes
	 * @param message Stash message
	 */
	async stashChanges(message?: string): Promise<void> {
		this.logger.info('Stashing changes', { message });

		const git = (this.gitService as any).git;
		if (!git) {
			throw new Error('Git service not initialized');
		}

		const args = ['push'];
		if (message) {
			args.push('-m', message);
		}

		await git.stash(args);

		this.logger.info('Changes stashed successfully');
	}

	/**
	 * Apply stashed changes
	 * @param stashIndex Stash index (default: 0 - most recent)
	 */
	async applyStash(stashIndex: number = 0): Promise<void> {
		this.logger.info('Applying stash', { stashIndex });

		const git = (this.gitService as any).git;
		if (!git) {
			throw new Error('Git service not initialized');
		}

		await git.stash(['apply', `stash@{${stashIndex}}`]);

		this.logger.info('Stash applied successfully');
	}

	/**
	 * List all stashes
	 */
	async listStashes(): Promise<any[]> {
		const git = (this.gitService as any).git;
		if (!git) {
			throw new Error('Git service not initialized');
		}

		const result = await git.stash(['list']);
		return result.raw.split('\n').filter((line: string) => line.length > 0);
	}
}
