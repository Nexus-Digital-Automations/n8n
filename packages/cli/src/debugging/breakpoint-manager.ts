import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { Service } from '@n8n/di';

export interface Breakpoint {
	id: string;
	workflowId: string;
	nodeName: string;
	condition?: string;
	enabled: boolean;
	hitCount: number;
	createdAt: Date;
	lastHit?: Date;
}

export interface BreakpointCondition {
	type: 'expression' | 'data_match' | 'error' | 'execution_count';
	value: string | number;
}

/**
 * Breakpoint Manager
 *
 * Manages breakpoints for workflow node debugging.
 * Supports conditional breakpoints and hit counting.
 */
@Service()
export class BreakpointManager {
	private breakpoints: Map<string, Breakpoint> = new Map();
	private breakpointCounter = 0;

	constructor(
		private readonly logger: Logger,
		private readonly globalConfig: GlobalConfig,
	) {
		this.logger.info('[BreakpointManager] Initialized', {
			module: 'BreakpointManager',
		});
	}

	/**
	 * Create a new breakpoint
	 */
	createBreakpoint(workflowId: string, nodeName: string, condition?: string): Breakpoint {
		const startTime = Date.now();
		this.logger.debug('[BreakpointManager] Creating breakpoint', {
			module: 'BreakpointManager',
			function: 'createBreakpoint',
			workflowId,
			nodeName,
			condition,
		});

		try {
			const breakpointId = `bp_${++this.breakpointCounter}_${Date.now()}`;
			const breakpoint: Breakpoint = {
				id: breakpointId,
				workflowId,
				nodeName,
				condition,
				enabled: true,
				hitCount: 0,
				createdAt: new Date(),
			};

			this.breakpoints.set(breakpointId, breakpoint);

			this.logger.info('[BreakpointManager] Breakpoint created', {
				module: 'BreakpointManager',
				function: 'createBreakpoint',
				breakpointId,
				workflowId,
				nodeName,
				duration: Date.now() - startTime,
			});

			return breakpoint;
		} catch (error) {
			this.logger.error('[BreakpointManager] Failed to create breakpoint', {
				module: 'BreakpointManager',
				function: 'createBreakpoint',
				workflowId,
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
	 * Get breakpoint by ID
	 */
	getBreakpoint(breakpointId: string): Breakpoint | undefined {
		return this.breakpoints.get(breakpointId);
	}

	/**
	 * Get all breakpoints for a workflow
	 */
	getWorkflowBreakpoints(workflowId: string): Breakpoint[] {
		const startTime = Date.now();
		this.logger.debug('[BreakpointManager] Getting workflow breakpoints', {
			module: 'BreakpointManager',
			function: 'getWorkflowBreakpoints',
			workflowId,
		});

		const breakpoints = Array.from(this.breakpoints.values()).filter(
			(bp) => bp.workflowId === workflowId,
		);

		this.logger.debug('[BreakpointManager] Workflow breakpoints retrieved', {
			module: 'BreakpointManager',
			function: 'getWorkflowBreakpoints',
			workflowId,
			count: breakpoints.length,
			duration: Date.now() - startTime,
		});

		return breakpoints;
	}

	/**
	 * Get all breakpoints for a specific node
	 */
	getNodeBreakpoints(workflowId: string, nodeName: string): Breakpoint[] {
		return Array.from(this.breakpoints.values()).filter(
			(bp) => bp.workflowId === workflowId && bp.nodeName === nodeName,
		);
	}

	/**
	 * Enable breakpoint
	 */
	enableBreakpoint(breakpointId: string): void {
		const startTime = Date.now();
		this.logger.debug('[BreakpointManager] Enabling breakpoint', {
			module: 'BreakpointManager',
			function: 'enableBreakpoint',
			breakpointId,
		});

		try {
			const breakpoint = this.breakpoints.get(breakpointId);
			if (!breakpoint) {
				this.logger.warn('[BreakpointManager] Breakpoint not found', {
					module: 'BreakpointManager',
					function: 'enableBreakpoint',
					breakpointId,
				});
				return;
			}

			breakpoint.enabled = true;

			this.logger.info('[BreakpointManager] Breakpoint enabled', {
				module: 'BreakpointManager',
				function: 'enableBreakpoint',
				breakpointId,
				duration: Date.now() - startTime,
			});
		} catch (error) {
			this.logger.error('[BreakpointManager] Failed to enable breakpoint', {
				module: 'BreakpointManager',
				function: 'enableBreakpoint',
				breakpointId,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Disable breakpoint
	 */
	disableBreakpoint(breakpointId: string): void {
		const startTime = Date.now();
		this.logger.debug('[BreakpointManager] Disabling breakpoint', {
			module: 'BreakpointManager',
			function: 'disableBreakpoint',
			breakpointId,
		});

		try {
			const breakpoint = this.breakpoints.get(breakpointId);
			if (!breakpoint) {
				this.logger.warn('[BreakpointManager] Breakpoint not found', {
					module: 'BreakpointManager',
					function: 'disableBreakpoint',
					breakpointId,
				});
				return;
			}

			breakpoint.enabled = false;

			this.logger.info('[BreakpointManager] Breakpoint disabled', {
				module: 'BreakpointManager',
				function: 'disableBreakpoint',
				breakpointId,
				duration: Date.now() - startTime,
			});
		} catch (error) {
			this.logger.error('[BreakpointManager] Failed to disable breakpoint', {
				module: 'BreakpointManager',
				function: 'disableBreakpoint',
				breakpointId,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Delete breakpoint
	 */
	deleteBreakpoint(breakpointId: string): boolean {
		const startTime = Date.now();
		this.logger.debug('[BreakpointManager] Deleting breakpoint', {
			module: 'BreakpointManager',
			function: 'deleteBreakpoint',
			breakpointId,
		});

		try {
			const deleted = this.breakpoints.delete(breakpointId);

			this.logger.info('[BreakpointManager] Breakpoint deleted', {
				module: 'BreakpointManager',
				function: 'deleteBreakpoint',
				breakpointId,
				deleted,
				duration: Date.now() - startTime,
			});

			return deleted;
		} catch (error) {
			this.logger.error('[BreakpointManager] Failed to delete breakpoint', {
				module: 'BreakpointManager',
				function: 'deleteBreakpoint',
				breakpointId,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Delete all breakpoints for a workflow
	 */
	deleteWorkflowBreakpoints(workflowId: string): number {
		const startTime = Date.now();
		this.logger.debug('[BreakpointManager] Deleting workflow breakpoints', {
			module: 'BreakpointManager',
			function: 'deleteWorkflowBreakpoints',
			workflowId,
		});

		try {
			let deletedCount = 0;

			for (const [id, breakpoint] of this.breakpoints.entries()) {
				if (breakpoint.workflowId === workflowId) {
					this.breakpoints.delete(id);
					deletedCount++;
				}
			}

			this.logger.info('[BreakpointManager] Workflow breakpoints deleted', {
				module: 'BreakpointManager',
				function: 'deleteWorkflowBreakpoints',
				workflowId,
				deletedCount,
				duration: Date.now() - startTime,
			});

			return deletedCount;
		} catch (error) {
			this.logger.error('[BreakpointManager] Failed to delete workflow breakpoints', {
				module: 'BreakpointManager',
				function: 'deleteWorkflowBreakpoints',
				workflowId,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Check if breakpoint should trigger
	 */
	shouldTrigger(workflowId: string, nodeName: string, nodeData: any): Breakpoint | null {
		const startTime = Date.now();
		this.logger.debug('[BreakpointManager] Checking breakpoint trigger', {
			module: 'BreakpointManager',
			function: 'shouldTrigger',
			workflowId,
			nodeName,
		});

		try {
			const breakpoints = this.getNodeBreakpoints(workflowId, nodeName);

			for (const breakpoint of breakpoints) {
				if (!breakpoint.enabled) continue;

				// Check condition
				if (breakpoint.condition) {
					if (!this.evaluateCondition(breakpoint.condition, nodeData)) {
						continue;
					}
				}

				// Update hit count
				breakpoint.hitCount++;
				breakpoint.lastHit = new Date();

				this.logger.info('[BreakpointManager] Breakpoint triggered', {
					module: 'BreakpointManager',
					function: 'shouldTrigger',
					breakpointId: breakpoint.id,
					workflowId,
					nodeName,
					hitCount: breakpoint.hitCount,
					duration: Date.now() - startTime,
				});

				return breakpoint;
			}

			this.logger.debug('[BreakpointManager] No breakpoint triggered', {
				module: 'BreakpointManager',
				function: 'shouldTrigger',
				workflowId,
				nodeName,
				duration: Date.now() - startTime,
			});

			return null;
		} catch (error) {
			this.logger.error('[BreakpointManager] Failed to check breakpoint trigger', {
				module: 'BreakpointManager',
				function: 'shouldTrigger',
				workflowId,
				nodeName,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			return null;
		}
	}

	/**
	 * Evaluate breakpoint condition
	 */
	private evaluateCondition(condition: string, nodeData: any): boolean {
		const startTime = Date.now();
		this.logger.debug('[BreakpointManager] Evaluating condition', {
			module: 'BreakpointManager',
			function: 'evaluateCondition',
			condition,
		});

		try {
			// Simple expression evaluation
			// In production, use a safe expression evaluator
			if (condition.startsWith('data.')) {
				const path = condition.substring(5);
				const value = this.getNestedValue(nodeData, path);
				const result = value !== undefined && value !== null;

				this.logger.debug('[BreakpointManager] Condition evaluated', {
					module: 'BreakpointManager',
					function: 'evaluateCondition',
					condition,
					result,
					duration: Date.now() - startTime,
				});

				return result;
			}

			if (condition === 'error') {
				const result = nodeData?.error !== undefined;

				this.logger.debug('[BreakpointManager] Condition evaluated', {
					module: 'BreakpointManager',
					function: 'evaluateCondition',
					condition,
					result,
					duration: Date.now() - startTime,
				});

				return result;
			}

			return true;
		} catch (error) {
			this.logger.error('[BreakpointManager] Failed to evaluate condition', {
				module: 'BreakpointManager',
				function: 'evaluateCondition',
				condition,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			return false;
		}
	}

	/**
	 * Get nested value from object
	 */
	private getNestedValue(obj: unknown, path: string): unknown {
		return path.split('.').reduce<unknown>((current: any, key) => current?.[key], obj);
	}

	/**
	 * Get breakpoint statistics
	 */
	getStatistics(): Record<string, any> {
		const startTime = Date.now();
		this.logger.debug('[BreakpointManager] Calculating statistics', {
			module: 'BreakpointManager',
			function: 'getStatistics',
		});

		try {
			const breakpoints = Array.from(this.breakpoints.values());
			const stats = {
				total: breakpoints.length,
				enabled: breakpoints.filter((bp) => bp.enabled).length,
				disabled: breakpoints.filter((bp) => !bp.enabled).length,
				withConditions: breakpoints.filter((bp) => bp.condition).length,
				totalHits: breakpoints.reduce((sum, bp) => sum + bp.hitCount, 0),
				byWorkflow: {} as Record<string, number>,
			};

			for (const bp of breakpoints) {
				stats.byWorkflow[bp.workflowId] = (stats.byWorkflow[bp.workflowId] || 0) + 1;
			}

			this.logger.info('[BreakpointManager] Statistics calculated', {
				module: 'BreakpointManager',
				function: 'getStatistics',
				stats,
				duration: Date.now() - startTime,
			});

			return stats;
		} catch (error) {
			this.logger.error('[BreakpointManager] Failed to calculate statistics', {
				module: 'BreakpointManager',
				function: 'getStatistics',
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Reset hit counts for all breakpoints
	 */
	resetHitCounts(workflowId?: string): void {
		const startTime = Date.now();
		this.logger.debug('[BreakpointManager] Resetting hit counts', {
			module: 'BreakpointManager',
			function: 'resetHitCounts',
			workflowId,
		});

		try {
			for (const breakpoint of this.breakpoints.values()) {
				if (!workflowId || breakpoint.workflowId === workflowId) {
					breakpoint.hitCount = 0;
					breakpoint.lastHit = undefined;
				}
			}

			this.logger.info('[BreakpointManager] Hit counts reset', {
				module: 'BreakpointManager',
				function: 'resetHitCounts',
				workflowId,
				duration: Date.now() - startTime,
			});
		} catch (error) {
			this.logger.error('[BreakpointManager] Failed to reset hit counts', {
				module: 'BreakpointManager',
				function: 'resetHitCounts',
				workflowId,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}
}
