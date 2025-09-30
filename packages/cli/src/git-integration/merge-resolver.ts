import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';

import type {
	SerializedWorkflow,
	MergeConflict,
	NodeConflict,
	ConnectionConflict,
	ConflictResolution,
	ResolvedConflict,
} from './types';

/**
 * Workflow merge conflict resolver
 * Handles three-way merge of workflows with conflict resolution
 */
@Service()
export class MergeResolver {
	constructor(private readonly logger: Logger) {}

	/**
	 * Detect merge conflicts between workflow versions
	 * @param baseWorkflow Base version (common ancestor)
	 * @param currentWorkflow Current version
	 * @param incomingWorkflow Incoming version
	 */
	detectConflicts(
		baseWorkflow: SerializedWorkflow,
		currentWorkflow: SerializedWorkflow,
		incomingWorkflow: SerializedWorkflow,
	): MergeConflict | null {
		this.logger.info('Detecting merge conflicts', {
			workflowId: currentWorkflow.id,
			workflowName: currentWorkflow.name,
		});

		const nodeConflicts = this.detectNodeConflicts(
			baseWorkflow.nodes,
			currentWorkflow.nodes,
			incomingWorkflow.nodes,
		);

		const connectionConflicts = this.detectConnectionConflicts(
			baseWorkflow.connections,
			currentWorkflow.connections,
			incomingWorkflow.connections,
		);

		if (nodeConflicts.length === 0 && connectionConflicts.length === 0) {
			this.logger.info('No conflicts detected');
			return null;
		}

		const conflict: MergeConflict = {
			workflowId: currentWorkflow.id,
			workflowName: currentWorkflow.name,
			conflictingNodes: nodeConflicts,
			conflictingConnections: connectionConflicts,
			baseVersion: baseWorkflow,
			currentVersion: currentWorkflow,
			incomingVersion: incomingWorkflow,
		};

		this.logger.warn('Merge conflicts detected', {
			nodeConflicts: nodeConflicts.length,
			connectionConflicts: connectionConflicts.length,
		});

		return conflict;
	}

	/**
	 * Automatically resolve conflicts using strategy
	 * @param conflict Merge conflict
	 * @param strategy Resolution strategy
	 */
	resolveConflicts(conflict: MergeConflict, strategy: ConflictResolution): ResolvedConflict {
		this.logger.info('Resolving conflicts', {
			workflowId: conflict.workflowId,
			strategy,
		});

		let resolvedWorkflow: SerializedWorkflow;

		switch (strategy) {
			case 'current':
				resolvedWorkflow = this.resolveWithCurrent(conflict);
				break;
			case 'incoming':
				resolvedWorkflow = this.resolveWithIncoming(conflict);
				break;
			case 'manual':
				throw new Error('Manual conflict resolution requires user interaction');
			default:
				throw new Error(`Unknown conflict resolution strategy: ${String(strategy)}`);
		}

		return {
			workflowId: conflict.workflowId,
			resolution: strategy,
			resolvedWorkflow,
		};
	}

	/**
	 * Perform three-way merge of workflows
	 * @param baseWorkflow Base version
	 * @param currentWorkflow Current version
	 * @param incomingWorkflow Incoming version
	 */
	threeWayMerge(
		baseWorkflow: SerializedWorkflow,
		currentWorkflow: SerializedWorkflow,
		incomingWorkflow: SerializedWorkflow,
	): SerializedWorkflow | MergeConflict {
		this.logger.info('Performing three-way merge', {
			workflowId: currentWorkflow.id,
		});

		// Detect conflicts first
		const conflict = this.detectConflicts(baseWorkflow, currentWorkflow, incomingWorkflow);

		if (conflict) {
			return conflict;
		}

		// No conflicts - perform automatic merge
		return this.autoMerge(baseWorkflow, currentWorkflow, incomingWorkflow);
	}

	/**
	 * Automatically merge workflows without conflicts
	 * @param baseWorkflow Base version
	 * @param currentWorkflow Current version
	 * @param incomingWorkflow Incoming version
	 */
	private autoMerge(
		baseWorkflow: SerializedWorkflow,
		currentWorkflow: SerializedWorkflow,
		incomingWorkflow: SerializedWorkflow,
	): SerializedWorkflow {
		// Start with current workflow as base
		const merged: SerializedWorkflow = {
			...currentWorkflow,
			updatedAt: new Date().toISOString(),
		};

		// Merge nodes
		merged.nodes = this.mergeNodes(
			baseWorkflow.nodes,
			currentWorkflow.nodes,
			incomingWorkflow.nodes,
		);

		// Merge connections
		merged.connections = this.mergeConnections(
			baseWorkflow.connections,
			currentWorkflow.connections,
			incomingWorkflow.connections,
		);

		// Merge settings
		merged.settings = this.mergeSettings(
			baseWorkflow.settings || {},
			currentWorkflow.settings || {},
			incomingWorkflow.settings || {},
		);

		// Use incoming workflow name if changed
		if (incomingWorkflow.name !== baseWorkflow.name) {
			merged.name = incomingWorkflow.name;
		}

		// Use incoming active status if changed
		if (incomingWorkflow.active !== baseWorkflow.active) {
			merged.active = incomingWorkflow.active;
		}

		this.logger.info('Auto-merge completed successfully');

		return merged;
	}

	/**
	 * Detect node conflicts
	 */
	private detectNodeConflicts(
		baseNodes: any[],
		currentNodes: any[],
		incomingNodes: any[],
	): NodeConflict[] {
		const conflicts: NodeConflict[] = [];

		const baseNodeMap = new Map(baseNodes.map((n) => [n.id, n]));
		const currentNodeMap = new Map(currentNodes.map((n) => [n.id, n]));
		const incomingNodeMap = new Map(incomingNodes.map((n) => [n.id, n]));

		// Check all nodes that exist in current or incoming
		const allNodeIds = new Set([...currentNodeMap.keys(), ...incomingNodeMap.keys()]);

		for (const nodeId of allNodeIds) {
			const baseNode = baseNodeMap.get(nodeId);
			const currentNode = currentNodeMap.get(nodeId);
			const incomingNode = incomingNodeMap.get(nodeId);

			// Both modified the same node
			if (baseNode && currentNode && incomingNode) {
				const currentChanged = JSON.stringify(currentNode) !== JSON.stringify(baseNode);
				const incomingChanged = JSON.stringify(incomingNode) !== JSON.stringify(baseNode);

				if (
					currentChanged &&
					incomingChanged &&
					JSON.stringify(currentNode) !== JSON.stringify(incomingNode)
				) {
					conflicts.push({
						nodeId,
						current: this.nodeToNodeDiff(currentNode),
						incoming: this.nodeToNodeDiff(incomingNode),
						base: this.nodeToNodeDiff(baseNode),
						conflictType: 'both-modified',
					});
				}
			}
			// Node deleted in current but modified in incoming
			else if (baseNode && !currentNode && incomingNode) {
				if (JSON.stringify(incomingNode) !== JSON.stringify(baseNode)) {
					conflicts.push({
						nodeId,
						current: this.nodeToNodeDiff(baseNode), // Show what was deleted
						incoming: this.nodeToNodeDiff(incomingNode),
						base: this.nodeToNodeDiff(baseNode),
						conflictType: 'deleted-modified',
					});
				}
			}
			// Node deleted in incoming but modified in current
			else if (baseNode && currentNode && !incomingNode) {
				if (JSON.stringify(currentNode) !== JSON.stringify(baseNode)) {
					conflicts.push({
						nodeId,
						current: this.nodeToNodeDiff(currentNode),
						incoming: this.nodeToNodeDiff(baseNode), // Show what was deleted
						base: this.nodeToNodeDiff(baseNode),
						conflictType: 'deleted-modified',
					});
				}
			}
			// Same node added in both (different content)
			else if (!baseNode && currentNode && incomingNode) {
				if (JSON.stringify(currentNode) !== JSON.stringify(incomingNode)) {
					conflicts.push({
						nodeId,
						current: this.nodeToNodeDiff(currentNode),
						incoming: this.nodeToNodeDiff(incomingNode),
						conflictType: 'added-added',
					});
				}
			}
		}

		return conflicts;
	}

	/**
	 * Detect connection conflicts
	 */
	private detectConnectionConflicts(
		baseConnections: any,
		currentConnections: any,
		incomingConnections: any,
	): ConnectionConflict[] {
		const conflicts: ConnectionConflict[] = [];

		// Flatten connections for easier comparison
		const baseFlat = this.flattenConnections(baseConnections);
		const currentFlat = this.flattenConnections(currentConnections);
		const incomingFlat = this.flattenConnections(incomingConnections);

		// Find all unique connections
		const allConnections = new Set([
			...baseFlat.map(this.connectionKey),
			...currentFlat.map(this.connectionKey),
			...incomingFlat.map(this.connectionKey),
		]);

		for (const connKey of allConnections) {
			const inBase = baseFlat.some((c) => this.connectionKey(c) === connKey);
			const inCurrent = currentFlat.some((c) => this.connectionKey(c) === connKey);
			const inIncoming = incomingFlat.some((c) => this.connectionKey(c) === connKey);

			// Connection exists in current but not incoming, and was in base
			// OR connection exists in incoming but not current, and was in base
			if (inBase && inCurrent !== inIncoming) {
				const [source, target] = connKey.split('->');
				conflicts.push({
					sourceNode: source,
					targetNode: target,
					currentExists: inCurrent,
					incomingExists: inIncoming,
				});
			}
		}

		return conflicts;
	}

	/**
	 * Merge nodes without conflicts
	 */
	private mergeNodes(baseNodes: any[], currentNodes: any[], incomingNodes: any[]): any[] {
		const baseNodeMap = new Map(baseNodes.map((n) => [n.id, n]));
		const currentNodeMap = new Map(currentNodes.map((n) => [n.id, n]));
		const incomingNodeMap = new Map(incomingNodes.map((n) => [n.id, n]));

		const mergedNodes: any[] = [];
		const processedIds = new Set<string>();

		// Process current nodes
		for (const currentNode of currentNodes) {
			const baseNode = baseNodeMap.get(currentNode.id);
			const incomingNode = incomingNodeMap.get(currentNode.id);

			if (!incomingNode) {
				// Node only in current (added or kept)
				mergedNodes.push(currentNode);
			} else if (JSON.stringify(currentNode) === JSON.stringify(baseNode)) {
				// Current unchanged, use incoming
				mergedNodes.push(incomingNode);
			} else {
				// Current changed, use current
				mergedNodes.push(currentNode);
			}

			processedIds.add(String(currentNode.id));
		}

		// Add incoming nodes not yet processed (newly added in incoming)
		for (const incomingNode of incomingNodes) {
			if (!processedIds.has(String(incomingNode.id))) {
				mergedNodes.push(incomingNode);
			}
		}

		return mergedNodes;
	}

	/**
	 * Merge connections without conflicts
	 */
	private mergeConnections(
		baseConnections: any,
		currentConnections: any,
		incomingConnections: any,
	): any {
		// Start with current connections
		const merged = { ...currentConnections };

		// Add incoming connections that don't exist in current
		for (const sourceNode in incomingConnections) {
			if (!merged[sourceNode]) {
				merged[sourceNode] = incomingConnections[sourceNode];
			} else {
				for (const connectionType in incomingConnections[sourceNode]) {
					if (!merged[sourceNode][connectionType]) {
						merged[sourceNode][connectionType] = incomingConnections[sourceNode][connectionType];
					}
				}
			}
		}

		return merged;
	}

	/**
	 * Merge settings without conflicts
	 */
	private mergeSettings(baseSettings: any, currentSettings: any, incomingSettings: any): any {
		const merged = { ...currentSettings };

		// Add or update settings from incoming
		for (const key in incomingSettings) {
			if (currentSettings[key] === baseSettings[key]) {
				// Current unchanged, use incoming
				merged[key] = incomingSettings[key];
			}
			// Otherwise keep current
		}

		return merged;
	}

	/**
	 * Resolve with current version (keep current changes)
	 */
	private resolveWithCurrent(conflict: MergeConflict): SerializedWorkflow {
		this.logger.info('Resolving with current version');
		return {
			...conflict.currentVersion,
			updatedAt: new Date().toISOString(),
		};
	}

	/**
	 * Resolve with incoming version (accept incoming changes)
	 */
	private resolveWithIncoming(conflict: MergeConflict): SerializedWorkflow {
		this.logger.info('Resolving with incoming version');
		return {
			...conflict.incomingVersion,
			updatedAt: new Date().toISOString(),
		};
	}

	/**
	 * Helper: Convert node to NodeDiff format
	 */
	private nodeToNodeDiff(node: any): any {
		return {
			id: node.id,
			name: node.name,
			type: node.type,
			position: node.position,
			parameters: node.parameters,
		};
	}

	/**
	 * Helper: Flatten connections to simple array
	 */
	private flattenConnections(connections: any): Array<{ source: string; target: string }> {
		const list: Array<{ source: string; target: string }> = [];

		for (const sourceNode in connections) {
			for (const connectionType in connections[sourceNode]) {
				const connectionsList = connections[sourceNode][connectionType];
				for (const connection of connectionsList) {
					for (const target of connection) {
						list.push({
							source: sourceNode,
							target: target.node,
						});
					}
				}
			}
		}

		return list;
	}

	/**
	 * Helper: Generate connection key for comparison
	 */
	private connectionKey(connection: { source: string; target: string }): string {
		return `${connection.source}->${connection.target}`;
	}

	/**
	 * Generate conflict report for user
	 */
	generateConflictReport(conflict: MergeConflict): string {
		const lines: string[] = [];

		lines.push('Merge Conflict Report');
		lines.push(`Workflow: ${conflict.workflowName} (${conflict.workflowId})`);
		lines.push('='.repeat(60));
		lines.push('');

		if (conflict.conflictingNodes.length > 0) {
			lines.push(`Node Conflicts (${conflict.conflictingNodes.length}):`);
			for (const nodeConflict of conflict.conflictingNodes) {
				lines.push(`  Node: ${nodeConflict.nodeId} - Type: ${nodeConflict.conflictType}`);
				lines.push(`    Current: ${JSON.stringify(nodeConflict.current.name)}`);
				lines.push(`    Incoming: ${JSON.stringify(nodeConflict.incoming.name)}`);
			}
			lines.push('');
		}

		if (conflict.conflictingConnections.length > 0) {
			lines.push(`Connection Conflicts (${conflict.conflictingConnections.length}):`);
			for (const connConflict of conflict.conflictingConnections) {
				lines.push(`  ${connConflict.sourceNode} -> ${connConflict.targetNode}`);
				lines.push(`    Current: ${connConflict.currentExists ? 'exists' : 'deleted'}`);
				lines.push(`    Incoming: ${connConflict.incomingExists ? 'exists' : 'deleted'}`);
			}
		}

		return lines.join('\n');
	}
}
