import { Config, Env } from '../decorators';

/**
 * Configuration for the notification system
 */
@Config
export class NotificationConfig {
	/** Whether notification system is enabled */
	@Env('N8N_NOTIFICATIONS_ENABLED')
	enabled: boolean = true;

	/** Default notification channels to use (comma-separated) */
	@Env('N8N_NOTIFICATIONS_DEFAULT_CHANNELS')
	defaultChannels: string = 'email';

	/** Maximum number of notifications per minute per workflow */
	@Env('N8N_NOTIFICATIONS_RATE_LIMIT_PER_MINUTE')
	rateLimitPerMinute: number = 5;

	/** Whether to enable batched notifications */
	@Env('N8N_NOTIFICATIONS_BATCH_ENABLED')
	batchEnabled: boolean = false;

	/** Batch interval in seconds */
	@Env('N8N_NOTIFICATIONS_BATCH_INTERVAL')
	batchInterval: number = 300;

	/** Maximum batch size */
	@Env('N8N_NOTIFICATIONS_BATCH_SIZE')
	batchSize: number = 10;

	/** Retry attempts for failed notifications */
	@Env('N8N_NOTIFICATIONS_RETRY_ATTEMPTS')
	retryAttempts: number = 3;

	/** Retry delay in seconds */
	@Env('N8N_NOTIFICATIONS_RETRY_DELAY')
	retryDelay: number = 30;

	/** Email configuration */
	@Env('N8N_NOTIFICATIONS_EMAIL_FROM')
	emailFrom: string = '';

	@Env('N8N_NOTIFICATIONS_EMAIL_SMTP_HOST')
	emailSmtpHost: string = '';

	@Env('N8N_NOTIFICATIONS_EMAIL_SMTP_PORT')
	emailSmtpPort: number = 587;

	@Env('N8N_NOTIFICATIONS_EMAIL_SMTP_USER')
	emailSmtpUser: string = '';

	@Env('N8N_NOTIFICATIONS_EMAIL_SMTP_PASSWORD')
	emailSmtpPassword: string = '';

	@Env('N8N_NOTIFICATIONS_EMAIL_SMTP_SECURE')
	emailSmtpSecure: boolean = true;

	/** Webhook configuration */
	@Env('N8N_NOTIFICATIONS_WEBHOOK_URL')
	webhookUrl: string = '';

	@Env('N8N_NOTIFICATIONS_WEBHOOK_SECRET')
	webhookSecret: string = '';

	/** Slack configuration */
	@Env('N8N_NOTIFICATIONS_SLACK_WEBHOOK_URL')
	slackWebhookUrl: string = '';

	@Env('N8N_NOTIFICATIONS_SLACK_CHANNEL')
	slackChannel: string = '#alerts';

	/** Teams configuration */
	@Env('N8N_NOTIFICATIONS_TEAMS_WEBHOOK_URL')
	teamsWebhookUrl: string = '';

	/** Discord configuration */
	@Env('N8N_NOTIFICATIONS_DISCORD_WEBHOOK_URL')
	discordWebhookUrl: string = '';

	/** PagerDuty configuration */
	@Env('N8N_NOTIFICATIONS_PAGERDUTY_ROUTING_KEY')
	pagerDutyRoutingKey: string = '';

	@Env('N8N_NOTIFICATIONS_PAGERDUTY_SEVERITY')
	pagerDutySeverity: 'critical' | 'error' | 'warning' | 'info' = 'error';
}