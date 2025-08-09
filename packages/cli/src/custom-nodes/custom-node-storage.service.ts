import { Logger } from '@n8n/backend-common';
import { CustomNodeRepository, CustomNodeDeploymentRepository } from '@n8n/db';
import type { CustomNode, CustomNodeStatus, ValidationResults, NodeMetadata } from '@n8n/db';
import { Service } from '@n8n/di';
import { access, constants, mkdir, readFile, writeFile, stat, rm } from 'fs/promises';
import { createHash } from 'crypto';
import { InstanceSettings } from 'n8n-core';
import { join, extname, dirname } from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import multer from 'multer';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { InternalServerError } from '@/errors/response-errors/internal-server.error';
import { NotFoundError } from '@/errors/response-errors/not-found.error';

const asyncExec = promisify(exec);

export interface CreateCustomNodeOptions {
	name: string;
	version: string;
	description?: string;
	authorId?: string;
	category?: string;
	tags?: string[];
	file?: Buffer;
	fileName?: string;
	validateOnly?: boolean;
	skipTests?: boolean;
}

export interface CustomNodeFilters {
	status?: CustomNodeStatus | 'all';
	category?: string;
	authorId?: string;
	search?: string;
	tags?: string[];
}

export interface CustomNodePagination {
	limit?: number;
	offset?: number;
	sortBy?: 'name' | 'createdAt' | 'version' | 'status';
	sortOrder?: 'asc' | 'desc';
}

@Service()
export class CustomNodeStorageService {
	private readonly storageDir: string;
	private readonly allowedExtensions = ['.js', '.ts', '.json', '.tgz', '.tar.gz', '.zip'];
	private readonly maxFileSize = 10 * 1024 * 1024; // 10MB

	constructor(
		private readonly logger: Logger,
		private readonly instanceSettings: InstanceSettings,
		private readonly customNodeRepository: CustomNodeRepository,
		private readonly deploymentRepository: CustomNodeDeploymentRepository,
	) {
		this.storageDir = join(this.instanceSettings.userFolder, 'custom-nodes');
		void this.ensureStorageDirectory();
	}

	private async ensureStorageDirectory(): Promise<void> {
		try {
			await access(this.storageDir, constants.F_OK);
		} catch {
			await mkdir(this.storageDir, { recursive: true });
			this.logger.info('Created custom nodes storage directory', { path: this.storageDir });
		}
	}

	async createCustomNode(options: CreateCustomNodeOptions): Promise<CustomNode> {
		const {
			name,
			version,
			description,
			authorId,
			category,
			tags,
			file,
			fileName,
			validateOnly = false,
		} = options;

		// Validate file if provided
		if (file && fileName) {
			this.validateFile(file, fileName);
		}

		// Check for existing node with same name and version
		const existingNode = await this.customNodeRepository.findByNameAndVersion(name, version);
		if (existingNode) {
			throw new BadRequestError(
				`Custom node with name "${name}" and version "${version}" already exists`,
			);
		}

		// Store file if provided
		let filePath = '';
		let fileSize = 0;
		if (file && fileName) {
			const result = await this.storeFile(file, fileName, name, version);
			filePath = result.path;
			fileSize = result.size;
		}

		// Create initial metadata
		const metadata: NodeMetadata = {
			nodeTypes: [],
			author: authorId || 'unknown',
			license: 'unknown',
			fileSize: this.formatFileSize(fileSize),
			dependencies: [],
		};

		// Create the custom node entity
		const customNode = this.customNodeRepository.create({
			name,
			version,
			description,
			authorId,
			category,
			tags,
			status: 'uploaded',
			filePath,
			fileSize,
			metadata,
			validationResults: undefined,
		});

		if (validateOnly) {
			// Return the node without saving for validation-only requests
			return customNode;
		}

		try {
			const savedNode = await this.customNodeRepository.save(customNode);
			this.logger.info('Custom node created successfully', {
				id: savedNode.id,
				name: savedNode.name,
				version: savedNode.version,
			});
			return savedNode;
		} catch (error) {
			// Clean up file if database save failed
			if (filePath) {
				try {
					await rm(filePath, { force: true });
				} catch (cleanupError) {
					this.logger.warn('Failed to clean up file after database error', {
						filePath,
						error: cleanupError,
					});
				}
			}
			throw new InternalServerError('Failed to create custom node', { cause: error });
		}
	}

	async findCustomNodes(
		filters: CustomNodeFilters,
		pagination: CustomNodePagination,
	): Promise<{
		nodes: CustomNode[];
		total: number;
		filters: {
			categories: string[];
			authors: string[];
			tags: string[];
			statuses: string[];
		};
	}> {
		const { nodes, total } = await this.customNodeRepository.findWithFilters(filters, pagination);

		// Get filter options for UI
		const statistics = await this.customNodeRepository.getStatistics();
		const filterOptions = {
			categories: Object.keys(statistics.byCategory),
			authors: [], // TODO: Get from user table
			tags: [], // TODO: Extract unique tags
			statuses: Object.keys(statistics.byStatus),
		};

		return {
			nodes,
			total,
			filters: filterOptions,
		};
	}

	async findCustomNodeById(id: string): Promise<CustomNode> {
		const node = await this.customNodeRepository.findWithDetails(id);
		if (!node) {
			throw new NotFoundError(`Custom node with ID "${id}" not found`);
		}
		return node;
	}

	async updateCustomNode(
		id: string,
		updates: Partial<CreateCustomNodeOptions>,
	): Promise<CustomNode> {
		const existingNode = await this.findCustomNodeById(id);

		// Handle file update if provided
		if (updates.file && updates.fileName) {
			this.validateFile(updates.file, updates.fileName);

			// Store new file
			const result = await this.storeFile(
				updates.file,
				updates.fileName,
				updates.name || existingNode.name,
				updates.version || existingNode.version,
			);

			// Remove old file
			if (existingNode.filePath) {
				try {
					await rm(existingNode.filePath, { force: true });
				} catch (error) {
					this.logger.warn('Failed to remove old file', { filePath: existingNode.filePath, error });
				}
			}

			updates.file = undefined; // Don't include buffer in update
			updates.fileName = undefined;
			Object.assign(updates, { filePath: result.path, fileSize: result.size });
		}

		// Update metadata if file changed
		if (updates.fileSize) {
			const metadata = { ...existingNode.metadata };
			metadata.fileSize = this.formatFileSize(updates.fileSize);
			Object.assign(updates, { metadata });
		}

		// Apply updates
		await this.customNodeRepository.update(id, updates as Partial<CustomNode>);

		// Return updated node
		return await this.findCustomNodeById(id);
	}

	async deleteCustomNode(
		id: string,
		options: { force?: boolean; cleanup?: boolean } = {},
	): Promise<void> {
		const node = await this.findCustomNodeById(id);

		// Check if node is deployed and force is not set
		if (node.status === 'deployed' && !options.force) {
			throw new BadRequestError(
				'Cannot delete deployed custom node. Use force option or undeploy first.',
			);
		}

		// Cleanup runtime instances if requested
		if (options.cleanup) {
			// TODO: Implement runtime cleanup
			this.logger.info('Runtime cleanup requested', { nodeId: id });
		}

		// Remove file
		if (node.filePath) {
			try {
				await rm(node.filePath, { force: true });
			} catch (error) {
				this.logger.warn('Failed to remove custom node file', { filePath: node.filePath, error });
			}
		}

		// Remove from database
		await this.customNodeRepository.delete(id);

		this.logger.info('Custom node deleted successfully', {
			id,
			name: node.name,
			version: node.version,
		});
	}

	async getCustomNodeStatistics(): Promise<{
		total: number;
		byStatus: Record<CustomNodeStatus, number>;
		byCategory: Record<string, number>;
		active: number;
	}> {
		return await this.customNodeRepository.getStatistics();
	}

	private validateFile(file: Buffer, fileName: string): void {
		// Check file size
		if (file.length > this.maxFileSize) {
			throw new BadRequestError(
				`File size exceeds maximum limit of ${this.formatFileSize(this.maxFileSize)}`,
			);
		}

		// Check file extension
		const extension = extname(fileName).toLowerCase();
		if (!this.allowedExtensions.includes(extension)) {
			throw new BadRequestError(
				`File type "${extension}" is not allowed. Allowed types: ${this.allowedExtensions.join(', ')}`,
			);
		}

		// Check for potentially malicious content
		this.performBasicSecurityCheck(file, fileName);
	}

	private performBasicSecurityCheck(file: Buffer, fileName: string): void {
		const content = file.toString('utf8', 0, Math.min(file.length, 1024)); // Check first 1KB

		// Check for suspicious patterns
		const suspiciousPatterns = [
			/eval\s*\(/i,
			/Function\s*\(/i,
			/process\.exit/i,
			/require\s*\(\s*['"]child_process['"].*\)/i,
			/fs\.unlink/i,
			/fs\.rmdir/i,
			/__dirname.*\.\./i,
		];

		for (const pattern of suspiciousPatterns) {
			if (pattern.test(content)) {
				this.logger.warn('Suspicious content detected in uploaded file', {
					fileName,
					pattern: pattern.toString(),
				});
				throw new BadRequestError('File contains potentially malicious content');
			}
		}
	}

	private async storeFile(
		file: Buffer,
		fileName: string,
		nodeName: string,
		version: string,
	): Promise<{ path: string; size: number }> {
		// Create unique directory for this node version
		const nodeDir = join(this.storageDir, `${nodeName}_${version}`);
		await mkdir(nodeDir, { recursive: true });

		// Generate safe filename
		const timestamp = Date.now();
		const hash = createHash('md5').update(file).digest('hex').substring(0, 8);
		const extension = extname(fileName);
		const baseName = fileName.replace(extension, '');
		const safeFileName = `${baseName}_${timestamp}_${hash}${extension}`;

		const filePath = join(nodeDir, safeFileName);

		// Write file
		await writeFile(filePath, file);

		// Verify file was written correctly
		const stats = await stat(filePath);
		if (stats.size !== file.length) {
			throw new InternalServerError('File was not stored correctly');
		}

		this.logger.info('Custom node file stored successfully', {
			path: filePath,
			size: stats.size,
			originalName: fileName,
		});

		return { path: filePath, size: stats.size };
	}

	private formatFileSize(bytes: number): string {
		const units = ['B', 'KB', 'MB', 'GB'];
		let size = bytes;
		let unitIndex = 0;

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}

		return `${size.toFixed(1)} ${units[unitIndex]}`;
	}

	// Multer configuration for file uploads
	getMulterConfig(): multer.Multer {
		return multer({
			storage: multer.memoryStorage(),
			limits: {
				fileSize: this.maxFileSize,
			},
			fileFilter: (req, file, cb) => {
				const extension = extname(file.originalname).toLowerCase();
				if (this.allowedExtensions.includes(extension)) {
					cb(null, true);
				} else {
					cb(new BadRequestError(`File type "${extension}" is not allowed`));
				}
			},
		});
	}
}
