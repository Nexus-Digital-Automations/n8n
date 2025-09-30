import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { NotFoundError } from '@/errors/response-errors/not-found.error';

import { CredentialIsolationService } from './credential-isolation';
import { EnvironmentConfigService } from './environment-config';
import { EnvironmentVariablesService } from './environment-variables';
import { PromotionWorkflowService } from './promotion-workflow';
import { EnvironmentRepository } from './repositories/environment.repository';
import type {
	EnvironmentConfig,
	EnvironmentStatus,
	EnvironmentType,
	CreateEnvironmentOptions,
	UpdateEnvironmentOptions,
	EnvironmentHealthCheck,
	EnvironmentCloneOptions,
} from './types';

/**
 * Core environment management system for n8n.
 * Handles creation, deletion, updates, and lifecycle management of environments.
 *
 * Supports multiple environments (dev, staging, production, custom) with:
 * - Environment-specific credentials and variables
 * - Workflow promotion between environments
 * - Environment cloning and seeding
 * - Access control per environment
 * - Health checks and status monitoring
 */
@Service()
export class EnvironmentManager {
	constructor(
		private readonly logger: Logger,
		private readonly environmentRepository: EnvironmentRepository,
		private readonly environmentConfig: EnvironmentConfigService,
		private readonly credentialIsolation: CredentialIsolationService,
		private readonly promotionWorkflow: PromotionWorkflowService,
		private readonly environmentVariables: EnvironmentVariablesService,
	) {
		this.logger.info('EnvironmentManager service initialized');
	}

	/**
	 * Create a new environment with configuration.
	 *
	 * @param options - Environment creation options
	 * @param userId - User creating the environment
	 * @returns Newly created environment
	 */
	async createEnvironment(
		options: CreateEnvironmentOptions,
		userId: string,
	): Promise<EnvironmentConfig> {
		this.logger.info('Creating new environment', { name: options.name, type: options.type });

		// Validate environment name uniqueness
		const existing = await this.environmentRepository.findByName(options.name);
		if (existing) {
			throw new BadRequestError(`Environment with name '${options.name}' already exists`);
		}

		// Validate environment type
		this.validateEnvironmentType(options.type);

		// Create environment entity
		const environment = await this.environmentRepository.createEnvironment({
			name: options.name,
			type: options.type,
			description: options.description,
			status: 'active',
			config: options.config || {},
			createdBy: userId,
			metadata: options.metadata || {},
		});

		// Initialize environment configuration
		const createdEnvironment = environment;
		await this.environmentConfig.initializeEnvironment(createdEnvironment.id, options.config || {});

		// Initialize environment variables if provided
		if (options.variables && Object.keys(options.variables).length > 0) {
			await this.environmentVariables.setVariables(
				createdEnvironment.id,
				options.variables,
				userId,
			);
		}

		this.logger.info('Environment created successfully', {
			id: environment.id,
			name: options.name,
		});

		return this.toEnvironmentConfig(environment);
	}

	/**
	 * Update an existing environment.
	 *
	 * @param environmentId - ID of environment to update
	 * @param updates - Updates to apply
	 * @param userId - User performing the update
	 * @returns Updated environment
	 */
	async updateEnvironment(
		environmentId: string,
		updates: UpdateEnvironmentOptions,
		userId: string,
	): Promise<EnvironmentConfig> {
		this.logger.info('Updating environment', { environmentId });

		const environment = await this.environmentRepository.findById(environmentId);
		if (!environment) {
			throw new NotFoundError(`Environment with id '${environmentId}' not found`);
		}

		// Validate name uniqueness if changing name
		if (updates.name && updates.name !== environment.name) {
			const existing = await this.environmentRepository.findByName(updates.name);
			if (existing) {
				throw new BadRequestError(`Environment with name '${updates.name}' already exists`);
			}
		}

		// Update environment entity
		const updatedEnvironment = await this.environmentRepository.updateEnvironment(environmentId, {
			name: updates.name,
			description: updates.description,
			status: updates.status,
			config: updates.config,
			metadata: updates.metadata,
			updatedBy: userId,
		});

		// Update configuration if provided
		if (updates.config) {
			await this.environmentConfig.updateConfiguration(environmentId, updates.config);
		}

		// Update variables if provided
		if (updates.variables) {
			await this.environmentVariables.setVariables(environmentId, updates.variables, userId);
		}

		this.logger.info('Environment updated successfully', { environmentId });

		return this.toEnvironmentConfig(updatedEnvironment);
	}

	/**
	 * Delete an environment.
	 * This will also clean up associated credentials, variables, and configurations.
	 *
	 * @param environmentId - ID of environment to delete
	 * @param userId - User performing the deletion
	 * @param options - Deletion options
	 */
	async deleteEnvironment(
		environmentId: string,
		userId: string,
		options: { force?: boolean } = {},
	): Promise<void> {
		this.logger.info('Deleting environment', { environmentId, force: options.force });

		const environment = await this.environmentRepository.findById(environmentId);
		if (!environment) {
			throw new NotFoundError(`Environment with id '${environmentId}' not found`);
		}

		// Prevent deletion of production environment without force flag
		if (environment.type === 'production' && !options.force) {
			throw new BadRequestError(
				'Cannot delete production environment without force flag. Use { force: true } to proceed.',
			);
		}

		// Clean up associated data
		await this.cleanupEnvironmentData(environmentId);

		// Delete environment
		await this.environmentRepository.deleteEnvironment(environmentId);

		this.logger.info('Environment deleted successfully', { environmentId });
	}

	/**
	 * Get environment by ID.
	 *
	 * @param environmentId - Environment ID
	 * @returns Environment configuration
	 */
	async getEnvironment(environmentId: string): Promise<EnvironmentConfig> {
		this.logger.debug('Fetching environment', { environmentId });

		const environment = await this.environmentRepository.findById(environmentId);
		if (!environment) {
			throw new NotFoundError(`Environment with id '${environmentId}' not found`);
		}

		return this.toEnvironmentConfig(environment);
	}

	/**
	 * Get environment by name.
	 *
	 * @param name - Environment name
	 * @returns Environment configuration
	 */
	async getEnvironmentByName(name: string): Promise<EnvironmentConfig> {
		this.logger.debug('Fetching environment by name', { name });

		const environment = await this.environmentRepository.findByName(name);
		if (!environment) {
			throw new NotFoundError(`Environment with name '${name}' not found`);
		}

		return this.toEnvironmentConfig(environment);
	}

	/**
	 * List all environments with optional filtering.
	 *
	 * @param filters - Optional filters
	 * @returns List of environments
	 */
	async listEnvironments(filters?: {
		type?: EnvironmentType;
		status?: EnvironmentStatus;
	}): Promise<EnvironmentConfig[]> {
		this.logger.debug('Listing environments', { filters });

		const environments = await this.environmentRepository.findAll(filters);

		return environments.map((env) => this.toEnvironmentConfig(env));
	}

	/**
	 * Clone an environment to create a new one.
	 *
	 * @param sourceId - Source environment ID
	 * @param options - Clone options
	 * @param userId - User performing the clone
	 * @returns Newly cloned environment
	 */
	async cloneEnvironment(
		sourceId: string,
		options: EnvironmentCloneOptions,
		userId: string,
	): Promise<EnvironmentConfig> {
		this.logger.info('Cloning environment', { sourceId, targetName: options.targetName });

		const source = await this.environmentRepository.findById(sourceId);
		if (!source) {
			throw new NotFoundError(`Source environment with id '${sourceId}' not found`);
		}

		// Create new environment with cloned configuration
		const newEnvironment = await this.createEnvironment(
			{
				name: options.targetName,
				type: options.targetType || source.type,
				description: options.description || `Clone of ${source.name}`,
				config: source.config,
				metadata: {
					...source.metadata,
					clonedFrom: sourceId,
					clonedAt: new Date().toISOString(),
				},
			},
			userId,
		);

		// Clone credentials if requested
		if (options.includeCredentials) {
			await this.credentialIsolation.cloneCredentials(sourceId, newEnvironment.id, userId);
		}

		// Clone variables if requested
		if (options.includeVariables) {
			const sourceVariables = await this.environmentVariables.getAllVariables(sourceId);
			await this.environmentVariables.setVariables(newEnvironment.id, sourceVariables, userId);
		}

		this.logger.info('Environment cloned successfully', {
			sourceId,
			newId: newEnvironment.id,
		});

		return newEnvironment;
	}

	/**
	 * Perform health check on an environment.
	 *
	 * @param environmentId - Environment ID
	 * @returns Health check results
	 */
	async performHealthCheck(environmentId: string): Promise<EnvironmentHealthCheck> {
		this.logger.debug('Performing health check', { environmentId });

		const environment = await this.environmentRepository.findById(environmentId);
		if (!environment) {
			throw new NotFoundError(`Environment with id '${environmentId}' not found`);
		}

		const checks: EnvironmentHealthCheck = {
			environmentId,
			status: 'healthy',
			timestamp: new Date(),
			checks: {
				database: await this.checkDatabaseHealth(environmentId),
				credentials: await this.checkCredentialsHealth(environmentId),
				variables: await this.checkVariablesHealth(environmentId),
				configuration: await this.checkConfigurationHealth(environmentId),
			},
		};

		// Determine overall status
		const checkValues = Object.values(checks.checks);
		if (checkValues.some((check) => check.status === 'error')) {
			checks.status = 'unhealthy';
		} else if (checkValues.some((check) => check.status === 'warning')) {
			checks.status = 'degraded';
		}

		return checks;
	}

	/**
	 * Activate an environment.
	 *
	 * @param environmentId - Environment ID
	 * @param userId - User performing the activation
	 */
	async activateEnvironment(environmentId: string, userId: string): Promise<void> {
		this.logger.info('Activating environment', { environmentId });

		await this.updateEnvironment(environmentId, { status: 'active' }, userId);
	}

	/**
	 * Deactivate an environment.
	 *
	 * @param environmentId - Environment ID
	 * @param userId - User performing the deactivation
	 */
	async deactivateEnvironment(environmentId: string, userId: string): Promise<void> {
		this.logger.info('Deactivating environment', { environmentId });

		await this.updateEnvironment(environmentId, { status: 'inactive' }, userId);
	}

	/**
	 * Maintenance mode for an environment.
	 *
	 * @param environmentId - Environment ID
	 * @param userId - User performing the action
	 */
	async setMaintenanceMode(environmentId: string, userId: string): Promise<void> {
		this.logger.info('Setting environment to maintenance mode', { environmentId });

		await this.updateEnvironment(environmentId, { status: 'maintenance' }, userId);
	}

	// ===== Private helper methods =====

	private validateEnvironmentType(type: EnvironmentType): void {
		const validTypes: EnvironmentType[] = [
			'development',
			'staging',
			'production',
			'testing',
			'custom',
		];
		if (!validTypes.includes(type)) {
			throw new BadRequestError(`Invalid environment type: ${type}`);
		}
	}

	private toEnvironmentConfig(entity: any): EnvironmentConfig {
		return {
			id: entity.id,
			name: entity.name,
			type: entity.type,
			description: entity.description,
			status: entity.status,
			config: entity.config || {},
			metadata: entity.metadata || {},
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			createdBy: entity.createdBy,
			updatedBy: entity.updatedBy,
		};
	}

	private async cleanupEnvironmentData(environmentId: string): Promise<void> {
		this.logger.debug('Cleaning up environment data', { environmentId });

		// Clean up credentials
		await this.credentialIsolation.deleteEnvironmentCredentials(environmentId);

		// Clean up variables
		await this.environmentVariables.deleteAllVariables(environmentId);

		// Clean up configuration
		await this.environmentConfig.deleteConfiguration(environmentId);
	}

	private async checkDatabaseHealth(
		environmentId: string,
	): Promise<{ status: 'healthy' | 'warning' | 'error'; message: string }> {
		try {
			const environment = await this.environmentRepository.findById(environmentId);
			if (!environment) {
				return { status: 'error', message: 'Environment not found in database' };
			}
			return { status: 'healthy', message: 'Database connection successful' };
		} catch (error) {
			return { status: 'error', message: `Database error: ${error.message}` };
		}
	}

	private async checkCredentialsHealth(
		environmentId: string,
	): Promise<{ status: 'healthy' | 'warning' | 'error'; message: string }> {
		try {
			const credentials = await this.credentialIsolation.listCredentials(environmentId);
			return {
				status: 'healthy',
				message: `${credentials.length} credentials available`,
			};
		} catch (error) {
			return { status: 'warning', message: `Credentials check failed: ${error.message}` };
		}
	}

	private async checkVariablesHealth(
		environmentId: string,
	): Promise<{ status: 'healthy' | 'warning' | 'error'; message: string }> {
		try {
			const variables = await this.environmentVariables.getAllVariables(environmentId);
			return {
				status: 'healthy',
				message: `${Object.keys(variables).length} variables configured`,
			};
		} catch (error) {
			return { status: 'warning', message: `Variables check failed: ${error.message}` };
		}
	}

	private async checkConfigurationHealth(
		environmentId: string,
	): Promise<{ status: 'healthy' | 'warning' | 'error'; message: string }> {
		try {
			const config = await this.environmentConfig.getConfiguration(environmentId);
			return {
				status: 'healthy',
				message: 'Configuration loaded successfully',
			};
		} catch (error) {
			return { status: 'error', message: `Configuration error: ${error.message}` };
		}
	}
}
