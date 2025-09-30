import type { GitConfig } from './types';

/**
 * Example Git integration configurations for different scenarios
 */

// ===================================================================
// 1. LOCAL DEVELOPMENT CONFIGURATION
// ===================================================================
export const localDevConfig: GitConfig = {
	repositoryPath: '/home/user/.n8n/git-repo',
	userName: 'Developer Name',
	userEmail: 'dev@company.com',
	defaultBranch: 'main',
	autoCommit: true,
	autoPush: false, // Don't auto-push in development
};

// ===================================================================
// 2. GITHUB HTTPS CONFIGURATION (with Personal Access Token)
// ===================================================================
export const githubHttpsConfig: GitConfig = {
	repositoryPath: '/var/lib/n8n/git-repo',
	remoteUrl: 'https://github.com/organization/workflows.git',
	remoteName: 'origin',
	userName: 'n8n-bot',
	userEmail: 'bot@company.com',
	defaultBranch: 'main',
	autoCommit: true,
	autoPush: true,
	accessToken: process.env.GITHUB_TOKEN || 'ghp_xxxxxxxxxxxxxxxxxxxx',
};

// ===================================================================
// 3. GITHUB SSH CONFIGURATION
// ===================================================================
export const githubSshConfig: GitConfig = {
	repositoryPath: '/var/lib/n8n/git-repo',
	remoteUrl: 'git@github.com:organization/workflows.git',
	remoteName: 'origin',
	userName: 'n8n-bot',
	userEmail: 'bot@company.com',
	defaultBranch: 'main',
	autoCommit: true,
	autoPush: true,
	sshKeyPath: '/home/user/.ssh/id_rsa',
};

// ===================================================================
// 4. GITLAB CONFIGURATION
// ===================================================================
export const gitlabConfig: GitConfig = {
	repositoryPath: '/var/lib/n8n/git-repo',
	remoteUrl: 'https://gitlab.com/organization/workflows.git',
	remoteName: 'origin',
	userName: 'n8n-bot',
	userEmail: 'bot@company.com',
	defaultBranch: 'main',
	autoCommit: true,
	autoPush: true,
	accessToken: process.env.GITLAB_TOKEN || 'glpat-xxxxxxxxxxxxxxxxxxxx',
};

// ===================================================================
// 5. BITBUCKET CONFIGURATION
// ===================================================================
export const bitbucketConfig: GitConfig = {
	repositoryPath: '/var/lib/n8n/git-repo',
	remoteUrl: 'https://bitbucket.org/organization/workflows.git',
	remoteName: 'origin',
	userName: 'n8n-bot',
	userEmail: 'bot@company.com',
	defaultBranch: 'main',
	autoCommit: true,
	autoPush: true,
	accessToken: process.env.BITBUCKET_TOKEN,
};

// ===================================================================
// 6. SELF-HOSTED GIT SERVER CONFIGURATION
// ===================================================================
export const selfHostedConfig: GitConfig = {
	repositoryPath: '/var/lib/n8n/git-repo',
	remoteUrl: 'https://git.company.com/workflows.git',
	remoteName: 'origin',
	userName: 'n8n-system',
	userEmail: 'n8n@company.com',
	defaultBranch: 'master',
	autoCommit: true,
	autoPush: false, // Manual push for safety
	accessToken: process.env.GIT_TOKEN,
};

// ===================================================================
// 7. PRODUCTION CONFIGURATION (High Security)
// ===================================================================
export const productionConfig: GitConfig = {
	repositoryPath: '/var/lib/n8n/git-repo',
	remoteUrl: process.env.GIT_REMOTE_URL!,
	remoteName: 'origin',
	userName: process.env.GIT_USER_NAME || 'n8n-production',
	userEmail: process.env.GIT_USER_EMAIL || 'n8n@company.com',
	defaultBranch: 'production',
	autoCommit: true,
	autoPush: true,
	sshKeyPath: process.env.GIT_SSH_KEY_PATH || '/etc/n8n/ssh/id_rsa',
};

// ===================================================================
// 8. MINIMAL CONFIGURATION (Local Only, No Remote)
// ===================================================================
export const localOnlyConfig: GitConfig = {
	repositoryPath: '/home/user/.n8n/git-repo',
	userName: 'Local User',
	userEmail: 'user@localhost',
	autoCommit: true,
	autoPush: false,
	// No remote URL - local versioning only
};

// ===================================================================
// 9. TEAM COLLABORATION CONFIGURATION
// ===================================================================
export const teamConfig: GitConfig = {
	repositoryPath: '/shared/n8n/workflows',
	remoteUrl: 'https://github.com/team/workflows.git',
	remoteName: 'origin',
	userName: process.env.USER_NAME || 'Team Member',
	userEmail: process.env.USER_EMAIL || 'member@team.com',
	defaultBranch: 'develop',
	autoCommit: false, // Manual commits for team review
	autoPush: false,
	accessToken: process.env.GITHUB_TOKEN,
};

// ===================================================================
// 10. MULTI-ENVIRONMENT CONFIGURATION
// ===================================================================
export const getEnvironmentConfig = (env: 'development' | 'staging' | 'production'): GitConfig => {
	const baseConfig: GitConfig = {
		repositoryPath: process.env.GIT_REPO_PATH || '/var/lib/n8n/git-repo',
		remoteUrl: process.env.GIT_REMOTE_URL,
		remoteName: 'origin',
		userName: process.env.GIT_USER_NAME || 'n8n-bot',
		userEmail: process.env.GIT_USER_EMAIL || 'bot@company.com',
		autoCommit: true,
		accessToken: process.env.GIT_ACCESS_TOKEN,
	};

	switch (env) {
		case 'development':
			return {
				...baseConfig,
				defaultBranch: 'develop',
				autoPush: false,
			};
		case 'staging':
			return {
				...baseConfig,
				defaultBranch: 'staging',
				autoPush: true,
			};
		case 'production':
			return {
				...baseConfig,
				defaultBranch: 'main',
				autoPush: true,
			};
	}
};

// ===================================================================
// CONFIGURATION VALIDATOR
// ===================================================================
export function validateGitConfig(config: GitConfig): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	// Required fields
	if (!config.repositoryPath) {
		errors.push('repositoryPath is required');
	}

	// Remote configuration validation
	if (config.remoteUrl) {
		if (!config.remoteUrl.match(/^(https?:\/\/|git@)/)) {
			errors.push('remoteUrl must be a valid Git URL');
		}

		// Check authentication
		if (config.remoteUrl.startsWith('https://') && !config.accessToken) {
			errors.push('accessToken required for HTTPS remote URLs');
		}

		if (config.remoteUrl.startsWith('git@') && !config.sshKeyPath) {
			errors.push('sshKeyPath required for SSH remote URLs');
		}
	}

	// Email validation
	if (config.userEmail && !config.userEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
		errors.push('userEmail must be a valid email address');
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}

// ===================================================================
// USAGE EXAMPLES
// ===================================================================

/*
// Example 1: Initialize with GitHub HTTPS
import { GitIntegrationService } from './git-integration.service';
import { githubHttpsConfig } from './config.example';

const gitService = new GitIntegrationService(...);
await gitService.initialize(githubHttpsConfig);

// Example 2: Initialize with environment-specific config
const config = getEnvironmentConfig(process.env.NODE_ENV as any);
await gitService.initialize(config);

// Example 3: Validate configuration before use
const { valid, errors } = validateGitConfig(myConfig);
if (!valid) {
  console.error('Invalid Git configuration:', errors);
  process.exit(1);
}
await gitService.initialize(myConfig);

// Example 4: Dynamic configuration from environment
const dynamicConfig: GitConfig = {
  repositoryPath: process.env.GIT_REPO_PATH || '/var/lib/n8n/git-repo',
  remoteUrl: process.env.GIT_REMOTE_URL,
  userName: process.env.GIT_USER_NAME,
  userEmail: process.env.GIT_USER_EMAIL,
  defaultBranch: process.env.GIT_DEFAULT_BRANCH || 'main',
  autoCommit: process.env.GIT_AUTO_COMMIT === 'true',
  autoPush: process.env.GIT_AUTO_PUSH === 'true',
  accessToken: process.env.GIT_ACCESS_TOKEN,
  sshKeyPath: process.env.GIT_SSH_KEY_PATH,
};

await gitService.initialize(dynamicConfig);
*/
