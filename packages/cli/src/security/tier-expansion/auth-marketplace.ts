import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import type { AuthPlugin } from './auth-plugin-system';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';

export interface MarketplacePlugin extends AuthPlugin {
	verified: boolean;
	downloads: number;
	rating: number;
	reviews: number;
	lastUpdated: Date;
	compatibility: {
		minN8nVersion: string;
		maxN8nVersion?: string;
	};
	tags: string[];
}

export interface PluginReview {
	id: string;
	pluginId: string;
	userId: string;
	userName: string;
	rating: number; // 1-5
	title: string;
	comment: string;
	helpful: number;
	createdAt: Date;
}

export interface MarketplaceCategory {
	id: string;
	name: string;
	description: string;
	pluginCount: number;
}

export interface PluginSearchFilter {
	query?: string;
	type?: AuthPlugin['type'];
	verified?: boolean;
	minRating?: number;
	tags?: string[];
	sortBy?: 'downloads' | 'rating' | 'recent' | 'name';
	limit?: number;
}

@Service()
export class AuthMarketplace {
	private marketplacePlugins: Map<string, MarketplacePlugin> = new Map();
	private reviews: Map<string, PluginReview[]> = new Map();
	private categories: Map<string, MarketplaceCategory> = new Map();

	constructor(private readonly logger: Logger) {
		this.logger = this.logger.scoped('auth-marketplace');
		this.initializeCategories();
		this.initializeFeaturedPlugins();
	}

	/**
	 * Submit plugin to marketplace
	 */
	async submitPlugin(
		plugin: Omit<
			MarketplacePlugin,
			'id' | 'createdAt' | 'updatedAt' | 'verified' | 'downloads' | 'rating' | 'reviews'
		>,
	): Promise<MarketplacePlugin> {
		this.logger.info('Submitting plugin to marketplace', {
			name: plugin.name,
			author: plugin.author,
		});

		const id = `marketplace_${Date.now()}_${Math.random().toString(36).substring(7)}`;

		const marketplacePlugin: MarketplacePlugin = {
			...plugin,
			id,
			verified: false, // Requires manual verification
			downloads: 0,
			rating: 0,
			reviews: 0,
			lastUpdated: new Date(),
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		this.marketplacePlugins.set(id, marketplacePlugin);

		this.logger.info('Plugin submitted to marketplace', {
			id,
			name: plugin.name,
			totalPlugins: this.marketplacePlugins.size,
		});

		return marketplacePlugin;
	}

	/**
	 * Search marketplace plugins
	 */
	searchPlugins(filter: PluginSearchFilter = {}): MarketplacePlugin[] {
		let plugins = Array.from(this.marketplacePlugins.values());

		// Filter by query
		if (filter.query) {
			const query = filter.query.toLowerCase();
			plugins = plugins.filter(
				(p) =>
					p.name.toLowerCase().includes(query) ||
					p.description.toLowerCase().includes(query) ||
					p.author.toLowerCase().includes(query) ||
					p.tags.some((t) => t.toLowerCase().includes(query)),
			);
		}

		// Filter by type
		if (filter.type) {
			plugins = plugins.filter((p) => p.type === filter.type);
		}

		// Filter by verified status
		if (filter.verified !== undefined) {
			plugins = plugins.filter((p) => p.verified === filter.verified);
		}

		// Filter by minimum rating
		if (filter.minRating) {
			plugins = plugins.filter((p) => p.rating >= filter.minRating);
		}

		// Filter by tags
		if (filter.tags && filter.tags.length > 0) {
			plugins = plugins.filter((p) => filter.tags!.some((tag) => p.tags.includes(tag)));
		}

		// Sort
		switch (filter.sortBy) {
			case 'downloads':
				plugins.sort((a, b) => b.downloads - a.downloads);
				break;
			case 'rating':
				plugins.sort((a, b) => b.rating - a.rating);
				break;
			case 'recent':
				plugins.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
				break;
			case 'name':
				plugins.sort((a, b) => a.name.localeCompare(b.name));
				break;
			default:
				// Default to downloads
				plugins.sort((a, b) => b.downloads - a.downloads);
		}

		// Apply limit
		if (filter.limit) {
			plugins = plugins.slice(0, filter.limit);
		}

		return plugins;
	}

	/**
	 * Get plugin by ID
	 */
	getPlugin(id: string): MarketplacePlugin | undefined {
		return this.marketplacePlugins.get(id);
	}

	/**
	 * Get featured plugins
	 */
	getFeaturedPlugins(limit: number = 10): MarketplacePlugin[] {
		return this.searchPlugins({
			verified: true,
			minRating: 4,
			sortBy: 'downloads',
			limit,
		});
	}

	/**
	 * Get popular plugins
	 */
	getPopularPlugins(limit: number = 10): MarketplacePlugin[] {
		return this.searchPlugins({
			sortBy: 'downloads',
			limit,
		});
	}

	/**
	 * Get recently updated plugins
	 */
	getRecentPlugins(limit: number = 10): MarketplacePlugin[] {
		return this.searchPlugins({
			sortBy: 'recent',
			limit,
		});
	}

	/**
	 * Increment download count
	 */
	async recordDownload(pluginId: string): Promise<void> {
		const plugin = this.marketplacePlugins.get(pluginId);
		if (!plugin) {
			throw new BadRequestError(`Plugin ${pluginId} not found`);
		}

		plugin.downloads++;
		this.marketplacePlugins.set(pluginId, plugin);

		this.logger.info('Plugin download recorded', {
			pluginId,
			name: plugin.name,
			totalDownloads: plugin.downloads,
		});
	}

	/**
	 * Add review for plugin
	 */
	async addReview(
		pluginId: string,
		userId: string,
		userName: string,
		rating: number,
		title: string,
		comment: string,
	): Promise<PluginReview> {
		const plugin = this.marketplacePlugins.get(pluginId);
		if (!plugin) {
			throw new BadRequestError(`Plugin ${pluginId} not found`);
		}

		if (rating < 1 || rating > 5) {
			throw new BadRequestError('Rating must be between 1 and 5');
		}

		const review: PluginReview = {
			id: `review_${Date.now()}_${Math.random().toString(36).substring(7)}`,
			pluginId,
			userId,
			userName,
			rating,
			title,
			comment,
			helpful: 0,
			createdAt: new Date(),
		};

		const pluginReviews = this.reviews.get(pluginId) || [];
		pluginReviews.push(review);
		this.reviews.set(pluginId, pluginReviews);

		// Update plugin rating
		this.updatePluginRating(pluginId);

		this.logger.info('Review added', {
			pluginId,
			reviewId: review.id,
			rating,
		});

		return review;
	}

	/**
	 * Get reviews for plugin
	 */
	getReviews(pluginId: string): PluginReview[] {
		return this.reviews.get(pluginId) || [];
	}

	/**
	 * Mark review as helpful
	 */
	async markReviewHelpful(reviewId: string): Promise<void> {
		for (const reviews of this.reviews.values()) {
			const review = reviews.find((r) => r.id === reviewId);
			if (review) {
				review.helpful++;
				this.logger.info('Review marked helpful', { reviewId, helpful: review.helpful });
				return;
			}
		}

		throw new BadRequestError(`Review ${reviewId} not found`);
	}

	/**
	 * Get all categories
	 */
	getCategories(): MarketplaceCategory[] {
		return Array.from(this.categories.values());
	}

	/**
	 * Get plugins by category
	 */
	getPluginsByCategory(categoryId: string): MarketplacePlugin[] {
		const category = this.categories.get(categoryId);
		if (!category) {
			return [];
		}

		// In a real implementation, this would filter by category
		// For now, we'll return all plugins
		return Array.from(this.marketplacePlugins.values());
	}

	/**
	 * Get marketplace statistics
	 */
	getStatistics(): {
		totalPlugins: number;
		verifiedPlugins: number;
		totalDownloads: number;
		averageRating: number;
		totalReviews: number;
		pluginsByType: Record<string, number>;
	} {
		const plugins = Array.from(this.marketplacePlugins.values());

		const totalPlugins = plugins.length;
		const verifiedPlugins = plugins.filter((p) => p.verified).length;
		const totalDownloads = plugins.reduce((sum, p) => sum + p.downloads, 0);
		const averageRating =
			plugins.length > 0 ? plugins.reduce((sum, p) => sum + p.rating, 0) / plugins.length : 0;

		const totalReviews = Array.from(this.reviews.values()).reduce(
			(sum, reviews) => sum + reviews.length,
			0,
		);

		const pluginsByType: Record<string, number> = {};
		for (const plugin of plugins) {
			pluginsByType[plugin.type] = (pluginsByType[plugin.type] || 0) + 1;
		}

		return {
			totalPlugins,
			verifiedPlugins,
			totalDownloads,
			averageRating: Math.round(averageRating * 10) / 10,
			totalReviews,
			pluginsByType,
		};
	}

	/**
	 * Update plugin rating based on reviews
	 */
	private updatePluginRating(pluginId: string): void {
		const plugin = this.marketplacePlugins.get(pluginId);
		const reviews = this.reviews.get(pluginId);

		if (!plugin || !reviews || reviews.length === 0) {
			return;
		}

		const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
		plugin.rating = Math.round((totalRating / reviews.length) * 10) / 10;
		plugin.reviews = reviews.length;

		this.marketplacePlugins.set(pluginId, plugin);
	}

	/**
	 * Initialize marketplace categories
	 */
	private initializeCategories(): void {
		this.categories.set('sso', {
			id: 'sso',
			name: 'Single Sign-On',
			description: 'SSO authentication providers and integrations',
			pluginCount: 0,
		});

		this.categories.set('ldap', {
			id: 'ldap',
			name: 'LDAP/Active Directory',
			description: 'LDAP and Active Directory authentication',
			pluginCount: 0,
		});

		this.categories.set('mfa', {
			id: 'mfa',
			name: 'Multi-Factor Authentication',
			description: 'Additional authentication factors and security',
			pluginCount: 0,
		});

		this.categories.set('custom', {
			id: 'custom',
			name: 'Custom Authentication',
			description: 'Custom authentication methods and workflows',
			pluginCount: 0,
		});
	}

	/**
	 * Initialize featured plugins (examples)
	 */
	private initializeFeaturedPlugins(): void {
		// Example plugins for demonstration
		const examplePlugins: Array<Omit<MarketplacePlugin, 'id' | 'createdAt' | 'updatedAt'>> = [
			{
				name: 'Okta SSO Community',
				version: '1.0.0',
				description: 'Community-maintained Okta SSO integration for n8n',
				author: 'n8n Community',
				type: 'sso',
				enabled: false,
				configuration: {},
				metadata: {
					homepage: 'https://github.com/n8n-community/okta-sso',
					repository: 'https://github.com/n8n-community/okta-sso',
					license: 'MIT',
					keywords: ['okta', 'sso', 'authentication'],
				},
				verified: true,
				downloads: 150,
				rating: 4.5,
				reviews: 12,
				lastUpdated: new Date(),
				compatibility: {
					minN8nVersion: '1.0.0',
				},
				tags: ['sso', 'okta', 'enterprise'],
			},
			{
				name: 'Auth0 Integration',
				version: '2.1.0',
				description: 'Full-featured Auth0 authentication integration',
				author: 'Auth0 Team',
				type: 'sso',
				enabled: false,
				configuration: {},
				metadata: {
					homepage: 'https://auth0.com/n8n',
					repository: 'https://github.com/auth0/n8n-auth0',
					license: 'Apache-2.0',
					keywords: ['auth0', 'sso', 'oauth'],
				},
				verified: true,
				downloads: 300,
				rating: 4.8,
				reviews: 25,
				lastUpdated: new Date(),
				compatibility: {
					minN8nVersion: '1.0.0',
				},
				tags: ['sso', 'auth0', 'oauth'],
			},
		];

		for (const plugin of examplePlugins) {
			const id = `featured_${Date.now()}_${Math.random().toString(36).substring(7)}`;
			this.marketplacePlugins.set(id, {
				...plugin,
				id,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}
	}
}
