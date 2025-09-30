import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import type {
	SerializedWorkflow,
	WorkflowDiff,
	WorkflowNodeDiff,
	WorkflowNodeModification,
	PropertyChange,
	ConnectionDiff,
	SettingsDiff,
} from './types';

/**
 * Workflow diff calculation engine
 * Analyzes differences between workflow versions
 */
@Service()
export class DiffEngine {
	constructor(private readonly logger: Logger) {}

	/**
	 * Calculate diff between two workflow versions
	 * @param oldWorkflow Old workflow version
	 * @param newWorkflow New workflow version
	 */
	calculateDiff(oldWorkflow: SerializedWorkflow, newWorkflow: SerializedWorkflow): WorkflowDiff {
		this.logger.debug('Calculating workflow diff', {
			workflowId: newWorkflow.id,
			oldVersion: oldWorkflow.updatedAt,
			newVersion: newWorkflow.updatedAt,
		});

		// Calculate node changes
		const { addedNodes, removedNodes, modifiedNodes } = this.calculateNodeChanges(
			oldWorkflow.nodes,
			newWorkflow.nodes,
		);

		// Calculate connection changes
		const connectionChanges = this.calculateConnectionChanges(
			oldWorkflow.connections,
			newWorkflow.connections,
		);

		// Calculate settings changes
		const settingsChanges = this.calculateSettingsChanges(
			oldWorkflow.settings || {},
			newWorkflow.settings || {},
		);

		// Create summary
		const summary = {
			totalChanges:
				addedNodes.length +
				removedNodes.length +
				modifiedNodes.length +
				connectionChanges.length +
				settingsChanges.length,
			nodesAdded: addedNodes.length,
			nodesRemoved: removedNodes.length,
			nodesModified: modifiedNodes.length,
			connectionsChanged: connectionChanges.length,
		};

		const diff: WorkflowDiff = {
			workflowId: newWorkflow.id,
			workflowName: newWorkflow.name,
			addedNodes,
			removedNodes,
			modifiedNodes,
			connectionChanges,
			settingsChanges,
			summary,
		};

		this.logger.info('Workflow diff calculated', {
			workflowId: newWorkflow.id,
			summary,
		});

		return diff;
	}

	/**
	 * Calculate node changes between versions
	 * @param oldNodes Old nodes array
	 * @param newNodes New nodes array
	 */
	private calculateNodeChanges(
		oldNodes: any[],
		newNodes: any[],
	): {
		addedNodes: WorkflowNodeDiff[];
		removedNodes: WorkflowNodeDiff[];
		modifiedNodes: WorkflowNodeModification[];
	} {
		const addedNodes: WorkflowNodeDiff[] = [];
		const removedNodes: WorkflowNodeDiff[] = [];
		const modifiedNodes: WorkflowNodeModification[] = [];

		// Create maps for efficient lookup
		const oldNodesMap = new Map(oldNodes.map((node) => [node.id, node]));
		const newNodesMap = new Map(newNodes.map((node) => [node.id, node]));

		// Find added and modified nodes
		for (const newNode of newNodes) {
			const oldNode = oldNodesMap.get(newNode.id);

			if (!oldNode) {
				// Node was added
				addedNodes.push(this.nodeToNodeDiff(newNode));
			} else {
				// Check if node was modified
				const changes = this.findPropertyChanges(oldNode, newNode);
				if (changes.length > 0) {
					modifiedNodes.push({
						id: newNode.id,
						name: newNode.name,
						type: newNode.type,
						changes,
					});
				}
			}
		}

		// Find removed nodes
		for (const oldNode of oldNodes) {
			if (!newNodesMap.has(oldNode.id)) {
				removedNodes.push(this.nodeToNodeDiff(oldNode));
			}
		}

		return { addedNodes, removedNodes, modifiedNodes };
	}

	/**
	 * Calculate connection changes between versions
	 * @param oldConnections Old connections object
	 * @param newConnections New connections object
	 */
	private calculateConnectionChanges(oldConnections: any, newConnections: any): ConnectionDiff[] {
		const changes: ConnectionDiff[] = [];

		// Normalize connections to comparable format
		const oldConnectionsList = this.flattenConnections(oldConnections);
		const newConnectionsList = this.flattenConnections(newConnections);

		// Find added connections
		for (const newConn of newConnectionsList) {
			if (!this.connectionExists(newConn, oldConnectionsList)) {
				changes.push({
					sourceNode: newConn.source,
					targetNode: newConn.target,
					type: newConn.type,
					changeType: 'added',
				});
			}
		}

		// Find removed connections
		for (const oldConn of oldConnectionsList) {
			if (!this.connectionExists(oldConn, newConnectionsList)) {
				changes.push({
					sourceNode: oldConn.source,
					targetNode: oldConn.target,
					type: oldConn.type,
					changeType: 'removed',
				});
			}
		}

		return changes;
	}

	/**
	 * Calculate settings changes between versions
	 * @param oldSettings Old settings object
	 * @param newSettings New settings object
	 */
	private calculateSettingsChanges(oldSettings: any, newSettings: any): SettingsDiff[] {
		const changes: SettingsDiff[] = [];

		// Get all unique keys
		const allKeys = new Set([...Object.keys(oldSettings), ...Object.keys(newSettings)]);

		for (const key of allKeys) {
			const oldValue = oldSettings[key];
			const newValue = newSettings[key];

			if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
				changes.push({
					key,
					oldValue,
					newValue,
				});
			}
		}

		return changes;
	}

	/**
	 * Find property changes in a node
	 * @param oldNode Old node
	 * @param newNode New node
	 */
	private findPropertyChanges(oldNode: any, newNode: any): PropertyChange[] {
		const changes: PropertyChange[] = [];

		// Check name
		if (oldNode.name !== newNode.name) {
			changes.push({
				path: 'name',
				oldValue: oldNode.name,
				newValue: newNode.name,
				changeType: 'modified',
			});
		}

		// Check position
		if (JSON.stringify(oldNode.position) !== JSON.stringify(newNode.position)) {
			changes.push({
				path: 'position',
				oldValue: oldNode.position,
				newValue: newNode.position,
				changeType: 'modified',
			});
		}

		// Check parameters recursively
		const parameterChanges = this.compareObjects(
			oldNode.parameters || {},
			newNode.parameters || {},
			'parameters',
		);
		changes.push(...parameterChanges);

		// Check credentials
		if (JSON.stringify(oldNode.credentials) !== JSON.stringify(newNode.credentials)) {
			changes.push({
				path: 'credentials',
				oldValue: oldNode.credentials,
				newValue: newNode.credentials,
				changeType: 'modified',
			});
		}

		return changes;
	}

	/**
	 * Recursively compare objects and find differences
	 * @param oldObj Old object
	 * @param newObj New object
	 * @param basePath Base path for property names
	 */
	private compareObjects(oldObj: any, newObj: any, basePath: string): PropertyChange[] {
		const changes: PropertyChange[] = [];

		// Get all unique keys
		const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);

		for (const key of allKeys) {
			const path = `${basePath}.${key}`;
			const oldValue = oldObj?.[key];
			const newValue = newObj?.[key];

			if (oldValue === undefined && newValue !== undefined) {
				changes.push({
					path,
					oldValue,
					newValue,
					changeType: 'added',
				});
			} else if (oldValue !== undefined && newValue === undefined) {
				changes.push({
					path,
					oldValue,
					newValue,
					changeType: 'removed',
				});
			} else if (typeof oldValue === 'object' && typeof newValue === 'object') {
				// Recursively compare nested objects
				const nestedChanges = this.compareObjects(oldValue, newValue, path);
				changes.push(...nestedChanges);
			} else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
				changes.push({
					path,
					oldValue,
					newValue,
					changeType: 'modified',
				});
			}
		}

		return changes;
	}

	/**
	 * Convert node to NodeDiff format
	 * @param node Node object
	 */
	private nodeToNodeDiff(node: any): WorkflowNodeDiff {
		return {
			id: node.id,
			name: node.name,
			type: node.type,
			position: node.position,
			parameters: node.parameters,
		};
	}

	/**
	 * Flatten connections object to list
	 * @param connections Connections object
	 */
	private flattenConnections(
		connections: any,
	): Array<{ source: string; target: string; type: string }> {
		const list: Array<{ source: string; target: string; type: string }> = [];

		for (const sourceNode in connections) {
			for (const connectionType in connections[sourceNode]) {
				const connectionsList = connections[sourceNode][connectionType];
				for (const connection of connectionsList) {
					for (const target of connection) {
						list.push({
							source: sourceNode,
							target: target.node,
							type: connectionType,
						});
					}
				}
			}
		}

		return list;
	}

	/**
	 * Check if connection exists in list
	 * @param connection Connection to check
	 * @param list List of connections
	 */
	private connectionExists(
		connection: { source: string; target: string; type: string },
		list: Array<{ source: string; target: string; type: string }>,
	): boolean {
		return list.some(
			(c) =>
				c.source === connection.source &&
				c.target === connection.target &&
				c.type === connection.type,
		);
	}

	/**
	 * Generate human-readable diff summary
	 * @param diff Workflow diff
	 */
	generateDiffSummary(diff: WorkflowDiff): string {
		const lines: string[] = [];

		lines.push(`Workflow: ${diff.workflowName} (${diff.workflowId})`);
		lines.push(`Total Changes: ${diff.summary.totalChanges}`);
		lines.push('');

		if (diff.addedNodes.length > 0) {
			lines.push('Added Nodes:');
			for (const node of diff.addedNodes) {
				lines.push(`  + ${node.name} (${node.type})`);
			}
			lines.push('');
		}

		if (diff.removedNodes.length > 0) {
			lines.push('Removed Nodes:');
			for (const node of diff.removedNodes) {
				lines.push(`  - ${node.name} (${node.type})`);
			}
			lines.push('');
		}

		if (diff.modifiedNodes.length > 0) {
			lines.push('Modified Nodes:');
			for (const node of diff.modifiedNodes) {
				lines.push(`  ~ ${node.name} (${node.type})`);
				for (const change of node.changes) {
					lines.push(
						`      ${change.path}: ${JSON.stringify(change.oldValue)} → ${JSON.stringify(change.newValue)}`,
					);
				}
			}
			lines.push('');
		}

		if (diff.connectionChanges.length > 0) {
			lines.push('Connection Changes:');
			for (const change of diff.connectionChanges) {
				const symbol = change.changeType === 'added' ? '+' : '-';
				lines.push(`  ${symbol} ${change.sourceNode} → ${change.targetNode} (${change.type})`);
			}
			lines.push('');
		}

		if (diff.settingsChanges.length > 0) {
			lines.push('Settings Changes:');
			for (const change of diff.settingsChanges) {
				lines.push(
					`  ~ ${change.key}: ${JSON.stringify(change.oldValue)} → ${JSON.stringify(change.newValue)}`,
				);
			}
		}

		return lines.join('\n');
	}

	/**
	 * Generate visual diff (colored output for terminal)
	 * @param diff Workflow diff
	 */
	generateVisualDiff(diff: WorkflowDiff): string {
		const colors = {
			reset: '\x1b[0m',
			green: '\x1b[32m',
			red: '\x1b[31m',
			yellow: '\x1b[33m',
			cyan: '\x1b[36m',
		};

		const lines: string[] = [];

		lines.push(`${colors.cyan}Workflow: ${diff.workflowName} (${diff.workflowId})${colors.reset}`);
		lines.push(`Total Changes: ${diff.summary.totalChanges}`);
		lines.push('');

		if (diff.addedNodes.length > 0) {
			lines.push(`${colors.green}Added Nodes:${colors.reset}`);
			for (const node of diff.addedNodes) {
				lines.push(`${colors.green}  + ${node.name} (${node.type})${colors.reset}`);
			}
			lines.push('');
		}

		if (diff.removedNodes.length > 0) {
			lines.push(`${colors.red}Removed Nodes:${colors.reset}`);
			for (const node of diff.removedNodes) {
				lines.push(`${colors.red}  - ${node.name} (${node.type})${colors.reset}`);
			}
			lines.push('');
		}

		if (diff.modifiedNodes.length > 0) {
			lines.push(`${colors.yellow}Modified Nodes:${colors.reset}`);
			for (const node of diff.modifiedNodes) {
				lines.push(`${colors.yellow}  ~ ${node.name} (${node.type})${colors.reset}`);
			}
			lines.push('');
		}

		return lines.join('\n');
	}
}
