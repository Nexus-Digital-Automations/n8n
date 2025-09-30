import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import { promises as fs } from 'fs';
import simpleGit, { type SimpleGit, type StatusResult } from 'simple-git';

import type {
	GitConfig,
	GitCommitResult,
	GitPushResult,
	GitPullResult,
	GitMergeResult,
} from './types';

/**
 * Core Git operations service using simple-git library
 * Provides low-level Git operations for workflow versioning
 */
@Service()
export class GitService {
	private git: SimpleGit | null = null;
	private repoPath: string | null = null;

	constructor(private readonly logger: Logger) {}

	/**
	 * Initialize Git repository for workflow versioning
	 * @param config Git configuration
	 */
	async initialize(config: GitConfig): Promise<void> {
		this.logger.info('Initializing Git repository', {
			repoPath: config.repositoryPath,
			remoteUrl: config.remoteUrl ? '[CONFIGURED]' : '[NOT SET]',
		});

		this.repoPath = config.repositoryPath;

		// Ensure repository directory exists
		await fs.mkdir(this.repoPath, { recursive: true });

		// Initialize simple-git
		this.git = simpleGit({
			baseDir: this.repoPath,
			binary: 'git',
			maxConcurrentProcesses: 6,
			trimmed: false,
		});

		// Check if repository is already initialized
		const isRepo = await this.git.checkIsRepo();

		if (!isRepo) {
			this.logger.info('Initializing new Git repository');
			await this.git.init();
			await this.git.addConfig('core.autocrlf', 'false');
		}

		// Configure user if provided
		if (config.userName) {
			await this.git.addConfig('user.name', config.userName);
		}
		if (config.userEmail) {
			await this.git.addConfig('user.email', config.userEmail);
		}

		// Configure remote if provided
		if (config.remoteUrl) {
			await this.configureRemote(config.remoteUrl, config.remoteName || 'origin');
		}

		this.logger.info('Git repository initialized successfully');
	}

	/**
	 * Configure or update remote repository
	 * @param remoteUrl Remote repository URL
	 * @param remoteName Remote name (default: origin)
	 */
	async configureRemote(remoteUrl: string, remoteName: string = 'origin'): Promise<void> {
		this.ensureInitialized();

		const remotes = await this.git!.getRemotes(true);
		const existingRemote = remotes.find((r) => r.name === remoteName);

		if (existingRemote) {
			this.logger.info(`Updating remote ${remoteName}`);
			await this.git!.remote(['set-url', remoteName, remoteUrl]);
		} else {
			this.logger.info(`Adding remote ${remoteName}`);
			await this.git!.addRemote(remoteName, remoteUrl);
		}
	}

	/**
	 * Get current repository status
	 */
	async getStatus(): Promise<StatusResult> {
		this.ensureInitialized();
		return await this.git!.status();
	}

	/**
	 * Stage files for commit
	 * @param files File paths to stage (relative to repo root)
	 */
	async add(files: string | string[]): Promise<void> {
		this.ensureInitialized();
		await this.git!.add(files);
		this.logger.debug('Files staged', { files });
	}

	/**
	 * Commit staged changes
	 * @param message Commit message
	 * @param author Optional author information
	 */
	async commit(
		message: string,
		author?: { name: string; email: string },
	): Promise<GitCommitResult> {
		this.ensureInitialized();

		const options: string[] = ['-m', message];

		if (author) {
			options.push('--author', `${author.name} <${author.email}>`);
		}

		const result = await this.git!.commit(message, options);

		this.logger.info('Commit created', {
			hash: result.commit,
			message,
			author: author?.name,
		});

		return {
			hash: result.commit,
			message,
			author: author?.name,
			timestamp: new Date(),
		};
	}

	/**
	 * Push commits to remote repository
	 * @param remoteName Remote name (default: origin)
	 * @param branchName Branch name
	 */
	async push(remoteName: string = 'origin', branchName?: string): Promise<GitPushResult> {
		this.ensureInitialized();

		const currentBranch = branchName || (await this.getCurrentBranch());
		const startTime = Date.now();

		this.logger.info('Pushing to remote', {
			remote: remoteName,
			branch: currentBranch,
		});

		await this.git!.push(remoteName, currentBranch, ['--set-upstream']);

		return {
			remote: remoteName,
			branch: currentBranch,
			success: true,
			duration: Date.now() - startTime,
		};
	}

	/**
	 * Pull changes from remote repository
	 * @param remoteName Remote name (default: origin)
	 * @param branchName Branch name
	 */
	async pull(remoteName: string = 'origin', branchName?: string): Promise<GitPullResult> {
		this.ensureInitialized();

		const currentBranch = branchName || (await this.getCurrentBranch());
		const startTime = Date.now();

		this.logger.info('Pulling from remote', {
			remote: remoteName,
			branch: currentBranch,
		});

		const result = await this.git!.pull(remoteName, currentBranch);

		return {
			remote: remoteName,
			branch: currentBranch,
			success: true,
			filesChanged: result.files?.length || 0,
			insertions: result.insertions || {},
			deletions: result.deletions || {},
			duration: Date.now() - startTime,
		};
	}

	/**
	 * Fetch changes from remote without merging
	 * @param remoteName Remote name (default: origin)
	 */
	async fetch(remoteName: string = 'origin'): Promise<void> {
		this.ensureInitialized();
		this.logger.info('Fetching from remote', { remote: remoteName });
		await this.git!.fetch(remoteName);
	}

	/**
	 * Create a new branch
	 * @param branchName Branch name
	 * @param checkout Whether to checkout the new branch
	 */
	async createBranch(branchName: string, checkout: boolean = true): Promise<void> {
		this.ensureInitialized();

		if (checkout) {
			await this.git!.checkoutLocalBranch(branchName);
			this.logger.info('Created and checked out new branch', { branch: branchName });
		} else {
			await this.git!.branch([branchName]);
			this.logger.info('Created new branch', { branch: branchName });
		}
	}

	/**
	 * Checkout a branch
	 * @param branchName Branch name
	 */
	async checkout(branchName: string): Promise<void> {
		this.ensureInitialized();
		await this.git!.checkout(branchName);
		this.logger.info('Checked out branch', { branch: branchName });
	}

	/**
	 * Merge a branch into current branch
	 * @param branchName Branch to merge
	 */
	async merge(branchName: string): Promise<GitMergeResult> {
		this.ensureInitialized();

		const startTime = Date.now();

		this.logger.info('Merging branch', { branch: branchName });

		try {
			const result = await this.git!.merge([branchName]);

			return {
				success: true,
				conflicts: [],
				mergedFiles: result.files?.length || 0,
				duration: Date.now() - startTime,
			};
		} catch (error) {
			// Check for merge conflicts
			const status = await this.getStatus();
			const conflicts = status.conflicted;

			this.logger.warn('Merge conflicts detected', { conflicts });

			return {
				success: false,
				conflicts,
				mergedFiles: 0,
				duration: Date.now() - startTime,
			};
		}
	}

	/**
	 * Get list of branches
	 */
	async getBranches(): Promise<string[]> {
		this.ensureInitialized();
		const result = await this.git!.branch();
		return result.all;
	}

	/**
	 * Get current branch name
	 */
	async getCurrentBranch(): Promise<string> {
		this.ensureInitialized();
		const result = await this.git!.branch();
		return result.current;
	}

	/**
	 * Get commit log
	 * @param options Log options
	 */
	async getLog(options?: { maxCount?: number; file?: string }): Promise<any[]> {
		this.ensureInitialized();

		const logOptions: any = {};
		if (options?.maxCount) {
			logOptions.maxCount = options.maxCount;
		}
		if (options?.file) {
			logOptions.file = options.file;
		}

		const result = await this.git!.log(logOptions);
		return result.all;
	}

	/**
	 * Get diff between commits, branches, or working directory
	 * @param fromRef Starting reference (commit, branch, etc.)
	 * @param toRef Ending reference (optional, defaults to working directory)
	 */
	async getDiff(fromRef?: string, toRef?: string): Promise<string> {
		this.ensureInitialized();

		const args: string[] = [];
		if (fromRef) args.push(fromRef);
		if (toRef) args.push(toRef);

		return await this.git!.diff(args);
	}

	/**
	 * Show file content at specific commit
	 * @param filePath File path
	 * @param commitHash Commit hash (optional, defaults to HEAD)
	 */
	async showFileAtCommit(filePath: string, commitHash: string = 'HEAD'): Promise<string> {
		this.ensureInitialized();
		return await this.git!.show([`${commitHash}:${filePath}`]);
	}

	/**
	 * Check if repository has uncommitted changes
	 */
	async hasUncommittedChanges(): Promise<boolean> {
		this.ensureInitialized();
		const status = await this.getStatus();
		return status.files.length > 0;
	}

	/**
	 * Check if repository is behind remote
	 */
	async isBehindRemote(remoteName: string = 'origin'): Promise<boolean> {
		this.ensureInitialized();
		await this.fetch(remoteName);
		const status = await this.getStatus();
		return status.behind > 0;
	}

	/**
	 * Check if repository is ahead of remote
	 */
	async isAheadOfRemote(remoteName: string = 'origin'): Promise<boolean> {
		this.ensureInitialized();
		await this.fetch(remoteName);
		const status = await this.getStatus();
		return status.ahead > 0;
	}

	/**
	 * Reset to specific commit (hard reset)
	 * @param commitHash Commit hash
	 */
	async reset(commitHash: string): Promise<void> {
		this.ensureInitialized();
		this.logger.warn('Performing hard reset', { commit: commitHash });
		await this.git!.reset(['--hard', commitHash]);
	}

	/**
	 * Get repository path
	 */
	getRepositoryPath(): string {
		if (!this.repoPath) {
			throw new Error('Git repository not initialized');
		}
		return this.repoPath;
	}

	/**
	 * Check if Git is initialized
	 */
	isInitialized(): boolean {
		return this.git !== null && this.repoPath !== null;
	}

	/**
	 * Ensure Git is initialized before operations
	 */
	private ensureInitialized(): void {
		if (!this.isInitialized()) {
			throw new Error('Git repository not initialized. Call initialize() first.');
		}
	}

	/**
	 * Clean up resources
	 */
	async cleanup(): Promise<void> {
		if (this.git) {
			// simple-git doesn't require explicit cleanup
			this.git = null;
			this.repoPath = null;
			this.logger.info('Git service cleaned up');
		}
	}
}
