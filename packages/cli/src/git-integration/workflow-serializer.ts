import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import type { WorkflowEntity } from '@n8n/db';
import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'yamljs';
import { jsonParse } from 'n8n-workflow';
import type { SerializedWorkflow, WorkflowFileMapping } from './types';

/**
 * Workflow serialization service
 * Converts workflows to/from Git-friendly formats (JSON/YAML)
 */
@Service()
export class WorkflowSerializer {
	private readonly workflowsDirectory = 'workflows';
	private readonly mappingsFile = '.workflow-mappings.json';
	private mappings: Map<string, WorkflowFileMapping> = new Map();

	constructor(private readonly logger: Logger) {}

	/**
	 * Initialize serializer with repository path
	 * @param repoPath Git repository path
	 */
	async initialize(repoPath: string): Promise<void> {
		this.logger.info('Initializing workflow serializer', { repoPath });

		const workflowsPath = path.join(repoPath, this.workflowsDirectory);
		await fs.mkdir(workflowsPath, { recursive: true });

		// Load existing mappings
		await this.loadMappings(repoPath);
	}

	/**
	 * Serialize workflow to file
	 * @param workflow Workflow entity
	 * @param repoPath Repository path
	 * @param format Output format (json or yaml)
	 */
	async serializeWorkflow(
		workflow: WorkflowEntity,
		repoPath: string,
		format: 'json' | 'yaml' = 'json',
	): Promise<string> {
		this.logger.debug('Serializing workflow', {
			workflowId: workflow.id,
			name: workflow.name,
			format,
		});

		// Convert workflow to serialized format
		const serialized: SerializedWorkflow = {
			id: workflow.id,
			name: workflow.name,
			active: workflow.active,
			nodes: workflow.nodes,
			connections: workflow.connections,
			settings: workflow.settings,
			staticData: workflow.staticData,
			tags: workflow.tags?.map((t) => t.name) || [],
			createdAt: workflow.createdAt.toISOString(),
			updatedAt: workflow.updatedAt.toISOString(),
			version: 1, // Version for future compatibility
		};

		// Generate file path
		const fileName = this.sanitizeFileName(workflow.name);
		const fileExtension = format === 'yaml' ? 'yaml' : 'json';
		const relativePath = path.join(this.workflowsDirectory, `${fileName}.${fileExtension}`);
		const fullPath = path.join(repoPath, relativePath);

		// Serialize to appropriate format
		let content: string;
		if (format === 'yaml') {
			content = yaml.stringify(serialized, 10, 2);
		} else {
			content = JSON.stringify(serialized, null, 2);
		}

		// Write to file
		await fs.writeFile(fullPath, content, 'utf-8');

		this.logger.info('Workflow serialized successfully', {
			workflowId: workflow.id,
			filePath: relativePath,
		});

		return relativePath;
	}

	/**
	 * Deserialize workflow from file
	 * @param filePath File path (relative to repo root)
	 * @param repoPath Repository path
	 */
	async deserializeWorkflow(filePath: string, repoPath: string): Promise<SerializedWorkflow> {
		this.logger.debug('Deserializing workflow', { filePath });

		const fullPath = path.join(repoPath, filePath);
		const content = await fs.readFile(fullPath, 'utf-8');

		// Determine format from extension
		const extension = path.extname(filePath).toLowerCase();
		let workflow: SerializedWorkflow;

		if (extension === '.yaml' || extension === '.yml') {
			workflow = yaml.parse(content);
		} else {
			workflow = jsonParse<SerializedWorkflow>(content);
		}

		this.logger.debug('Workflow deserialized successfully', {
			workflowId: workflow.id,
			name: workflow.name,
		});

		return workflow;
	}

	/**
	 * Serialize multiple workflows
	 * @param workflows Array of workflow entities
	 * @param repoPath Repository path
	 * @param format Output format
	 */
	async serializeWorkflows(
		workflows: WorkflowEntity[],
		repoPath: string,
		format: 'json' | 'yaml' = 'json',
	): Promise<Map<string, string>> {
		this.logger.info('Serializing multiple workflows', {
			count: workflows.length,
			format,
		});

		const filePaths = new Map<string, string>();

		for (const workflow of workflows) {
			try {
				const filePath = await this.serializeWorkflow(workflow, repoPath, format);
				filePaths.set(workflow.id, filePath);

				// Update mapping
				this.mappings.set(workflow.id, {
					workflowId: workflow.id,
					filePath,
					lastSyncedCommit: '', // Will be updated after commit
					lastSyncedAt: new Date(),
				});
			} catch (error) {
				this.logger.error('Failed to serialize workflow', {
					workflowId: workflow.id,
					error: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		}

		// Save mappings
		await this.saveMappings(repoPath);

		return filePaths;
	}

	/**
	 * Deserialize all workflows from repository
	 * @param repoPath Repository path
	 */
	async deserializeAllWorkflows(repoPath: string): Promise<SerializedWorkflow[]> {
		this.logger.info('Deserializing all workflows from repository');

		const workflowsPath = path.join(repoPath, this.workflowsDirectory);
		const workflows: SerializedWorkflow[] = [];

		try {
			const files = await fs.readdir(workflowsPath);

			for (const file of files) {
				if (file.endsWith('.json') || file.endsWith('.yaml') || file.endsWith('.yml')) {
					try {
						const relativePath = path.join(this.workflowsDirectory, file);
						const workflow = await this.deserializeWorkflow(relativePath, repoPath);
						workflows.push(workflow);
					} catch (error) {
						this.logger.error('Failed to deserialize workflow file', {
							file,
							error: error instanceof Error ? error.message : 'Unknown error',
						});
					}
				}
			}
		} catch (error) {
			this.logger.error('Failed to read workflows directory', {
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}

		this.logger.info('All workflows deserialized', { count: workflows.length });

		return workflows;
	}

	/**
	 * Get file path for workflow
	 * @param workflowId Workflow ID
	 */
	getWorkflowFilePath(workflowId: string): string | undefined {
		return this.mappings.get(workflowId)?.filePath;
	}

	/**
	 * Get workflow ID from file path
	 * @param filePath File path
	 */
	getWorkflowIdFromPath(filePath: string): string | undefined {
		for (const [id, mapping] of this.mappings.entries()) {
			if (mapping.filePath === filePath) {
				return id;
			}
		}
		return undefined;
	}

	/**
	 * Update mapping after commit
	 * @param workflowId Workflow ID
	 * @param commitHash Commit hash
	 */
	updateMappingCommit(workflowId: string, commitHash: string): void {
		const mapping = this.mappings.get(workflowId);
		if (mapping) {
			mapping.lastSyncedCommit = commitHash;
			mapping.lastSyncedAt = new Date();
		}
	}

	/**
	 * Convert serialized workflow to workflow entity format
	 * @param serialized Serialized workflow
	 */
	toWorkflowEntity(serialized: SerializedWorkflow): Partial<WorkflowEntity> {
		return {
			id: serialized.id,
			name: serialized.name,
			active: serialized.active,
			nodes: serialized.nodes,
			connections: serialized.connections,
			settings: serialized.settings,
			staticData: serialized.staticData,
			createdAt: new Date(serialized.createdAt),
			updatedAt: new Date(serialized.updatedAt),
		};
	}

	/**
	 * Generate commit message for workflow changes
	 * @param workflow Workflow entity
	 * @param action Action performed (created, updated, deleted)
	 */
	generateCommitMessage(
		workflow: WorkflowEntity,
		action: 'created' | 'updated' | 'deleted',
	): string {
		const prefix = action.charAt(0).toUpperCase() + action.slice(1);
		return `${prefix} workflow: ${workflow.name} (${workflow.id})`;
	}

	/**
	 * Sanitize file name
	 * @param name Workflow name
	 */
	private sanitizeFileName(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.substring(0, 100);
	}

	/**
	 * Load workflow mappings from file
	 * @param repoPath Repository path
	 */
	private async loadMappings(repoPath: string): Promise<void> {
		const mappingsPath = path.join(repoPath, this.mappingsFile);

		try {
			const content = await fs.readFile(mappingsPath, 'utf-8');
			const mappingsArray: WorkflowFileMapping[] = JSON.parse(content);

			this.mappings.clear();
			for (const mapping of mappingsArray) {
				this.mappings.set(mapping.workflowId, {
					...mapping,
					lastSyncedAt: new Date(mapping.lastSyncedAt),
				});
			}

			this.logger.debug('Workflow mappings loaded', { count: this.mappings.size });
		} catch (error) {
			// Mappings file doesn't exist yet - this is fine
			this.logger.debug('No existing workflow mappings found');
		}
	}

	/**
	 * Save workflow mappings to file
	 * @param repoPath Repository path
	 */
	private async saveMappings(repoPath: string): Promise<void> {
		const mappingsPath = path.join(repoPath, this.mappingsFile);
		const mappingsArray = Array.from(this.mappings.values());
		const content = JSON.stringify(mappingsArray, null, 2);

		await fs.writeFile(mappingsPath, content, 'utf-8');

		this.logger.debug('Workflow mappings saved', { count: mappingsArray.length });
	}

	/**
	 * Delete workflow file
	 * @param workflowId Workflow ID
	 * @param repoPath Repository path
	 */
	async deleteWorkflowFile(workflowId: string, repoPath: string): Promise<string | null> {
		const mapping = this.mappings.get(workflowId);
		if (!mapping) {
			this.logger.warn('No mapping found for workflow', { workflowId });
			return null;
		}

		const fullPath = path.join(repoPath, mapping.filePath);

		try {
			await fs.unlink(fullPath);
			this.mappings.delete(workflowId);
			await this.saveMappings(repoPath);

			this.logger.info('Workflow file deleted', {
				workflowId,
				filePath: mapping.filePath,
			});

			return mapping.filePath;
		} catch (error) {
			this.logger.error('Failed to delete workflow file', {
				workflowId,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
			return null;
		}
	}

	/**
	 * Check if workflow file exists
	 * @param workflowId Workflow ID
	 * @param repoPath Repository path
	 */
	async workflowFileExists(workflowId: string, repoPath: string): Promise<boolean> {
		const mapping = this.mappings.get(workflowId);
		if (!mapping) return false;

		const fullPath = path.join(repoPath, mapping.filePath);

		try {
			await fs.access(fullPath);
			return true;
		} catch {
			return false;
		}
	}
}
