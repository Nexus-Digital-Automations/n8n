/**
 * Git integration type definitions
 */

/**
 * Git configuration
 */
export interface GitConfig {
	/** Path to Git repository */
	repositoryPath: string;
	/** Remote repository URL */
	remoteUrl?: string;
	/** Remote name (default: origin) */
	remoteName?: string;
	/** Git user name */
	userName?: string;
	/** Git user email */
	userEmail?: string;
	/** Default branch name */
	defaultBranch?: string;
	/** Enable auto-commit on workflow save */
	autoCommit?: boolean;
	/** Enable auto-push on commit */
	autoPush?: boolean;
	/** SSH key path for authentication */
	sshKeyPath?: string;
	/** Personal access token for HTTPS authentication */
	accessToken?: string;
}

/**
 * Git commit result
 */
export interface GitCommitResult {
	/** Commit hash */
	hash: string;
	/** Commit message */
	message: string;
	/** Commit author */
	author?: string;
	/** Commit timestamp */
	timestamp: Date;
}

/**
 * Git push result
 */
export interface GitPushResult {
	/** Remote name */
	remote: string;
	/** Branch name */
	branch: string;
	/** Success status */
	success: boolean;
	/** Error message if failed */
	error?: string;
	/** Duration in milliseconds */
	duration: number;
}

/**
 * Git pull result
 */
export interface GitPullResult {
	/** Remote name */
	remote: string;
	/** Branch name */
	branch: string;
	/** Success status */
	success: boolean;
	/** Number of files changed */
	filesChanged: number;
	/** Insertions by file */
	insertions: Record<string, number>;
	/** Deletions by file */
	deletions: Record<string, number>;
	/** Error message if failed */
	error?: string;
	/** Duration in milliseconds */
	duration: number;
}

/**
 * Git merge result
 */
export interface GitMergeResult {
	/** Success status */
	success: boolean;
	/** Conflicted files */
	conflicts: string[];
	/** Number of merged files */
	mergedFiles: number;
	/** Duration in milliseconds */
	duration: number;
}

/**
 * Workflow serialization format
 */
export interface SerializedWorkflow {
	/** Workflow ID */
	id: string;
	/** Workflow name */
	name: string;
	/** Workflow active status */
	active: boolean;
	/** Workflow nodes */
	nodes: any[];
	/** Workflow connections */
	connections: any;
	/** Workflow settings */
	settings?: any;
	/** Workflow static data */
	staticData?: any;
	/** Workflow tags */
	tags?: string[];
	/** Creation timestamp */
	createdAt: string;
	/** Last update timestamp */
	updatedAt: string;
	/** Version metadata */
	version: number;
}

/**
 * Workflow diff information
 */
export interface WorkflowDiff {
	/** Workflow ID */
	workflowId: string;
	/** Workflow name */
	workflowName: string;
	/** Added nodes */
	addedNodes: WorkflowNodeDiff[];
	/** Removed nodes */
	removedNodes: WorkflowNodeDiff[];
	/** Modified nodes */
	modifiedNodes: WorkflowNodeModification[];
	/** Connection changes */
	connectionChanges: ConnectionDiff[];
	/** Settings changes */
	settingsChanges: SettingsDiff[];
	/** Overall change summary */
	summary: {
		totalChanges: number;
		nodesAdded: number;
		nodesRemoved: number;
		nodesModified: number;
		connectionsChanged: number;
	};
}

/**
 * Node diff information
 */
export interface WorkflowNodeDiff {
	/** Node ID */
	id: string;
	/** Node name */
	name: string;
	/** Node type */
	type: string;
	/** Node position */
	position?: [number, number];
	/** Node parameters */
	parameters?: any;
}

/**
 * Node modification details
 */
export interface WorkflowNodeModification {
	/** Node ID */
	id: string;
	/** Node name */
	name: string;
	/** Node type */
	type: string;
	/** Changed properties */
	changes: PropertyChange[];
}

/**
 * Property change details
 */
export interface PropertyChange {
	/** Property path (e.g., "parameters.url") */
	path: string;
	/** Old value */
	oldValue: any;
	/** New value */
	newValue: any;
	/** Change type */
	changeType: 'added' | 'removed' | 'modified';
}

/**
 * Connection diff information
 */
export interface ConnectionDiff {
	/** Source node */
	sourceNode: string;
	/** Target node */
	targetNode: string;
	/** Connection type */
	type: string;
	/** Change type */
	changeType: 'added' | 'removed';
}

/**
 * Settings diff information
 */
export interface SettingsDiff {
	/** Setting key */
	key: string;
	/** Old value */
	oldValue: any;
	/** New value */
	newValue: any;
}

/**
 * Merge conflict information
 */
export interface MergeConflict {
	/** Workflow ID */
	workflowId: string;
	/** Workflow name */
	workflowName: string;
	/** Conflicting nodes */
	conflictingNodes: NodeConflict[];
	/** Conflicting connections */
	conflictingConnections: ConnectionConflict[];
	/** Base version (common ancestor) */
	baseVersion: SerializedWorkflow;
	/** Current version */
	currentVersion: SerializedWorkflow;
	/** Incoming version */
	incomingVersion: SerializedWorkflow;
}

/**
 * Node conflict details
 */
export interface NodeConflict {
	/** Node ID */
	nodeId: string;
	/** Current version of node */
	current: WorkflowNodeDiff;
	/** Incoming version of node */
	incoming: WorkflowNodeDiff;
	/** Base version of node */
	base?: WorkflowNodeDiff;
	/** Conflict type */
	conflictType: 'both-modified' | 'deleted-modified' | 'added-added';
}

/**
 * Connection conflict details
 */
export interface ConnectionConflict {
	/** Source node */
	sourceNode: string;
	/** Target node */
	targetNode: string;
	/** Current connection exists */
	currentExists: boolean;
	/** Incoming connection exists */
	incomingExists: boolean;
}

/**
 * Conflict resolution strategy
 */
export type ConflictResolution = 'current' | 'incoming' | 'manual';

/**
 * Resolved conflict
 */
export interface ResolvedConflict {
	/** Workflow ID */
	workflowId: string;
	/** Resolution strategy used */
	resolution: ConflictResolution;
	/** Resolved workflow */
	resolvedWorkflow: SerializedWorkflow;
}

/**
 * Branch information
 */
export interface BranchInfo {
	/** Branch name */
	name: string;
	/** Current branch indicator */
	current: boolean;
	/** Last commit hash */
	lastCommit: string;
	/** Last commit message */
	lastCommitMessage: string;
	/** Last commit author */
	lastCommitAuthor: string;
	/** Last commit date */
	lastCommitDate: Date;
	/** Ahead count (compared to remote) */
	ahead?: number;
	/** Behind count (compared to remote) */
	behind?: number;
}

/**
 * Git history entry
 */
export interface GitHistoryEntry {
	/** Commit hash */
	hash: string;
	/** Short commit hash */
	shortHash: string;
	/** Commit message */
	message: string;
	/** Commit author name */
	authorName: string;
	/** Commit author email */
	authorEmail: string;
	/** Commit date */
	date: Date;
	/** Parent commit hashes */
	parents: string[];
	/** Files changed in commit */
	filesChanged: string[];
}

/**
 * Pull request information
 */
export interface PullRequestInfo {
	/** PR number */
	prNumber: number;
	/** PR title */
	title: string;
	/** PR description */
	description: string;
	/** Source branch */
	sourceBranch: string;
	/** Target branch */
	targetBranch: string;
	/** PR author */
	author: string;
	/** PR state */
	state: 'open' | 'closed' | 'merged';
	/** Creation date */
	createdAt: Date;
	/** Last update date */
	updatedAt: Date;
	/** Merge date (if merged) */
	mergedAt?: Date;
	/** Reviewers */
	reviewers: string[];
	/** Approval status */
	approved: boolean;
}

/**
 * Webhook event types
 */
export type WebhookEventType =
	| 'push'
	| 'pull_request'
	| 'pull_request_review'
	| 'merge'
	| 'branch_created'
	| 'branch_deleted';

/**
 * Webhook event payload
 */
export interface WebhookEvent {
	/** Event type */
	type: WebhookEventType;
	/** Repository name */
	repository: string;
	/** Branch name */
	branch: string;
	/** Commit hash */
	commit?: string;
	/** Event author */
	author: string;
	/** Event timestamp */
	timestamp: Date;
	/** Additional event data */
	data: any;
}

/**
 * Git credentials
 */
export interface GitCredentials {
	/** Credential type */
	type: 'ssh' | 'https' | 'token';
	/** SSH key path */
	sshKeyPath?: string;
	/** SSH passphrase */
	sshPassphrase?: string;
	/** HTTPS username */
	username?: string;
	/** HTTPS password */
	password?: string;
	/** Personal access token */
	token?: string;
}

/**
 * Workflow file mapping
 */
export interface WorkflowFileMapping {
	/** Workflow ID */
	workflowId: string;
	/** File path in repository */
	filePath: string;
	/** Last synced commit hash */
	lastSyncedCommit: string;
	/** Last synced timestamp */
	lastSyncedAt: Date;
}
