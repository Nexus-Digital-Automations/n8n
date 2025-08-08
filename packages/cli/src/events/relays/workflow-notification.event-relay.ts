import { Service } from '@n8n/di';
import { NotificationConfig } from '@n8n/config';
import { Logger } from '@n8n/backend-common';
import type { IRun, IWorkflowBase } from 'n8n-workflow';

import { EventService } from '../event.service';
import { NotificationService } from '@/services/notification.service';
import type { NotificationContext } from '@/services/notification.service';

/**
 * Event relay for workflow notifications
 * 
 * Listens to workflow execution events and triggers notifications
 * for failed workflows based on user notification settings.
 */
@Service()
export class WorkflowNotificationEventRelay {
	constructor(
		private readonly logger: Logger,
		private readonly notificationConfig: NotificationConfig,
		private readonly eventService: EventService,
		private readonly notificationService: NotificationService,
	) {
		if (this.notificationConfig.enabled) {
			this.setupEventListeners();
		}
	}

	/**
	 * Setup event listeners for workflow events
	 */
	private setupEventListeners(): void {
		// Listen for workflow execution completion
		this.eventService.on('workflow-post-execute', this.handleWorkflowPostExecute.bind(this));

		this.logger.info('Workflow notification event relay initialized');
	}

	/**
	 * Handle workflow post-execute event
	 */
	private async handleWorkflowPostExecute(event: {
		executionId: string;
		userId?: string;
		workflow: IWorkflowBase;
		runData?: IRun;
	}): Promise<void> {
		try {
			const { executionId, userId, workflow, runData } = event;

			// Only process failed executions
			if (!runData || !this.isExecutionFailed(runData)) {
				this.logger.debug('Execution not failed, skipping notification', {
					executionId,
					workflowId: workflow.id,
					status: runData?.status || 'unknown',
				});
				return;
			}

			this.logger.info('Processing workflow failure notification', {
				executionId,
				workflowId: workflow.id,
				workflowName: workflow.name,
				userId,
				status: runData.status,
			});

			// Extract error information
			const errorInfo = this.extractErrorInfo(runData);

			// Build notification context
			const notificationContext: NotificationContext = {
				workflowId: workflow.id,
				executionId,
				userId,
				errorMessage: errorInfo.message,
				failedNode: errorInfo.nodeName,
				retryCount: this.getRetryCount(runData),
			};

			// Send notification
			await this.notificationService.sendWorkflowFailureNotification(notificationContext);

		} catch (error) {
			this.logger.error('Failed to handle workflow post-execute event', {
				executionId: event.executionId,
				workflowId: event.workflow?.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Check if execution failed
	 */
	private isExecutionFailed(runData: IRun): boolean {
		// Check for error status
		if (runData.status === 'error') {
			return true;
		}

		// Check for crash status
		if (runData.status === 'crashed') {
			return true;
		}

		// Check for execution data errors
		if (runData.data?.resultData?.error) {
			return true;
		}

		// Check if finished successfully
		if (runData.finished === false && runData.status !== 'running' && runData.status !== 'waiting') {
			return true;
		}

		return false;
	}

	/**
	 * Extract error information from run data
	 */
	private extractErrorInfo(runData: IRun): {
		message?: string;
		nodeName?: string;
		nodeType?: string;
		stack?: string;
	} {
		const errorInfo: {
			message?: string;
			nodeName?: string;
			nodeType?: string;
			stack?: string;
		} = {};

		// Check main execution error
		const executionError = runData.data?.resultData?.error;
		if (executionError) {
			errorInfo.message = executionError.message || executionError.description || undefined;
			errorInfo.stack = executionError.stack;

			// Extract node information from error
			if ('node' in executionError && executionError.node) {
				errorInfo.nodeName = executionError.node.name;
				errorInfo.nodeType = executionError.node.type;
			}
		}

		// Check for last node executed if no specific error node found
		if (!errorInfo.nodeName && runData.data?.resultData?.lastNodeExecuted) {
			errorInfo.nodeName = runData.data.resultData.lastNodeExecuted;
		}

		// Check for node execution errors in run data
		if (!errorInfo.message && runData.data?.resultData?.runData) {
			const runDataNodes = runData.data.resultData.runData;
			
			// Find first node with error
			for (const [nodeName, nodeRunData] of Object.entries(runDataNodes)) {
				if (nodeRunData && nodeRunData.length > 0) {
					const lastRun = nodeRunData[nodeRunData.length - 1];
					if (lastRun?.error) {
						errorInfo.message = lastRun.error.message;
						errorInfo.nodeName = nodeName;
						errorInfo.stack = lastRun.error.stack;
						break;
					}
				}
			}
		}

		// Fallback error message
		if (!errorInfo.message) {
			errorInfo.message = `Workflow execution failed with status: ${runData.status || 'unknown'}`;
		}

		return errorInfo;
	}

	/**
	 * Get retry count from run data
	 */
	private getRetryCount(runData: IRun): number | undefined {
		// Check execution metadata for retry information
		if (runData.data?.executionData?.metadata?.retryOf) {
			// This is a retry execution - we could track the chain
			// For now, return 1 to indicate it's a retry
			return 1;
		}

		// Check if any nodes have retry information
		if (runData.data?.resultData?.runData) {
			const runDataNodes = runData.data.resultData.runData;
			
			for (const nodeRunData of Object.values(runDataNodes)) {
				if (nodeRunData && nodeRunData.length > 1) {
					// Multiple executions of the same node suggest retries
					return nodeRunData.length - 1;
				}
			}
		}

		return undefined;
	}

	/**
	 * Get additional context for notification
	 */
	private getExecutionContext(runData: IRun): Record<string, unknown> {
		const context: Record<string, unknown> = {
			status: runData.status,
			finished: runData.finished,
			startedAt: runData.startedAt,
			stoppedAt: runData.stoppedAt,
		};

		// Add execution mode if available
		if (runData.mode) {
			context.mode = runData.mode;
		}

		// Add duration if available
		if (runData.startedAt && runData.stoppedAt) {
			context.duration = new Date(runData.stoppedAt).getTime() - new Date(runData.startedAt).getTime();
		}

		// Add last node executed
		if (runData.data?.resultData?.lastNodeExecuted) {
			context.lastNodeExecuted = runData.data.resultData.lastNodeExecuted;
		}

		return context;
	}

	/**
	 * Shutdown the event relay
	 */
	shutdown(): void {
		if (this.notificationConfig.enabled) {
			this.eventService.removeAllListeners('workflow-post-execute');
			this.logger.info('Workflow notification event relay shut down');
		}
	}
}