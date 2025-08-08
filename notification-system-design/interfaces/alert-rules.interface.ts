/**
 * Alert rules and notification routing interfaces
 */

export interface AlertRule {
	/** Unique rule identifier */
	id: string;
	/** Human-readable rule name */
	name: string;
	/** Rule description */
	description?: string;
	/** Whether the rule is active */
	enabled: boolean;
	/** Rule priority (higher numbers = higher priority) */
	priority: number;
	/** Rule conditions */
	conditions: AlertCondition[];
	/** Actions to take when rule matches */
	actions: AlertAction[];
	/** Rule metadata */
	metadata: AlertRuleMetadata;
	/** Rate limiting for this rule */
	rateLimits?: AlertRateLimit;
	/** Rule schedule (when it should be active) */
	schedule?: AlertSchedule;
	/** Rule expiration */
	expiresAt?: Date;
	/** Creation and modification timestamps */
	createdAt: Date;
	updatedAt: Date;
	createdBy: string;
	updatedBy: string;
}

export interface AlertCondition {
	/** Condition type */
	type: AlertConditionType;
	/** Field to evaluate */
	field: string;
	/** Comparison operator */
	operator: ComparisonOperator;
	/** Value to compare against */
	value: any;
	/** Logical operator for combining with other conditions */
	logicalOperator?: LogicalOperator;
	/** Nested conditions for complex logic */
	children?: AlertCondition[];
	/** Condition metadata */
	metadata?: {
		description?: string;
		tags?: string[];
	};
}

export enum AlertConditionType {
	/** Workflow-based conditions */
	WORKFLOW_ID = 'workflow_id',
	WORKFLOW_NAME = 'workflow_name',
	WORKFLOW_TAG = 'workflow_tag',
	WORKFLOW_STATUS = 'workflow_status',
	
	/** Execution-based conditions */
	EXECUTION_STATUS = 'execution_status',
	EXECUTION_DURATION = 'execution_duration',
	EXECUTION_ERROR_TYPE = 'execution_error_type',
	EXECUTION_NODE = 'execution_node',
	EXECUTION_RETRY_COUNT = 'execution_retry_count',
	
	/** Project and user conditions */
	PROJECT_ID = 'project_id',
	PROJECT_NAME = 'project_name',
	USER_ID = 'user_id',
	USER_ROLE = 'user_role',
	
	/** Environment conditions */
	ENVIRONMENT = 'environment',
	INSTANCE_ID = 'instance_id',
	
	/** Time-based conditions */
	TIME_OF_DAY = 'time_of_day',
	DAY_OF_WEEK = 'day_of_week',
	DATE_RANGE = 'date_range',
	
	/** Performance conditions */
	MEMORY_USAGE = 'memory_usage',
	CPU_USAGE = 'cpu_usage',
	RESPONSE_TIME = 'response_time',
	
	/** Frequency conditions */
	FAILURE_COUNT = 'failure_count',
	FAILURE_RATE = 'failure_rate',
	SUCCESS_RATE = 'success_rate',
	
	/** Custom conditions */
	CUSTOM_FIELD = 'custom_field',
	CUSTOM_EXPRESSION = 'custom_expression',
}

export enum ComparisonOperator {
	EQUALS = 'equals',
	NOT_EQUALS = 'not_equals',
	GREATER_THAN = 'greater_than',
	GREATER_THAN_OR_EQUAL = 'greater_than_or_equal',
	LESS_THAN = 'less_than',
	LESS_THAN_OR_EQUAL = 'less_than_or_equal',
	CONTAINS = 'contains',
	NOT_CONTAINS = 'not_contains',
	STARTS_WITH = 'starts_with',
	ENDS_WITH = 'ends_with',
	MATCHES_REGEX = 'matches_regex',
	IN = 'in',
	NOT_IN = 'not_in',
	EXISTS = 'exists',
	NOT_EXISTS = 'not_exists',
	IS_EMPTY = 'is_empty',
	IS_NOT_EMPTY = 'is_not_empty',
}

export enum LogicalOperator {
	AND = 'and',
	OR = 'or',
	NOT = 'not',
}

export interface AlertAction {
	/** Action type */
	type: AlertActionType;
	/** Target configuration */
	target: AlertActionTarget;
	/** Action parameters */
	parameters: AlertActionParameters;
	/** Action conditions (additional filtering) */
	conditions?: AlertCondition[];
	/** Action metadata */
	metadata?: {
		description?: string;
		tags?: string[];
		timeout?: number;
	};
}

export enum AlertActionType {
	/** Send notification through channel */
	SEND_NOTIFICATION = 'send_notification',
	/** Create incident/ticket */
	CREATE_INCIDENT = 'create_incident',
	/** Execute webhook */
	EXECUTE_WEBHOOK = 'execute_webhook',
	/** Run workflow */
	RUN_WORKFLOW = 'run_workflow',
	/** Update workflow status */
	UPDATE_WORKFLOW_STATUS = 'update_workflow_status',
	/** Log to system */
	LOG_ALERT = 'log_alert',
	/** Custom action */
	CUSTOM_ACTION = 'custom_action',
}

export interface AlertActionTarget {
	/** Target type */
	type: 'notification_channel' | 'webhook' | 'workflow' | 'external_system';
	/** Target identifier */
	id: string;
	/** Target configuration */
	config?: Record<string, any>;
}

export interface AlertActionParameters {
	/** Message template to use */
	template?: string;
	/** Template variables */
	templateVariables?: Record<string, any>;
	/** Priority override */
	priority?: AlertSeverity;
	/** Tags to add */
	tags?: string[];
	/** Additional metadata */
	metadata?: Record<string, any>;
	/** Escalation configuration */
	escalation?: EscalationConfig;
}

export interface EscalationConfig {
	/** Enable escalation */
	enabled: boolean;
	/** Escalation levels */
	levels: EscalationLevel[];
	/** Escalation timeout in minutes */
	timeoutMinutes: number;
	/** Escalation strategy */
	strategy: 'linear' | 'exponential';
}

export interface EscalationLevel {
	/** Level number */
	level: number;
	/** Delay before this level in minutes */
	delayMinutes: number;
	/** Actions for this level */
	actions: AlertAction[];
	/** Stop escalation conditions */
	stopConditions?: AlertCondition[];
}

export interface AlertRuleMetadata {
	/** Rule category */
	category: string;
	/** Rule tags */
	tags: string[];
	/** Associated project */
	projectId?: string;
	/** Rule environment */
	environment?: string;
	/** Rule version */
	version: number;
	/** Documentation URL */
	documentationUrl?: string;
	/** Contact information */
	contacts?: Contact[];
}

export interface Contact {
	/** Contact type */
	type: 'email' | 'slack' | 'phone' | 'other';
	/** Contact value */
	value: string;
	/** Contact name */
	name?: string;
	/** Whether this is a primary contact */
	primary?: boolean;
}

export interface AlertRateLimit {
	/** Enable rate limiting for this rule */
	enabled: boolean;
	/** Maximum alerts per time window */
	maxAlerts: number;
	/** Time window in minutes */
	windowMinutes: number;
	/** Strategy when limit exceeded */
	strategy: RateLimitStrategy;
	/** Aggregation configuration */
	aggregation?: AlertAggregation;
}

export enum RateLimitStrategy {
	/** Drop subsequent alerts */
	DROP = 'drop',
	/** Aggregate alerts into summary */
	AGGREGATE = 'aggregate',
	/** Delay alerts */
	DELAY = 'delay',
	/** Send rate limit notification */
	NOTIFY = 'notify',
}

export interface AlertAggregation {
	/** Aggregation type */
	type: 'count' | 'summary' | 'detailed';
	/** Group by fields */
	groupBy: string[];
	/** Summary template */
	template?: string;
	/** Aggregation window in minutes */
	windowMinutes: number;
}

export interface AlertSchedule {
	/** Schedule type */
	type: 'always' | 'business_hours' | 'custom' | 'cron';
	/** Timezone for schedule */
	timezone: string;
	/** Schedule configuration */
	config: ScheduleConfig;
	/** Override periods */
	overrides?: ScheduleOverride[];
}

export interface ScheduleConfig {
	/** Business hours configuration */
	businessHours?: {
		monday?: TimeRange[];
		tuesday?: TimeRange[];
		wednesday?: TimeRange[];
		thursday?: TimeRange[];
		friday?: TimeRange[];
		saturday?: TimeRange[];
		sunday?: TimeRange[];
		holidays?: Date[];
	};
	/** Cron expression for custom schedules */
	cronExpression?: string;
	/** Custom time ranges */
	timeRanges?: TimeRange[];
}

export interface TimeRange {
	/** Start time (HH:MM format) */
	start: string;
	/** End time (HH:MM format) */
	end: string;
}

export interface ScheduleOverride {
	/** Override name */
	name: string;
	/** Start date */
	startDate: Date;
	/** End date */
	endDate: Date;
	/** Override type */
	type: 'disable' | 'enable' | 'redirect';
	/** Override configuration */
	config?: {
		/** Alternative actions during override */
		actions?: AlertAction[];
		/** Override reason */
		reason?: string;
	};
}

/**
 * Alert rule evaluation context
 */
export interface AlertEvaluationContext {
	/** Original alert data */
	alert: NotificationAlert;
	/** Execution context */
	execution?: ExecutionInfo;
	/** Workflow context */
	workflow?: WorkflowInfo;
	/** User context */
	user?: {
		id: string;
		email: string;
		roles: string[];
	};
	/** Project context */
	project?: {
		id: string;
		name: string;
		settings: Record<string, any>;
	};
	/** Instance context */
	instance: {
		id: string;
		version: string;
		environment: string;
		region?: string;
	};
	/** Request context */
	request: {
		id: string;
		timestamp: Date;
		userAgent?: string;
		ipAddress?: string;
	};
	/** Historical data */
	history?: {
		recentAlerts: NotificationAlert[];
		statistics: AlertStatistics;
	};
}

export interface AlertStatistics {
	/** Total alerts in time window */
	totalAlerts: number;
	/** Alerts by severity */
	bySeverity: Record<AlertSeverity, number>;
	/** Alerts by type */
	byType: Record<AlertType, number>;
	/** Success/failure rates */
	successRate: number;
	failureRate: number;
	/** Average response times */
	avgResponseTime: number;
	/** Time window for statistics */
	timeWindow: {
		start: Date;
		end: Date;
		duration: number;
	};
}

/**
 * Alert rule evaluation result
 */
export interface AlertRuleEvaluationResult {
	/** Rule that was evaluated */
	ruleId: string;
	/** Whether the rule matched */
	matched: boolean;
	/** Evaluation score (0-1) */
	score: number;
	/** Matching conditions */
	matchingConditions: string[];
	/** Actions to execute */
	actionsToExecute: AlertAction[];
	/** Evaluation metadata */
	metadata: {
		evaluationTime: number;
		evaluatedAt: Date;
		context: Partial<AlertEvaluationContext>;
	};
	/** Evaluation errors */
	errors?: AlertEvaluationError[];
}

export interface AlertEvaluationError {
	/** Error code */
	code: string;
	/** Error message */
	message: string;
	/** Field that caused error */
	field?: string;
	/** Error context */
	context?: Record<string, any>;
}

/**
 * Alert rule service interface
 */
export interface IAlertRuleService {
	/** Evaluate alert against all rules */
	evaluateAlert(
		alert: NotificationAlert,
		context: AlertEvaluationContext,
	): Promise<AlertRuleEvaluationResult[]>;

	/** Get rules that match criteria */
	findMatchingRules(
		criteria: AlertRuleCriteria,
	): Promise<AlertRule[]>;

	/** Validate rule configuration */
	validateRule(rule: AlertRule): Promise<ValidationResult>;

	/** Test rule against sample data */
	testRule(
		rule: AlertRule,
		sampleData: NotificationAlert,
	): Promise<AlertRuleEvaluationResult>;

	/** Get rule statistics */
	getRuleStatistics(
		ruleId: string,
		timeRange: { start: Date; end: Date },
	): Promise<AlertRuleStatistics>;
}

export interface AlertRuleCriteria {
	/** Rule IDs to include */
	ruleIds?: string[];
	/** Project IDs to include */
	projectIds?: string[];
	/** Rule categories */
	categories?: string[];
	/** Rule tags */
	tags?: string[];
	/** Only enabled rules */
	enabledOnly?: boolean;
	/** Environment filter */
	environment?: string;
	/** Priority range */
	priorityRange?: {
		min: number;
		max: number;
	};
}

export interface AlertRuleStatistics {
	/** Rule ID */
	ruleId: string;
	/** Time range */
	timeRange: {
		start: Date;
		end: Date;
	};
	/** Evaluation statistics */
	evaluations: {
		total: number;
		matched: number;
		matchRate: number;
		avgEvaluationTime: number;
	};
	/** Action statistics */
	actions: {
		total: number;
		successful: number;
		failed: number;
		successRate: number;
	};
	/** Performance metrics */
	performance: {
		avgResponseTime: number;
		p95ResponseTime: number;
		errorRate: number;
	};
}

import { AlertSeverity, AlertType, NotificationAlert, ExecutionInfo, WorkflowInfo, ValidationResult } from './notification-channel.interface';