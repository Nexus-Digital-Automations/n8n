import type { CustomNode, CustomNodeStatus, ValidationResults, NodeMetadata } from '@n8n/db';

// Request/Response Types
export interface CreateCustomNodeRequest {
	name: string;
	version: string;
	description?: string;
	category?: string;
	tags?: string[];
	validateOnly?: boolean;
	skipTests?: boolean;
}

export interface UpdateCustomNodeRequest {
	name?: string;
	description?: string;
	category?: string;
	tags?: string[];
	version?: string;
}

export interface CustomNodeFilters {
	status?: CustomNodeStatus | 'all';
	category?: string;
	authorId?: string;
	search?: string;
	tags?: string[];
}

export interface CustomNodePagination {
	limit?: number;
	offset?: number;
	sortBy?: 'name' | 'createdAt' | 'version' | 'status';
	sortOrder?: 'asc' | 'desc';
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

export interface DeleteCustomNodeQuery {
	force?: string;
	cleanup?: string;
}

// Response Types
export interface CustomNodeSummary {
	id: string;
	name: string;
	version: string;
	status: CustomNodeStatus;
	description: string;
	author: string;
	category: string;
	tags: string[];
	nodeTypes: string[];
	createdAt: string;
	updatedAt: string;
	deployedAt?: string;
	isActive: boolean;
}

export interface CustomNodeDetailsResponse extends CustomNode {
	deploymentInfo?: {
		deployedVersion: string;
		deploymentStatus: 'deploying' | 'deployed' | 'failed';
		lastDeployment: string;
		rollbackAvailable: boolean;
	};
	files?: {
		name: string;
		size: number;
		type: string;
		path: string;
	}[];
	dependencies?: {
		name: string;
		version: string;
		resolved: boolean;
	}[];
	testResults?: {
		passed: number;
		failed: number;
		coverage?: number;
		details: TestResult[];
	};
}

export interface ListCustomNodesResponse {
	nodes: CustomNodeSummary[];
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

// Validation Types
export interface SecurityCheckResult {
	passed: boolean;
	warnings: string[];
	errors: string[];
	riskLevel: 'low' | 'medium' | 'high';
}

export interface DependencyCheckResult {
	passed: boolean;
	dependencies: string[];
	missingDependencies: string[];
	vulnerabilities: string[];
}

export interface TestResult {
	name: string;
	status: 'passed' | 'failed' | 'skipped';
	duration: number;
	error?: string;
}

// Storage Types
export interface CreateCustomNodeOptions {
	name: string;
	version: string;
	description?: string;
	authorId?: string;
	category?: string;
	tags?: string[];
	file?: Buffer;
	fileName?: string;
	validateOnly?: boolean;
	skipTests?: boolean;
}

export interface CustomNodeStorageOptions {
	maxFileSize?: number;
	allowedExtensions?: string[];
	storageLocation?: string;
	enableCompression?: boolean;
}

// Batch Operations
export interface BatchOperationRequest {
	operation: 'validate' | 'delete' | 'deploy' | 'undeploy';
	nodeIds: string[];
	options?: {
		force?: boolean;
		parallel?: boolean;
		maxConcurrency?: number;
		[key: string]: any;
	};
}

export interface BatchOperationResult {
	success: boolean;
	results: Array<{
		id: string;
		success: boolean;
		error?: string;
		data?: any;
	}>;
	summary: {
		total: number;
		successful: number;
		failed: number;
		skipped: number;
	};
}

// Statistics Types
export interface CustomNodeStatistics {
	total: number;
	byStatus: Record<CustomNodeStatus, number>;
	byCategory: Record<string, number>;
	byAuthor: Record<string, number>;
	active: number;
	recentActivity: {
		created: number;
		validated: number;
		deployed: number;
		failed: number;
	};
}

// Event Types for audit logging
export interface CustomNodeEvent {
	user: {
		id: string;
		email: string;
	};
	nodeId: string;
	nodeName: string;
	nodeVersion: string;
	timestamp: Date;
}

export interface CustomNodeCreatedEvent extends CustomNodeEvent {
	validateOnly: boolean;
}

export interface CustomNodeValidatedEvent extends CustomNodeEvent {
	success: boolean;
	results: ValidationResults;
}

export interface CustomNodeUpdatedEvent extends CustomNodeEvent {
	updates: Partial<UpdateCustomNodeRequest>;
}

export interface CustomNodeDeletedEvent extends CustomNodeEvent {
	force: boolean;
}

export interface CustomNodeBatchOperationEvent {
	user: {
		id: string;
		email: string;
	};
	operation: string;
	nodeIds: string[];
	results: Array<{ id: string; success: boolean; error?: string }>;
	timestamp: Date;
}

// Template Types (for future scaffolding feature)
export interface CustomNodeTemplate {
	id: string;
	name: string;
	description: string;
	category: string;
	files: Array<{
		path: string;
		content: string;
		variables?: Record<string, any>;
	}>;
	metadata: {
		version: string;
		author: string;
		nodeTypes: string[];
		dependencies: string[];
	};
}

export interface GenerateFromTemplateRequest {
	templateId: string;
	nodeName: string;
	variables?: Record<string, any>;
}

// Import/Export Types (for future feature)
export interface ExportCustomNodeOptions {
	includeFiles?: boolean;
	includeMetadata?: boolean;
	includeValidationResults?: boolean;
	format?: 'json' | 'zip';
}

export interface ImportCustomNodeRequest {
	data: string | Buffer;
	format: 'json' | 'zip';
	overwrite?: boolean;
	validateBeforeImport?: boolean;
}
