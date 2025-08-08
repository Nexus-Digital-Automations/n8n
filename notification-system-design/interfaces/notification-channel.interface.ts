/**
 * Core notification channel interfaces following n8n's TypeScript patterns
 */

export interface NotificationChannel {
	/** Unique identifier for the channel */
	id: string;
	/** Human-readable name for the channel */
	name: string;
	/** Channel type (email, webhook, sms, etc.) */
	type: NotificationChannelType;
	/** Whether the channel is enabled */
	enabled: boolean;
	/** Channel-specific configuration */
	configuration: NotificationChannelConfig;
	/** Rate limiting configuration */
	rateLimits?: RateLimitConfig;
	/** Retry configuration */
	retryConfig?: RetryConfig;
	/** Template configuration for different alert types */
	templates?: NotificationTemplate[];
}

export enum NotificationChannelType {
	EMAIL = 'email',
	WEBHOOK = 'webhook',
	SMS = 'sms',
	SLACK = 'slack',
	TEAMS = 'teams',
	DISCORD = 'discord',
	TELEGRAM = 'telegram',
}

export interface NotificationChannelConfig {
	/** Base configuration that all channels share */
	baseConfig: BaseChannelConfig;
	/** Channel-specific configuration */
	channelConfig: EmailConfig | WebhookConfig | SmsConfig | SlackConfig;
}

export interface BaseChannelConfig {
	/** Display name for the channel */
	displayName: string;
	/** Description of the channel purpose */
	description?: string;
	/** Tags for organization */
	tags?: string[];
	/** Environment restrictions (production, staging, etc.) */
	environments?: string[];
	/** User/project access controls */
	accessControls?: AccessControl[];
}

export interface EmailConfig {
	/** SMTP configuration */
	smtp?: {
		host: string;
		port: number;
		secure: boolean;
		auth: {
			user: string;
			pass: string;
		} | {
			type: 'OAuth2';
			user: string;
			serviceClient: string;
			privateKey: string;
		};
	};
	/** Email service provider configuration */
	provider?: {
		service: 'sendgrid' | 'mailgun' | 'ses' | 'postmark';
		apiKey: string;
		region?: string;
	};
	/** Default sender configuration */
	from: {
		email: string;
		name?: string;
	};
	/** Default recipients */
	to: string[];
	/** CC recipients */
	cc?: string[];
	/** BCC recipients */
	bcc?: string[];
}

export interface WebhookConfig {
	/** Webhook URL */
	url: string;
	/** HTTP method */
	method: 'POST' | 'PUT' | 'PATCH';
	/** HTTP headers */
	headers?: Record<string, string>;
	/** Authentication configuration */
	auth?: {
		type: 'basic' | 'bearer' | 'api-key' | 'oauth2';
		credentials: Record<string, string>;
	};
	/** Request timeout in milliseconds */
	timeout?: number;
	/** Whether to verify SSL certificates */
	verifySsl?: boolean;
	/** Custom payload template */
	payloadTemplate?: string;
	/** Content type */
	contentType?: string;
}

export interface SmsConfig {
	/** SMS provider configuration */
	provider: {
		service: 'twilio' | 'aws-sns' | 'vonage' | 'messagebird';
		apiKey: string;
		apiSecret?: string;
		region?: string;
	};
	/** Default sender phone number */
	from: string;
	/** Default recipient phone numbers */
	to: string[];
}

export interface SlackConfig {
	/** Slack webhook URL or bot token */
	webhook?: string;
	botToken?: string;
	/** Default channel */
	channel: string;
	/** Slack app configuration */
	app?: {
		clientId: string;
		clientSecret: string;
		signingSecret: string;
	};
	/** Message formatting options */
	formatting?: {
		useMarkdown: boolean;
		includeMetadata: boolean;
		threadReplies: boolean;
	};
}

export interface RateLimitConfig {
	/** Maximum notifications per time window */
	maxNotifications: number;
	/** Time window in seconds */
	windowSeconds: number;
	/** Rate limit strategy */
	strategy: 'fixed-window' | 'sliding-window' | 'token-bucket';
	/** Burst allowance */
	burstSize?: number;
	/** Cooldown period after limit exceeded */
	cooldownSeconds?: number;
}

export interface RetryConfig {
	/** Maximum number of retry attempts */
	maxAttempts: number;
	/** Base delay between retries in milliseconds */
	baseDelayMs: number;
	/** Exponential backoff multiplier */
	backoffMultiplier: number;
	/** Maximum delay between retries in milliseconds */
	maxDelayMs: number;
	/** Conditions that trigger retries */
	retryConditions: RetryCondition[];
	/** Dead letter queue configuration */
	deadLetterQueue?: {
		enabled: boolean;
		retentionDays: number;
	};
}

export interface RetryCondition {
	/** HTTP status codes that trigger retries */
	httpStatusCodes?: number[];
	/** Error types that trigger retries */
	errorTypes?: string[];
	/** Custom retry predicate function name */
	customPredicate?: string;
}

export interface NotificationTemplate {
	/** Template identifier */
	id: string;
	/** Alert type this template applies to */
	alertType: AlertType;
	/** Template content */
	content: TemplateContent;
	/** Template variables */
	variables: TemplateVariable[];
	/** Conditional rendering rules */
	conditions?: TemplateCondition[];
}

export interface TemplateContent {
	/** Subject line (for email/notifications with subjects) */
	subject?: string;
	/** Main content body */
	body: string;
	/** Plain text version */
	textBody?: string;
	/** Rich content (for channels that support it) */
	richContent?: any;
	/** Attachments */
	attachments?: TemplateAttachment[];
}

export interface TemplateVariable {
	/** Variable name */
	name: string;
	/** Variable type */
	type: 'string' | 'number' | 'boolean' | 'date' | 'object';
	/** Whether the variable is required */
	required: boolean;
	/** Default value */
	defaultValue?: any;
	/** Description for documentation */
	description?: string;
}

export interface TemplateCondition {
	/** Condition expression */
	expression: string;
	/** Template to use if condition is true */
	trueTemplate?: string;
	/** Template to use if condition is false */
	falseTemplate?: string;
}

export interface TemplateAttachment {
	/** Attachment type */
	type: 'file' | 'image' | 'link';
	/** Attachment source */
	source: string;
	/** Display name */
	name?: string;
	/** MIME type */
	mimeType?: string;
}

export interface AccessControl {
	/** Access type */
	type: 'user' | 'role' | 'project' | 'team';
	/** Entity identifier */
	entityId: string;
	/** Permission level */
	permission: 'read' | 'write' | 'admin';
	/** Conditions for access */
	conditions?: Record<string, any>;
}

export enum AlertType {
	WORKFLOW_FAILURE = 'workflow_failure',
	WORKFLOW_SUCCESS = 'workflow_success',
	EXECUTION_ERROR = 'execution_error',
	SYSTEM_ERROR = 'system_error',
	PERFORMANCE_ISSUE = 'performance_issue',
	QUOTA_EXCEEDED = 'quota_exceeded',
	SECURITY_ALERT = 'security_alert',
	MAINTENANCE = 'maintenance',
	CUSTOM = 'custom',
}

/**
 * Interface for channel implementations
 */
export interface INotificationChannelService {
	/** Send a notification through this channel */
	sendNotification(
		channelConfig: NotificationChannel,
		alert: NotificationAlert,
		context: NotificationContext,
	): Promise<NotificationResult>;

	/** Validate channel configuration */
	validateConfiguration(config: NotificationChannelConfig): Promise<ValidationResult>;

	/** Test channel connectivity */
	testConnection(config: NotificationChannelConfig): Promise<TestResult>;

	/** Get channel capabilities */
	getCapabilities(): ChannelCapabilities;

	/** Get default template for alert type */
	getDefaultTemplate(alertType: AlertType): NotificationTemplate;
}

export interface NotificationAlert {
	/** Unique alert identifier */
	id: string;
	/** Alert type */
	type: AlertType;
	/** Alert severity */
	severity: AlertSeverity;
	/** Alert title */
	title: string;
	/** Alert description */
	description: string;
	/** Alert metadata */
	metadata: AlertMetadata;
	/** When the alert was created */
	createdAt: Date;
	/** Alert context data */
	context: Record<string, any>;
	/** Associated workflow information */
	workflow?: WorkflowInfo;
	/** Associated execution information */
	execution?: ExecutionInfo;
}

export enum AlertSeverity {
	LOW = 'low',
	MEDIUM = 'medium',
	HIGH = 'high',
	CRITICAL = 'critical',
}

export interface AlertMetadata {
	/** Source of the alert */
	source: string;
	/** Alert category */
	category: string;
	/** Tags for organization */
	tags: string[];
	/** Environment where alert occurred */
	environment: string;
	/** Associated project */
	projectId?: string;
	/** Associated user */
	userId?: string;
}

export interface WorkflowInfo {
	/** Workflow ID */
	id: string;
	/** Workflow name */
	name: string;
	/** Workflow version */
	version?: number;
	/** Workflow status */
	status: string;
	/** Workflow owner */
	owner?: string;
	/** Associated project */
	projectId?: string;
}

export interface ExecutionInfo {
	/** Execution ID */
	id: string;
	/** Execution mode */
	mode: string;
	/** Start time */
	startedAt: Date;
	/** End time */
	endedAt?: Date;
	/** Execution status */
	status: string;
	/** Error information */
	error?: ExecutionError;
	/** Performance metrics */
	metrics?: ExecutionMetrics;
}

export interface ExecutionError {
	/** Error message */
	message: string;
	/** Error type */
	type: string;
	/** Stack trace */
	stack?: string;
	/** Node where error occurred */
	node?: string;
	/** Error context */
	context?: Record<string, any>;
}

export interface ExecutionMetrics {
	/** Total execution time in milliseconds */
	duration: number;
	/** Number of nodes executed */
	nodesExecuted: number;
	/** Memory usage in bytes */
	memoryUsage?: number;
	/** CPU usage percentage */
	cpuUsage?: number;
}

export interface NotificationContext {
	/** Request ID for tracing */
	requestId: string;
	/** User context */
	user?: {
		id: string;
		email: string;
		name: string;
	};
	/** Project context */
	project?: {
		id: string;
		name: string;
	};
	/** Instance information */
	instance: {
		id: string;
		version: string;
		environment: string;
	};
	/** Timestamp */
	timestamp: Date;
}

export interface NotificationResult {
	/** Whether the notification was sent successfully */
	success: boolean;
	/** Message ID from the provider */
	messageId?: string;
	/** Delivery status */
	status: DeliveryStatus;
	/** Error information if failed */
	error?: NotificationError;
	/** Delivery attempts */
	attempts: number;
	/** Next retry time if applicable */
	nextRetryAt?: Date;
	/** Provider-specific metadata */
	providerMetadata?: Record<string, any>;
}

export enum DeliveryStatus {
	SENT = 'sent',
	DELIVERED = 'delivered',
	FAILED = 'failed',
	RATE_LIMITED = 'rate_limited',
	RETRY_SCHEDULED = 'retry_scheduled',
	EXPIRED = 'expired',
}

export interface NotificationError {
	/** Error code */
	code: string;
	/** Error message */
	message: string;
	/** Error details */
	details?: Record<string, any>;
	/** Whether the error is retryable */
	retryable: boolean;
}

export interface ValidationResult {
	/** Whether the configuration is valid */
	valid: boolean;
	/** Validation errors */
	errors: ValidationError[];
	/** Validation warnings */
	warnings: ValidationWarning[];
}

export interface ValidationError {
	/** Field that failed validation */
	field: string;
	/** Error message */
	message: string;
	/** Error code */
	code: string;
}

export interface ValidationWarning {
	/** Field with warning */
	field: string;
	/** Warning message */
	message: string;
	/** Warning code */
	code: string;
}

export interface TestResult {
	/** Whether the test was successful */
	success: boolean;
	/** Response time in milliseconds */
	responseTime: number;
	/** Test message */
	message: string;
	/** Error if test failed */
	error?: string;
	/** Provider-specific test results */
	details?: Record<string, any>;
}

export interface ChannelCapabilities {
	/** Supported alert types */
	supportedAlertTypes: AlertType[];
	/** Maximum message size in bytes */
	maxMessageSize?: number;
	/** Supported content types */
	supportedContentTypes: string[];
	/** Whether rich content is supported */
	supportsRichContent: boolean;
	/** Whether attachments are supported */
	supportsAttachments: boolean;
	/** Whether templates are supported */
	supportsTemplates: boolean;
	/** Rate limits imposed by the provider */
	rateLimits?: {
		requestsPerSecond: number;
		requestsPerMinute: number;
		requestsPerHour: number;
		requestsPerDay: number;
	};
}