import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { Service } from '@n8n/di';
import { ExecutionRepository, WorkflowRepository } from '@n8n/db';
import type { IExecutionResponse } from '@n8n/db';
import type { IRunExecutionData, IWorkflowBase, IWorkflowExecutionDataProcess } from 'n8n-workflow';
import { Workflow, WorkflowOperationError } from 'n8n-workflow';
import { NodeTypes } from '@/node-types';
import { WorkflowRunner } from '@/workflow-runner';
import { ActiveExecutions } from '@/active-executions';

export interface ReplayOptions {
	executionId: string;
	modifyInputs?: Record<string, any>;
	skipNodes?: string[];
	startFromNode?: string;
	loadCurrentWorkflow?: boolean;
}

export interface ReplayResult {
	originalExecutionId: string;
	replayExecutionId: string;
	status: string;
	startedAt: Date;
	stoppedAt?: Date;
	finished: boolean;
	data?: IRunExecutionData;
}

/**
 * Execution Replay Service
 *
 * Replays past executions for debugging and testing purposes.
 * Allows modification of inputs and selective node execution.
 */
@Service()
export class ExecutionReplay {
	constructor(
		private readonly logger: Logger,
		private readonly globalConfig: GlobalConfig,
		private readonly executionRepository: ExecutionRepository,
		private readonly workflowRepository: WorkflowRepository,
		private readonly nodeTypes: NodeTypes,
		private readonly workflowRunner: WorkflowRunner,
		private readonly activeExecutions: ActiveExecutions,
	) {
		this.logger.info('[ExecutionReplay] Initialized', {
			module: 'ExecutionReplay',
		});
	}

	/**
	 * Replay an execution with optional modifications
	 */
	async replayExecution(options: ReplayOptions): Promise<ReplayResult> {
		const startTime = Date.now();
		this.logger.debug('[ExecutionReplay] Starting execution replay', {
			module: 'ExecutionReplay',
			function: 'replayExecution',
			executionId: options.executionId,
			options,
		});

		try {
			// Fetch original execution
			const execution = await this.executionRepository.findOne({
				where: { id: options.executionId },
				relations: ['executionData'],
			});

			if (!execution) {
				throw new WorkflowOperationError(`Execution with ID "${options.executionId}" not found`);
			}

			if (!execution.executionData) {
				throw new WorkflowOperationError(`Execution data for "${options.executionId}" not found`);
			}

			this.logger.debug('[ExecutionReplay] Original execution loaded', {
				module: 'ExecutionReplay',
				function: 'replayExecution',
				executionId: options.executionId,
				workflowId: execution.workflowId,
			});

			// Load workflow
			let workflowData: IWorkflowBase;
			if (options.loadCurrentWorkflow) {
				const workflow = await this.workflowRepository.findOneBy({
					id: execution.workflowId,
				});
				if (!workflow) {
					throw new WorkflowOperationError(`Workflow with ID "${execution.workflowId}" not found`);
				}
				workflowData = workflow as IWorkflowBase;
			} else {
				workflowData = (execution as IExecutionResponse).workflowData;
			}

			// Prepare execution data
			let executionData: IRunExecutionData = deepCopy(execution.executionData.data);

			// Apply modifications
			if (options.modifyInputs) {
				executionData = this.applyInputModifications(executionData, options.modifyInputs);
			}

			if (options.skipNodes && options.skipNodes.length > 0) {
				executionData = this.applyNodeSkips(executionData, options.skipNodes);
			}

			if (options.startFromNode) {
				executionData = this.setStartNode(executionData, options.startFromNode, workflowData);
			}

			// Prepare workflow execution data
			const data: IWorkflowExecutionDataProcess = {
				executionMode: 'manual',
				executionData,
				workflowData,
				userId: '1', // System user for replay
			};

			this.logger.debug('[ExecutionReplay] Starting replay execution', {
				module: 'ExecutionReplay',
				function: 'replayExecution',
				originalExecutionId: options.executionId,
				workflowId: execution.workflowId,
			});

			// Execute the workflow
			const replayExecutionId = await this.workflowRunner.run(data);

			// Wait for execution to complete
			const executionResult = await this.activeExecutions.getPostExecutePromise(replayExecutionId);

			if (!executionResult) {
				throw new WorkflowOperationError('Replay execution did not start');
			}

			const result: ReplayResult = {
				originalExecutionId: options.executionId,
				replayExecutionId,
				status: executionResult.status,
				startedAt: executionResult.startedAt,
				stoppedAt: executionResult.stoppedAt,
				finished: executionResult.finished ?? false,
				data: executionResult.data,
			};

			this.logger.info('[ExecutionReplay] Execution replay completed', {
				module: 'ExecutionReplay',
				function: 'replayExecution',
				originalExecutionId: options.executionId,
				replayExecutionId,
				status: result.status,
				finished: result.finished,
				duration: Date.now() - startTime,
			});

			return result;
		} catch (error) {
			this.logger.error('[ExecutionReplay] Failed to replay execution', {
				module: 'ExecutionReplay',
				function: 'replayExecution',
				executionId: options.executionId,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Apply input modifications to execution data
	 */
	private applyInputModifications(
		executionData: IRunExecutionData,
		modifications: Record<string, any>,
	): IRunExecutionData {
		const startTime = Date.now();
		this.logger.debug('[ExecutionReplay] Applying input modifications', {
			module: 'ExecutionReplay',
			function: 'applyInputModifications',
			modifications,
		});

		try {
			const modifiedData = deepCopy(executionData);

			// Apply modifications to run data
			for (const [nodeName, nodeData] of Object.entries(modifications)) {
				if (modifiedData.resultData.runData[nodeName]) {
					// Merge modified data
					modifiedData.resultData.runData[nodeName] = nodeData;
				}
			}

			this.logger.info('[ExecutionReplay] Input modifications applied', {
				module: 'ExecutionReplay',
				function: 'applyInputModifications',
				modificationCount: Object.keys(modifications).length,
				duration: Date.now() - startTime,
			});

			return modifiedData;
		} catch (error) {
			this.logger.error('[ExecutionReplay] Failed to apply input modifications', {
				module: 'ExecutionReplay',
				function: 'applyInputModifications',
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Skip specified nodes in execution
	 */
	private applyNodeSkips(executionData: IRunExecutionData, skipNodes: string[]): IRunExecutionData {
		const startTime = Date.now();
		this.logger.debug('[ExecutionReplay] Applying node skips', {
			module: 'ExecutionReplay',
			function: 'applyNodeSkips',
			skipNodes,
		});

		try {
			const modifiedData = deepCopy(executionData);

			// Remove skipped nodes from execution stack
			if (modifiedData.executionData?.nodeExecutionStack) {
				modifiedData.executionData.nodeExecutionStack =
					modifiedData.executionData.nodeExecutionStack.filter(
						(stack: any) => !skipNodes.includes(stack.node.name),
					);
			}

			this.logger.info('[ExecutionReplay] Node skips applied', {
				module: 'ExecutionReplay',
				function: 'applyNodeSkips',
				skipCount: skipNodes.length,
				duration: Date.now() - startTime,
			});

			return modifiedData;
		} catch (error) {
			this.logger.error('[ExecutionReplay] Failed to apply node skips', {
				module: 'ExecutionReplay',
				function: 'applyNodeSkips',
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Set starting node for execution
	 */
	private setStartNode(
		executionData: IRunExecutionData,
		startNode: string,
		workflowData: IWorkflowBase,
	): IRunExecutionData {
		const startTime = Date.now();
		this.logger.debug('[ExecutionReplay] Setting start node', {
			module: 'ExecutionReplay',
			function: 'setStartNode',
			startNode,
		});

		try {
			const modifiedData = deepCopy(executionData);

			// Find the node in workflow
			const workflow = new Workflow({
				id: workflowData.id,
				name: workflowData.name,
				nodes: workflowData.nodes,
				connections: workflowData.connections,
				active: false,
				nodeTypes: this.nodeTypes,
				staticData: undefined,
				settings: workflowData.settings,
			});

			const node = workflow.getNode(startNode);
			if (!node) {
				throw new WorkflowOperationError(`Node "${startNode}" not found in workflow`);
			}

			// Update start data
			modifiedData.startData = {
				destinationNode: startNode,
				runNodeFilter: [startNode],
			};

			this.logger.info('[ExecutionReplay] Start node set', {
				module: 'ExecutionReplay',
				function: 'setStartNode',
				startNode,
				duration: Date.now() - startTime,
			});

			return modifiedData;
		} catch (error) {
			this.logger.error('[ExecutionReplay] Failed to set start node', {
				module: 'ExecutionReplay',
				function: 'setStartNode',
				startNode,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Compare two executions to identify differences
	 */
	async compareExecutions(
		executionId1: string,
		executionId2: string,
	): Promise<Record<string, any>> {
		const startTime = Date.now();
		this.logger.debug('[ExecutionReplay] Comparing executions', {
			module: 'ExecutionReplay',
			function: 'compareExecutions',
			executionId1,
			executionId2,
		});

		try {
			const [execution1, execution2] = await Promise.all([
				this.executionRepository.findOne({
					where: { id: executionId1 },
					relations: ['executionData'],
				}),
				this.executionRepository.findOne({
					where: { id: executionId2 },
					relations: ['executionData'],
				}),
			]);

			if (!execution1 || !execution2) {
				throw new WorkflowOperationError('One or both executions not found');
			}

			const comparison = {
				status: {
					execution1: execution1.status,
					execution2: execution2.status,
					match: execution1.status === execution2.status,
				},
				duration: {
					execution1: this.calculateDuration(execution1),
					execution2: this.calculateDuration(execution2),
				},
				finished: {
					execution1: execution1.finished,
					execution2: execution2.finished,
					match: execution1.finished === execution2.finished,
				},
			};

			this.logger.info('[ExecutionReplay] Executions compared', {
				module: 'ExecutionReplay',
				function: 'compareExecutions',
				executionId1,
				executionId2,
				comparison,
				duration: Date.now() - startTime,
			});

			return comparison;
		} catch (error) {
			this.logger.error('[ExecutionReplay] Failed to compare executions', {
				module: 'ExecutionReplay',
				function: 'compareExecutions',
				executionId1,
				executionId2,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Calculate execution duration
	 */
	private calculateDuration(execution: any): number | null {
		if (!execution.startedAt || !execution.stoppedAt) {
			return null;
		}
		return new Date(execution.stoppedAt).getTime() - new Date(execution.startedAt).getTime();
	}
}
