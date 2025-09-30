import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import type { PullRequestInfo, WebhookEvent } from './types';
import { GitService } from './git-service';
import { BranchManager } from './branch-manager';
import { DiffEngine } from './diff-engine';

/**
 * Pull request and code review system
 * Integrates with GitHub/GitLab/Bitbucket for workflow reviews
 */
@Service()
export class ReviewSystem {
	private webhookHandlers: Map<string, (event: WebhookEvent) => Promise<void>> = new Map();

	constructor(
		private readonly logger: Logger,
		private readonly gitService: GitService,
		private readonly branchManager: BranchManager,
		private readonly diffEngine: DiffEngine,
	) {}

	/**
	 * Initialize review system
	 */
	async initialize(): Promise<void> {
		this.logger.info('Initializing review system');

		// Register default webhook handlers
		this.registerWebhookHandler('push', this.handlePushEvent.bind(this));
		this.registerWebhookHandler('pull_request', this.handlePullRequestEvent.bind(this));
		this.registerWebhookHandler('pull_request_review', this.handleReviewEvent.bind(this));
	}

	/**
	 * Create a pull request (platform-agnostic format)
	 * @param sourceBranch Source branch
	 * @param targetBranch Target branch
	 * @param title PR title
	 * @param description PR description
	 */
	async createPullRequest(
		sourceBranch: string,
		targetBranch: string,
		title: string,
		description: string,
	): Promise<PullRequestInfo> {
		this.logger.info('Creating pull request', {
			sourceBranch,
			targetBranch,
			title,
		});

		// Validate branches exist
		const branchExists = await this.branchManager.branchExists(sourceBranch);
		if (!branchExists) {
			throw new Error(`Source branch does not exist: ${sourceBranch}`);
		}

		// Push source branch to remote
		try {
			await this.gitService.push('origin', sourceBranch);
		} catch (error) {
			this.logger.warn('Failed to push source branch', {
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}

		// Create PR info structure
		// Note: Actual PR creation would use platform-specific APIs (GitHub, GitLab, etc.)
		const pr: PullRequestInfo = {
			prNumber: Date.now(), // Would be assigned by platform
			title,
			description,
			sourceBranch,
			targetBranch,
			author: 'n8n-system', // Would come from user context
			state: 'open',
			createdAt: new Date(),
			updatedAt: new Date(),
			reviewers: [],
			approved: false,
		};

		this.logger.info('Pull request created', {
			prNumber: pr.prNumber,
			sourceBranch,
			targetBranch,
		});

		return pr;
	}

	/**
	 * Update pull request
	 * @param prNumber PR number
	 * @param updates PR updates
	 */
	async updatePullRequest(
		prNumber: number,
		updates: Partial<PullRequestInfo>,
	): Promise<PullRequestInfo> {
		this.logger.info('Updating pull request', { prNumber, updates });

		// This would call platform-specific API
		// For now, return a mock updated PR
		const updatedPr: PullRequestInfo = {
			prNumber,
			title: updates.title || 'Updated PR',
			description: updates.description || '',
			sourceBranch: updates.sourceBranch || 'feature/branch',
			targetBranch: updates.targetBranch || 'main',
			author: updates.author || 'n8n-system',
			state: updates.state || 'open',
			createdAt: new Date(),
			updatedAt: new Date(),
			reviewers: updates.reviewers || [],
			approved: updates.approved || false,
		};

		return updatedPr;
	}

	/**
	 * Get pull request details
	 * @param prNumber PR number
	 */
	async getPullRequest(prNumber: number): Promise<PullRequestInfo | null> {
		this.logger.debug('Getting pull request', { prNumber });

		// This would call platform-specific API
		// For now, return null
		return null;
	}

	/**
	 * List all pull requests
	 * @param state PR state filter
	 */
	async listPullRequests(state?: 'open' | 'closed' | 'merged'): Promise<PullRequestInfo[]> {
		this.logger.debug('Listing pull requests', { state });

		// This would call platform-specific API
		// For now, return empty array
		return [];
	}

	/**
	 * Merge pull request
	 * @param prNumber PR number
	 * @param mergeMethod Merge method (merge, squash, rebase)
	 */
	async mergePullRequest(
		prNumber: number,
		mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge',
	): Promise<void> {
		this.logger.info('Merging pull request', { prNumber, mergeMethod });

		// Get PR info
		const pr = await this.getPullRequest(prNumber);
		if (!pr) {
			throw new Error(`Pull request not found: ${prNumber}`);
		}

		if (pr.state !== 'open') {
			throw new Error(`Cannot merge PR in state: ${pr.state}`);
		}

		// Check approval status
		if (!pr.approved) {
			throw new Error('Pull request not approved');
		}

		// Switch to target branch
		await this.branchManager.switchBranch(pr.targetBranch);

		// Pull latest changes
		await this.gitService.pull('origin', pr.targetBranch);

		// Merge source branch
		await this.branchManager.mergeBranch(pr.sourceBranch, mergeMethod === 'squash');

		// Push merged changes
		await this.gitService.push('origin', pr.targetBranch);

		this.logger.info('Pull request merged successfully', { prNumber });
	}

	/**
	 * Close pull request without merging
	 * @param prNumber PR number
	 */
	async closePullRequest(prNumber: number): Promise<void> {
		this.logger.info('Closing pull request', { prNumber });

		// This would call platform-specific API to close PR
		await this.updatePullRequest(prNumber, { state: 'closed' });
	}

	/**
	 * Add reviewer to pull request
	 * @param prNumber PR number
	 * @param reviewer Reviewer username
	 */
	async addReviewer(prNumber: number, reviewer: string): Promise<void> {
		this.logger.info('Adding reviewer to pull request', { prNumber, reviewer });

		const pr = await this.getPullRequest(prNumber);
		if (!pr) {
			throw new Error(`Pull request not found: ${prNumber}`);
		}

		const reviewers = [...pr.reviewers, reviewer];
		await this.updatePullRequest(prNumber, { reviewers });
	}

	/**
	 * Approve pull request
	 * @param prNumber PR number
	 * @param reviewer Reviewer username
	 * @param comment Optional review comment
	 */
	async approvePullRequest(prNumber: number, reviewer: string, comment?: string): Promise<void> {
		this.logger.info('Approving pull request', { prNumber, reviewer, comment });

		// This would call platform-specific API
		await this.updatePullRequest(prNumber, { approved: true });
	}

	/**
	 * Request changes on pull request
	 * @param prNumber PR number
	 * @param reviewer Reviewer username
	 * @param comment Review comment
	 */
	async requestChanges(prNumber: number, reviewer: string, comment: string): Promise<void> {
		this.logger.info('Requesting changes on pull request', { prNumber, reviewer });

		// This would call platform-specific API
		await this.updatePullRequest(prNumber, { approved: false });
	}

	/**
	 * Register webhook handler
	 * @param eventType Event type
	 * @param handler Event handler function
	 */
	registerWebhookHandler(eventType: string, handler: (event: WebhookEvent) => Promise<void>): void {
		this.logger.debug('Registering webhook handler', { eventType });
		this.webhookHandlers.set(eventType, handler);
	}

	/**
	 * Handle incoming webhook event
	 * @param event Webhook event
	 */
	async handleWebhookEvent(event: WebhookEvent): Promise<void> {
		this.logger.info('Processing webhook event', {
			type: event.type,
			repository: event.repository,
			branch: event.branch,
		});

		const handler = this.webhookHandlers.get(event.type);
		if (handler) {
			try {
				await handler(event);
				this.logger.info('Webhook event processed successfully', { type: event.type });
			} catch (error) {
				this.logger.error('Failed to process webhook event', {
					type: event.type,
					error: error instanceof Error ? error.message : 'Unknown error',
				});
				throw error;
			}
		} else {
			this.logger.warn('No handler registered for webhook event type', { type: event.type });
		}
	}

	/**
	 * Handle push event
	 * @param event Push event
	 */
	private async handlePushEvent(event: WebhookEvent): Promise<void> {
		this.logger.info('Processing push event', {
			branch: event.branch,
			commit: event.commit,
		});

		// Pull latest changes from branch
		try {
			const currentBranch = await this.gitService.getCurrentBranch();
			if (currentBranch === event.branch) {
				await this.gitService.pull('origin', event.branch);
				this.logger.info('Pulled latest changes from push event');
			}
		} catch (error) {
			this.logger.error('Failed to pull changes from push event', {
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * Handle pull request event
	 * @param event Pull request event
	 */
	private async handlePullRequestEvent(event: WebhookEvent): Promise<void> {
		this.logger.info('Processing pull request event', {
			action: event.data.action,
			prNumber: event.data.number,
		});

		const action = event.data.action;

		switch (action) {
			case 'opened':
				// Notify about new PR
				this.logger.info('New pull request opened', { prNumber: event.data.number });
				break;
			case 'closed':
				if (event.data.merged) {
					// PR was merged
					this.logger.info('Pull request merged', { prNumber: event.data.number });
					// Pull merged changes
					await this.gitService.pull('origin', event.branch);
				} else {
					// PR was closed without merging
					this.logger.info('Pull request closed without merge', { prNumber: event.data.number });
				}
				break;
			case 'reopened':
				this.logger.info('Pull request reopened', { prNumber: event.data.number });
				break;
			case 'synchronize':
				// PR was updated with new commits
				this.logger.info('Pull request synchronized', { prNumber: event.data.number });
				break;
		}
	}

	/**
	 * Handle pull request review event
	 * @param event Review event
	 */
	private async handleReviewEvent(event: WebhookEvent): Promise<void> {
		this.logger.info('Processing pull request review event', {
			action: event.data.action,
			prNumber: event.data.prNumber,
			reviewState: event.data.review?.state,
		});

		const reviewState = event.data.review?.state;

		switch (reviewState) {
			case 'approved':
				this.logger.info('Pull request approved', {
					prNumber: event.data.prNumber,
					reviewer: event.author,
				});
				break;
			case 'changes_requested':
				this.logger.info('Changes requested on pull request', {
					prNumber: event.data.prNumber,
					reviewer: event.author,
				});
				break;
			case 'commented':
				this.logger.info('Comment added to pull request', {
					prNumber: event.data.prNumber,
					reviewer: event.author,
				});
				break;
		}
	}

	/**
	 * Generate PR template
	 * @param sourceBranch Source branch
	 * @param targetBranch Target branch
	 */
	async generatePRTemplate(sourceBranch: string, targetBranch: string): Promise<string> {
		this.logger.debug('Generating PR template', { sourceBranch, targetBranch });

		const lines: string[] = [];

		lines.push('## Changes');
		lines.push('<!-- Describe the changes in this PR -->');
		lines.push('');

		// Get commit messages between branches
		const git = (this.gitService as any).git;
		if (git) {
			try {
				const log = await git.log({
					from: targetBranch,
					to: sourceBranch,
				});

				if (log.all.length > 0) {
					lines.push('### Commits');
					for (const commit of log.all) {
						lines.push(`- ${commit.message}`);
					}
					lines.push('');
				}
			} catch (error) {
				this.logger.debug('Could not get commit log for PR template');
			}
		}

		lines.push('## Testing');
		lines.push('<!-- How should reviewers test these changes? -->');
		lines.push('');

		lines.push('## Checklist');
		lines.push('- [ ] Changes tested locally');
		lines.push('- [ ] Documentation updated');
		lines.push('- [ ] No breaking changes');
		lines.push('');

		return lines.join('\n');
	}

	/**
	 * Validate PR can be merged
	 * @param prNumber PR number
	 */
	async validatePRMergeable(prNumber: number): Promise<{
		mergeable: boolean;
		reasons: string[];
	}> {
		this.logger.debug('Validating PR mergeability', { prNumber });

		const reasons: string[] = [];
		const pr = await this.getPullRequest(prNumber);

		if (!pr) {
			return { mergeable: false, reasons: ['Pull request not found'] };
		}

		if (pr.state !== 'open') {
			reasons.push(`PR is ${pr.state}, not open`);
		}

		if (!pr.approved) {
			reasons.push('PR not approved by reviewers');
		}

		// Check for merge conflicts
		try {
			await this.branchManager.switchBranch(pr.targetBranch);
			await this.gitService.pull('origin', pr.targetBranch);

			// Try merge in dry-run mode
			// This is simplified - actual implementation would use git merge --no-commit --no-ff
			const result = await this.gitService.merge(pr.sourceBranch);
			if (!result.success) {
				reasons.push(`Merge conflicts detected: ${result.conflicts.join(', ')}`);
			}
		} catch (error) {
			reasons.push('Unable to check for merge conflicts');
		}

		return {
			mergeable: reasons.length === 0,
			reasons,
		};
	}
}
