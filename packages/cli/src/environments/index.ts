/**
 * Environment Management System for n8n
 *
 * This module provides comprehensive environment management capabilities including:
 * - Multiple environment support (dev, staging, production, testing, custom)
 * - Environment-specific credentials with encryption
 * - Environment variables with automatic sensitive data detection
 * - Workflow promotion between environments with validation
 * - Environment cloning and seeding
 * - Health checks and status monitoring
 * - Backup and rollback support
 */

// Core services
export { EnvironmentManager } from './environment-manager';
export { EnvironmentConfigService } from './environment-config';
export { CredentialIsolationService } from './credential-isolation';
export { PromotionWorkflowService } from './promotion-workflow';
export { EnvironmentVariablesService } from './environment-variables';

// Repositories
export { EnvironmentRepository } from './repositories/environment.repository';
export { EnvironmentConfigRepository } from './repositories/environment-config.repository';
export { EnvironmentCredentialRepository } from './repositories/environment-credential.repository';
export { EnvironmentVariableRepository } from './repositories/environment-variable.repository';
export { WorkflowPromotionRepository } from './repositories/workflow-promotion.repository';
export { WorkflowBackupRepository } from './repositories/workflow-backup.repository';

// Types
export type {
	EnvironmentType,
	EnvironmentStatus,
	PromotionStatus,
	EnvironmentConfig,
	CreateEnvironmentOptions,
	UpdateEnvironmentOptions,
	EnvironmentCloneOptions,
	EnvironmentHealthCheck,
	HealthCheckResult,
	EnvironmentCredential,
	EnvironmentVariable,
	WorkflowPromotionRequest,
	WorkflowPromotionResult,
	PromotionError,
	ValidationResult,
	WorkflowBackup,
	EnvironmentAccess,
	EnvironmentTemplate,
	PromotionOptions,
	CredentialIsolationOptions,
} from './types';
