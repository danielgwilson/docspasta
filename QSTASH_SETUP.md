# QStash Setup Guide for Docspasta V2

This guide explains how to set up and configure QStash for serverless job processing in Docspasta V2.

## Overview

QStash replaces the previous Redis + BullMQ queue system with a fully serverless approach:

- **Queue-First Pattern**: Jobs are published to QStash immediately, then processed asynchronously
- **Atomic Processing**: Each QStash message processes exactly one task (URL or job)
- **Built-in Retries**: QStash handles retry logic with exponential backoff
- **Message Verification**: Cryptographic signature verification for security
- **Dead Letter Queue**: Failed messages are automatically moved to DLQ for investigation

## Architecture Flow

```
POST /api/v4/crawl
    ↓
Generate Job ID + Publish to QStash
    ↓
POST /api/v4/process (QStash webhook)
    ↓
Process based on job type:
- start-crawl: Discover URLs → Publish batch jobs
- process-url: Crawl page → Store results
- finalize-job: Combine results → Mark complete
```

## Setup Steps

### 1. Create Upstash QStash Account

1. Go to [console.upstash.com](https://console.upstash.com)
2. Create a new QStash topic
3. Copy your credentials:
   - `QSTASH_TOKEN`
   - `QSTASH_CURRENT_SIGNING_KEY`
   - `QSTASH_NEXT_SIGNING_KEY`

### 2. Set Environment Variables

Add to your `.env.local`:

```bash
# QStash Configuration
QSTASH_URL="https://qstash.upstash.io"
QSTASH_TOKEN="your-qstash-token-here"
QSTASH_CURRENT_SIGNING_KEY="your-current-signing-key"
QSTASH_NEXT_SIGNING_KEY="your-next-signing-key"

# Optional: Custom queue settings
QSTASH_QUEUE_NAME="docspasta-crawl"
QSTASH_CONCURRENCY="5"
QSTASH_MAX_RETRIES="3"
```

### 3. Configure Your Domain

QStash needs to send webhooks to your application. Set your public domain:

```bash
# For production
BASE_URL="https://your-domain.com"

# For development (use ngrok or similar)
BASE_URL="https://your-ngrok-url.ngrok.io"
```

### 4. Test the Setup

Run the test suite to verify everything is working:

```bash
pnpm test src/lib/queue/__tests__/qstash.test.ts
```

## Job Types

### Start Crawl Job
- **Purpose**: Initialize a crawl job, discover URLs, queue processing jobs
- **Endpoint**: `/api/v4/process`
- **Payload**: `StartCrawlJob`

### Process URL Job  
- **Purpose**: Crawl a single URL, extract content, assess quality
- **Endpoint**: `/api/v4/process`
- **Payload**: `ProcessUrlJob`

### Finalize Job
- **Purpose**: Combine results, generate final output, mark job complete
- **Endpoint**: `/api/v4/process`
- **Payload**: `FinalizeJob`

## Error Handling

### Retryable Errors (HTTP 5xx)
- Network timeouts
- Database connection issues
- Target site temporarily unavailable
- QStash will automatically retry with exponential backoff

### Non-Retryable Errors (HTTP 4xx)
- Invalid URLs (SSRF protection)
- Malformed job payloads
- 404 Not Found on target pages
- Authentication failures

### Dead Letter Queue
- After max retries (default: 3), messages go to DLQ
- Monitor DLQ via Upstash console
- Implement DLQ processing for failed job alerts

## Security Features

### SSRF Protection
- Validates all URLs against private IP ranges
- Blocks localhost, 127.0.0.1, 192.168.x.x, 10.x.x.x
- Only allows HTTP/HTTPS protocols

### Message Verification
- All QStash messages are cryptographically signed
- Signatures verified using `verifySignatureAppRouter`
- Invalid signatures are rejected with 401 status

### User Isolation
- Every job includes `userId` for proper isolation
- Database queries filtered by user ID
- No cross-user data access possible

## Performance Tuning

### Concurrency Control
```typescript
await publishUrlProcessingBatch(jobs, {
  concurrency: 5, // Max parallel jobs per site
  delay: 2000,    // Random delay to spread load
})
```

### Batch Publishing
- Use `publishUrlProcessingBatch()` for discovered URLs
- Much faster than individual `publishJSON()` calls
- Reduces QStash API usage and costs

### Quality Thresholds
- Set appropriate `qualityThreshold` (default: 20)
- Higher values = fewer but better quality pages
- Lower values = more comprehensive crawling

## Monitoring

### Logs
- All QStash jobs log with emoji prefixes for easy filtering
- 🚀 Job started
- 📨 Message published  
- ✅ Job completed
- ❌ Job failed

### QStash Console
- Monitor queue depth and processing rates
- View failed messages in Dead Letter Queue
- Track API usage and costs

### Database Metrics
- Monitor job completion rates
- Track average processing times
- Identify frequently failing URLs

## Development vs Production

### Development
- Use ngrok or similar for webhook endpoints
- Enable debug logging
- Lower concurrency for easier debugging

### Production
- Use proper domain with SSL
- Monitor DLQ and set up alerts
- Tune concurrency based on target sites
- Set up proper error tracking (Sentry, etc.)

## Common Issues

### Webhook Not Received
- Check BASE_URL is correct and publicly accessible
- Verify QStash signing keys are properly set
- Check firewall/security group settings

### Jobs Stuck in Queue
- Check QStash console for error messages
- Verify database connectivity
- Look for failed authentication

### High Failure Rate
- Review SSRF protection settings
- Check target site rate limiting
- Adjust concurrency and delays

## Migration from V3

To migrate from the existing Redis/BullMQ system:

1. Set up QStash environment variables
2. Deploy new `/api/v4/process` endpoint
3. Test with small crawl jobs
4. Gradually migrate traffic from V3 to V4 endpoints
5. Monitor performance and error rates
6. Decommission old Redis queue workers

## Cost Optimization

- QStash pricing is per-message, not per-hour
- Use batch publishing to reduce message count
- Set appropriate quality thresholds to avoid processing low-value pages
- Monitor usage in Upstash console
- Consider queue pausing for maintenance windows