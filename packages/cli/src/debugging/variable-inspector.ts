import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { Service } from '@n8n/di';
import type { INodeExecutionData } from 'n8n-workflow';

export interface VariableSnapshot {
	nodeName: string;
	executionIndex: number;
	timestamp: Date;
	input: INodeExecutionData[];
	output: INodeExecutionData[];
	error?: any;
	metadata: Record<string, any>;
}

export interface InspectionResult {
	variables: Record<string, any>;
	dataStructure: Record<string, any>;
	statistics: {
		totalItems: number;
		totalSize: number;
		dataTypes: Record<string, number>;
	};
}

/**
 * Variable Inspector
 *
 * Inspects and analyzes variables at each workflow execution step.
 * Provides detailed data structure analysis and variable tracking.
 */
@Service()
export class VariableInspector {
	private snapshots: Map<string, VariableSnapshot[]> = new Map();

	constructor(
		private readonly logger: Logger,
		private readonly globalConfig: GlobalConfig,
	) {
		this.logger.info('[VariableInspector] Initialized', {
			module: 'VariableInspector',
		});
	}

	/**
	 * Capture variable snapshot at node execution
	 */
	captureSnapshot(
		executionId: string,
		nodeName: string,
		executionIndex: number,
		input: INodeExecutionData[],
		output: INodeExecutionData[],
		error?: any,
		metadata?: Record<string, any>,
	): void {
		const startTime = Date.now();
		this.logger.debug('[VariableInspector] Capturing snapshot', {
			module: 'VariableInspector',
			function: 'captureSnapshot',
			executionId,
			nodeName,
			executionIndex,
		});

		try {
			const snapshot: VariableSnapshot = {
				nodeName,
				executionIndex,
				timestamp: new Date(),
				input: deepCopy(input),
				output: deepCopy(output),
				error,
				metadata: metadata || {},
			};

			if (!this.snapshots.has(executionId)) {
				this.snapshots.set(executionId, []);
			}

			this.snapshots.get(executionId)!.push(snapshot);

			this.logger.info('[VariableInspector] Snapshot captured', {
				module: 'VariableInspector',
				function: 'captureSnapshot',
				executionId,
				nodeName,
				inputItems: input.length,
				outputItems: output.length,
				duration: Date.now() - startTime,
			});
		} catch (error) {
			this.logger.error('[VariableInspector] Failed to capture snapshot', {
				module: 'VariableInspector',
				function: 'captureSnapshot',
				executionId,
				nodeName,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Get snapshots for an execution
	 */
	getSnapshots(executionId: string): VariableSnapshot[] {
		const startTime = Date.now();
		this.logger.debug('[VariableInspector] Getting snapshots', {
			module: 'VariableInspector',
			function: 'getSnapshots',
			executionId,
		});

		const snapshots = this.snapshots.get(executionId) || [];

		this.logger.debug('[VariableInspector] Snapshots retrieved', {
			module: 'VariableInspector',
			function: 'getSnapshots',
			executionId,
			count: snapshots.length,
			duration: Date.now() - startTime,
		});

		return snapshots;
	}

	/**
	 * Get snapshot for specific node
	 */
	getNodeSnapshot(
		executionId: string,
		nodeName: string,
		executionIndex?: number,
	): VariableSnapshot | undefined {
		const startTime = Date.now();
		this.logger.debug('[VariableInspector] Getting node snapshot', {
			module: 'VariableInspector',
			function: 'getNodeSnapshot',
			executionId,
			nodeName,
			executionIndex,
		});

		const snapshots = this.snapshots.get(executionId) || [];
		const nodeSnapshots = snapshots.filter((s) => s.nodeName === nodeName);

		const snapshot =
			executionIndex !== undefined
				? nodeSnapshots.find((s) => s.executionIndex === executionIndex)
				: nodeSnapshots[nodeSnapshots.length - 1];

		this.logger.debug('[VariableInspector] Node snapshot retrieved', {
			module: 'VariableInspector',
			function: 'getNodeSnapshot',
			executionId,
			nodeName,
			found: !!snapshot,
			duration: Date.now() - startTime,
		});

		return snapshot;
	}

	/**
	 * Inspect variables in snapshot
	 */
	inspect(executionId: string, nodeName: string): InspectionResult {
		const startTime = Date.now();
		this.logger.debug('[VariableInspector] Inspecting variables', {
			module: 'VariableInspector',
			function: 'inspect',
			executionId,
			nodeName,
		});

		try {
			const snapshot = this.getNodeSnapshot(executionId, nodeName);
			if (!snapshot) {
				this.logger.warn('[VariableInspector] Snapshot not found', {
					module: 'VariableInspector',
					function: 'inspect',
					executionId,
					nodeName,
				});

				return {
					variables: {},
					dataStructure: {},
					statistics: {
						totalItems: 0,
						totalSize: 0,
						dataTypes: {},
					},
				};
			}

			const result: InspectionResult = {
				variables: this.extractVariables(snapshot),
				dataStructure: this.analyzeStructure(snapshot),
				statistics: this.calculateStatistics(snapshot),
			};

			this.logger.info('[VariableInspector] Variables inspected', {
				module: 'VariableInspector',
				function: 'inspect',
				executionId,
				nodeName,
				variableCount: Object.keys(result.variables).length,
				duration: Date.now() - startTime,
			});

			return result;
		} catch (error) {
			this.logger.error('[VariableInspector] Failed to inspect variables', {
				module: 'VariableInspector',
				function: 'inspect',
				executionId,
				nodeName,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Extract variables from snapshot
	 */
	private extractVariables(snapshot: VariableSnapshot): Record<string, any> {
		const variables: Record<string, any> = {};

		// Extract from output data
		snapshot.output.forEach((item, index) => {
			if (item.json) {
				Object.entries(item.json).forEach(([key, value]) => {
					variables[`output[${index}].${key}`] = value;
				});
			}
		});

		// Extract from metadata
		Object.entries(snapshot.metadata).forEach(([key, value]) => {
			variables[`metadata.${key}`] = value;
		});

		return variables;
	}

	/**
	 * Analyze data structure
	 */
	private analyzeStructure(snapshot: VariableSnapshot): Record<string, any> {
		const structure: Record<string, any> = {
			input: {
				itemCount: snapshot.input.length,
				schema: this.inferSchema(snapshot.input),
			},
			output: {
				itemCount: snapshot.output.length,
				schema: this.inferSchema(snapshot.output),
			},
		};

		return structure;
	}

	/**
	 * Infer schema from data items
	 */
	private inferSchema(items: INodeExecutionData[]): Record<string, string> {
		if (items.length === 0) return {};

		const schema: Record<string, string> = {};
		const firstItem = items[0];

		if (firstItem.json) {
			Object.entries(firstItem.json).forEach(([key, value]) => {
				schema[key] = typeof value;
			});
		}

		return schema;
	}

	/**
	 * Calculate statistics
	 */
	private calculateStatistics(snapshot: VariableSnapshot): InspectionResult['statistics'] {
		const stats = {
			totalItems: snapshot.output.length,
			totalSize: 0,
			dataTypes: {} as Record<string, number>,
		};

		snapshot.output.forEach((item) => {
			if (item.json) {
				const itemString = JSON.stringify(item.json);
				stats.totalSize += itemString.length;

				Object.values(item.json).forEach((value) => {
					const type = typeof value;
					stats.dataTypes[type] = (stats.dataTypes[type] || 0) + 1;
				});
			}
		});

		return stats;
	}

	/**
	 * Compare snapshots between two executions
	 */
	compareSnapshots(
		executionId1: string,
		executionId2: string,
		nodeName: string,
	): Record<string, any> {
		const startTime = Date.now();
		this.logger.debug('[VariableInspector] Comparing snapshots', {
			module: 'VariableInspector',
			function: 'compareSnapshots',
			executionId1,
			executionId2,
			nodeName,
		});

		try {
			const snapshot1 = this.getNodeSnapshot(executionId1, nodeName);
			const snapshot2 = this.getNodeSnapshot(executionId2, nodeName);

			if (!snapshot1 || !snapshot2) {
				this.logger.warn('[VariableInspector] One or both snapshots not found', {
					module: 'VariableInspector',
					function: 'compareSnapshots',
					executionId1,
					executionId2,
					nodeName,
				});

				return {
					error: 'One or both snapshots not found',
				};
			}

			const comparison = {
				inputItemsMatch: snapshot1.input.length === snapshot2.input.length,
				outputItemsMatch: snapshot1.output.length === snapshot2.output.length,
				differences: this.findDifferences(snapshot1.output, snapshot2.output),
			};

			this.logger.info('[VariableInspector] Snapshots compared', {
				module: 'VariableInspector',
				function: 'compareSnapshots',
				executionId1,
				executionId2,
				nodeName,
				differences: comparison.differences.length,
				duration: Date.now() - startTime,
			});

			return comparison;
		} catch (error) {
			this.logger.error('[VariableInspector] Failed to compare snapshots', {
				module: 'VariableInspector',
				function: 'compareSnapshots',
				executionId1,
				executionId2,
				nodeName,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Find differences between two data sets
	 */
	private findDifferences(data1: INodeExecutionData[], data2: INodeExecutionData[]): string[] {
		const differences: string[] = [];

		if (data1.length !== data2.length) {
			differences.push(`Item count differs: ${data1.length} vs ${data2.length}`);
		}

		const minLength = Math.min(data1.length, data2.length);
		for (let i = 0; i < minLength; i++) {
			const item1 = data1[i].json;
			const item2 = data2[i].json;

			if (JSON.stringify(item1) !== JSON.stringify(item2)) {
				differences.push(`Item ${i} differs`);
			}
		}

		return differences;
	}

	/**
	 * Clear snapshots for an execution
	 */
	clearSnapshots(executionId: string): void {
		const startTime = Date.now();
		this.logger.debug('[VariableInspector] Clearing snapshots', {
			module: 'VariableInspector',
			function: 'clearSnapshots',
			executionId,
		});

		try {
			this.snapshots.delete(executionId);

			this.logger.info('[VariableInspector] Snapshots cleared', {
				module: 'VariableInspector',
				function: 'clearSnapshots',
				executionId,
				duration: Date.now() - startTime,
			});
		} catch (error) {
			this.logger.error('[VariableInspector] Failed to clear snapshots', {
				module: 'VariableInspector',
				function: 'clearSnapshots',
				executionId,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Get memory usage of snapshots
	 */
	getMemoryUsage(): Record<string, any> {
		const startTime = Date.now();
		this.logger.debug('[VariableInspector] Calculating memory usage', {
			module: 'VariableInspector',
			function: 'getMemoryUsage',
		});

		try {
			let totalSize = 0;
			let totalSnapshots = 0;

			for (const [executionId, snapshots] of this.snapshots.entries()) {
				totalSnapshots += snapshots.length;
				const snapshotsString = JSON.stringify(snapshots);
				totalSize += snapshotsString.length;
			}

			const usage = {
				executionCount: this.snapshots.size,
				snapshotCount: totalSnapshots,
				estimatedSize: totalSize,
				estimatedSizeMB: (totalSize / 1024 / 1024).toFixed(2),
			};

			this.logger.info('[VariableInspector] Memory usage calculated', {
				module: 'VariableInspector',
				function: 'getMemoryUsage',
				usage,
				duration: Date.now() - startTime,
			});

			return usage;
		} catch (error) {
			this.logger.error('[VariableInspector] Failed to calculate memory usage', {
				module: 'VariableInspector',
				function: 'getMemoryUsage',
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}
}
