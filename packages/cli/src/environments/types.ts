/**
 * Type definitions for environment management system.
 */

export type EnvironmentType = 'development' | 'staging' | 'production' | 'testing' | 'custom';

export type EnvironmentStatus = 'active' | 'inactive' | 'maintenance' | 'archived';

export type PromotionStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';

/**
 * Core environment configuration.
 */
export interface EnvironmentConfig {
	id: string;
	name: string;
	type: EnvironmentType;
	description?: string;
	status: EnvironmentStatus;
	config: Record<string, any>;
	metadata: Record<string, any>;
	createdAt: Date;
	updatedAt: Date;
	createdBy: string;
	updatedBy?: string;
}

/**
 * Options for creating a new environment.
 */
export interface CreateEnvironmentOptions {
	name: string;
	type: EnvironmentType;
	description?: string;
	config?: Record<string, any>;
	variables?: Record<string, string>;
	metadata?: Record<string, any>;
}

/**
 * Options for updating an environment.
 */
export interface UpdateEnvironmentOptions {
	name?: string;
	description?: string;
	status?: EnvironmentStatus;
	config?: Record<string, any>;
	variables?: Record<string, string>;
	metadata?: Record<string, any>;
}

/**
 * Options for cloning an environment.
 */
export interface EnvironmentCloneOptions {
	targetName: string;
	targetType?: EnvironmentType;
	description?: string;
	includeCredentials?: boolean;
	includeVariables?: boolean;
	includeWorkflows?: boolean;
}

/**
 * Environment health check results.
 */
export interface EnvironmentHealthCheck {
	environmentId: string;
	status: 'healthy' | 'degraded' | 'unhealthy';
	timestamp: Date;
	checks: {
		database: HealthCheckResult;
		credentials: HealthCheckResult;
		variables: HealthCheckResult;
		configuration: HealthCheckResult;
	};
}

export interface HealthCheckResult {
	status: 'healthy' | 'warning' | 'error';
	message: string;
}

/**
 * Environment-specific credential configuration.
 */
export interface EnvironmentCredential {
	id: string;
	environmentId: string;
	credentialId: string;
	encryptedData: string;
	isActive: boolean;
	metadata: Record<string, any>;
	createdAt: Date;
	updatedAt: Date;
	createdBy: string;
}

/**
 * Environment variable configuration.
 */
export interface EnvironmentVariable {
	id: string;
	environmentId: string;
	key: string;
	value: string;
	encrypted: boolean;
	description?: string;
	metadata: Record<string, any>;
	createdAt: Date;
	updatedAt: Date;
	createdBy: string;
}

/**
 * Workflow promotion request.
 */
export interface WorkflowPromotionRequest {
	workflowId: string;
	sourceEnvironmentId: string;
	targetEnvironmentId: string;
	validateBeforePromotion?: boolean;
	createBackup?: boolean;
	notifyUsers?: string[];
	metadata?: Record<string, any>;
}

/**
 * Workflow promotion result.
 */
export interface WorkflowPromotionResult {
	id: string;
	workflowId: string;
	sourceEnvironmentId: string;
	targetEnvironmentId: string;
	status: PromotionStatus;
	startedAt: Date;
	completedAt?: Date;
	errors?: PromotionError[];
	backupId?: string;
	validationResults?: ValidationResult[];
	metadata: Record<string, any>;
	performedBy: string;
}

/**
 * Promotion error details.
 */
export interface PromotionError {
	code: string;
	message: string;
	details?: Record<string, any>;
	timestamp: Date;
}

/**
 * Validation result for workflow promotion.
 */
export interface ValidationResult {
	check: string;
	passed: boolean;
	message: string;
	severity: 'error' | 'warning' | 'info';
}

/**
 * Workflow backup for rollback support.
 */
export interface WorkflowBackup {
	id: string;
	workflowId: string;
	environmentId: string;
	workflowData: any;
	metadata: Record<string, any>;
	createdAt: Date;
	createdBy: string;
}

/**
 * Environment access control configuration.
 */
export interface EnvironmentAccess {
	environmentId: string;
	userId: string;
	role: 'admin' | 'editor' | 'viewer';
	permissions: string[];
	grantedAt: Date;
	grantedBy: string;
}

/**
 * Environment configuration template.
 */
export interface EnvironmentTemplate {
	name: string;
	type: EnvironmentType;
	description: string;
	defaultConfig: Record<string, any>;
	defaultVariables: Record<string, string>;
	requiredVariables: string[];
}

/**
 * Promotion workflow options.
 */
export interface PromotionOptions {
	validateCredentials?: boolean;
	validateConnections?: boolean;
	createBackup?: boolean;
	dryRun?: boolean;
	autoActivate?: boolean;
	notifyOnComplete?: boolean;
	rollbackOnError?: boolean;
}

/**
 * Credential isolation options.
 */
export interface CredentialIsolationOptions {
	encryptionKey?: string;
	allowSharing?: boolean;
	auditAccess?: boolean;
}
