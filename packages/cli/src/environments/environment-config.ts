import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';

import { EnvironmentConfigRepository } from './repositories/environment-config.repository';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';

/**
 * Environment-specific configuration handler.
 * Manages configuration settings that are unique to each environment.
 *
 * Features:
 * - Store and retrieve environment-specific settings
 * - Validate configuration schemas
 * - Merge configurations with defaults
 * - Support for nested configuration objects
 * - Configuration versioning and history
 */
@Service()
export class EnvironmentConfigService {
	constructor(
		private readonly logger: Logger,
		private readonly configRepository: EnvironmentConfigRepository,
	) {
		this.logger.info('EnvironmentConfigService initialized');
	}

	/**
	 * Initialize configuration for a new environment.
	 *
	 * @param environmentId - Environment ID
	 * @param initialConfig - Initial configuration
	 */
	async initializeEnvironment(
		environmentId: string,
		initialConfig: Record<string, unknown>,
	): Promise<void> {
		this.logger.info('Initializing environment configuration', { environmentId });

		// Merge with default configuration
		const config = this.mergeWithDefaults(initialConfig);

		// Validate configuration
		this.validateConfiguration(config);

		// Store configuration
		await this.configRepository.setConfiguration(environmentId, config);

		this.logger.info('Environment configuration initialized', { environmentId });
	}

	/**
	 * Get configuration for an environment.
	 *
	 * @param environmentId - Environment ID
	 * @returns Configuration object
	 */
	async getConfiguration(environmentId: string): Promise<Record<string, unknown>> {
		this.logger.debug('Fetching environment configuration', { environmentId });

		const config = await this.configRepository.getConfiguration(environmentId);

		if (!config) {
			this.logger.warn('No configuration found for environment', { environmentId });
			return this.getDefaultConfiguration();
		}

		return config;
	}

	/**
	 * Update configuration for an environment.
	 *
	 * @param environmentId - Environment ID
	 * @param updates - Configuration updates
	 */
	async updateConfiguration(
		environmentId: string,
		updates: Record<string, unknown>,
	): Promise<void> {
		this.logger.info('Updating environment configuration', { environmentId });

		// Get current configuration
		const current = await this.getConfiguration(environmentId);

		// Merge updates with current configuration
		const merged = this.deepMerge(current, updates);

		// Validate merged configuration
		this.validateConfiguration(merged);

		// Store updated configuration
		await this.configRepository.setConfiguration(environmentId, merged);

		this.logger.info('Environment configuration updated', { environmentId });
	}

	/**
	 * Delete configuration for an environment.
	 *
	 * @param environmentId - Environment ID
	 */
	async deleteConfiguration(environmentId: string): Promise<void> {
		this.logger.info('Deleting environment configuration', { environmentId });

		await this.configRepository.deleteConfiguration(environmentId);

		this.logger.info('Environment configuration deleted', { environmentId });
	}

	/**
	 * Get a specific configuration value.
	 *
	 * @param environmentId - Environment ID
	 * @param key - Configuration key (supports dot notation)
	 * @returns Configuration value
	 */
	async getConfigValue<T = unknown>(environmentId: string, key: string): Promise<T | undefined> {
		this.logger.debug('Fetching configuration value', { environmentId, key });

		const config = await this.getConfiguration(environmentId);

		return this.getNestedValue(config, key) as T | undefined;
	}

	/**
	 * Set a specific configuration value.
	 *
	 * @param environmentId - Environment ID
	 * @param key - Configuration key (supports dot notation)
	 * @param value - Value to set
	 */
	async setConfigValue(environmentId: string, key: string, value: any): Promise<void> {
		this.logger.debug('Setting configuration value', { environmentId, key });

		const config = await this.getConfiguration(environmentId);

		this.setNestedValue(config, key, value);

		await this.configRepository.setConfiguration(environmentId, config);

		this.logger.debug('Configuration value set', { environmentId, key });
	}

	/**
	 * Export configuration for backup or transfer.
	 *
	 * @param environmentId - Environment ID
	 * @returns Serialized configuration
	 */
	async exportConfiguration(environmentId: string): Promise<string> {
		this.logger.info('Exporting environment configuration', { environmentId });

		const config = await this.getConfiguration(environmentId);

		return JSON.stringify(config, null, 2);
	}

	/**
	 * Import configuration from backup or transfer.
	 *
	 * @param environmentId - Environment ID
	 * @param configJson - Serialized configuration
	 */
	async importConfiguration(environmentId: string, configJson: string): Promise<void> {
		this.logger.info('Importing environment configuration', { environmentId });

		let config: Record<string, any>;

		try {
			config = JSON.parse(configJson);
		} catch (error) {
			throw new BadRequestError('Invalid configuration JSON');
		}

		// Validate imported configuration
		this.validateConfiguration(config);

		// Store configuration
		await this.configRepository.setConfiguration(environmentId, config);

		this.logger.info('Environment configuration imported', { environmentId });
	}

	/**
	 * Get configuration history for an environment.
	 *
	 * @param environmentId - Environment ID
	 * @param limit - Number of history entries to retrieve
	 * @returns Configuration history
	 */
	async getConfigurationHistory(
		environmentId: string,
		limit: number = 10,
	): Promise<Array<{ timestamp: Date; config: Record<string, any>; changedBy?: string }>> {
		this.logger.debug('Fetching configuration history', { environmentId, limit });

		return await this.configRepository.getConfigurationHistory(environmentId, limit);
	}

	// ===== Private helper methods =====

	private getDefaultConfiguration(): Record<string, any> {
		return {
			deployment: {
				autoScale: false,
				maxInstances: 1,
				minInstances: 1,
			},
			security: {
				requireApproval: false,
				allowedIPs: [],
				enforceHTTPS: true,
			},
			notifications: {
				enabled: false,
				channels: [],
			},
			limits: {
				maxExecutionsPerMinute: 100,
				maxActiveWorkflows: 50,
			},
			logging: {
				level: 'info',
				retentionDays: 30,
			},
		};
	}

	private mergeWithDefaults(config: Record<string, unknown>): Record<string, unknown> {
		const defaults = this.getDefaultConfiguration();
		return this.deepMerge(defaults, config) as Record<string, unknown>;
	}

	private deepMerge(target: unknown, source: unknown): unknown {
		if (this.isObject(target) && this.isObject(source)) {
			const output = { ...target };
			for (const key in source) {
				if (this.isObject(source[key])) {
					if (!(key in target)) {
						output[key] = source[key];
					} else {
						output[key] = this.deepMerge(target[key], source[key]);
					}
				} else {
					output[key] = source[key];
				}
			}
			return output;
		}
		return source;
	}

	private isObject(item: unknown): item is Record<string, unknown> {
		return typeof item === 'object' && item !== null && !Array.isArray(item);
	}

	private validateConfiguration(config: Record<string, unknown>): void {
		// Basic validation - can be extended with schema validation
		if (!config || typeof config !== 'object') {
			throw new BadRequestError('Configuration must be an object');
		}

		// Validate specific configuration sections
		if (config.limits) {
			this.validateLimits(config.limits);
		}

		if (config.security) {
			this.validateSecurity(config.security);
		}

		if (config.deployment) {
			this.validateDeployment(config.deployment);
		}
	}

	private validateLimits(limits: unknown): void {
		if (limits.maxExecutionsPerMinute !== undefined) {
			if (typeof limits.maxExecutionsPerMinute !== 'number' || limits.maxExecutionsPerMinute < 1) {
				throw new BadRequestError('maxExecutionsPerMinute must be a positive number');
			}
		}

		if (limits.maxActiveWorkflows !== undefined) {
			if (typeof limits.maxActiveWorkflows !== 'number' || limits.maxActiveWorkflows < 1) {
				throw new BadRequestError('maxActiveWorkflows must be a positive number');
			}
		}
	}

	private validateSecurity(security: any): void {
		if (security.allowedIPs !== undefined) {
			if (!Array.isArray(security.allowedIPs)) {
				throw new BadRequestError('allowedIPs must be an array');
			}
		}

		if (security.enforceHTTPS !== undefined) {
			if (typeof security.enforceHTTPS !== 'boolean') {
				throw new BadRequestError('enforceHTTPS must be a boolean');
			}
		}
	}

	private validateDeployment(deployment: any): void {
		if (deployment.maxInstances !== undefined) {
			if (typeof deployment.maxInstances !== 'number' || deployment.maxInstances < 1) {
				throw new BadRequestError('maxInstances must be a positive number');
			}
		}

		if (deployment.minInstances !== undefined) {
			if (typeof deployment.minInstances !== 'number' || deployment.minInstances < 0) {
				throw new BadRequestError('minInstances must be a non-negative number');
			}
		}

		if (
			deployment.minInstances !== undefined &&
			deployment.maxInstances !== undefined &&
			deployment.minInstances > deployment.maxInstances
		) {
			throw new BadRequestError('minInstances cannot be greater than maxInstances');
		}
	}

	private getNestedValue(obj: any, path: string): any {
		const keys = path.split('.');
		let current = obj;

		for (const key of keys) {
			if (current === undefined || current === null) {
				return undefined;
			}
			current = current[key];
		}

		return current;
	}

	private setNestedValue(obj: any, path: string, value: any): void {
		const keys = path.split('.');
		const lastKey = keys.pop()!;
		let current = obj;

		for (const key of keys) {
			if (!(key in current) || typeof current[key] !== 'object') {
				current[key] = {};
			}
			current = current[key];
		}

		current[lastKey] = value;
	}
}
