import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import type { CustomNode } from '@n8n/db';
import { Service } from '@n8n/di';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { pathExists } from 'fs-extra';
import Module from 'module';
import { EventEmitter } from 'events';

import { InternalServerError } from '@/errors/response-errors/internal-server.error';
import { NotFoundError } from '@/errors/response-errors/not-found.error';

export interface NodeTypeInfo {
	name: string;
	displayName: string;
	description: string;
	group: string[];
	version: number | number[];
	defaults: any;
	inputs: string[];
	outputs: string[];
	properties: any[];
	credentials?: any[];
	webhooks?: any[];
	polling?: boolean;
}

export interface LoadedNodeInfo {
	nodeTypeName: string;
	nodeClass: any;
	filePath: string;
	loadedAt: Date;
	version: string;
	metadata: {
		dependencies: Record<string, string>;
		nodeTypes: string[];
		author: string;
		license: string;
	};
}

export interface RuntimeNodeHealth {
	isHealthy: boolean;
	lastCheck: Date;
	issues: string[];
	memoryUsage?: {
		used: number;
		peak: number;
	};
	executionStats?: {
		count: number;
		averageTime: number;
		errorRate: number;
	};
}

@Service()
export class CustomNodeRuntimeService extends EventEmitter {
	private readonly loadedNodes = new Map<string, LoadedNodeInfo>();
	private readonly nodeTypeRegistry = new Map<string, any>();
	private readonly healthStats = new Map<string, RuntimeNodeHealth>();
	private readonly moduleCache = new Map<string, any>();

	constructor(
		private readonly logger: Logger,
		private readonly globalConfig: GlobalConfig,
	) {
		super();
		this.setupNodeCacheCleanup();
	}

	/**
	 * Load a custom node into the runtime
	 */
	async loadCustomNode(customNode: CustomNode, deploymentPath: string): Promise<LoadedNodeInfo> {
		this.logger.info('Loading custom node into runtime', {
			nodeName: customNode.name,
			version: customNode.version,
			deploymentPath,
		});

		try {
			// Validate deployment path exists
			if (!(await pathExists(deploymentPath))) {
				throw new NotFoundError(`Deployment path not found: ${deploymentPath}`);
			}

			// Find the main entry point
			const entryPoint = await this.findNodeEntryPoint(deploymentPath, customNode.name);

			// Clear module cache for hot reload
			this.clearModuleCache(entryPoint);

			// Load the node module
			const nodeModule = await this.loadNodeModule(entryPoint);

			// Register node types
			const nodeTypes = await this.registerNodeTypes(nodeModule, customNode);

			// Create loaded node info
			const loadedNodeInfo: LoadedNodeInfo = {
				nodeTypeName: customNode.name,
				nodeClass: nodeModule,
				filePath: entryPoint,
				loadedAt: new Date(),
				version: customNode.version,
				metadata: {
					dependencies: customNode.metadata?.dependencies || {},
					nodeTypes,
					author: customNode.metadata?.author || 'Unknown',
					license: customNode.metadata?.license || 'MIT',
				},
			};

			// Store in registry
			this.loadedNodes.set(customNode.name, loadedNodeInfo);

			// Initialize health monitoring
			this.initializeHealthMonitoring(customNode.name);

			this.emit('nodeLoaded', {
				nodeId: customNode.id,
				nodeName: customNode.name,
				version: customNode.version,
				loadedAt: loadedNodeInfo.loadedAt,
			});

			this.logger.info('Custom node loaded successfully', {
				nodeName: customNode.name,
				nodeTypes: nodeTypes.length,
			});

			return loadedNodeInfo;
		} catch (error) {
			this.logger.error('Failed to load custom node', {
				nodeName: customNode.name,
				error: error.message,
			});
			throw new InternalServerError(`Failed to load node ${customNode.name}: ${error.message}`);
		}
	}

	/**
	 * Unload a custom node from the runtime
	 */
	async unloadCustomNode(nodeName: string): Promise<void> {
		this.logger.info('Unloading custom node from runtime', { nodeName });

		const loadedNode = this.loadedNodes.get(nodeName);
		if (!loadedNode) {
			throw new NotFoundError(`Node ${nodeName} is not currently loaded`);
		}

		try {
			// Unregister node types
			await this.unregisterNodeTypes(loadedNode.metadata.nodeTypes);

			// Clear module cache
			this.clearModuleCache(loadedNode.filePath);

			// Remove from registries
			this.loadedNodes.delete(nodeName);
			this.healthStats.delete(nodeName);

			this.emit('nodeUnloaded', {
				nodeName,
				unloadedAt: new Date(),
			});

			this.logger.info('Custom node unloaded successfully', { nodeName });
		} catch (error) {
			this.logger.error('Failed to unload custom node', {
				nodeName,
				error: error.message,
			});
			throw new InternalServerError(`Failed to unload node ${nodeName}: ${error.message}`);
		}
	}

	/**
	 * Hot reload a custom node
	 */
	async hotReloadNode(customNode: CustomNode, deploymentPath: string): Promise<LoadedNodeInfo> {
		this.logger.info('Hot reloading custom node', {
			nodeName: customNode.name,
			version: customNode.version,
		});

		// Check if node is currently loaded
		const wasLoaded = this.loadedNodes.has(customNode.name);

		if (wasLoaded) {
			// Unload the current version first
			await this.unloadCustomNode(customNode.name);
		}

		// Load the new version
		const loadedNodeInfo = await this.loadCustomNode(customNode, deploymentPath);

		this.emit('nodeReloaded', {
			nodeId: customNode.id,
			nodeName: customNode.name,
			version: customNode.version,
			reloadedAt: loadedNodeInfo.loadedAt,
			wasLoaded,
		});

		return loadedNodeInfo;
	}

	/**
	 * Get runtime information for a loaded node
	 */
	getLoadedNodeInfo(nodeName: string): LoadedNodeInfo | undefined {
		return this.loadedNodes.get(nodeName);
	}

	/**
	 * Get all currently loaded custom nodes
	 */
	getAllLoadedNodes(): LoadedNodeInfo[] {
		return Array.from(this.loadedNodes.values());
	}

	/**
	 * Check if a node is currently loaded
	 */
	isNodeLoaded(nodeName: string): boolean {
		return this.loadedNodes.has(nodeName);
	}

	/**
	 * Get node health status
	 */
	getNodeHealth(nodeName: string): RuntimeNodeHealth | undefined {
		return this.healthStats.get(nodeName);
	}

	/**
	 * Update execution statistics for a node
	 */
	updateExecutionStats(nodeName: string, executionTime: number, success: boolean): void {
		const health = this.healthStats.get(nodeName);
		if (health?.executionStats) {
			health.executionStats.count++;

			// Update average execution time (running average)
			health.executionStats.averageTime =
				(health.executionStats.averageTime * (health.executionStats.count - 1) + executionTime) /
				health.executionStats.count;

			// Update error rate
			if (!success) {
				const errorCount =
					Math.round(health.executionStats.errorRate * (health.executionStats.count - 1)) + 1;
				health.executionStats.errorRate = errorCount / health.executionStats.count;
			} else {
				const errorCount = Math.round(
					health.executionStats.errorRate * (health.executionStats.count - 1),
				);
				health.executionStats.errorRate = errorCount / health.executionStats.count;
			}
		}
	}

	// Private helper methods

	private async findNodeEntryPoint(deploymentPath: string, nodeName: string): Promise<string> {
		// Try common entry point patterns
		const possibleEntryPoints = [
			join(deploymentPath, `${nodeName}.js`),
			join(deploymentPath, 'dist', `${nodeName}.js`),
			join(deploymentPath, 'lib', `${nodeName}.js`),
			join(deploymentPath, 'index.js'),
			join(deploymentPath, 'src', 'index.js'),
		];

		// Check package.json for main field
		const packageJsonPath = join(deploymentPath, 'package.json');
		if (await pathExists(packageJsonPath)) {
			try {
				const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
				if (packageJson.main) {
					possibleEntryPoints.unshift(join(deploymentPath, packageJson.main));
				}
				if (packageJson.n8n?.nodes?.[0]) {
					possibleEntryPoints.unshift(join(deploymentPath, packageJson.n8n.nodes[0]));
				}
			} catch (error) {
				this.logger.warn('Failed to parse package.json', { packageJsonPath, error });
			}
		}

		// Find the first existing entry point
		for (const entryPoint of possibleEntryPoints) {
			if (await pathExists(entryPoint)) {
				return entryPoint;
			}
		}

		throw new NotFoundError(`No valid entry point found for node ${nodeName}`);
	}

	private async loadNodeModule(entryPoint: string): Promise<any> {
		try {
			// Use dynamic import for ES modules, require for CommonJS
			delete require.cache[require.resolve(entryPoint)];

			let nodeModule;
			try {
				// Try ES module import first
				nodeModule = await import(entryPoint);
				if (nodeModule.default) {
					nodeModule = nodeModule.default;
				}
			} catch {
				// Fall back to CommonJS require
				nodeModule = require(entryPoint);
			}

			if (!nodeModule) {
				throw new Error('Module export is null or undefined');
			}

			return nodeModule;
		} catch (error) {
			throw new InternalServerError(`Failed to load module from ${entryPoint}: ${error.message}`);
		}
	}

	private async registerNodeTypes(nodeModule: any, customNode: CustomNode): Promise<string[]> {
		const nodeTypes: string[] = [];

		try {
			// Handle different node export patterns
			if (typeof nodeModule === 'function' && nodeModule.prototype) {
				// Single node class
				const nodeTypeName = nodeModule.prototype.constructor.name || customNode.name;
				this.nodeTypeRegistry.set(nodeTypeName, nodeModule);
				nodeTypes.push(nodeTypeName);
			} else if (typeof nodeModule === 'object') {
				// Multiple node types or object with node classes
				for (const [key, value] of Object.entries(nodeModule)) {
					if (typeof value === 'function' && value.prototype) {
						this.nodeTypeRegistry.set(key, value);
						nodeTypes.push(key);
					}
				}
			}

			if (nodeTypes.length === 0) {
				throw new Error('No valid node types found in module');
			}

			// TODO: Register with n8n's actual node type registry
			// This would integrate with n8n's LoadNodesAndCredentials service
			// For now, we maintain our own registry

			return nodeTypes;
		} catch (error) {
			throw new InternalServerError(`Failed to register node types: ${error.message}`);
		}
	}

	private async unregisterNodeTypes(nodeTypes: string[]): Promise<void> {
		for (const nodeType of nodeTypes) {
			this.nodeTypeRegistry.delete(nodeType);
		}

		// TODO: Unregister from n8n's actual node type registry
	}

	private clearModuleCache(filePath: string): void {
		// Clear Node.js module cache
		const moduleId = require.resolve(filePath);
		delete require.cache[moduleId];

		// Clear our internal module cache
		this.moduleCache.delete(filePath);

		// Clear related modules in the same directory
		const dir = dirname(filePath);
		for (const cachedModule of Object.keys(require.cache)) {
			if (cachedModule.startsWith(dir)) {
				delete require.cache[cachedModule];
			}
		}
	}

	private initializeHealthMonitoring(nodeName: string): void {
		const health: RuntimeNodeHealth = {
			isHealthy: true,
			lastCheck: new Date(),
			issues: [],
			memoryUsage: {
				used: 0,
				peak: 0,
			},
			executionStats: {
				count: 0,
				averageTime: 0,
				errorRate: 0,
			},
		};

		this.healthStats.set(nodeName, health);
	}

	private setupNodeCacheCleanup(): void {
		// Periodic cleanup of unused modules and health stats
		setInterval(
			() => {
				const now = Date.now();
				const maxAge = 1000 * 60 * 60; // 1 hour

				for (const [nodeName, health] of this.healthStats.entries()) {
					if (now - health.lastCheck.getTime() > maxAge) {
						// Update health check
						health.lastCheck = new Date();

						// Check memory usage if available
						if (process.memoryUsage) {
							const memUsage = process.memoryUsage();
							if (health.memoryUsage) {
								health.memoryUsage.used = memUsage.heapUsed;
								health.memoryUsage.peak = Math.max(health.memoryUsage.peak, memUsage.heapUsed);
							}
						}

						// Perform basic health checks
						health.isHealthy = this.performHealthCheck(nodeName);
					}
				}
			},
			1000 * 60 * 5,
		); // Check every 5 minutes
	}

	private performHealthCheck(nodeName: string): boolean {
		// Basic health check - verify node is still loaded and accessible
		const loadedNode = this.loadedNodes.get(nodeName);
		if (!loadedNode) {
			return false;
		}

		try {
			// Verify module is still accessible
			require.resolve(loadedNode.filePath);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get node type registry (for testing/debugging)
	 */
	getNodeTypeRegistry(): Map<string, any> {
		return new Map(this.nodeTypeRegistry);
	}

	/**
	 * Validate node before loading
	 */
	async validateNodeForLoading(
		deploymentPath: string,
		nodeName: string,
	): Promise<{
		valid: boolean;
		issues: string[];
	}> {
		const issues: string[] = [];

		try {
			// Check if deployment path exists
			if (!(await pathExists(deploymentPath))) {
				issues.push(`Deployment path does not exist: ${deploymentPath}`);
				return { valid: false, issues };
			}

			// Try to find entry point
			try {
				await this.findNodeEntryPoint(deploymentPath, nodeName);
			} catch {
				issues.push('No valid entry point found');
			}

			// Check for required dependencies
			const packageJsonPath = join(deploymentPath, 'package.json');
			if (await pathExists(packageJsonPath)) {
				try {
					const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
					if (packageJson.dependencies) {
						const nodeModulesPath = join(deploymentPath, 'node_modules');
						if (!(await pathExists(nodeModulesPath))) {
							issues.push('Dependencies not installed (node_modules not found)');
						}
					}
				} catch {
					issues.push('Invalid package.json file');
				}
			}

			return {
				valid: issues.length === 0,
				issues,
			};
		} catch (error) {
			issues.push(`Validation failed: ${error.message}`);
			return { valid: false, issues };
		}
	}
}
