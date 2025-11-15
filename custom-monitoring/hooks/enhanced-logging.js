/**
 * n8n External Hooks - Enhanced Logging (Minimal Version)
 *
 * PURPOSE: Capture workflow execution data for debugging and monitoring
 * COST: Phase 0 validation approach (~10 hours implementation)
 *
 * SETUP:
 * 1. Set environment variable: EXTERNAL_HOOK_FILES=/path/to/enhanced-logging.js
 * 2. Set LOG_DESTINATION (options below)
 * 3. Restart n8n
 *
 * CONFIGURATION:
 * - LOG_DESTINATION=file (default) - Append to /var/log/n8n/executions.log
 * - LOG_DESTINATION=slack - POST to SLACK_WEBHOOK_URL
 * - LOG_DESTINATION=http - POST to MONITORING_ENDPOINT
 * - LOG_LEVEL=info (default) | debug | error
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Configuration
const LOG_DESTINATION = process.env.LOG_DESTINATION || 'file';
const LOG_FILE_PATH = process.env.LOG_FILE_PATH || '/var/log/n8n/executions.log';
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const MONITORING_ENDPOINT = process.env.MONITORING_ENDPOINT;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Ensure log directory exists
function ensureLogDirectory() {
	const logDir = path.dirname(LOG_FILE_PATH);
	if (!fs.existsSync(logDir)) {
		fs.mkdirSync(logDir, { recursive: true });
	}
}

// Log to file
function logToFile(logEntry) {
	try {
		ensureLogDirectory();
		fs.appendFileSync(LOG_FILE_PATH, JSON.stringify(logEntry) + '\n');
	} catch (error) {
		console.error('Failed to write to log file:', error.message);
	}
}

// Log to Slack
async function logToSlack(logEntry) {
	if (!SLACK_WEBHOOK_URL) {
		console.error('SLACK_WEBHOOK_URL not configured');
		return;
	}

	try {
		const color = logEntry.success ? 'good' : 'danger';
		const emoji = logEntry.success ? ':white_check_mark:' : ':x:';

		await axios.post(SLACK_WEBHOOK_URL, {
			attachments: [{
				color,
				title: `${emoji} Workflow: ${logEntry.workflowName}`,
				fields: [
					{ title: 'Execution ID', value: logEntry.executionId, short: true },
					{ title: 'Status', value: logEntry.success ? 'Success' : 'Failed', short: true },
					{ title: 'Duration', value: `${logEntry.duration}ms`, short: true },
					{ title: 'Mode', value: logEntry.mode, short: true },
				],
				footer: 'n8n Monitoring',
				ts: Math.floor(logEntry.timestamp.getTime() / 1000)
			}]
		});
	} catch (error) {
		console.error('Failed to send to Slack:', error.message);
	}
}

// Log to HTTP endpoint
async function logToHttp(logEntry) {
	if (!MONITORING_ENDPOINT) {
		console.error('MONITORING_ENDPOINT not configured');
		return;
	}

	try {
		await axios.post(MONITORING_ENDPOINT, logEntry, {
			headers: { 'Content-Type': 'application/json' },
			timeout: 5000
		});
	} catch (error) {
		console.error('Failed to send to monitoring endpoint:', error.message);
	}
}

// Main logging function
async function sendLog(logEntry) {
	switch (LOG_DESTINATION) {
		case 'slack':
			await logToSlack(logEntry);
			break;
		case 'http':
			await logToHttp(logEntry);
			break;
		case 'file':
		default:
			logToFile(logEntry);
			break;
	}
}

// Extract execution logs from fullRunData
function extractExecutionLogs(fullRunData) {
	const logs = [];
	const runData = fullRunData.data?.resultData?.runData || {};

	for (const [nodeName, nodeExecutions] of Object.entries(runData)) {
		for (let runIndex = 0; runIndex < nodeExecutions.length; runIndex++) {
			const run = nodeExecutions[runIndex];
			logs.push({
				node: nodeName,
				runIndex,
				duration: run.executionTime,
				status: run.executionStatus,
				itemCount: run.data?.main?.[0]?.length || 0,
				error: run.error?.message,
				startTime: run.startTime
			});
		}
	}

	return logs;
}

// Calculate execution statistics
function calculateStats(fullRunData) {
	const logs = extractExecutionLogs(fullRunData);

	return {
		totalNodes: logs.length,
		successfulNodes: logs.filter(l => l.status === 'success').length,
		failedNodes: logs.filter(l => l.status === 'error').length,
		totalDuration: logs.reduce((sum, l) => sum + (l.duration || 0), 0),
		averageDuration: logs.length > 0
			? Math.round(logs.reduce((sum, l) => sum + (l.duration || 0), 0) / logs.length)
			: 0
	};
}

// External Hooks Module Export
module.exports = {
	workflow: {
		// Before workflow execution starts
		preExecute: [
			async function(workflow, executionData) {
				if (LOG_LEVEL !== 'debug') return;

				const logEntry = {
					event: 'workflow.started',
					timestamp: new Date(),
					workflowId: workflow.id,
					workflowName: workflow.name,
					mode: executionData.mode,
					trigger: executionData.startNodes?.map(n => n.name).join(', ') || 'manual'
				};

				await sendLog(logEntry);
			}
		],

		// After workflow execution completes
		postExecute: [
			async function(fullRunData, workflow, executionId) {
				const stats = calculateStats(fullRunData);
				const executionLogs = extractExecutionLogs(fullRunData);

				const logEntry = {
					event: 'workflow.completed',
					timestamp: new Date(),
					executionId,
					workflowId: workflow.id,
					workflowName: workflow.name,
					mode: fullRunData.mode,
					success: fullRunData.finished && !fullRunData.data?.resultData?.error,
					duration: fullRunData.stoppedAt - fullRunData.startedAt,
					startedAt: fullRunData.startedAt,
					stoppedAt: fullRunData.stoppedAt,
					stats,
					error: fullRunData.data?.resultData?.error ? {
						message: fullRunData.data.resultData.error.message,
						node: fullRunData.data.resultData.error.node,
						stack: fullRunData.data.resultData.error.stack?.substring(0, 500) // Truncate stack
					} : null,
					// Include node logs only in debug mode
					nodeLogs: LOG_LEVEL === 'debug' ? executionLogs : undefined
				};

				await sendLog(logEntry);

				// For errors, also log to console for visibility
				if (!logEntry.success) {
					console.error(`[n8n] Workflow "${workflow.name}" failed:`, logEntry.error?.message);
				}
			}
		]
	},

	node: {
		// Before node execution starts
		preExecute: [
			async function(nodeName, workflow, executionData) {
				if (LOG_LEVEL !== 'debug') return;

				const logEntry = {
					event: 'node.started',
					timestamp: new Date(),
					workflowId: workflow.id,
					workflowName: workflow.name,
					nodeName,
					nodeType: workflow.nodes.find(n => n.name === nodeName)?.type
				};

				await sendLog(logEntry);
			}
		],

		// After node execution completes
		postExecute: [
			async function(nodeName, taskData, executionData) {
				if (LOG_LEVEL !== 'debug') return;

				const nodeOutput = taskData?.data?.main?.[0] || [];

				const logEntry = {
					event: 'node.completed',
					timestamp: new Date(),
					nodeName,
					status: taskData.executionStatus,
					duration: taskData.executionTime,
					itemCount: nodeOutput.length,
					error: taskData.error ? {
						message: taskData.error.message,
						type: taskData.error.name
					} : null
				};

				await sendLog(logEntry);

				// For node errors, log to console
				if (taskData.error) {
					console.error(`[n8n] Node "${nodeName}" failed:`, taskData.error.message);
				}
			}
		]
	}
};
