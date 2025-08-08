/**
 * Configuration schema for the notification system
 * Following n8n's configuration patterns
 */

export const notificationConfigSchema = {
	notifications: {
		enabled: {
			doc: 'Enable/disable the notification system',
			format: Boolean,
			default: true,
			env: 'N8N_NOTIFICATIONS_ENABLED',
		},

		maxConcurrentNotifications: {
			doc: 'Maximum number of notifications that can be sent concurrently',
			format: Number,
			default: 10,
			env: 'N8N_NOTIFICATIONS_MAX_CONCURRENT',
		},

		defaultTimeout: {
			doc: 'Default timeout for notification delivery in milliseconds',
			format: Number,
			default: 30000,
			env: 'N8N_NOTIFICATIONS_DEFAULT_TIMEOUT',
		},

		retryPolicy: {
			enabled: {
				doc: 'Enable automatic retry for failed notifications',
				format: Boolean,
				default: true,
				env: 'N8N_NOTIFICATIONS_RETRY_ENABLED',
			},
			maxAttempts: {
				doc: 'Maximum number of retry attempts',
				format: Number,
				default: 3,
				env: 'N8N_NOTIFICATIONS_RETRY_MAX_ATTEMPTS',
			},
			baseDelayMs: {
				doc: 'Base delay between retries in milliseconds',
				format: Number,
				default: 1000,
				env: 'N8N_NOTIFICATIONS_RETRY_BASE_DELAY',
			},
			maxDelayMs: {
				doc: 'Maximum delay between retries in milliseconds',
				format: Number,
				default: 60000,
				env: 'N8N_NOTIFICATIONS_RETRY_MAX_DELAY',
			},
		},

		rateLimiting: {
			enabled: {
				doc: 'Enable rate limiting for notifications',
				format: Boolean,
				default: true,
				env: 'N8N_NOTIFICATIONS_RATE_LIMIT_ENABLED',
			},
			globalLimits: {
				perSecond: {
					doc: 'Global notifications per second limit',
					format: Number,
					default: 10,
					env: 'N8N_NOTIFICATIONS_GLOBAL_LIMIT_PER_SECOND',
				},
				perMinute: {
					doc: 'Global notifications per minute limit',
					format: Number,
					default: 100,
					env: 'N8N_NOTIFICATIONS_GLOBAL_LIMIT_PER_MINUTE',
				},
				perHour: {
					doc: 'Global notifications per hour limit',
					format: Number,
					default: 1000,
					env: 'N8N_NOTIFICATIONS_GLOBAL_LIMIT_PER_HOUR',
				},
			},
		},

		queue: {
			enabled: {
				doc: 'Enable notification queue for processing',
				format: Boolean,
				default: true,
				env: 'N8N_NOTIFICATIONS_QUEUE_ENABLED',
			},
			redisUrl: {
				doc: 'Redis URL for notification queue (if different from main Redis)',
				format: String,
				default: '',
				env: 'N8N_NOTIFICATIONS_QUEUE_REDIS_URL',
			},
			concurrency: {
				doc: 'Number of concurrent queue workers',
				format: Number,
				default: 5,
				env: 'N8N_NOTIFICATIONS_QUEUE_CONCURRENCY',
			},
			retentionDays: {
				doc: 'Number of days to retain completed notification jobs',
				format: Number,
				default: 7,
				env: 'N8N_NOTIFICATIONS_QUEUE_RETENTION_DAYS',
			},
		},

		storage: {
			retentionDays: {
				doc: 'Number of days to retain notification history',
				format: Number,
				default: 30,
				env: 'N8N_NOTIFICATIONS_STORAGE_RETENTION_DAYS',
			},
			compressAfterDays: {
				doc: 'Number of days after which to compress notification data',
				format: Number,
				default: 7,
				env: 'N8N_NOTIFICATIONS_STORAGE_COMPRESS_AFTER_DAYS',
			},
		},

		channels: {
			email: {
				enabled: {
					doc: 'Enable email notification channel',
					format: Boolean,
					default: true,
					env: 'N8N_NOTIFICATIONS_EMAIL_ENABLED',
				},
				defaults: {
					from: {
						doc: 'Default from email address for notifications',
						format: String,
						default: 'noreply@n8n.io',
						env: 'N8N_NOTIFICATIONS_EMAIL_DEFAULT_FROM',
					},
					fromName: {
						doc: 'Default from name for email notifications',
						format: String,
						default: 'n8n',
						env: 'N8N_NOTIFICATIONS_EMAIL_DEFAULT_FROM_NAME',
					},
				},
				rateLimits: {
					perSecond: {
						doc: 'Email notifications per second limit',
						format: Number,
						default: 2,
						env: 'N8N_NOTIFICATIONS_EMAIL_LIMIT_PER_SECOND',
					},
					perMinute: {
						doc: 'Email notifications per minute limit',
						format: Number,
						default: 20,
						env: 'N8N_NOTIFICATIONS_EMAIL_LIMIT_PER_MINUTE',
					},
					perHour: {
						doc: 'Email notifications per hour limit',
						format: Number,
						default: 100,
						env: 'N8N_NOTIFICATIONS_EMAIL_LIMIT_PER_HOUR',
					},
				},
			},

			webhook: {
				enabled: {
					doc: 'Enable webhook notification channel',
					format: Boolean,
					default: true,
					env: 'N8N_NOTIFICATIONS_WEBHOOK_ENABLED',
				},
				defaults: {
					timeout: {
						doc: 'Default timeout for webhook requests in milliseconds',
						format: Number,
						default: 10000,
						env: 'N8N_NOTIFICATIONS_WEBHOOK_DEFAULT_TIMEOUT',
					},
					retryAttempts: {
						doc: 'Default number of retry attempts for webhooks',
						format: Number,
						default: 3,
						env: 'N8N_NOTIFICATIONS_WEBHOOK_DEFAULT_RETRY_ATTEMPTS',
					},
				},
				rateLimits: {
					perSecond: {
						doc: 'Webhook notifications per second limit',
						format: Number,
						default: 10,
						env: 'N8N_NOTIFICATIONS_WEBHOOK_LIMIT_PER_SECOND',
					},
					perMinute: {
						doc: 'Webhook notifications per minute limit',
						format: Number,
						default: 100,
						env: 'N8N_NOTIFICATIONS_WEBHOOK_LIMIT_PER_MINUTE',
					},
				},
			},

			sms: {
				enabled: {
					doc: 'Enable SMS notification channel',
					format: Boolean,
					default: false,
					env: 'N8N_NOTIFICATIONS_SMS_ENABLED',
				},
				rateLimits: {
					perSecond: {
						doc: 'SMS notifications per second limit',
						format: Number,
						default: 1,
						env: 'N8N_NOTIFICATIONS_SMS_LIMIT_PER_SECOND',
					},
					perMinute: {
						doc: 'SMS notifications per minute limit',
						format: Number,
						default: 5,
						env: 'N8N_NOTIFICATIONS_SMS_LIMIT_PER_MINUTE',
					},
					perHour: {
						doc: 'SMS notifications per hour limit',
						format: Number,
						default: 20,
						env: 'N8N_NOTIFICATIONS_SMS_LIMIT_PER_HOUR',
					},
				},
			},

			slack: {
				enabled: {
					doc: 'Enable Slack notification channel',
					format: Boolean,
					default: true,
					env: 'N8N_NOTIFICATIONS_SLACK_ENABLED',
				},
				rateLimits: {
					perSecond: {
						doc: 'Slack notifications per second limit',
						format: Number,
						default: 1,
						env: 'N8N_NOTIFICATIONS_SLACK_LIMIT_PER_SECOND',
					},
					perMinute: {
						doc: 'Slack notifications per minute limit',
						format: Number,
						default: 20,
						env: 'N8N_NOTIFICATIONS_SLACK_LIMIT_PER_MINUTE',
					},
				},
			},
		},

		alertRules: {
			enabled: {
				doc: 'Enable alert rule evaluation',
				format: Boolean,
				default: true,
				env: 'N8N_NOTIFICATIONS_ALERT_RULES_ENABLED',
			},
			evaluationTimeout: {
				doc: 'Timeout for alert rule evaluation in milliseconds',
				format: Number,
				default: 5000,
				env: 'N8N_NOTIFICATIONS_ALERT_RULES_EVALUATION_TIMEOUT',
			},
			maxRulesPerAlert: {
				doc: 'Maximum number of rules to evaluate per alert',
				format: Number,
				default: 50,
				env: 'N8N_NOTIFICATIONS_ALERT_RULES_MAX_PER_ALERT',
			},
			caching: {
				enabled: {
					doc: 'Enable rule evaluation result caching',
					format: Boolean,
					default: true,
					env: 'N8N_NOTIFICATIONS_ALERT_RULES_CACHING_ENABLED',
				},
				ttlSeconds: {
					doc: 'Cache TTL for rule evaluation results in seconds',
					format: Number,
					default: 300,
					env: 'N8N_NOTIFICATIONS_ALERT_RULES_CACHING_TTL',
				},
			},
		},

		templates: {
			caching: {
				enabled: {
					doc: 'Enable template caching',
					format: Boolean,
					default: true,
					env: 'N8N_NOTIFICATIONS_TEMPLATES_CACHING_ENABLED',
				},
				ttlSeconds: {
					doc: 'Cache TTL for compiled templates in seconds',
					format: Number,
					default: 3600,
					env: 'N8N_NOTIFICATIONS_TEMPLATES_CACHING_TTL',
				},
			},
			defaults: {
				dateFormat: {
					doc: 'Default date format for templates',
					format: String,
					default: 'YYYY-MM-DD HH:mm:ss',
					env: 'N8N_NOTIFICATIONS_TEMPLATES_DEFAULT_DATE_FORMAT',
				},
				timezone: {
					doc: 'Default timezone for templates',
					format: String,
					default: 'UTC',
					env: 'N8N_NOTIFICATIONS_TEMPLATES_DEFAULT_TIMEZONE',
				},
			},
		},

		monitoring: {
			enabled: {
				doc: 'Enable notification system monitoring',
				format: Boolean,
				default: true,
				env: 'N8N_NOTIFICATIONS_MONITORING_ENABLED',
			},
			metricsInterval: {
				doc: 'Interval for collecting metrics in seconds',
				format: Number,
				default: 60,
				env: 'N8N_NOTIFICATIONS_MONITORING_METRICS_INTERVAL',
			},
			healthCheck: {
				enabled: {
					doc: 'Enable notification system health checks',
					format: Boolean,
					default: true,
					env: 'N8N_NOTIFICATIONS_MONITORING_HEALTH_CHECK_ENABLED',
				},
				interval: {
					doc: 'Health check interval in seconds',
					format: Number,
					default: 300,
					env: 'N8N_NOTIFICATIONS_MONITORING_HEALTH_CHECK_INTERVAL',
				},
			},
			alerting: {
				enabled: {
					doc: 'Enable alerting for notification system issues',
					format: Boolean,
					default: true,
					env: 'N8N_NOTIFICATIONS_MONITORING_ALERTING_ENABLED',
				},
				thresholds: {
					failureRate: {
						doc: 'Failure rate threshold for alerting (percentage)',
						format: Number,
						default: 10,
						env: 'N8N_NOTIFICATIONS_MONITORING_FAILURE_RATE_THRESHOLD',
					},
					responseTime: {
						doc: 'Response time threshold for alerting in milliseconds',
						format: Number,
						default: 30000,
						env: 'N8N_NOTIFICATIONS_MONITORING_RESPONSE_TIME_THRESHOLD',
					},
				},
			},
		},

		security: {
			encryption: {
				enabled: {
					doc: 'Enable encryption for sensitive notification data',
					format: Boolean,
					default: true,
					env: 'N8N_NOTIFICATIONS_ENCRYPTION_ENABLED',
				},
				algorithm: {
					doc: 'Encryption algorithm for sensitive data',
					format: String,
					default: 'aes-256-gcm',
					env: 'N8N_NOTIFICATIONS_ENCRYPTION_ALGORITHM',
				},
			},
			allowedDomains: {
				doc: 'Comma-separated list of allowed domains for webhook notifications',
				format: String,
				default: '',
				env: 'N8N_NOTIFICATIONS_SECURITY_ALLOWED_DOMAINS',
			},
			blockedDomains: {
				doc: 'Comma-separated list of blocked domains for webhook notifications',
				format: String,
				default: 'localhost,127.0.0.1,0.0.0.0,internal',
				env: 'N8N_NOTIFICATIONS_SECURITY_BLOCKED_DOMAINS',
			},
			maxPayloadSize: {
				doc: 'Maximum payload size for notifications in bytes',
				format: Number,
				default: 1024 * 1024, // 1MB
				env: 'N8N_NOTIFICATIONS_SECURITY_MAX_PAYLOAD_SIZE',
			},
		},

		development: {
			mockChannels: {
				doc: 'Enable mock notification channels for development',
				format: Boolean,
				default: false,
				env: 'N8N_NOTIFICATIONS_DEV_MOCK_CHANNELS',
			},
			logLevel: {
				doc: 'Log level for notification system in development',
				format: ['error', 'warn', 'info', 'debug'] as const,
				default: 'info',
				env: 'N8N_NOTIFICATIONS_DEV_LOG_LEVEL',
			},
			enableTestEndpoints: {
				doc: 'Enable test endpoints for notification system',
				format: Boolean,
				default: false,
				env: 'N8N_NOTIFICATIONS_DEV_ENABLE_TEST_ENDPOINTS',
			},
		},
	},
};

/**
 * Default notification channel configurations
 */
export const defaultChannelConfigurations = {
	email: {
		smtp: {
			host: '',
			port: 587,
			secure: false,
			auth: {
				user: '',
				pass: '',
			},
		},
		rateLimits: {
			maxNotifications: 100,
			windowSeconds: 3600,
			strategy: 'sliding-window',
		},
		retryConfig: {
			maxAttempts: 3,
			baseDelayMs: 1000,
			backoffMultiplier: 2,
			maxDelayMs: 30000,
			retryConditions: [
				{
					httpStatusCodes: [429, 500, 502, 503, 504],
					errorTypes: ['timeout', 'network', 'connection'],
				},
			],
		},
	},

	webhook: {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'User-Agent': 'n8n-notification-system/1.0.0',
		},
		timeout: 10000,
		verifySsl: true,
		rateLimits: {
			maxNotifications: 1000,
			windowSeconds: 3600,
			strategy: 'sliding-window',
		},
		retryConfig: {
			maxAttempts: 3,
			baseDelayMs: 1000,
			backoffMultiplier: 2,
			maxDelayMs: 30000,
			retryConditions: [
				{
					httpStatusCodes: [429, 500, 502, 503, 504],
				},
			],
		},
	},

	sms: {
		rateLimits: {
			maxNotifications: 50,
			windowSeconds: 3600,
			strategy: 'sliding-window',
		},
		retryConfig: {
			maxAttempts: 2,
			baseDelayMs: 5000,
			backoffMultiplier: 2,
			maxDelayMs: 60000,
			retryConditions: [
				{
					errorTypes: ['timeout', 'rate_limit', 'temporary_failure'],
				},
			],
		},
	},

	slack: {
		rateLimits: {
			maxNotifications: 100,
			windowSeconds: 3600,
			strategy: 'sliding-window',
		},
		retryConfig: {
			maxAttempts: 3,
			baseDelayMs: 1000,
			backoffMultiplier: 2,
			maxDelayMs: 30000,
			retryConditions: [
				{
					httpStatusCodes: [429, 500, 502, 503],
				},
			],
		},
	},
};

/**
 * Default alert rule templates
 */
export const defaultAlertRuleTemplates = {
	workflowFailure: {
		name: 'Critical Workflow Failures',
		description: 'Alert for critical workflow failures',
		priority: 100,
		conditions: [
			{
				type: 'execution_status',
				field: 'execution.status',
				operator: 'equals',
				value: 'failed',
			},
			{
				type: 'workflow_tag',
				field: 'workflow.tags',
				operator: 'contains',
				value: 'critical',
				logicalOperator: 'and',
			},
		],
		actions: [
			{
				type: 'send_notification',
				target: {
					type: 'notification_channel',
					id: 'email-critical',
				},
				parameters: {
					template: 'workflow-failure-critical',
					priority: 'critical',
				},
			},
		],
	},

	performanceIssue: {
		name: 'Performance Issues',
		description: 'Alert for workflow performance issues',
		priority: 50,
		conditions: [
			{
				type: 'execution_duration',
				field: 'execution.metrics.duration',
				operator: 'greater_than',
				value: 300000, // 5 minutes
			},
		],
		actions: [
			{
				type: 'send_notification',
				target: {
					type: 'notification_channel',
					id: 'slack-performance',
				},
				parameters: {
					template: 'performance-issue',
					priority: 'medium',
				},
			},
		],
	},

	securityAlert: {
		name: 'Security Alerts',
		description: 'Alert for security-related issues',
		priority: 200,
		conditions: [
			{
				type: 'custom_field',
				field: 'alert.type',
				operator: 'equals',
				value: 'security_alert',
			},
		],
		actions: [
			{
				type: 'send_notification',
				target: {
					type: 'notification_channel',
					id: 'email-security',
				},
				parameters: {
					template: 'security-alert',
					priority: 'critical',
				},
			},
			{
				type: 'send_notification',
				target: {
					type: 'notification_channel',
					id: 'slack-security',
				},
				parameters: {
					template: 'security-alert-slack',
					priority: 'critical',
				},
			},
		],
	},
};

/**
 * Type definitions for configuration
 */
export interface NotificationConfig {
	enabled: boolean;
	maxConcurrentNotifications: number;
	defaultTimeout: number;
	retryPolicy: RetryPolicyConfig;
	rateLimiting: RateLimitingConfig;
	queue: QueueConfig;
	storage: StorageConfig;
	channels: ChannelConfig;
	alertRules: AlertRulesConfig;
	templates: TemplateConfig;
	monitoring: MonitoringConfig;
	security: SecurityConfig;
	development?: DevelopmentConfig;
}

export interface RetryPolicyConfig {
	enabled: boolean;
	maxAttempts: number;
	baseDelayMs: number;
	maxDelayMs: number;
}

export interface RateLimitingConfig {
	enabled: boolean;
	globalLimits: {
		perSecond: number;
		perMinute: number;
		perHour: number;
	};
}

export interface QueueConfig {
	enabled: boolean;
	redisUrl?: string;
	concurrency: number;
	retentionDays: number;
}

export interface StorageConfig {
	retentionDays: number;
	compressAfterDays: number;
}

export interface ChannelConfig {
	email: ChannelTypeConfig;
	webhook: ChannelTypeConfig;
	sms: ChannelTypeConfig;
	slack: ChannelTypeConfig;
}

export interface ChannelTypeConfig {
	enabled: boolean;
	defaults?: Record<string, any>;
	rateLimits: {
		perSecond: number;
		perMinute: number;
		perHour?: number;
	};
}

export interface AlertRulesConfig {
	enabled: boolean;
	evaluationTimeout: number;
	maxRulesPerAlert: number;
	caching: {
		enabled: boolean;
		ttlSeconds: number;
	};
}

export interface TemplateConfig {
	caching: {
		enabled: boolean;
		ttlSeconds: number;
	};
	defaults: {
		dateFormat: string;
		timezone: string;
	};
}

export interface MonitoringConfig {
	enabled: boolean;
	metricsInterval: number;
	healthCheck: {
		enabled: boolean;
		interval: number;
	};
	alerting: {
		enabled: boolean;
		thresholds: {
			failureRate: number;
			responseTime: number;
		};
	};
}

export interface SecurityConfig {
	encryption: {
		enabled: boolean;
		algorithm: string;
	};
	allowedDomains: string;
	blockedDomains: string;
	maxPayloadSize: number;
}

export interface DevelopmentConfig {
	mockChannels: boolean;
	logLevel: 'error' | 'warn' | 'info' | 'debug';
	enableTestEndpoints: boolean;
}