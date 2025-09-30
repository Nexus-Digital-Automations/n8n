import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import type { TierManager, SSOProvider } from './tier-manager';
import { AuthenticationTier } from './tier-manager';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';

export interface SSOConfiguration {
	id: string;
	provider: SSOProvider;
	enabled: boolean;
	displayName: string;
	configuration: Record<string, any>;
	createdAt: Date;
	updatedAt: Date;
}

export interface SSOValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

@Service()
export class SSOCommunityService {
	private configurations: Map<string, SSOConfiguration> = new Map();

	constructor(
		private readonly logger: Logger,
		private readonly tierManager: TierManager,
	) {
		this.logger = this.logger.scoped('sso-community');
	}

	/**
	 * Add SSO configuration
	 */
	async addSSOConfiguration(
		provider: SSOProvider,
		displayName: string,
		configuration: Record<string, any>,
	): Promise<SSOConfiguration> {
		this.logger.info('Adding SSO configuration', { provider, displayName });

		// Check tier limits
		const currentProviders = this.configurations.size;
		if (!this.tierManager.canAddSSOProvider(currentProviders)) {
			const maxProviders = this.tierManager.getMaxSSOProviders();
			throw new BadRequestError(
				`Maximum SSO providers (${maxProviders}) reached for your tier. ${this.tierManager.getUpgradeMessage('sso')}`,
			);
		}

		// Check if provider is supported in current tier
		const capabilities = this.tierManager.getCurrentCapabilities();
		if (!capabilities.features.sso.supportedProviders.includes(provider)) {
			throw new BadRequestError(
				`SSO provider ${provider} is not supported in your tier. ${this.tierManager.getUpgradeMessage('sso')}`,
			);
		}

		// Validate configuration
		const validation = await this.validateConfiguration(provider, configuration);
		if (!validation.valid) {
			throw new BadRequestError(`Invalid SSO configuration: ${validation.errors.join(', ')}`);
		}

		const id = `sso_${Date.now()}_${Math.random().toString(36).substring(7)}`;
		const ssoConfig: SSOConfiguration = {
			id,
			provider,
			enabled: true,
			displayName,
			configuration,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		this.configurations.set(id, ssoConfig);

		this.logger.info('SSO configuration added', {
			id,
			provider,
			displayName,
			totalConfigurations: this.configurations.size,
		});

		return ssoConfig;
	}

	/**
	 * Update SSO configuration
	 */
	async updateSSOConfiguration(
		id: string,
		updates: Partial<Omit<SSOConfiguration, 'id' | 'createdAt'>>,
	): Promise<SSOConfiguration> {
		this.logger.info('Updating SSO configuration', { id });

		const existing = this.configurations.get(id);
		if (!existing) {
			throw new BadRequestError(`SSO configuration ${id} not found`);
		}

		// If configuration is being updated, validate it
		if (updates.configuration) {
			const validation = await this.validateConfiguration(existing.provider, updates.configuration);
			if (!validation.valid) {
				throw new BadRequestError(`Invalid SSO configuration: ${validation.errors.join(', ')}`);
			}
		}

		const updated: SSOConfiguration = {
			...existing,
			...updates,
			id: existing.id,
			createdAt: existing.createdAt,
			updatedAt: new Date(),
		};

		this.configurations.set(id, updated);

		this.logger.info('SSO configuration updated', { id });

		return updated;
	}

	/**
	 * Remove SSO configuration
	 */
	async removeSSOConfiguration(id: string): Promise<void> {
		this.logger.info('Removing SSO configuration', { id });

		const existing = this.configurations.get(id);
		if (!existing) {
			throw new BadRequestError(`SSO configuration ${id} not found`);
		}

		this.configurations.delete(id);

		this.logger.info('SSO configuration removed', {
			id,
			provider: existing.provider,
			remainingConfigurations: this.configurations.size,
		});
	}

	/**
	 * Get all SSO configurations
	 */
	getAllConfigurations(): SSOConfiguration[] {
		return Array.from(this.configurations.values());
	}

	/**
	 * Get SSO configuration by ID
	 */
	getConfiguration(id: string): SSOConfiguration | undefined {
		return this.configurations.get(id);
	}

	/**
	 * Get enabled SSO configurations
	 */
	getEnabledConfigurations(): SSOConfiguration[] {
		return Array.from(this.configurations.values()).filter((config) => config.enabled);
	}

	/**
	 * Toggle SSO configuration enabled state
	 */
	async toggleConfiguration(id: string, enabled: boolean): Promise<SSOConfiguration> {
		return await this.updateSSOConfiguration(id, { enabled });
	}

	/**
	 * Validate SSO configuration
	 */
	private async validateConfiguration(
		provider: SSOProvider,
		configuration: Record<string, any>,
	): Promise<SSOValidationResult> {
		const errors: string[] = [];
		const warnings: string[] = [];

		switch (provider) {
			case 'oidc':
				if (!configuration.issuer) {
					errors.push('OIDC issuer URL is required');
				}
				if (!configuration.clientId) {
					errors.push('OIDC client ID is required');
				}
				if (!configuration.clientSecret) {
					errors.push('OIDC client secret is required');
				}
				if (configuration.issuer && !configuration.issuer.startsWith('https://')) {
					warnings.push('OIDC issuer should use HTTPS for security');
				}
				break;

			case 'saml':
				if (!configuration.entryPoint) {
					errors.push('SAML entry point URL is required');
				}
				if (!configuration.issuer) {
					errors.push('SAML issuer is required');
				}
				if (!configuration.cert && !configuration.signingCert) {
					errors.push('SAML certificate is required');
				}
				break;

			case 'google':
				if (!configuration.clientId) {
					errors.push('Google client ID is required');
				}
				if (!configuration.clientSecret) {
					errors.push('Google client secret is required');
				}
				break;

			case 'microsoft':
				if (!configuration.clientId) {
					errors.push('Microsoft client ID is required');
				}
				if (!configuration.clientSecret) {
					errors.push('Microsoft client secret is required');
				}
				if (!configuration.tenant) {
					errors.push('Microsoft tenant ID is required');
				}
				break;

			case 'okta':
				if (!configuration.domain) {
					errors.push('Okta domain is required');
				}
				if (!configuration.clientId) {
					errors.push('Okta client ID is required');
				}
				if (!configuration.clientSecret) {
					errors.push('Okta client secret is required');
				}
				break;

			default:
				warnings.push(`Provider ${provider} validation not implemented`);
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		};
	}

	/**
	 * Test SSO configuration (dry run)
	 */
	async testConfiguration(id: string): Promise<{
		success: boolean;
		message: string;
		details?: any;
	}> {
		this.logger.info('Testing SSO configuration', { id });

		const config = this.configurations.get(id);
		if (!config) {
			return {
				success: false,
				message: 'Configuration not found',
			};
		}

		// Validate configuration
		const validation = await this.validateConfiguration(config.provider, config.configuration);

		if (!validation.valid) {
			return {
				success: false,
				message: 'Configuration validation failed',
				details: {
					errors: validation.errors,
					warnings: validation.warnings,
				},
			};
		}

		// In a real implementation, this would test the actual SSO connection
		// For now, we just validate the configuration structure
		return {
			success: true,
			message: 'Configuration is valid',
			details: {
				warnings: validation.warnings,
			},
		};
	}

	/**
	 * Get SSO statistics
	 */
	getStatistics(): {
		total: number;
		enabled: number;
		byProvider: Record<string, number>;
		remainingSlots: number | 'unlimited';
	} {
		const total = this.configurations.size;
		const enabled = Array.from(this.configurations.values()).filter((c) => c.enabled).length;

		const byProvider: Record<string, number> = {};
		for (const config of this.configurations.values()) {
			byProvider[config.provider] = (byProvider[config.provider] || 0) + 1;
		}

		const maxProviders = this.tierManager.getMaxSSOProviders();
		const remainingSlots = maxProviders === -1 ? 'unlimited' : maxProviders - total;

		return {
			total,
			enabled,
			byProvider,
			remainingSlots,
		};
	}

	/**
	 * Get tier information for SSO
	 */
	getTierInfo(): {
		currentTier: AuthenticationTier;
		maxProviders: number | 'unlimited';
		supportedProviders: SSOProvider[];
		upgradeMessage: string;
	} {
		const currentTier = this.tierManager.getCurrentTier();
		const capabilities = this.tierManager.getCurrentCapabilities();
		const maxProviders = capabilities.features.sso.providers;

		return {
			currentTier,
			maxProviders: maxProviders === -1 ? 'unlimited' : maxProviders,
			supportedProviders: capabilities.features.sso.supportedProviders,
			upgradeMessage: this.tierManager.getUpgradeMessage('sso'),
		};
	}
}
