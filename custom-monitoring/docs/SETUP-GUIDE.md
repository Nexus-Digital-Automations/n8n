# n8n External Hooks - Setup Guide

## Phase 0: Minimal Monitoring Implementation

**Investment:** 10-15 hours ($1,000-$1,500)
**Goal:** Validate ROI before building full monitoring infrastructure

---

## Prerequisites

- n8n installed (self-hosted)
- Node.js with npm
- Terminal access to n8n server

---

## Step 1: Measure Current State (Week 1 - Before Implementation)

### 1.1 Track Debugging Time

Use the provided tracking spreadsheet:

```bash
# Copy tracking spreadsheet
cp custom-monitoring/tracking/debugging-time-tracker.csv ~/n8n-debugging-tracker.csv

# Open in Excel/Google Sheets
# OR use from terminal:
nano ~/n8n-debugging-tracker.csv
```

**For 2 weeks, track EVERY debugging session:**
- Date
- Workflow name
- Issue type
- Time spent (hours)
- Root cause category (n8n Bug, Workflow Design, User Error, etc.)
- Resolution status
- Notes

### 1.2 Calculate Baseline

After 2 weeks:
- **Total debugging hours:** Sum of all time spent
- **Monthly cost:** Total hours × $100/hr × 2 (to estimate monthly)
- **Category breakdown:** % n8n bugs vs workflow design vs other

**Decision point:** If spending <5 hours/month on n8n debugging → **DON'T IMPLEMENT** (current state is fine)

---

## Step 2: Install External Hooks (Week 3)

### 2.1 Install Dependencies

```bash
cd /path/to/n8n
npm install axios
```

### 2.2 Copy Enhanced Logging File

```bash
# Copy the hooks file
cp custom-monitoring/hooks/enhanced-logging.js /opt/n8n/hooks/enhanced-logging.js

# OR if n8n is in different location:
cp custom-monitoring/hooks/enhanced-logging.js ~/.n8n/hooks/enhanced-logging.js
```

### 2.3 Configure Logging Destination

**Option A: File Logging (Simplest)**

```bash
# Set environment variables
export LOG_DESTINATION=file
export LOG_FILE_PATH=/var/log/n8n/executions.log
export LOG_LEVEL=info

# Point n8n to hooks file
export EXTERNAL_HOOK_FILES=/opt/n8n/hooks/enhanced-logging.js
```

**Option B: Slack Notifications (Real-time Alerts)**

```bash
# Create Slack webhook:
# 1. Go to https://api.slack.com/messaging/webhooks
# 2. Create incoming webhook
# 3. Copy webhook URL

export LOG_DESTINATION=slack
export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
export LOG_LEVEL=info  # Only workflow-level logs (not every node)

export EXTERNAL_HOOK_FILES=/opt/n8n/hooks/enhanced-logging.js
```

**Option C: HTTP Endpoint (Custom Monitoring)**

```bash
# If you have a monitoring service:
export LOG_DESTINATION=http
export MONITORING_ENDPOINT=https://your-monitoring-service.com/api/logs
export LOG_LEVEL=info

export EXTERNAL_HOOK_FILES=/opt/n8n/hooks/enhanced-logging.js
```

### 2.4 Restart n8n

```bash
# If using pm2:
pm2 restart n8n

# If using systemd:
sudo systemctl restart n8n

# If using docker:
docker restart n8n
```

### 2.5 Verify Installation

```bash
# Check n8n logs for hook registration
tail -f /var/log/n8n/n8n.log | grep "External hooks"

# Run a test workflow in n8n
# Check for log entries:
tail -f /var/log/n8n/executions.log
```

Expected output:
```json
{"event":"workflow.completed","timestamp":"2025-11-15T19:53:00.000Z","executionId":"123","workflowName":"Test Workflow","success":true,"duration":1523}
```

---

## Step 3: Import Error Handler Template (Week 3)

### 3.1 Import Workflow

1. Open n8n UI
2. Click "Workflows" → "Import from file"
3. Select `custom-monitoring/workflows/error-handler-template.json`
4. Activate the workflow

### 3.2 Configure Error Handler

Set environment variables for error handler:

```bash
# Enable Slack error notifications
export SEND_TO_SLACK=true
export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# OR configure monitoring endpoint
export MONITORING_ENDPOINT=https://your-monitoring-service.com/api/errors

# Restart n8n
pm2 restart n8n
```

### 3.3 Test Error Handler

1. Create a test workflow with an intentional error (e.g., HTTP Request to invalid URL)
2. Run the workflow
3. Check Slack channel or monitoring endpoint for error notification

---

## Step 4: Add Error Handlers to Existing Workflows (Week 3-4)

### 4.1 For Each Production Workflow:

1. Open workflow in n8n editor
2. Add "Error Trigger" node
3. Connect to "HTTP Request" node
4. Configure HTTP Request to POST to your monitoring endpoint or Slack webhook
5. Set request body to include error details:

```json
{
  "workflow": "{{ $workflow.name }}",
  "execution_id": "{{ $execution.id }}",
  "error_node": "{{ $json.node.name }}",
  "error_message": "{{ $json.error.message }}",
  "timestamp": "{{ $now.toISO() }}"
}
```

6. Save and activate

### 4.2 Prioritize Workflows

Add error handlers to workflows in this order:
1. **High-value production workflows** (client-facing, revenue-generating)
2. **Frequently failing workflows** (check execution history)
3. **Complex workflows** (multi-step, many dependencies)
4. **Low-priority workflows** (internal tools, reports)

---

## Step 5: Monitor Results (Month 2)

### 5.1 Continue Tracking Debugging Time

Using the same spreadsheet, track debugging time for 4 weeks AFTER implementation.

### 5.2 Compare Results

| Metric | Before Hooks | After Hooks | Improvement |
|--------|--------------|-------------|-------------|
| Hours/month debugging | ??? | ??? | ??? |
| Average time to identify issue | ??? | ??? | ??? |
| Client escalations | ??? | ??? | ??? |
| Mean time to resolution | ??? | ??? | ??? |

### 5.3 Calculate ROI

```
Implementation Cost: $1,000-$1,500 (one-time)
Monthly Time Saved: X hours
Monthly Cost Savings: X hours × $100/hr
Monthly ROI: (Cost Savings - (Investment/12)) / (Investment/12) × 100%

Break-even: Investment / Monthly Cost Savings = Y months
```

**Decision point:**
- **ROI > 200%:** Continue to Phase 1 (monitoring stack)
- **ROI 100-200%:** Keep current setup, monitor for 3 more months
- **ROI < 100%:** Consider n8n Enterprise or stop here

---

## Troubleshooting

### External Hooks Not Loading

**Problem:** n8n doesn't load hooks file

**Solutions:**
```bash
# Check file path is correct
echo $EXTERNAL_HOOK_FILES

# Check file permissions
ls -la /opt/n8n/hooks/enhanced-logging.js

# Check n8n logs for errors
tail -f /var/log/n8n/n8n.log | grep -i error

# Verify environment variable is set in n8n process
ps aux | grep n8n
```

### Logs Not Appearing

**Problem:** No log entries in `/var/log/n8n/executions.log`

**Solutions:**
```bash
# Check directory exists and is writable
mkdir -p /var/log/n8n
chmod 755 /var/log/n8n

# Check disk space
df -h

# Run workflow and check console output
LOG_LEVEL=debug pm2 logs n8n

# Verify LOG_DESTINATION is set
echo $LOG_DESTINATION
```

### Slack Notifications Not Sending

**Problem:** Workflow completes but no Slack message

**Solutions:**
```bash
# Test webhook URL manually
curl -X POST $SLACK_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{"text":"Test message from n8n hooks"}'

# Check axios is installed
npm list axios

# Set LOG_LEVEL=debug to see errors
export LOG_LEVEL=debug
pm2 restart n8n
tail -f /var/log/n8n/n8n.log
```

### Performance Impact

**Problem:** n8n slower after hooks implementation

**Solutions:**
```bash
# Reduce log verbosity
export LOG_LEVEL=info  # or 'error' for minimal logging

# Use async logging (already implemented in hooks)
# Switch to file logging instead of HTTP if network is slow
export LOG_DESTINATION=file

# Monitor n8n memory usage
pm2 monit n8n
```

---

## Log Format Reference

### Workflow Completed Event

```json
{
  "event": "workflow.completed",
  "timestamp": "2025-11-15T19:53:00.000Z",
  "executionId": "abc123",
  "workflowId": "workflow-1",
  "workflowName": "Customer Data Sync",
  "mode": "trigger",
  "success": true,
  "duration": 2345,
  "startedAt": 1700000000000,
  "stoppedAt": 1700002345000,
  "stats": {
    "totalNodes": 5,
    "successfulNodes": 5,
    "failedNodes": 0,
    "totalDuration": 2340,
    "averageDuration": 468
  },
  "error": null
}
```

### Workflow Error Event

```json
{
  "event": "workflow.completed",
  "timestamp": "2025-11-15T19:53:00.000Z",
  "executionId": "def456",
  "workflowId": "workflow-2",
  "workflowName": "API Integration",
  "mode": "manual",
  "success": false,
  "duration": 1523,
  "stats": {
    "totalNodes": 3,
    "successfulNodes": 2,
    "failedNodes": 1
  },
  "error": {
    "message": "Request failed with status code 404",
    "node": "HTTP Request",
    "stack": "Error: Request failed with status code 404\n    at ..."
  }
}
```

---

## Next Steps

**If ROI is positive after 1-2 months:**

1. **Phase 1:** Build Prometheus + Grafana monitoring stack ($2,000-$4,000)
2. **Phase 2:** Add custom debug helper nodes ($1,500)
3. **Phase 3:** Expand to advanced error analytics

**If ROI is marginal:**

- Keep current setup
- Focus on workflow design improvements
- Consider n8n Enterprise for advanced features

**If ROI is negative:**

- Remove hooks (minimal cost to try)
- Evaluate if n8n is the right tool
- Consider managed n8n hosting

---

## Cost Summary

| Item | Time | Cost |
|------|------|------|
| Tracking current state | 1 hour | $100 |
| Installing hooks | 2-3 hours | $200-$300 |
| Configuring destinations | 1-2 hours | $100-$200 |
| Adding error handlers | 5-8 hours | $500-$800 |
| Documentation/training | 1-2 hours | $100-$200 |
| **TOTAL** | **10-16 hours** | **$1,000-$1,600** |

**Monthly Maintenance:** <1 hour ($100/month)

---

## Support

For issues or questions:
1. Check [n8n Community Forums](https://community.n8n.io/)
2. Review [n8n External Hooks Documentation](https://docs.n8n.io/hosting/configuration/external-hooks/)
3. Check logs: `/var/log/n8n/n8n.log`
