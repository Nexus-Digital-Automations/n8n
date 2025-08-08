/**
 * Alert rule evaluation service implementation
 */

import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { Service } from '@n8n/di';
import { ErrorReporter } from 'n8n-core';

import type {
	AlertRule,
	AlertCondition,
	AlertEvaluationContext,
	AlertRuleEvaluationResult,
	AlertRuleCriteria,
	AlertRuleStatistics,
	IAlertRuleService,
	AlertConditionType,
	ComparisonOperator,
	LogicalOperator,
	AlertAction,
} from '../interfaces/alert-rules.interface';
import type {
	NotificationAlert,
	ValidationResult,
	AlertSeverity,
} from '../interfaces/notification-channel.interface';

import { AlertRuleRepository } from '../repositories/alert-rule.repository';

@Service()
export class AlertRuleService implements IAlertRuleService {
	constructor(
		private readonly globalConfig: GlobalConfig,
		private readonly logger: Logger,
		private readonly errorReporter: ErrorReporter,
		private readonly alertRuleRepository: AlertRuleRepository,
	) {}

	/**
	 * Evaluate alert against all applicable rules
	 */
	async evaluateAlert(
		alert: NotificationAlert,
		context: AlertEvaluationContext,
	): Promise<AlertRuleEvaluationResult[]> {
		const startTime = Date.now();
		
		this.logger.debug('Starting alert rule evaluation', {
			alertId: alert.id,
			alertType: alert.type,
			severity: alert.severity,
		});

		try {
			// Get applicable rules for this alert
			const criteria: AlertRuleCriteria = {
				enabledOnly: true,
				environment: context.instance.environment,
				projectIds: context.project?.id ? [context.project.id] : undefined,
			};

			const rules = await this.alertRuleRepository.findRules(criteria);
			
			if (rules.length === 0) {
				this.logger.debug('No rules found for evaluation', { alertId: alert.id });
				return [];
			}

			this.logger.debug('Found rules for evaluation', {
				alertId: alert.id,
				ruleCount: rules.length,
				ruleIds: rules.map(r => r.id),
			});

			// Evaluate each rule
			const evaluationResults: AlertRuleEvaluationResult[] = [];
			
			for (const rule of rules) {
				const ruleResult = await this.evaluateRule(rule, alert, context);
				evaluationResults.push(ruleResult);

				// Log rule evaluation result
				this.logger.debug('Rule evaluation completed', {
					ruleId: rule.id,
					ruleName: rule.name,
					matched: ruleResult.matched,
					score: ruleResult.score,
					actionsCount: ruleResult.actionsToExecute.length,
				});
			}

			// Sort results by rule priority and score
			evaluationResults.sort((a, b) => {
				const ruleA = rules.find(r => r.id === a.ruleId)!;
				const ruleB = rules.find(r => r.id === b.ruleId)!;
				
				// Higher priority first
				if (ruleA.priority !== ruleB.priority) {
					return ruleB.priority - ruleA.priority;
				}
				
				// Higher score first
				return b.score - a.score;
			});

			const totalEvaluationTime = Date.now() - startTime;
			this.logger.debug('Alert rule evaluation completed', {
				alertId: alert.id,
				totalRules: rules.length,
				matchedRules: evaluationResults.filter(r => r.matched).length,
				evaluationTime: totalEvaluationTime,
			});

			return evaluationResults;

		} catch (error) {
			this.errorReporter.error(error);
			this.logger.error('Failed to evaluate alert rules', {
				alertId: alert.id,
				error: error as Error,
				evaluationTime: Date.now() - startTime,
			});

			throw error;
		}
	}

	/**
	 * Evaluate a single rule against an alert
	 */
	private async evaluateRule(
		rule: AlertRule,
		alert: NotificationAlert,
		context: AlertEvaluationContext,
	): Promise<AlertRuleEvaluationResult> {
		const startTime = Date.now();

		try {
			// Check if rule is active based on schedule
			if (rule.schedule && !this.isRuleActiveNow(rule, context)) {
				return {
					ruleId: rule.id,
					matched: false,
					score: 0,
					matchingConditions: [],
					actionsToExecute: [],
					metadata: {
						evaluationTime: Date.now() - startTime,
						evaluatedAt: new Date(),
						context: { reason: 'Rule not active based on schedule' },
					},
				};
			}

			// Check rate limits for this rule
			if (rule.rateLimits?.enabled) {
				const rateLimitExceeded = await this.checkRuleRateLimit(rule, alert, context);
				if (rateLimitExceeded) {
					return {
						ruleId: rule.id,
						matched: false,
						score: 0,
						matchingConditions: [],
						actionsToExecute: [],
						metadata: {
							evaluationTime: Date.now() - startTime,
							evaluatedAt: new Date(),
							context: { reason: 'Rate limit exceeded' },
						},
					};
				}
			}

			// Evaluate rule conditions
			const conditionResult = await this.evaluateConditions(
				rule.conditions,
				alert,
				context,
			);

			// Determine actions to execute if rule matches
			const actionsToExecute: AlertAction[] = [];
			if (conditionResult.matched) {
				// Filter actions based on their additional conditions
				for (const action of rule.actions) {
					if (action.conditions && action.conditions.length > 0) {
						const actionConditionResult = await this.evaluateConditions(
							action.conditions,
							alert,
							context,
						);
						if (actionConditionResult.matched) {
							actionsToExecute.push(action);
						}
					} else {
						actionsToExecute.push(action);
					}
				}
			}

			return {
				ruleId: rule.id,
				matched: conditionResult.matched,
				score: conditionResult.score,
				matchingConditions: conditionResult.matchingConditions,
				actionsToExecute,
				metadata: {
					evaluationTime: Date.now() - startTime,
					evaluatedAt: new Date(),
					context: {
						ruleVersion: rule.metadata.version,
						evaluationDetails: conditionResult.details,
					},
				},
			};

		} catch (error) {
			this.logger.error('Failed to evaluate rule', {
				ruleId: rule.id,
				ruleName: rule.name,
				alertId: alert.id,
				error: error as Error,
			});

			return {
				ruleId: rule.id,
				matched: false,
				score: 0,
				matchingConditions: [],
				actionsToExecute: [],
				metadata: {
					evaluationTime: Date.now() - startTime,
					evaluatedAt: new Date(),
					context: { error: (error as Error).message },
				},
				errors: [{
					code: 'RULE_EVALUATION_ERROR',
					message: (error as Error).message,
					context: { ruleId: rule.id },
				}],
			};
		}
	}

	/**
	 * Evaluate a set of conditions
	 */
	private async evaluateConditions(
		conditions: AlertCondition[],
		alert: NotificationAlert,
		context: AlertEvaluationContext,
	): Promise<ConditionEvaluationResult> {
		if (conditions.length === 0) {
			return { matched: true, score: 1.0, matchingConditions: [], details: {} };
		}

		const results: boolean[] = [];
		const matchingConditions: string[] = [];
		const evaluationDetails: Record<string, any> = {};

		for (const condition of conditions) {
			const result = await this.evaluateCondition(condition, alert, context);
			results.push(result.matched);
			
			evaluationDetails[condition.field] = result;

			if (result.matched) {
				matchingConditions.push(`${condition.field} ${condition.operator} ${condition.value}`);
			}
		}

		// Calculate overall match based on logical operators
		const overallMatch = this.calculateLogicalResult(conditions, results);
		
		// Calculate score based on match percentage
		const score = results.filter(r => r).length / results.length;

		return {
			matched: overallMatch,
			score,
			matchingConditions,
			details: evaluationDetails,
		};
	}

	/**
	 * Evaluate a single condition
	 */
	private async evaluateCondition(
		condition: AlertCondition,
		alert: NotificationAlert,
		context: AlertEvaluationContext,
	): Promise<SingleConditionResult> {
		try {
			// Get the actual value to compare
			const actualValue = this.extractFieldValue(condition.field, condition.type, alert, context);
			
			// Perform comparison
			const matched = this.compareValues(actualValue, condition.operator, condition.value);

			return {
				matched,
				actualValue,
				expectedValue: condition.value,
				operator: condition.operator,
			};

		} catch (error) {
			this.logger.error('Failed to evaluate condition', {
				conditionType: condition.type,
				field: condition.field,
				operator: condition.operator,
				value: condition.value,
				error: error as Error,
			});

			return {
				matched: false,
				actualValue: null,
				expectedValue: condition.value,
				operator: condition.operator,
				error: (error as Error).message,
			};
		}
	}

	/**
	 * Extract field value from alert and context
	 */
	private extractFieldValue(
		field: string,
		type: AlertConditionType,
		alert: NotificationAlert,
		context: AlertEvaluationContext,
	): any {
		switch (type) {
			// Workflow-based conditions
			case AlertConditionType.WORKFLOW_ID:
				return alert.workflow?.id;
			case AlertConditionType.WORKFLOW_NAME:
				return alert.workflow?.name;
			case AlertConditionType.WORKFLOW_STATUS:
				return alert.workflow?.status;
			case AlertConditionType.WORKFLOW_TAG:
				return alert.metadata.tags;

			// Execution-based conditions
			case AlertConditionType.EXECUTION_STATUS:
				return alert.execution?.status;
			case AlertConditionType.EXECUTION_DURATION:
				return alert.execution?.metrics?.duration;
			case AlertConditionType.EXECUTION_ERROR_TYPE:
				return alert.execution?.error?.type;
			case AlertConditionType.EXECUTION_NODE:
				return alert.execution?.error?.node;
			case AlertConditionType.EXECUTION_RETRY_COUNT:
				return alert.context.retryCount || 0;

			// Project and user conditions
			case AlertConditionType.PROJECT_ID:
				return context.project?.id;
			case AlertConditionType.PROJECT_NAME:
				return context.project?.name;
			case AlertConditionType.USER_ID:
				return context.user?.id;
			case AlertConditionType.USER_ROLE:
				return context.user?.roles;

			// Environment conditions
			case AlertConditionType.ENVIRONMENT:
				return context.instance.environment;
			case AlertConditionType.INSTANCE_ID:
				return context.instance.id;

			// Time-based conditions
			case AlertConditionType.TIME_OF_DAY:
				return new Date().getHours();
			case AlertConditionType.DAY_OF_WEEK:
				return new Date().getDay();
			case AlertConditionType.DATE_RANGE:
				return new Date();

			// Performance conditions
			case AlertConditionType.MEMORY_USAGE:
				return alert.execution?.metrics?.memoryUsage;
			case AlertConditionType.CPU_USAGE:
				return alert.execution?.metrics?.cpuUsage;
			case AlertConditionType.RESPONSE_TIME:
				return alert.execution?.metrics?.duration;

			// Custom conditions
			case AlertConditionType.CUSTOM_FIELD:
				return this.getNestedProperty(alert, field);
			case AlertConditionType.CUSTOM_EXPRESSION:
				return this.evaluateExpression(field, alert, context);

			default:
				throw new Error(`Unsupported condition type: ${type}`);
		}
	}

	/**
	 * Compare values using the specified operator
	 */
	private compareValues(actualValue: any, operator: ComparisonOperator, expectedValue: any): boolean {
		switch (operator) {
			case ComparisonOperator.EQUALS:
				return actualValue === expectedValue;
			case ComparisonOperator.NOT_EQUALS:
				return actualValue !== expectedValue;
			case ComparisonOperator.GREATER_THAN:
				return actualValue > expectedValue;
			case ComparisonOperator.GREATER_THAN_OR_EQUAL:
				return actualValue >= expectedValue;
			case ComparisonOperator.LESS_THAN:
				return actualValue < expectedValue;
			case ComparisonOperator.LESS_THAN_OR_EQUAL:
				return actualValue <= expectedValue;
			case ComparisonOperator.CONTAINS:
				return String(actualValue).includes(String(expectedValue));
			case ComparisonOperator.NOT_CONTAINS:
				return !String(actualValue).includes(String(expectedValue));
			case ComparisonOperator.STARTS_WITH:
				return String(actualValue).startsWith(String(expectedValue));
			case ComparisonOperator.ENDS_WITH:
				return String(actualValue).endsWith(String(expectedValue));
			case ComparisonOperator.MATCHES_REGEX:
				return new RegExp(expectedValue).test(String(actualValue));
			case ComparisonOperator.IN:
				return Array.isArray(expectedValue) ? expectedValue.includes(actualValue) : false;
			case ComparisonOperator.NOT_IN:
				return Array.isArray(expectedValue) ? !expectedValue.includes(actualValue) : true;
			case ComparisonOperator.EXISTS:
				return actualValue !== null && actualValue !== undefined;
			case ComparisonOperator.NOT_EXISTS:
				return actualValue === null || actualValue === undefined;
			case ComparisonOperator.IS_EMPTY:
				return !actualValue || (Array.isArray(actualValue) && actualValue.length === 0);
			case ComparisonOperator.IS_NOT_EMPTY:
				return !!actualValue && (!Array.isArray(actualValue) || actualValue.length > 0);
			default:
				throw new Error(`Unsupported comparison operator: ${operator}`);
		}
	}

	/**
	 * Calculate logical result for multiple conditions
	 */
	private calculateLogicalResult(conditions: AlertCondition[], results: boolean[]): boolean {
		// If no logical operators specified, default to AND logic
		if (conditions.length === 1) {
			return results[0];
		}

		// For now, implement simple AND/OR logic
		// In a full implementation, this would handle complex nested logic
		const hasOr = conditions.some(c => c.logicalOperator === LogicalOperator.OR);
		
		if (hasOr) {
			return results.some(r => r); // OR logic - any true
		} else {
			return results.every(r => r); // AND logic - all true
		}
	}

	/**
	 * Get nested property from object using dot notation
	 */
	private getNestedProperty(obj: any, path: string): any {
		return path.split('.').reduce((current, key) => current?.[key], obj);
	}

	/**
	 * Evaluate custom expression (simplified implementation)
	 */
	private evaluateExpression(expression: string, alert: NotificationAlert, context: AlertEvaluationContext): any {
		// In a full implementation, this would use a safe expression evaluator
		// For now, return a placeholder
		this.logger.warn('Custom expression evaluation not fully implemented', { expression });
		return null;
	}

	/**
	 * Check if rule should be active based on schedule
	 */
	private isRuleActiveNow(rule: AlertRule, context: AlertEvaluationContext): boolean {
		if (!rule.schedule) {
			return true;
		}

		const now = new Date();
		
		// Check schedule type
		switch (rule.schedule.type) {
			case 'always':
				return true;
			case 'business_hours':
				return this.isBusinessHours(now, rule.schedule.config, rule.schedule.timezone);
			case 'custom':
				return this.isWithinCustomSchedule(now, rule.schedule.config, rule.schedule.timezone);
			case 'cron':
				return this.matchesCronExpression(now, rule.schedule.config.cronExpression!, rule.schedule.timezone);
			default:
				return true;
		}
	}

	/**
	 * Check if current time is within business hours
	 */
	private isBusinessHours(now: Date, config: any, timezone: string): boolean {
		// Implementation would check business hours configuration
		// This is a simplified placeholder
		const hour = now.getHours();
		return hour >= 9 && hour <= 17; // 9 AM to 5 PM
	}

	/**
	 * Check if current time is within custom schedule
	 */
	private isWithinCustomSchedule(now: Date, config: any, timezone: string): boolean {
		// Implementation would check custom time ranges
		// This is a simplified placeholder
		return true;
	}

	/**
	 * Check if current time matches cron expression
	 */
	private matchesCronExpression(now: Date, cronExpression: string, timezone: string): boolean {
		// Implementation would use a cron library to evaluate expression
		// This is a simplified placeholder
		return true;
	}

	/**
	 * Check rule-specific rate limits
	 */
	private async checkRuleRateLimit(
		rule: AlertRule,
		alert: NotificationAlert,
		context: AlertEvaluationContext,
	): Promise<boolean> {
		// Implementation would check if this rule has exceeded its rate limits
		// This is a placeholder
		return false;
	}

	/**
	 * Find matching rules based on criteria
	 */
	async findMatchingRules(criteria: AlertRuleCriteria): Promise<AlertRule[]> {
		return this.alertRuleRepository.findRules(criteria);
	}

	/**
	 * Validate rule configuration
	 */
	async validateRule(rule: AlertRule): Promise<ValidationResult> {
		const errors: any[] = [];
		const warnings: any[] = [];

		// Validate basic rule structure
		if (!rule.name || rule.name.trim().length === 0) {
			errors.push({
				field: 'name',
				message: 'Rule name is required',
				code: 'REQUIRED_FIELD',
			});
		}

		if (!rule.conditions || rule.conditions.length === 0) {
			errors.push({
				field: 'conditions',
				message: 'At least one condition is required',
				code: 'REQUIRED_FIELD',
			});
		}

		if (!rule.actions || rule.actions.length === 0) {
			warnings.push({
				field: 'actions',
				message: 'Rule has no actions - it will only match but not execute anything',
				code: 'NO_ACTIONS',
			});
		}

		// Validate conditions
		if (rule.conditions) {
			rule.conditions.forEach((condition, index) => {
				if (!Object.values(AlertConditionType).includes(condition.type)) {
					errors.push({
						field: `conditions[${index}].type`,
						message: `Invalid condition type: ${condition.type}`,
						code: 'INVALID_VALUE',
					});
				}

				if (!Object.values(ComparisonOperator).includes(condition.operator)) {
					errors.push({
						field: `conditions[${index}].operator`,
						message: `Invalid comparison operator: ${condition.operator}`,
						code: 'INVALID_VALUE',
					});
				}
			});
		}

		// Validate schedule if present
		if (rule.schedule) {
			if (rule.schedule.type === 'cron' && !rule.schedule.config.cronExpression) {
				errors.push({
					field: 'schedule.config.cronExpression',
					message: 'Cron expression is required for cron schedule type',
					code: 'REQUIRED_FIELD',
				});
			}
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		};
	}

	/**
	 * Test rule against sample data
	 */
	async testRule(rule: AlertRule, sampleData: NotificationAlert): Promise<AlertRuleEvaluationResult> {
		// Create a test evaluation context
		const testContext: AlertEvaluationContext = {
			alert: sampleData,
			execution: sampleData.execution,
			workflow: sampleData.workflow,
			instance: {
				id: 'test-instance',
				version: '1.0.0',
				environment: 'test',
			},
			request: {
				id: 'test-request',
				timestamp: new Date(),
			},
		};

		return this.evaluateRule(rule, sampleData, testContext);
	}

	/**
	 * Get rule statistics
	 */
	async getRuleStatistics(
		ruleId: string,
		timeRange: { start: Date; end: Date },
	): Promise<AlertRuleStatistics> {
		return this.alertRuleRepository.getRuleStatistics(ruleId, timeRange);
	}
}

/**
 * Supporting interfaces
 */
interface ConditionEvaluationResult {
	matched: boolean;
	score: number;
	matchingConditions: string[];
	details: Record<string, any>;
}

interface SingleConditionResult {
	matched: boolean;
	actualValue: any;
	expectedValue: any;
	operator: ComparisonOperator;
	error?: string;
}