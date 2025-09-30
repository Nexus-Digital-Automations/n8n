import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import type { Request, Response, NextFunction } from 'express';
import type { TierManager } from './tier-manager';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';

export interface AuthPlugin {
	id: string;
	name: string;
	version: string;
	description: string;
	author: string;
	type: 'sso' | 'ldap' | 'custom' | 'middleware';
	enabled: boolean;
	configuration: Record<string, any>;
	metadata: {
		homepage?: string;
		repository?: string;
		license?: string;
		keywords?: string[];
		downloads?: number;
		rating?: number;
	};
	createdAt: Date;
	updatedAt: Date;
}

export interface AuthPluginHooks {
	/**
	 * Called before authentication
	 */
	beforeAuth?: (req: Request, res: Response) => Promise<boolean | undefined>;

	/**
	 * Called after successful authentication
	 */
	afterAuth?: (req: Request, res: Response, user: any) => Promise<void>;

	/**
	 * Called on authentication failure
	 */
	onAuthFailure?: (req: Request, res: Response, error: Error) => Promise<void>;

	/**
	 * Custom authentication handler
	 */
	authenticate?: (req: Request, res: Response) => Promise<any>;

	/**
	 * User transformation/mapping
	 */
	transformUser?: (externalUser: any) => Promise<any>;
}

export interface PluginValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

@Service()
export class AuthPluginSystem {
	private plugins: Map<string, AuthPlugin> = new Map();
	private pluginHooks: Map<string, AuthPluginHooks> = new Map();

	constructor(
		private readonly logger: Logger,
		private readonly tierManager: TierManager,
	) {
		this.logger = this.logger.scoped('auth-plugin-system');
	}

	/**
	 * Register a new authentication plugin
	 */
	async registerPlugin(
		plugin: Omit<AuthPlugin, 'id' | 'createdAt' | 'updatedAt'>,
		hooks?: AuthPluginHooks,
	): Promise<AuthPlugin> {
		this.logger.info('Registering authentication plugin', {
			name: plugin.name,
			type: plugin.type,
		});

		// Check if custom plugins are available in current tier
		if (!this.tierManager.isFeatureAvailable('customAuthPlugins')) {
			throw new BadRequestError(
				`Custom authentication plugins are not available in your tier. ${this.tierManager.getUpgradeMessage('customPlugins')}`,
			);
		}

		// Validate plugin
		const validation = await this.validatePlugin(plugin);
		if (!validation.valid) {
			throw new BadRequestError(`Invalid plugin configuration: ${validation.errors.join(', ')}`);
		}

		const id = `plugin_${Date.now()}_${Math.random().toString(36).substring(7)}`;
		const fullPlugin: AuthPlugin = {
			...plugin,
			id,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		this.plugins.set(id, fullPlugin);

		if (hooks) {
			this.pluginHooks.set(id, hooks);
		}

		this.logger.info('Authentication plugin registered', {
			id,
			name: plugin.name,
			totalPlugins: this.plugins.size,
		});

		return fullPlugin;
	}

	/**
	 * Unregister authentication plugin
	 */
	async unregisterPlugin(id: string): Promise<void> {
		this.logger.info('Unregistering authentication plugin', { id });

		const plugin = this.plugins.get(id);
		if (!plugin) {
			throw new BadRequestError(`Plugin ${id} not found`);
		}

		this.plugins.delete(id);
		this.pluginHooks.delete(id);

		this.logger.info('Authentication plugin unregistered', {
			id,
			name: plugin.name,
			remainingPlugins: this.plugins.size,
		});
	}

	/**
	 * Update plugin configuration
	 */
	async updatePlugin(
		id: string,
		updates: Partial<Omit<AuthPlugin, 'id' | 'createdAt'>>,
	): Promise<AuthPlugin> {
		this.logger.info('Updating authentication plugin', { id });

		const existing = this.plugins.get(id);
		if (!existing) {
			throw new BadRequestError(`Plugin ${id} not found`);
		}

		const updated: AuthPlugin = {
			...existing,
			...updates,
			id: existing.id,
			createdAt: existing.createdAt,
			updatedAt: new Date(),
		};

		this.plugins.set(id, updated);

		this.logger.info('Authentication plugin updated', { id, name: updated.name });

		return updated;
	}

	/**
	 * Get all registered plugins
	 */
	getAllPlugins(): AuthPlugin[] {
		return Array.from(this.plugins.values());
	}

	/**
	 * Get enabled plugins
	 */
	getEnabledPlugins(): AuthPlugin[] {
		return Array.from(this.plugins.values()).filter((p) => p.enabled);
	}

	/**
	 * Get plugin by ID
	 */
	getPlugin(id: string): AuthPlugin | undefined {
		return this.plugins.get(id);
	}

	/**
	 * Get plugins by type
	 */
	getPluginsByType(type: AuthPlugin['type']): AuthPlugin[] {
		return Array.from(this.plugins.values()).filter((p) => p.type === type);
	}

	/**
	 * Toggle plugin enabled state
	 */
	async togglePlugin(id: string, enabled: boolean): Promise<AuthPlugin> {
		return await this.updatePlugin(id, { enabled });
	}

	/**
	 * Execute plugin hooks
	 */
	async executeBeforeAuth(req: Request, res: Response): Promise<boolean> {
		const enabledPlugins = this.getEnabledPlugins();

		for (const plugin of enabledPlugins) {
			const hooks = this.pluginHooks.get(plugin.id);
			if (hooks?.beforeAuth) {
				try {
					this.logger.debug('Executing beforeAuth hook', {
						pluginId: plugin.id,
						pluginName: plugin.name,
					});

					const result = await hooks.beforeAuth(req, res);
					if (result === false) {
						this.logger.info('Plugin blocked authentication', {
							pluginId: plugin.id,
							pluginName: plugin.name,
						});
						return false;
					}
				} catch (error) {
					this.logger.error('Error executing beforeAuth hook', {
						pluginId: plugin.id,
						pluginName: plugin.name,
						error: error instanceof Error ? error.message : 'Unknown error',
						stack: error instanceof Error ? error.stack : undefined,
					});
				}
			}
		}

		return true;
	}

	/**
	 * Execute after auth hooks
	 */
	async executeAfterAuth(req: Request, res: Response, user: any): Promise<void> {
		const enabledPlugins = this.getEnabledPlugins();

		for (const plugin of enabledPlugins) {
			const hooks = this.pluginHooks.get(plugin.id);
			if (hooks?.afterAuth) {
				try {
					this.logger.debug('Executing afterAuth hook', {
						pluginId: plugin.id,
						pluginName: plugin.name,
					});

					await hooks.afterAuth(req, res, user);
				} catch (error) {
					this.logger.error('Error executing afterAuth hook', {
						pluginId: plugin.id,
						pluginName: plugin.name,
						error: error instanceof Error ? error.message : 'Unknown error',
						stack: error instanceof Error ? error.stack : undefined,
					});
				}
			}
		}
	}

	/**
	 * Execute auth failure hooks
	 */
	async executeOnAuthFailure(req: Request, res: Response, error: Error): Promise<void> {
		const enabledPlugins = this.getEnabledPlugins();

		for (const plugin of enabledPlugins) {
			const hooks = this.pluginHooks.get(plugin.id);
			if (hooks?.onAuthFailure) {
				try {
					this.logger.debug('Executing onAuthFailure hook', {
						pluginId: plugin.id,
						pluginName: plugin.name,
					});

					await hooks.onAuthFailure(req, res, error);
				} catch (hookError) {
					this.logger.error('Error executing onAuthFailure hook', {
						pluginId: plugin.id,
						pluginName: plugin.name,
						error: hookError instanceof Error ? hookError.message : 'Unknown error',
						stack: hookError instanceof Error ? hookError.stack : undefined,
					});
				}
			}
		}
	}

	/**
	 * Create Express middleware from plugin
	 */
	createMiddleware(
		pluginId: string,
	): (req: Request, res: Response, next: NextFunction) => Promise<void> {
		return async (req: Request, res: Response, next: NextFunction) => {
			const plugin = this.plugins.get(pluginId);
			if (!plugin || !plugin.enabled) {
				return next();
			}

			const hooks = this.pluginHooks.get(pluginId);
			if (!hooks?.authenticate) {
				return next();
			}

			try {
				const user = await hooks.authenticate(req, res);
				if (user) {
					(req as any).user = user;
				}
				next();
			} catch (error) {
				this.logger.error('Plugin authentication failed', {
					pluginId,
					pluginName: plugin.name,
					error: error instanceof Error ? error.message : 'Unknown error',
					stack: error instanceof Error ? error.stack : undefined,
				});
				next(error);
			}
		};
	}

	/**
	 * Validate plugin configuration
	 */
	private async validatePlugin(
		plugin: Omit<AuthPlugin, 'id' | 'createdAt' | 'updatedAt'>,
	): Promise<PluginValidationResult> {
		const errors: string[] = [];
		const warnings: string[] = [];

		if (!plugin.name || plugin.name.trim().length === 0) {
			errors.push('Plugin name is required');
		}

		if (!plugin.version || !/^\d+\.\d+\.\d+/.test(plugin.version)) {
			errors.push('Valid semantic version is required');
		}

		if (!plugin.author || plugin.author.trim().length === 0) {
			errors.push('Plugin author is required');
		}

		if (!['sso', 'ldap', 'custom', 'middleware'].includes(plugin.type)) {
			errors.push('Invalid plugin type');
		}

		if (!plugin.description || plugin.description.trim().length === 0) {
			warnings.push('Plugin description is recommended');
		}

		if (!plugin.metadata?.license) {
			warnings.push('License information is recommended');
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		};
	}

	/**
	 * Get plugin statistics
	 */
	getStatistics(): {
		total: number;
		enabled: number;
		byType: Record<string, number>;
	} {
		const total = this.plugins.size;
		const enabled = Array.from(this.plugins.values()).filter((p) => p.enabled).length;

		const byType: Record<string, number> = {};
		for (const plugin of this.plugins.values()) {
			byType[plugin.type] = (byType[plugin.type] || 0) + 1;
		}

		return {
			total,
			enabled,
			byType,
		};
	}

	/**
	 * Search plugins
	 */
	searchPlugins(query: string): AuthPlugin[] {
		const lowerQuery = query.toLowerCase();
		return Array.from(this.plugins.values()).filter(
			(plugin) =>
				plugin.name.toLowerCase().includes(lowerQuery) ||
				plugin.description.toLowerCase().includes(lowerQuery) ||
				plugin.author.toLowerCase().includes(lowerQuery) ||
				plugin.metadata.keywords?.some((k) => k.toLowerCase().includes(lowerQuery)),
		);
	}
}
