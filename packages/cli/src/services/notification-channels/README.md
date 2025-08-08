# n8n Real-time Workflow Failure Notification System

## Overview

The n8n Real-time Workflow Failure Notification System provides comprehensive, production-ready notifications for workflow failures. It supports multiple channels, rate limiting, retry logic, and batch processing.

## Features

- **Multi-channel Support**: Email, Webhook, Slack, Teams, Discord, PagerDuty
- **Real-time Notifications**: Immediate alerts on workflow failures
- **Rate Limiting**: Prevent notification spam with configurable limits
- **Retry Logic**: Exponential backoff for failed deliveries
- **Batch Processing**: Optional batching for high-volume scenarios
- **Rich Templates**: Customizable notification templates
- **History Tracking**: Complete audit trail of all notifications
- **Flexible Configuration**: Per-workflow, per-user settings

## Architecture

### Core Components

1. **NotificationService** - Central orchestration service
2. **Notification Channels** - Pluggable delivery mechanisms
3. **Event Relay** - Workflow event listener and processor
4. **Retry Scheduler** - Failed notification retry handling
5. **Database Entities** - Settings and history persistence

### Channel Architecture

All notification channels implement the `INotificationChannel` interface:

```typescript
interface INotificationChannel {
  readonly channelType: string;
  readonly channelName: string;
  send(payload: NotificationPayload, config?: Record<string, unknown>): Promise<NotificationResult>;
  validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors?: string[] }>;
  isAvailable(): Promise<boolean>;
  getRetryConfig(): NotificationRetryConfig;
}
```

## Configuration

### Environment Variables

#### Core Settings
```bash
# Enable/disable notifications
N8N_NOTIFICATIONS_ENABLED=true

# Default channels (comma-separated)
N8N_NOTIFICATIONS_DEFAULT_CHANNELS=email

# Rate limiting (requests per minute per workflow)
N8N_NOTIFICATIONS_RATE_LIMIT_PER_MINUTE=5

# Batch processing
N8N_NOTIFICATIONS_BATCH_ENABLED=false
N8N_NOTIFICATIONS_BATCH_INTERVAL=300
N8N_NOTIFICATIONS_BATCH_SIZE=10

# Retry settings
N8N_NOTIFICATIONS_RETRY_ATTEMPTS=3
N8N_NOTIFICATIONS_RETRY_DELAY=30
```

#### Email Configuration
```bash
N8N_NOTIFICATIONS_EMAIL_FROM=noreply@yourcompany.com
N8N_NOTIFICATIONS_EMAIL_SMTP_HOST=smtp.gmail.com
N8N_NOTIFICATIONS_EMAIL_SMTP_PORT=587
N8N_NOTIFICATIONS_EMAIL_SMTP_USER=your-email@gmail.com
N8N_NOTIFICATIONS_EMAIL_SMTP_PASSWORD=your-app-password
N8N_NOTIFICATIONS_EMAIL_SMTP_SECURE=true
```

#### Webhook Configuration
```bash
N8N_NOTIFICATIONS_WEBHOOK_URL=https://your-webhook-endpoint.com/n8n-alerts
N8N_NOTIFICATIONS_WEBHOOK_SECRET=your-webhook-secret
```

#### Slack Configuration
```bash
N8N_NOTIFICATIONS_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
N8N_NOTIFICATIONS_SLACK_CHANNEL=#alerts
```

#### Teams Configuration
```bash
N8N_NOTIFICATIONS_TEAMS_WEBHOOK_URL=https://your-org.webhook.office.com/webhookb2/...
```

#### Discord Configuration
```bash
N8N_NOTIFICATIONS_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

#### PagerDuty Configuration
```bash
N8N_NOTIFICATIONS_PAGERDUTY_ROUTING_KEY=your-routing-key
N8N_NOTIFICATIONS_PAGERDUTY_SEVERITY=error
```

## Database Schema

### NotificationSettings Table
```sql
CREATE TABLE notification_settings (
  id UUID PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES workflow_entity(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  channels JSON NOT NULL DEFAULT '[]',
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 5,
  batch_enabled BOOLEAN NOT NULL DEFAULT false,
  batch_interval INTEGER NOT NULL DEFAULT 300,
  config JSON NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(workflow_id, user_id)
);
```

### NotificationHistory Table
```sql
CREATE TABLE notification_history (
  id UUID PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES workflow_entity(id) ON DELETE CASCADE,
  execution_id UUID NOT NULL REFERENCES execution_entity(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  channel VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error TEXT,
  sent_at TIMESTAMP,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMP,
  metadata JSON NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## Usage Examples

### Basic Email Notification Setup

```typescript
import { NotificationSettingsRepository } from '@n8n/db';

// Create notification settings for a workflow
const settings = await notificationSettingsRepository.upsert(
  workflowId,
  userId,
  {
    enabled: true,
    channels: ['email'],
    rateLimitPerMinute: 5,
    config: {
      email: {
        recipients: ['admin@company.com', 'devteam@company.com'],
        subject: 'Production Workflow Alert',
        template: 'detailed',
      },
    },
  }
);
```

### Webhook Integration

```typescript
// Configure webhook notifications
const webhookConfig = {
  enabled: true,
  channels: ['webhook'],
  config: {
    webhook: {
      url: 'https://your-monitoring-system.com/alerts',
      secret: 'your-webhook-secret',
      headers: {
        'X-Source': 'n8n',
        'X-Environment': 'production',
      },
      method: 'POST',
      timeout: 10000,
    },
  },
};
```

### Slack Notifications

```typescript
// Setup Slack notifications
const slackConfig = {
  enabled: true,
  channels: ['slack'],
  config: {
    slack: {
      webhookUrl: 'https://hooks.slack.com/services/...',
      channel: '#production-alerts',
      username: 'n8n Bot',
      iconEmoji: ':warning:',
      template: 'detailed',
      mentionUsers: ['@oncall-engineer'],
      mentionChannel: true,
    },
  },
};
```

### Multiple Channels

```typescript
// Configure multiple notification channels
const multiChannelConfig = {
  enabled: true,
  channels: ['email', 'slack', 'webhook'],
  rateLimitPerMinute: 3,
  config: {
    email: {
      recipients: ['critical-alerts@company.com'],
      template: 'basic',
    },
    slack: {
      webhookUrl: process.env.SLACK_WEBHOOK_URL,
      channel: '#critical-alerts',
      mentionChannel: true,
    },
    webhook: {
      url: 'https://pagerduty-integration.company.com/n8n',
      secret: process.env.PAGERDUTY_SECRET,
    },
  },
};
```

## Notification Payload Structure

```typescript
interface NotificationPayload {
  workflow: {
    id: string;
    name: string;
    active: boolean;
    nodes?: unknown[];
  };
  execution: {
    id: string;
    mode: string;
    startedAt: Date;
    stoppedAt?: Date | null;
    status: string;
    error?: string;
  };
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
  context: {
    executionUrl?: string;
    workflowUrl?: string;
    instanceUrl?: string;
    errorMessage?: string;
    failedNode?: string;
    retryCount?: number;
  };
}
```

## API Integration

### REST API Endpoints

```bash
# Get notification settings for a workflow
GET /api/v1/workflows/:workflowId/notifications

# Update notification settings
PUT /api/v1/workflows/:workflowId/notifications

# Get notification history
GET /api/v1/notifications/history?workflowId=:id&limit=50

# Test notification channel
POST /api/v1/notifications/test
{
  "channel": "email",
  "config": { ... },
  "workflowId": "workflow-id"
}

# Retry failed notification
POST /api/v1/notifications/:notificationId/retry

# Get notification statistics
GET /api/v1/notifications/stats?workflowId=:id&timeRange=24h
```

## Monitoring and Observability

### Metrics

The system exposes the following metrics:

- `n8n_notifications_sent_total` - Total notifications sent by channel
- `n8n_notifications_failed_total` - Total notifications failed by channel
- `n8n_notification_duration_seconds` - Time to deliver notifications
- `n8n_notification_retry_attempts_total` - Total retry attempts
- `n8n_notification_rate_limit_hits_total` - Rate limit violations

### Logging

All notification activities are logged with structured data:

```json
{
  "level": "info",
  "message": "Notification sent successfully",
  "workflowId": "wf_123",
  "executionId": "ex_456",
  "userId": "user_789",
  "channel": "email",
  "duration": 1250,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Error Handling

### Common Error Scenarios

1. **SMTP Authentication Failure**
   ```typescript
   {
     "error": "SMTP authentication failed",
     "code": "AUTH_FAILED",
     "channel": "email",
     "retryable": false
   }
   ```

2. **Webhook Timeout**
   ```typescript
   {
     "error": "Request timeout after 10000ms",
     "code": "TIMEOUT",
     "channel": "webhook",
     "retryable": true
   }
   ```

3. **Rate Limit Exceeded**
   ```typescript
   {
     "error": "Rate limit exceeded: 5 requests per minute",
     "code": "RATE_LIMITED",
     "channel": "all",
     "retryable": false
   }
   ```

### Retry Logic

The system implements exponential backoff with jitter:

- **First retry**: 30 seconds
- **Second retry**: 60 seconds
- **Third retry**: 120 seconds
- **Max retries**: 3 (configurable)
- **Max delay**: 300 seconds (configurable)

## Security Considerations

### Webhook Security

- HMAC-SHA256 signatures for webhook payloads
- Configurable secrets per webhook
- Request timeout limits
- SSL/TLS enforcement

### Data Protection

- No sensitive workflow data in notifications by default
- Configurable payload filtering
- Audit trail for all notifications
- GDPR-compliant data retention

### Access Control

- Per-user notification preferences
- Workflow-level access controls
- Admin override capabilities
- API key authentication for external integrations

## Performance Optimization

### Batching Strategy

For high-volume environments, enable batching:

```typescript
{
  batchEnabled: true,
  batchInterval: 300, // 5 minutes
  batchSize: 10,      // Max notifications per batch
}
```

### Database Optimization

- Indexed queries for notification history
- Automatic cleanup of old records
- Connection pooling for high throughput
- Read replicas for reporting queries

### Caching

- Rate limit counters in memory/Redis
- Channel availability status caching
- Template rendering cache
- Configuration caching

## Troubleshooting

### Common Issues

1. **Notifications Not Sending**
   - Check notification settings are enabled
   - Verify channel configuration
   - Review service logs for errors
   - Test channel connectivity

2. **High Latency**
   - Monitor external service response times
   - Check network connectivity
   - Review batch processing settings
   - Optimize database queries

3. **Rate Limiting**
   - Adjust rate limit settings
   - Implement batching
   - Review notification frequency
   - Consider notification priorities

### Debug Mode

Enable debug logging:

```bash
N8N_LOG_LEVEL=debug
N8N_NOTIFICATIONS_DEBUG=true
```

### Health Checks

```bash
# Check notification service health
curl http://localhost:5678/api/v1/health/notifications

# Test channel connectivity
curl -X POST http://localhost:5678/api/v1/notifications/channels/test \
  -H "Content-Type: application/json" \
  -d '{"channel": "email"}'
```

## Migration Guide

### Upgrading from Legacy Systems

1. **Export existing notification settings**
2. **Run database migrations**
3. **Update environment configuration**
4. **Test notification channels**
5. **Monitor for 24-48 hours**

### Rollback Procedure

1. **Disable new notification system**
2. **Restore database backup**
3. **Revert configuration changes**
4. **Restart services**

## Best Practices

### Configuration

- Use environment-specific settings
- Implement proper secret management
- Set appropriate rate limits
- Configure retry strategies per channel

### Operations

- Monitor notification delivery rates
- Set up alerts for notification failures
- Regularly clean up old history records
- Test disaster recovery procedures

### Development

- Write comprehensive tests for custom channels
- Follow the established channel interface
- Implement proper error handling
- Add structured logging

## Contributing

### Adding New Channels

1. Implement `INotificationChannel` interface
2. Add channel-specific configuration
3. Write comprehensive tests
4. Update documentation
5. Add to channel registry

### Testing

```bash
# Run notification service tests
npm test packages/cli/src/services/notification.service.test.ts

# Run channel tests
npm test packages/cli/src/services/notification-channels/

# Integration tests
npm test packages/cli/test/integration/notifications/
```

## License

This notification system is part of n8n and follows the same licensing terms.