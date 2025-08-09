import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import type {
	CustomNode,
	CustomNodeDeployment,
	CustomNodeRepository,
	CustomNodeDeploymentRepository,
} from '@n8n/db';
import type { CustomNodeStatus, ValidationResults, NodeMetadata } from '@n8n/db';
import { Service } from '@n8n/di';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { join, extname, basename } from 'path';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { InternalServerError } from '@/errors/response-errors/internal-server.error';
import { NotFoundError } from '@/errors/response-errors/not-found.error';

export interface FileUploadOptions {
	originalName: string;
	mimeType: string;
	size: number;
}

export interface ValidationOptions {
	validateSyntax?: boolean;
	validateDependencies?: boolean;
	validateSecurity?: boolean;
	runTests?: boolean;
}

export interface CustomNodeCreateRequest {
	name: string;
	version: string;
	description?: string;
	category?: string;
	tags?: string[];
	authorId: string;
	file?: {
		buffer: Buffer;
		originalName: string;
		mimeType: string;
	};
	filePath?: string;
	validateOnly?: boolean;
	validationOptions?: ValidationOptions;
}

export interface CustomNodeListQuery {
	status?: CustomNodeStatus | CustomNodeStatus[];
	category?: string;
	authorId?: string;
	search?: string;
	tags?: string[];
	limit?: number;
	offset?: number;
	sortBy?: 'name' | 'createdAt' | 'version' | 'status';
	sortOrder?: 'ASC' | 'DESC';
}

@Service()
export class CustomNodeStorageService {
	private readonly ALLOWED_FILE_TYPES = ['.js', '.ts', '.json', '.tgz', '.tar.gz', '.zip'];
	private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
	private readonly STORAGE_PATH: string;

	constructor(
		private readonly logger: Logger,
		private readonly globalConfig: GlobalConfig,
		private readonly customNodeRepository: CustomNodeRepository,
		private readonly deploymentRepository: CustomNodeDeploymentRepository,
	) {
		this.STORAGE_PATH =
			this.globalConfig.customNodes?.storageBasePath || join(tmpdir(), 'n8n-custom-nodes');
		this.ensureStorageDirectory();
	}

	private async ensureStorageDirectory(): Promise<void> {
		try {
			await fs.access(this.STORAGE_PATH);
		} catch {
			await fs.mkdir(this.STORAGE_PATH, { recursive: true });
			this.logger.info('Created custom nodes storage directory', { path: this.STORAGE_PATH });
		}
	}

	/**
	 * Create a new custom node
	 */
	async createCustomNode(request: CustomNodeCreateRequest): Promise<CustomNode> {
		this.logger.info('Creating custom node', { name: request.name, version: request.version });

		// Check if node with same name/version already exists
		const existing = await this.customNodeRepository.findByNameAndVersion(
			request.name,
			request.version,
		);
		if (existing) {
			throw new BadRequestError(
				`Custom node ${request.name} version ${request.version} already exists`,
			);
		}

		// Validate and store file
		let filePath: string;
		let fileSize: number;
		let fileHash: string;

		if (request.file) {
			const uploadResult = await this.storeUploadedFile(
				request.file,
				request.name,
				request.version,
			);
			filePath = uploadResult.filePath;
			fileSize = uploadResult.fileSize;
			fileHash = uploadResult.fileHash;
		} else if (request.filePath) {
			const stats = await fs.stat(request.filePath);
			filePath = request.filePath;
			fileSize = stats.size;
			fileHash = await this.calculateFileHash(request.filePath);
		} else {
			throw new BadRequestError('Either file upload or file path must be provided');
		}

		// Create custom node record
		const customNode = this.customNodeRepository.create({
			name: request.name,
			version: request.version,
			description: request.description,
			category: request.category,
			tags: request.tags,
			status: 'uploaded',
			filePath,
			fileSize,
			authorId: request.authorId,
			isActive: true,
			metadata: {
				nodeTypes: [],
				author: '',
				license: 'MIT',
				fileSize: fileSize.toString(),
				dependencies: [],
				fileHash,
			} as NodeMetadata,
		});

		const savedNode = await this.customNodeRepository.save(customNode);

		// Start validation if not validateOnly
		if (!request.validateOnly) {
			this.validateCustomNode(savedNode.id, request.validationOptions || {}).catch((error) => {
				this.logger.error('Validation failed for custom node', {
					nodeId: savedNode.id,
					error: error.message,
				});
			});
		}

		this.logger.info('Custom node created successfully', {
			id: savedNode.id,
			name: savedNode.name,
			version: savedNode.version,
		});

		return savedNode;
	}

	/**
	 * Get custom node by ID
	 */
	async getCustomNode(id: string): Promise<CustomNode> {
		const node = await this.customNodeRepository.findOne({
			where: { id, isActive: true },
			relations: ['author', 'deployments'],
		});

		if (!node) {
			throw new NotFoundError(`Custom node with ID ${id} not found`);
		}

		return node;
	}

	/**
	 * List custom nodes with filtering
	 */
	async listCustomNodes(query: CustomNodeListQuery): Promise<{
		nodes: CustomNode[];
		total: number;
		filters: {
			categories: string[];
			tags: string[];
			statuses: CustomNodeStatus[];
		};
	}> {
		const { nodes, total } = await this.customNodeRepository.findWithFilters({
			status: query.status,
			category: query.category,
			authorId: query.authorId,
			search: query.search,
			tags: query.tags,
			limit: query.limit || 50,
			offset: query.offset || 0,
			sortBy: query.sortBy || 'createdAt',
			sortOrder: query.sortOrder || 'DESC',
		});

		// Get available filter options
		const [categories, tags] = await Promise.all([
			this.customNodeRepository.getAvailableCategories(),
			this.customNodeRepository.getAvailableTags(),
		]);

		const statuses: CustomNodeStatus[] = [
			'uploaded',
			'validating',
			'validated',
			'failed',
			'deployed',
		];

		return {
			nodes,
			total,
			filters: {
				categories,
				tags,
				statuses,
			},
		};
	}

	/**
	 * Update custom node
	 */
	async updateCustomNode(
		id: string,
		updates: Partial<CustomNode>,
		file?: { buffer: Buffer; originalName: string; mimeType: string },
	): Promise<CustomNode> {
		const node = await this.getCustomNode(id);

		// Handle file update if provided
		if (file) {
			const uploadResult = await this.storeUploadedFile(file, node.name, node.version);

			// Remove old file
			try {
				await fs.unlink(node.filePath);
			} catch (error) {
				this.logger.warn('Failed to remove old file', { filePath: node.filePath, error });
			}

			updates.filePath = uploadResult.filePath;
			updates.fileSize = uploadResult.fileSize;
			updates.metadata = {
				...node.metadata,
				fileSize: uploadResult.fileSize.toString(),
				fileHash: uploadResult.fileHash,
			};

			// Reset validation status if file changed
			updates.status = 'uploaded';
			updates.validationResults = undefined;
			updates.validatedAt = undefined;
		}

		await this.customNodeRepository.update(id, updates);
		return await this.getCustomNode(id);
	}

	/**
	 * Delete custom node (soft delete)
	 */
	async deleteCustomNode(id: string, force: boolean = false): Promise<void> {
		const node = await this.getCustomNode(id);

		// Check if node is deployed
		const activeDeployments = await this.deploymentRepository.find({
			where: { nodeId: id, status: 'deployed' },
		});

		if (activeDeployments.length > 0 && !force) {
			throw new BadRequestError(
				`Cannot delete custom node ${node.name} - it has active deployments. Use force=true to delete anyway.`,
			);
		}

		// Soft delete the node
		await this.customNodeRepository.softDelete(id);

		// Remove file
		try {
			await fs.unlink(node.filePath);
		} catch (error) {
			this.logger.warn('Failed to remove file during deletion', {
				nodeId: id,
				filePath: node.filePath,
				error,
			});
		}

		this.logger.info('Custom node deleted', { id, name: node.name, force });
	}

	/**
	 * Validate custom node
	 */
	async validateCustomNode(nodeId: string, options: ValidationOptions): Promise<ValidationResults> {
		const node = await this.getCustomNode(nodeId);

		// Update status to validating
		await this.customNodeRepository.updateStatus(nodeId, 'validating');

		this.logger.info('Starting validation for custom node', { nodeId, name: node.name });

		const results: ValidationResults = {
			syntax: false,
			dependencies: false,
			security: false,
			tests: false,
			warnings: [],
			errors: [],
		};

		try {
			// Syntax validation
			if (options.validateSyntax !== false) {
				results.syntax = await this.validateSyntax(node.filePath);
			}

			// Dependencies validation
			if (options.validateDependencies !== false) {
				results.dependencies = await this.validateDependencies(node.filePath);
			}

			// Security validation
			if (options.validateSecurity !== false) {
				results.security = await this.validateSecurity(node.filePath);
			}

			// Run tests
			if (options.runTests === true) {
				results.tests = await this.runTests(node.filePath);
			}

			// Determine overall status
			const hasErrors = results.errors.length > 0;
			const criticalValidationsFailed =
				(options.validateSyntax !== false && !results.syntax) ||
				(options.validateSecurity !== false && !results.security);

			const finalStatus: CustomNodeStatus =
				hasErrors || criticalValidationsFailed ? 'failed' : 'validated';

			// Update node with results
			await this.customNodeRepository.update(nodeId, {
				status: finalStatus,
				validationResults: results,
				validatedAt: finalStatus === 'validated' ? new Date() : undefined,
			});

			this.logger.info('Validation completed', {
				nodeId,
				status: finalStatus,
				syntax: results.syntax,
				dependencies: results.dependencies,
				security: results.security,
				tests: results.tests,
				errorsCount: results.errors.length,
				warningsCount: results.warnings.length,
			});
		} catch (error) {
			results.errors.push(`Validation process failed: ${error.message}`);

			await this.customNodeRepository.update(nodeId, {
				status: 'failed',
				validationResults: results,
			});

			this.logger.error('Validation process failed', { nodeId, error });
		}

		return results;
	}

	/**
	 * Get deployment status for a custom node
	 */
	async getDeploymentStatus(nodeId: string): Promise<{
		deploymentStatus: string;
		deploymentHistory: CustomNodeDeployment[];
		currentDeployment?: CustomNodeDeployment;
	}> {
		const node = await this.getCustomNode(nodeId);
		const deployments = await this.deploymentRepository.findByNodeId(nodeId);
		const currentDeployment = deployments.find((d) => d.status === 'deployed');

		return {
			deploymentStatus: currentDeployment?.status || 'not-deployed',
			deploymentHistory: deployments.slice(0, 10), // Last 10 deployments
			currentDeployment,
		};
	}

	// Private helper methods

	private async storeUploadedFile(
		file: { buffer: Buffer; originalName: string; mimeType: string },
		nodeName: string,
		nodeVersion: string,
	): Promise<{ filePath: string; fileSize: number; fileHash: string }> {
		// Validate file type
		const fileExt = extname(file.originalName).toLowerCase();
		if (!this.ALLOWED_FILE_TYPES.includes(fileExt)) {
			throw new BadRequestError(
				`File type ${fileExt} not allowed. Allowed types: ${this.ALLOWED_FILE_TYPES.join(', ')}`,
			);
		}

		// Validate file size
		if (file.buffer.length > this.MAX_FILE_SIZE) {
			throw new BadRequestError(
				`File size ${file.buffer.length} exceeds maximum allowed size of ${this.MAX_FILE_SIZE} bytes`,
			);
		}

		// Generate storage path
		const fileName = `${nodeName}-${nodeVersion}-${randomUUID()}${fileExt}`;
		const filePath = join(this.STORAGE_PATH, fileName);

		// Write file
		await fs.writeFile(filePath, file.buffer);

		// Calculate hash
		const fileHash = createHash('sha256').update(file.buffer).digest('hex');

		return {
			filePath,
			fileSize: file.buffer.length,
			fileHash,
		};
	}

	private async calculateFileHash(filePath: string): Promise<string> {
		const buffer = await fs.readFile(filePath);
		return createHash('sha256').update(buffer).digest('hex');
	}

	private async validateSyntax(filePath: string): Promise<boolean> {
		try {
			// Basic syntax validation - would be enhanced with actual parsing
			const content = await fs.readFile(filePath, 'utf-8');

			// Basic checks for common syntax issues
			if (content.includes('eval(') || content.includes('Function(')) {
				return false;
			}

			return true;
		} catch (error) {
			this.logger.error('Syntax validation failed', { filePath, error });
			return false;
		}
	}

	private async validateDependencies(filePath: string): Promise<boolean> {
		try {
			// Basic dependency validation - would be enhanced with package.json analysis
			return true;
		} catch (error) {
			this.logger.error('Dependencies validation failed', { filePath, error });
			return false;
		}
	}

	private async validateSecurity(filePath: string): Promise<boolean> {
		try {
			const content = await fs.readFile(filePath, 'utf-8');

			// Basic security checks
			const dangerousPatterns = [
				/require\(['"]child_process['"]\)/,
				/require\(['"]fs['"]\)/,
				/process\.exit/,
				/process\.env/,
				/__dirname/,
				/__filename/,
			];

			for (const pattern of dangerousPatterns) {
				if (pattern.test(content)) {
					return false;
				}
			}

			return true;
		} catch (error) {
			this.logger.error('Security validation failed', { filePath, error });
			return false;
		}
	}

	private async runTests(filePath: string): Promise<boolean> {
		try {
			// Basic test execution - would be enhanced with actual test runner
			return true;
		} catch (error) {
			this.logger.error('Test execution failed', { filePath, error });
			return false;
		}
	}
}
