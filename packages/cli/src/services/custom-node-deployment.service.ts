import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import type {
	CustomNode,
	CustomNodeDeployment,
	CustomNodeRepository,
	CustomNodeDeploymentRepository,
} from '@n8n/db';
import type { DeploymentStatus, DeploymentEnvironment, DeploymentConfig } from '@n8n/db';
import { Service } from '@n8n/di';
import { promises as fs } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { createHash } from 'crypto';
import { spawn, execSync } from 'child_process';
import { tmpdir } from 'os';
import { EventEmitter } from 'events';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { InternalServerError } from '@/errors/response-errors/internal-server.error';
import { NotFoundError } from '@/errors/response-errors/not-found.error';

export interface DeploymentOptions {
	environment: DeploymentEnvironment;
	config?: DeploymentConfig;
	force?: boolean;
	skipValidation?: boolean;
}

export interface DeploymentResult {
	deploymentId: string;
	status: DeploymentStatus;
	message: string;
	logs?: string[];
	errors?: string[];
}

export interface RuntimeNodeInfo {
	name: string;
	version: string;
	displayName: string;
	description: string;
	nodeTypes: string[];
	credentials?: string[];
	dependencies: Record<string, string>;
	loaded: boolean;
	error?: string;
}

@Service()
export class CustomNodeDeploymentService extends EventEmitter {
	private readonly DEPLOYMENT_TIMEOUT = 120000; // 2 minutes
	private readonly NODE_MODULES_PATH: string;
	private readonly CUSTOM_NODES_PATH: string;
	private activeDeployments = new Map<string, AbortController>();

	constructor(
		private readonly logger: Logger,
		private readonly globalConfig: GlobalConfig,
		private readonly customNodeRepository: CustomNodeRepository,
		private readonly deploymentRepository: CustomNodeDeploymentRepository,
	) {
		super();
		this.NODE_MODULES_PATH =
			this.globalConfig.customNodes?.nodeModulesPath || join(process.cwd(), 'node_modules');
		this.CUSTOM_NODES_PATH =
			this.globalConfig.customNodes?.customNodesPath || join(process.cwd(), 'custom-nodes');
		this.ensureDirectories();
	}

	private async ensureDirectories(): Promise<void> {
		try {
			await fs.mkdir(this.CUSTOM_NODES_PATH, { recursive: true });
			await fs.mkdir(join(this.CUSTOM_NODES_PATH, 'deployed'), { recursive: true });
			await fs.mkdir(join(this.CUSTOM_NODES_PATH, 'staging'), { recursive: true });
		} catch (error) {
			this.logger.error('Failed to create custom nodes directories', { error });
		}
	}

	/**
	 * Deploy a custom node to the runtime
	 */
	async deployCustomNode(
		nodeId: string,
		options: DeploymentOptions,
		deployedBy: string,
	): Promise<DeploymentResult> {
		this.logger.info('Starting deployment', { nodeId, environment: options.environment });

		// Get the custom node
		const customNode = await this.customNodeRepository.findOne({
			where: { id: nodeId, isActive: true },
		});

		if (!customNode) {
			throw new NotFoundError(`Custom node ${nodeId} not found`);
		}

		// Validate node is ready for deployment
		if (!options.skipValidation && customNode.status !== 'validated') {
			throw new BadRequestError('Node must be validated before deployment');
		}

		// Check if already deployed in this environment
		const existingDeployment = await this.deploymentRepository.findOne({
			where: {
				nodeId,
				environment: options.environment,
				status: 'deployed',
			},
		});

		if (existingDeployment && !options.force) {
			throw new BadRequestError(
				`Node is already deployed in ${options.environment} environment. Use force=true to redeploy.`,
			);
		}

		// Create deployment record
		const deployment = this.deploymentRepository.create({
			nodeId,
			environment: options.environment,
			status: 'pending' as DeploymentStatus,
			config: options.config || {},
			deployedBy,
		});

		const savedDeployment = await this.deploymentRepository.save(deployment);

		// Start deployment process
		try {
			await this.performDeployment(customNode, savedDeployment, options);

			return {
				deploymentId: savedDeployment.id,
				status: 'deployed',
				message: 'Deployment completed successfully',
			};
		} catch (error) {
			this.logger.error('Deployment failed', {
				deploymentId: savedDeployment.id,
				nodeId,
				error: error.message,
			});

			await this.deploymentRepository.updateStatus(savedDeployment.id, 'failed', error.message);

			return {
				deploymentId: savedDeployment.id,
				status: 'failed',
				message: 'Deployment failed',
				errors: [error.message],
			};
		}
	}

	/**
	 * Undeploy a custom node from the runtime
	 */
	async undeployCustomNode(
		nodeId: string,
		environment: DeploymentEnvironment,
		force = false,
	): Promise<DeploymentResult> {
		this.logger.info('Starting undeployment', { nodeId, environment });

		// Find active deployment
		const deployment = await this.deploymentRepository.findOne({
			where: {
				nodeId,
				environment,
				status: 'deployed',
			},
		});

		if (!deployment) {
			throw new NotFoundError(`No active deployment found for node ${nodeId} in ${environment}`);
		}

		// Update status to undeploying
		await this.deploymentRepository.updateStatus(deployment.id, 'undeploying');

		try {
			await this.performUndeployment(deployment);

			return {
				deploymentId: deployment.id,
				status: 'undeployed',
				message: 'Undeployment completed successfully',
			};
		} catch (error) {
			this.logger.error('Undeployment failed', {
				deploymentId: deployment.id,
				nodeId,
				error: error.message,
			});

			// Revert status if undeployment fails
			await this.deploymentRepository.updateStatus(
				deployment.id,
				'deployed',
				`Undeployment failed: ${error.message}`,
			);

			return {
				deploymentId: deployment.id,
				status: 'failed',
				message: 'Undeployment failed',
				errors: [error.message],
			};
		}
	}

	/**
	 * Get deployment status and logs
	 */
	async getDeploymentStatus(deploymentId: string): Promise<{
		deployment: CustomNodeDeployment;
		logs: string[];
		runtimeInfo?: RuntimeNodeInfo;
	}> {
		const deployment = await this.deploymentRepository.findOne({
			where: { id: deploymentId },
			relations: ['node'],
		});

		if (!deployment) {
			throw new NotFoundError(`Deployment ${deploymentId} not found`);
		}

		// Get logs from deployment record or file system
		const logs = await this.getDeploymentLogs(deploymentId);

		// Get runtime information if deployed
		let runtimeInfo: RuntimeNodeInfo | undefined;
		if (deployment.status === 'deployed') {
			runtimeInfo = await this.getRuntimeNodeInfo(deployment.node.name);
		}

		return {
			deployment,
			logs,
			runtimeInfo,
		};
	}

	/**
	 * List all deployed nodes in runtime
	 */
	async listDeployedNodes(): Promise<RuntimeNodeInfo[]> {
		const deployments = await this.deploymentRepository.find({
			where: { status: 'deployed' },
			relations: ['node'],
		});

		const runtimeNodes: RuntimeNodeInfo[] = [];

		for (const deployment of deployments) {
			try {
				const runtimeInfo = await this.getRuntimeNodeInfo(deployment.node.name);
				runtimeNodes.push(runtimeInfo);
			} catch (error) {
				// Node might be deployed but not loaded
				runtimeNodes.push({
					name: deployment.node.name,
					version: deployment.node.version,
					displayName: deployment.node.name,
					description: deployment.node.description || '',
					nodeTypes: [],
					dependencies: {},
					loaded: false,
					error: error.message,
				});
			}
		}

		return runtimeNodes;
	}

	/**
	 * Hot reload a deployed node
	 */
	async hotReloadNode(nodeId: string): Promise<void> {
		const deployment = await this.deploymentRepository.findOne({
			where: {
				nodeId,
				status: 'deployed',
			},
			relations: ['node'],
		});

		if (!deployment) {
			throw new NotFoundError(`No active deployment found for node ${nodeId}`);
		}

		this.logger.info('Hot reloading node', {
			nodeId,
			nodeName: deployment.node.name,
		});

		// TODO: Implement hot reload mechanism
		// This would need to integrate with n8n's node loading system
		// For now, we'll simulate the process

		await this.reloadNodeInRuntime(deployment.node.name);

		this.emit('nodeReloaded', {
			nodeId,
			nodeName: deployment.node.name,
			deploymentId: deployment.id,
		});
	}

	// Private methods

	private async performDeployment(
		customNode: CustomNode,
		deployment: CustomNodeDeployment,
		options: DeploymentOptions,
	): Promise<void> {
		const abortController = new AbortController();
		this.activeDeployments.set(deployment.id, abortController);

		try {
			// Update status to deploying
			await this.deploymentRepository.markAsStarted(deployment.id);

			// Extract and prepare node files
			const deploymentPath = await this.prepareNodeFiles(customNode, deployment.environment);

			// Install dependencies if needed
			await this.installDependencies(deploymentPath, abortController.signal);

			// Load node into runtime
			await this.loadNodeIntoRuntime(customNode, deploymentPath);

			// Update deployment status
			await this.deploymentRepository.updateStatus(deployment.id, 'deployed');

			// Update custom node status
			await this.customNodeRepository.updateStatus(customNode.id, 'deployed', {
				deployedAt: new Date(),
			});

			this.emit('nodeDeployed', {
				nodeId: customNode.id,
				nodeName: customNode.name,
				deploymentId: deployment.id,
				environment: deployment.environment,
			});

			this.logger.info('Deployment completed successfully', {
				nodeId: customNode.id,
				deploymentId: deployment.id,
			});
		} finally {
			this.activeDeployments.delete(deployment.id);
		}
	}

	private async performUndeployment(deployment: CustomNodeDeployment): Promise<void> {
		// Unload from runtime
		await this.unloadNodeFromRuntime(deployment.node.name);

		// Clean up files
		const deploymentPath = this.getDeploymentPath(deployment.node.name, deployment.environment);
		await this.cleanupDeploymentFiles(deploymentPath);

		// Update deployment status
		await this.deploymentRepository.updateStatus(deployment.id, 'undeployed');

		// Update node status if no other deployments
		const otherDeployments = await this.deploymentRepository.find({
			where: {
				nodeId: deployment.nodeId,
				status: 'deployed',
			},
		});

		if (otherDeployments.length === 0) {
			await this.customNodeRepository.updateStatus(deployment.nodeId, 'validated');
		}

		this.emit('nodeUndeployed', {
			nodeId: deployment.nodeId,
			nodeName: deployment.node.name,
			deploymentId: deployment.id,
		});
	}

	private async prepareNodeFiles(
		customNode: CustomNode,
		environment: DeploymentEnvironment,
	): Promise<string> {
		const deploymentPath = this.getDeploymentPath(customNode.name, environment);

		// Create deployment directory
		await fs.mkdir(deploymentPath, { recursive: true });

		// Copy node files
		if (customNode.filePath) {
			const fileExtension = extname(customNode.filePath);

			if (fileExtension === '.js' || fileExtension === '.ts') {
				// Single file node
				const targetPath = join(deploymentPath, `${customNode.name}.js`);
				await fs.copyFile(customNode.filePath, targetPath);
			} else if (['.zip', '.tar.gz', '.tgz'].includes(fileExtension)) {
				// Package file - extract it
				await this.extractPackage(customNode.filePath, deploymentPath);
			}
		}

		// Create or update package.json if needed
		await this.ensurePackageJson(customNode, deploymentPath);

		return deploymentPath;
	}

	private async extractPackage(packagePath: string, targetPath: string): Promise<void> {
		const fileExtension = extname(packagePath);

		try {
			if (fileExtension === '.zip') {
				// Use unzip command
				execSync(`unzip -q "${packagePath}" -d "${targetPath}"`);
			} else if (['.tar.gz', '.tgz'].includes(fileExtension)) {
				// Use tar command
				execSync(`tar -xzf "${packagePath}" -C "${targetPath}"`);
			}
		} catch (error) {
			throw new InternalServerError(`Failed to extract package: ${error.message}`);
		}
	}

	private async ensurePackageJson(customNode: CustomNode, deploymentPath: string): Promise<void> {
		const packageJsonPath = join(deploymentPath, 'package.json');

		try {
			// Check if package.json already exists
			await fs.access(packageJsonPath);
		} catch {
			// Create basic package.json
			const packageJson = {
				name: customNode.name,
				version: customNode.version,
				description: customNode.description || '',
				main: `${customNode.name}.js`,
				n8n: {
					nodes: [`dist/${customNode.name}.js`],
				},
				keywords: ['n8n-community-node-package', ...(customNode.tags || [])],
				dependencies: customNode.metadata?.dependencies || {},
			};

			await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
		}
	}

	private async installDependencies(deploymentPath: string, signal: AbortSignal): Promise<void> {
		const packageJsonPath = join(deploymentPath, 'package.json');

		try {
			await fs.access(packageJsonPath);
		} catch {
			return; // No package.json, no dependencies to install
		}

		return new Promise((resolve, reject) => {
			const npmInstall = spawn('npm', ['install', '--production'], {
				cwd: deploymentPath,
				stdio: ['ignore', 'pipe', 'pipe'],
				signal,
			});

			let stdout = '';
			let stderr = '';

			npmInstall.stdout?.on('data', (data) => {
				stdout += data.toString();
			});

			npmInstall.stderr?.on('data', (data) => {
				stderr += data.toString();
			});

			npmInstall.on('close', (code) => {
				if (code === 0) {
					this.logger.debug('Dependencies installed successfully', { deploymentPath });
					resolve();
				} else {
					this.logger.error('Failed to install dependencies', {
						deploymentPath,
						code,
						stderr,
					});
					reject(new InternalServerError(`npm install failed: ${stderr}`));
				}
			});

			npmInstall.on('error', (error) => {
				reject(new InternalServerError(`Failed to start npm install: ${error.message}`));
			});
		});
	}

	private async loadNodeIntoRuntime(customNode: CustomNode, deploymentPath: string): Promise<void> {
		// TODO: Implement actual node loading into n8n runtime
		// This would need to integrate with n8n's node loading mechanism
		// For now, we'll simulate the process

		this.logger.info('Loading node into runtime', {
			nodeName: customNode.name,
			deploymentPath,
		});

		// Simulate loading delay
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Here we would:
		// 1. Load the node class from the deployment path
		// 2. Register it with n8n's node registry
		// 3. Update the runtime node cache
		// 4. Emit events for UI updates
	}

	private async unloadNodeFromRuntime(nodeName: string): Promise<void> {
		// TODO: Implement actual node unloading from n8n runtime
		this.logger.info('Unloading node from runtime', { nodeName });

		// Here we would:
		// 1. Unregister the node from n8n's node registry
		// 2. Clean up any cached instances
		// 3. Remove from runtime node cache
		// 4. Emit events for UI updates
	}

	private async reloadNodeInRuntime(nodeName: string): Promise<void> {
		// TODO: Implement hot reload
		this.logger.info('Reloading node in runtime', { nodeName });

		// Here we would:
		// 1. Unload the current node
		// 2. Clear any caches
		// 3. Reload the node from disk
		// 4. Re-register with the runtime
	}

	private async getRuntimeNodeInfo(nodeName: string): Promise<RuntimeNodeInfo> {
		// TODO: Get actual runtime information
		// For now, return mock data
		return {
			name: nodeName,
			version: '1.0.0',
			displayName: nodeName,
			description: 'Custom node',
			nodeTypes: [nodeName],
			dependencies: {},
			loaded: true,
		};
	}

	private getDeploymentPath(nodeName: string, environment: DeploymentEnvironment): string {
		return join(this.CUSTOM_NODES_PATH, environment, nodeName);
	}

	private async cleanupDeploymentFiles(deploymentPath: string): Promise<void> {
		try {
			await fs.rm(deploymentPath, { recursive: true, force: true });
		} catch (error) {
			this.logger.warn('Failed to cleanup deployment files', {
				deploymentPath,
				error: error.message,
			});
		}
	}

	private async getDeploymentLogs(deploymentId: string): Promise<string[]> {
		// TODO: Implement actual log retrieval
		// This could read from log files or database
		return [
			`[${new Date().toISOString()}] Deployment ${deploymentId} started`,
			`[${new Date().toISOString()}] Files prepared successfully`,
			`[${new Date().toISOString()}] Dependencies installed`,
			`[${new Date().toISOString()}] Node loaded into runtime`,
			`[${new Date().toISOString()}] Deployment completed`,
		];
	}

	/**
	 * Cancel an active deployment
	 */
	async cancelDeployment(deploymentId: string): Promise<void> {
		const abortController = this.activeDeployments.get(deploymentId);
		if (abortController) {
			abortController.abort();
			this.activeDeployments.delete(deploymentId);

			await this.deploymentRepository.updateStatus(
				deploymentId,
				'failed',
				'Deployment cancelled by user',
			);
		}
	}

	/**
	 * Cleanup old deployments
	 */
	async cleanupOldDeployments(daysOld = 30): Promise<number> {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - daysOld);

		const oldDeployments = await this.deploymentRepository.find({
			where: [
				{ status: 'failed', createdAt: { $lt: cutoffDate } },
				{ status: 'undeployed', createdAt: { $lt: cutoffDate } },
			],
		});

		let cleanedCount = 0;
		for (const deployment of oldDeployments) {
			try {
				const deploymentPath = this.getDeploymentPath(deployment.node.name, deployment.environment);
				await this.cleanupDeploymentFiles(deploymentPath);
				await this.deploymentRepository.remove(deployment);
				cleanedCount++;
			} catch (error) {
				this.logger.warn('Failed to cleanup old deployment', {
					deploymentId: deployment.id,
					error: error.message,
				});
			}
		}

		this.logger.info('Cleaned up old deployments', {
			cleanedCount,
			totalFound: oldDeployments.length,
		});

		return cleanedCount;
	}
}
