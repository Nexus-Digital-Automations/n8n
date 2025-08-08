import type { AuthenticatedRequest } from '@n8n/db';

/**
 * Custom Node Request Types
 * Defines all request/response interfaces for custom node management API
 */

// ================================
// Base Types and Enums
// ================================

export type NodeStatus = 'validating' | 'validated' | 'deployed' | 'failed' | 'archived';
export type DeploymentStatus = 'queued' | 'deploying' | 'deployed' | 'failed' | 'rolled-back';
export type EnvironmentType = 'staging' | 'production';
export type BatchOperation = 'deploy' | 'undeploy' | 'delete' | 'validate';

// ================================
// Core Data Interfaces
// ================================

export interface CustomNodeMetadata {
	nodeTypes: string[];
	author: string;
	authorEmail?: string;
	license: string;
	fileSize: string;
	dependencies: string[];
	category?: string;
	tags?: string[];
	repository?: string;
	homepage?: string;
	documentation?: string;
}

export interface ValidationResults {
	syntax: boolean;
	dependencies: boolean;
	security: boolean;
	tests: boolean;
	performance: boolean;
	warnings: ValidationIssue[];
	errors: ValidationIssue[];
	scanResults?: {
		vulnerabilities: number;
		securityScore: number;
		codeQuality: number;
	};
}

export interface ValidationIssue {
	type: 'syntax' | 'security' | 'dependency' | 'performance' | 'style';
	severity: 'error' | 'warning' | 'info';
	message: string;
	file?: string;
	line?: number;
	column?: number;
	rule?: string;
}

export interface CustomNodeSummary {
	id: string;
	name: string;
	version: string;
	status: NodeStatus;
	description?: string;
	author: string;
	category?: string;
	tags: string[];
	nodeTypes: string[];
	createdAt: string;
	updatedAt: string;
	deployedAt?: string;
	isActive: boolean;
	downloadCount?: number;
	rating?: number;
	lastUsed?: string;
}

export interface DeploymentInfo {
	deploymentId: string;
	nodeId: string;
	version: string;
	environment: EnvironmentType;
	status: DeploymentStatus;
	deployedBy: string;
	deployedAt: string;
	rollbackAvailable: boolean;
	errorMessage?: string;
	duration?: number; // deployment time in seconds
	resourceUsage?: {
		cpu: string;
		memory: string;
		storage: string;
	};
}

export interface RuntimeInfo {
	isLoaded: boolean;
	version: string;
	loadedAt?: string;
	instances: number;
	memory?: {
		used: string;
		peak: string;
		limit: string;
	};
	performance?: {
		executionCount: number;
		averageExecutionTime: number; // milliseconds
		errorRate: number; // percentage
		lastExecution?: string;
	};
	dependencies: {
		name: string;
		version: string;
		resolved: boolean;
		vulnerabilities?: number;
	}[];
}

export interface NodeFile {
	name: string;
	size: number;
	type: string;
	path: string;
	checksum?: string;
	lastModified?: string;
}

export interface HealthStatus {
	status: 'healthy' | 'degraded' | 'unhealthy';
	lastCheck: string;
	issues: string[];
	uptime?: number;
	responseTime?: number;
}

export interface TestResult {
	name: string;
	status: 'passed' | 'failed' | 'skipped';
	duration: number;
	error?: string;
	coverage?: number;
}

// ================================
// Source Configuration Types
// ================================

export interface NodeSourceConfig {
	type: 'git' | 'url' | 'npm' | 'file';
	location: string;
	version?: string;
	branch?: string;
	tag?: string;
	credentials?: {
		token?: string;
		username?: string;
		password?: string;
		sshKey?: string;
	};
	buildConfig?: {
		buildCommand?: string;
		outputDirectory?: string;
		entryPoint?: string;
	};
}

// ================================
// Request Type Definitions
// ================================

export declare namespace CustomNodeRequest {
	// Create/Upload Node
	type CreateNode = AuthenticatedRequest<
		{},
		CreateNodeResponse,
		{
			name: string;
			description?: string;
			version: string;
			tags?: string[];
			category?: string;
			validateOnly?: boolean;
			skipTests?: boolean;
			source?: NodeSourceConfig;
			metadata?: Partial<CustomNodeMetadata>;
		}
	> & {
		file?: Express.Multer.File;
	};

	// List Nodes with Filtering
	type ListNodes = AuthenticatedRequest<
		{},
		ListNodesResponse,
		{},
		{
			status?: 'all' | 'validating' | 'validated' | 'deployed' | 'failed' | 'archived';
			category?: string;
			author?: string;
			search?: string;
			tags?: string; // comma-separated
			nodeTypes?: string; // comma-separated
			limit?: string;
			offset?: string;
			sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'version' | 'status' | 'downloadCount' | 'rating';
			sortOrder?: 'asc' | 'desc';
			includeInactive?: string;
		}
	>;

	// Get Single Node Details
	type GetNode = AuthenticatedRequest<{ nodeId: string }, NodeDetailsResponse>;
	
	// Update Node
	type UpdateNode = AuthenticatedRequest<
		{ nodeId: string },
		UpdateNodeResponse,
		{
			name?: string;
			description?: string;
			tags?: string[];
			category?: string;
			version?: string;
			metadata?: Partial<CustomNodeMetadata>;
			isActive?: boolean;
		}
	> & {
		file?: Express.Multer.File;
	};

	// Delete Node
	type DeleteNode = AuthenticatedRequest<
		{ nodeId: string },
		DeleteNodeResponse,
		{},
		{
			force?: string; // 'true' | 'false'
			cleanup?: string; // 'true' | 'false'
			archiveOnly?: string; // 'true' | 'false'
		}
	>;

	// Deploy Node
	type DeployNode = AuthenticatedRequest<
		{ nodeId: string },
		DeployNodeResponse,
		{
			environment?: EnvironmentType;
			version?: string;
			rollback?: boolean;
			options?: DeploymentOptions;
		}
	>;

	// Get Node Status
	type GetNodeStatus = AuthenticatedRequest<{ nodeId: string }, NodeStatusResponse>;

	// Batch Operations
	type BatchOperation = AuthenticatedRequest<
		{},
		BatchOperationResponse,
		{
			operation: BatchOperation;
			nodeIds: string[];
			options?: BatchOperationOptions;
		}
	>;

	// Template Operations
	type GetTemplates = AuthenticatedRequest<{}, TemplatesResponse>;
	
	type GenerateFromTemplate = AuthenticatedRequest<
		{ templateId: string },
		GenerateFromTemplateResponse,
		{
			nodeName: string;
			description?: string;
			parameters?: Record<string, any>;
		}
	>;

	// Import/Export
	type ImportNodes = AuthenticatedRequest<
		{},
		ImportNodesResponse,
		{
			importType: 'file' | 'url' | 'backup';
			overwriteExisting?: boolean;
			validateBeforeImport?: boolean;
		}
	> & {
		file?: Express.Multer.File;
	};

	type ExportNode = AuthenticatedRequest<
		{ nodeId: string },
		{}, // File download response
		{},
		{
			format?: 'json' | 'tar' | 'zip';
			includeVersionHistory?: string;
			includeDependencies?: string;
		}
	>;
}

// ================================
// Response Type Definitions
// ================================

export interface CreateNodeResponse {
	id: string;
	name: string;
	version: string;
	status: NodeStatus;
	validationResults: ValidationResults;
	metadata: CustomNodeMetadata;
	uploadedAt: string;
	validatedAt?: string;
	warnings?: string[];
}

export interface ListNodesResponse {
	nodes: CustomNodeSummary[];
	total: number;
	limit: number;
	offset: number;
	filters: {
		categories: string[];
		authors: string[];
		tags: string[];
		statuses: NodeStatus[];
		nodeTypes: string[];
	};
	aggregations?: {
		totalByStatus: Record<NodeStatus, number>;
		totalByCategory: Record<string, number>;
		averageRating: number;
		totalDownloads: number;
	};
}

export interface NodeDetailsResponse extends CustomNodeSummary {
	validationResults?: ValidationResults;
	metadata: CustomNodeMetadata;
	deploymentInfo?: DeploymentInfo;
	files: NodeFile[];
	dependencies: RuntimeInfo['dependencies'];
	testResults?: {
		passed: number;
		failed: number;
		total: number;
		coverage?: number;
		details: TestResult[];
		lastRun?: string;
	};
	usage?: {
		activeWorkflows: number;
		totalExecutions: number;
		lastExecution?: string;
		popularityScore: number;
	};
	versionHistory?: {
		version: string;
		releaseDate: string;
		changelog?: string;
		isActive: boolean;
	}[];
}

export interface UpdateNodeResponse {
	id: string;
	name: string;
	version: string;
	status: NodeStatus;
	updatedAt: string;
	validationRequired?: boolean;
	changes: string[];
}

export interface DeleteNodeResponse {
	success: boolean;
	nodeId: string;
	deletedAt: string;
	archived: boolean;
	affectedWorkflows?: number;
}

export interface DeployNodeResponse {
	deploymentId: string;
	nodeId: string;
	version: string;
	status: DeploymentStatus;
	environment: EnvironmentType;
	startedAt: string;
	estimatedDuration?: number; // seconds
	message?: string;
	rollbackInfo?: {
		previousVersion?: string;
		rollbackAvailable: boolean;
	};
}

export interface NodeStatusResponse {
	nodeId: string;
	deploymentStatus: 'not-deployed' | DeploymentStatus;
	runtime: RuntimeInfo;
	health: HealthStatus;
	deploymentHistory: DeploymentInfo[];
	monitoring?: {
		alertsActive: number;
		lastAlert?: string;
		performanceTrends: {
			executionTime: number[];
			errorRate: number[];
			memoryUsage: number[];
		};
	};
}

export interface BatchOperationResponse {
	operation: BatchOperation;
	totalNodes: number;
	successful: number;
	failed: number;
	results: BatchOperationResult[];
	startedAt: string;
	completedAt: string;
	duration: number; // seconds
}

export interface BatchOperationResult {
	nodeId: string;
	success: boolean;
	message: string;
	timestamp: string;
	error?: string;
	details?: Record<string, any>;
}

export interface TemplatesResponse {
	templates: NodeTemplate[];
	categories: string[];
	totalCount: number;
}

export interface NodeTemplate {
	id: string;
	name: string;
	description: string;
	category: string;
	complexity: 'beginner' | 'intermediate' | 'advanced';
	features: string[];
	estimatedTime: string;
	author: string;
	version: string;
	tags: string[];
	preview?: {
		imageUrl?: string;
		demoUrl?: string;
		documentationUrl?: string;
	};
	parameters: {
		name: string;
		type: 'string' | 'number' | 'boolean' | 'select' | 'multiline';
		description: string;
		required: boolean;
		default?: any;
		options?: string[]; // for select type
	}[];
}

export interface GenerateFromTemplateResponse {
	nodeId: string;
	name: string;
	templateId: string;
	generatedAt: string;
	files: NodeFile[];
	nextSteps: string[];
	validationRequired: boolean;
	estimatedValidationTime?: number;
}

export interface ImportNodesResponse {
	imported: {
		nodeId: string;
		name: string;
		version: string;
		status: 'success' | 'warning' | 'error';
		message?: string;
	}[];
	summary: {
		total: number;
		successful: number;
		warnings: number;
		errors: number;
	};
	conflictsResolved?: {
		nodeId: string;
		action: 'overwritten' | 'skipped' | 'renamed';
		oldVersion?: string;
		newVersion: string;
	}[];
}

// ================================
// Configuration Interfaces
// ================================

export interface DeploymentOptions {
	restartWorkflows?: boolean;
	gracefulShutdown?: boolean;
	timeout?: number; // seconds
	rollbackOnFailure?: boolean;
	preDeploymentTests?: boolean;
	notificationChannels?: string[]; // webhook URLs or email addresses
	resourceLimits?: {
		memory?: string;
		cpu?: string;
		timeout?: number;
	};
}

export interface BatchOperationOptions {
	environment?: EnvironmentType;
	force?: boolean;
	parallel?: boolean;
	maxConcurrency?: number;
	rollbackOnFailure?: boolean;
	continueOnError?: boolean;
	notifyOnCompletion?: boolean;
}

// ================================
// Validation and Security Types
// ================================

export interface SecurityScanResult {
	vulnerabilities: SecurityVulnerability[];
	securityScore: number; // 0-100
	recommendations: string[];
	scanDate: string;
	scanDuration: number;
}

export interface SecurityVulnerability {
	type: 'dependency' | 'code' | 'configuration';
	severity: 'critical' | 'high' | 'medium' | 'low';
	title: string;
	description: string;
	affectedComponent: string;
	cve?: string;
	fixAvailable: boolean;
	fixDescription?: string;
}

export interface PerformanceMetrics {
	memoryUsage: {
		heapUsed: number;
		heapTotal: number;
		external: number;
	};
	executionMetrics: {
		averageTime: number; // ms
		medianTime: number; // ms
		p95Time: number; // ms
		throughput: number; // executions per minute
	};
	resourceUtilization: {
		cpu: number; // percentage
		memory: number; // percentage
		networkIO: {
			bytesIn: number;
			bytesOut: number;
		};
	};
}

// ================================
// Event Types for Audit Logging
// ================================

export interface CustomNodeEvent {
	type: 'created' | 'updated' | 'deleted' | 'deployed' | 'undeployed' | 'validated' | 'failed';
	nodeId: string;
	userId: string;
	timestamp: string;
	details: Record<string, any>;
	ipAddress?: string;
	userAgent?: string;
}