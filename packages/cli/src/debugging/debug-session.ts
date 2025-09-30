import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { Service } from '@n8n/di';
import { TypedEmitter } from '@/typed-emitter';

export interface DebugSession {
	id: string;
	workflowId: string;
	executionId?: string;
	status: 'active' | 'paused' | 'stopped' | 'completed';
	currentNode?: string;
	breakpoints: Set<string>;
	variables: Map<string, any>;
	stepMode: boolean;
	createdAt: Date;
	lastActivity: Date;
}

export interface DebugEvent {
	type: 'breakpoint' | 'step' | 'variable_change' | 'node_complete' | 'error';
	sessionId: string;
	nodeName?: string;
	data?: any;
	timestamp: Date;
}

export interface DebugCommand {
	type: 'continue' | 'step' | 'step_into' | 'step_out' | 'stop' | 'inspect' | 'modify';
	sessionId: string;
	data?: any;
}

export interface DebugSessionEvents {
	breakpoint: DebugEvent;
	step: DebugEvent;
	variable_change: DebugEvent;
	node_complete: DebugEvent;
	error: DebugEvent;
}

/**
 * Debug Session Manager
 *
 * Manages interactive debugging sessions for workflow executions.
 * Supports breakpoints, step-through execution, and variable inspection.
 */
@Service()
export class DebugSessionManager extends TypedEmitter<DebugSessionEvents> {
	private sessions: Map<string, DebugSession> = new Map();
	private sessionCounter = 0;

	constructor(
		private readonly logger: Logger,
		private readonly globalConfig: GlobalConfig,
	) {
		super();
		this.logger.info('[DebugSessionManager] Initialized', {
			module: 'DebugSessionManager',
		});
	}

	/**
	 * Create a new debug session
	 */
	createSession(
		workflowId: string,
		options?: {
			stepMode?: boolean;
			breakpoints?: string[];
		},
	): DebugSession {
		const startTime = Date.now();
		this.logger.debug('[DebugSessionManager] Creating debug session', {
			module: 'DebugSessionManager',
			function: 'createSession',
			workflowId,
			options,
		});

		try {
			const sessionId = `debug_${++this.sessionCounter}_${Date.now()}`;
			const session: DebugSession = {
				id: sessionId,
				workflowId,
				status: 'active',
				breakpoints: new Set(options?.breakpoints || []),
				variables: new Map(),
				stepMode: options?.stepMode || false,
				createdAt: new Date(),
				lastActivity: new Date(),
			};

			this.sessions.set(sessionId, session);

			this.logger.info('[DebugSessionManager] Debug session created', {
				module: 'DebugSessionManager',
				function: 'createSession',
				sessionId,
				workflowId,
				duration: Date.now() - startTime,
			});

			this.emit('session_created', { sessionId, workflowId });

			return session;
		} catch (error) {
			this.logger.error('[DebugSessionManager] Failed to create debug session', {
				module: 'DebugSessionManager',
				function: 'createSession',
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
	 * Get debug session by ID
	 */
	getSession(sessionId: string): DebugSession | undefined {
		const startTime = Date.now();
		this.logger.debug('[DebugSessionManager] Getting debug session', {
			module: 'DebugSessionManager',
			function: 'getSession',
			sessionId,
		});

		const session = this.sessions.get(sessionId);

		if (session) {
			session.lastActivity = new Date();
		}

		this.logger.debug('[DebugSessionManager] Debug session retrieved', {
			module: 'DebugSessionManager',
			function: 'getSession',
			sessionId,
			found: !!session,
			duration: Date.now() - startTime,
		});

		return session;
	}

	/**
	 * Update session status
	 */
	updateSessionStatus(sessionId: string, status: DebugSession['status']): void {
		const startTime = Date.now();
		this.logger.debug('[DebugSessionManager] Updating session status', {
			module: 'DebugSessionManager',
			function: 'updateSessionStatus',
			sessionId,
			status,
		});

		try {
			const session = this.sessions.get(sessionId);
			if (!session) {
				this.logger.warn('[DebugSessionManager] Session not found', {
					module: 'DebugSessionManager',
					function: 'updateSessionStatus',
					sessionId,
				});
				return;
			}

			session.status = status;
			session.lastActivity = new Date();

			this.logger.info('[DebugSessionManager] Session status updated', {
				module: 'DebugSessionManager',
				function: 'updateSessionStatus',
				sessionId,
				status,
				duration: Date.now() - startTime,
			});

			this.emit('session_status_changed', { sessionId, status });
		} catch (error) {
			this.logger.error('[DebugSessionManager] Failed to update session status', {
				module: 'DebugSessionManager',
				function: 'updateSessionStatus',
				sessionId,
				status,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Add breakpoint to session
	 */
	addBreakpoint(sessionId: string, nodeName: string): void {
		const startTime = Date.now();
		this.logger.debug('[DebugSessionManager] Adding breakpoint', {
			module: 'DebugSessionManager',
			function: 'addBreakpoint',
			sessionId,
			nodeName,
		});

		try {
			const session = this.sessions.get(sessionId);
			if (!session) {
				this.logger.warn('[DebugSessionManager] Session not found', {
					module: 'DebugSessionManager',
					function: 'addBreakpoint',
					sessionId,
				});
				return;
			}

			session.breakpoints.add(nodeName);
			session.lastActivity = new Date();

			this.logger.info('[DebugSessionManager] Breakpoint added', {
				module: 'DebugSessionManager',
				function: 'addBreakpoint',
				sessionId,
				nodeName,
				totalBreakpoints: session.breakpoints.size,
				duration: Date.now() - startTime,
			});

			this.emit('breakpoint_added', { sessionId, nodeName });
		} catch (error) {
			this.logger.error('[DebugSessionManager] Failed to add breakpoint', {
				module: 'DebugSessionManager',
				function: 'addBreakpoint',
				sessionId,
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
	 * Remove breakpoint from session
	 */
	removeBreakpoint(sessionId: string, nodeName: string): void {
		const startTime = Date.now();
		this.logger.debug('[DebugSessionManager] Removing breakpoint', {
			module: 'DebugSessionManager',
			function: 'removeBreakpoint',
			sessionId,
			nodeName,
		});

		try {
			const session = this.sessions.get(sessionId);
			if (!session) {
				this.logger.warn('[DebugSessionManager] Session not found', {
					module: 'DebugSessionManager',
					function: 'removeBreakpoint',
					sessionId,
				});
				return;
			}

			session.breakpoints.delete(nodeName);
			session.lastActivity = new Date();

			this.logger.info('[DebugSessionManager] Breakpoint removed', {
				module: 'DebugSessionManager',
				function: 'removeBreakpoint',
				sessionId,
				nodeName,
				totalBreakpoints: session.breakpoints.size,
				duration: Date.now() - startTime,
			});

			this.emit('breakpoint_removed', { sessionId, nodeName });
		} catch (error) {
			this.logger.error('[DebugSessionManager] Failed to remove breakpoint', {
				module: 'DebugSessionManager',
				function: 'removeBreakpoint',
				sessionId,
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
	 * Check if breakpoint is hit
	 */
	isBreakpointHit(sessionId: string, nodeName: string): boolean {
		const session = this.sessions.get(sessionId);
		if (!session) return false;

		return session.stepMode || session.breakpoints.has(nodeName);
	}

	/**
	 * Pause execution at node
	 */
	async pauseAtNode(sessionId: string, nodeName: string, nodeData: any): Promise<void> {
		const startTime = Date.now();
		this.logger.debug('[DebugSessionManager] Pausing at node', {
			module: 'DebugSessionManager',
			function: 'pauseAtNode',
			sessionId,
			nodeName,
		});

		try {
			const session = this.sessions.get(sessionId);
			if (!session) {
				this.logger.warn('[DebugSessionManager] Session not found', {
					module: 'DebugSessionManager',
					function: 'pauseAtNode',
					sessionId,
				});
				return;
			}

			session.status = 'paused';
			session.currentNode = nodeName;
			session.lastActivity = new Date();

			// Store node data in variables
			session.variables.set(`node_${nodeName}`, nodeData);

			this.logger.info('[DebugSessionManager] Execution paused at node', {
				module: 'DebugSessionManager',
				function: 'pauseAtNode',
				sessionId,
				nodeName,
				duration: Date.now() - startTime,
			});

			const debugEvent: DebugEvent = {
				type: 'breakpoint',
				sessionId,
				nodeName,
				data: nodeData,
				timestamp: new Date(),
			};

			this.emit('breakpoint_hit', debugEvent);

			// Wait for continue command
			await this.waitForContinue(sessionId);
		} catch (error) {
			this.logger.error('[DebugSessionManager] Failed to pause at node', {
				module: 'DebugSessionManager',
				function: 'pauseAtNode',
				sessionId,
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
	 * Wait for continue command
	 */
	private async waitForContinue(sessionId: string): Promise<void> {
		return await new Promise((resolve) => {
			const checkInterval = setInterval(() => {
				const session = this.sessions.get(sessionId);
				if (!session || session.status !== 'paused') {
					clearInterval(checkInterval);
					resolve();
				}
			}, 100);
		});
	}

	/**
	 * Continue execution
	 */
	continue(sessionId: string): void {
		const startTime = Date.now();
		this.logger.debug('[DebugSessionManager] Continuing execution', {
			module: 'DebugSessionManager',
			function: 'continue',
			sessionId,
		});

		try {
			const session = this.sessions.get(sessionId);
			if (!session) {
				this.logger.warn('[DebugSessionManager] Session not found', {
					module: 'DebugSessionManager',
					function: 'continue',
					sessionId,
				});
				return;
			}

			session.status = 'active';
			session.lastActivity = new Date();

			this.logger.info('[DebugSessionManager] Execution continued', {
				module: 'DebugSessionManager',
				function: 'continue',
				sessionId,
				duration: Date.now() - startTime,
			});

			this.emit('execution_continued', { sessionId });
		} catch (error) {
			this.logger.error('[DebugSessionManager] Failed to continue execution', {
				module: 'DebugSessionManager',
				function: 'continue',
				sessionId,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Stop debug session
	 */
	stopSession(sessionId: string): void {
		const startTime = Date.now();
		this.logger.debug('[DebugSessionManager] Stopping session', {
			module: 'DebugSessionManager',
			function: 'stopSession',
			sessionId,
		});

		try {
			const session = this.sessions.get(sessionId);
			if (!session) {
				this.logger.warn('[DebugSessionManager] Session not found', {
					module: 'DebugSessionManager',
					function: 'stopSession',
					sessionId,
				});
				return;
			}

			session.status = 'stopped';
			this.sessions.delete(sessionId);

			this.logger.info('[DebugSessionManager] Session stopped', {
				module: 'DebugSessionManager',
				function: 'stopSession',
				sessionId,
				duration: Date.now() - startTime,
			});

			this.emit('session_stopped', { sessionId });
		} catch (error) {
			this.logger.error('[DebugSessionManager] Failed to stop session', {
				module: 'DebugSessionManager',
				function: 'stopSession',
				sessionId,
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}

	/**
	 * Get all active sessions
	 */
	getActiveSessions(): DebugSession[] {
		return Array.from(this.sessions.values()).filter((s) => s.status === 'active');
	}

	/**
	 * Clean up inactive sessions
	 */
	cleanupInactiveSessions(maxAgeMinutes: number = 30): number {
		const startTime = Date.now();
		this.logger.debug('[DebugSessionManager] Cleaning up inactive sessions', {
			module: 'DebugSessionManager',
			function: 'cleanupInactiveSessions',
			maxAgeMinutes,
		});

		try {
			const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
			let cleanedCount = 0;

			for (const [sessionId, session] of this.sessions.entries()) {
				if (session.lastActivity < cutoffTime) {
					this.sessions.delete(sessionId);
					cleanedCount++;
				}
			}

			this.logger.info('[DebugSessionManager] Inactive sessions cleaned up', {
				module: 'DebugSessionManager',
				function: 'cleanupInactiveSessions',
				cleanedCount,
				remainingSessions: this.sessions.size,
				duration: Date.now() - startTime,
			});

			return cleanedCount;
		} catch (error) {
			this.logger.error('[DebugSessionManager] Failed to cleanup inactive sessions', {
				module: 'DebugSessionManager',
				function: 'cleanupInactiveSessions',
				error: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
				duration: Date.now() - startTime,
			});
			throw error;
		}
	}
}
