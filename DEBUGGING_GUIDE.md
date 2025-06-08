# SSE Progress Tracking Debugging Guide

## Issue Summary
The React UI is not receiving real-time progress updates via Server-Sent Events (SSE) even though the backend crawler is working.

## What I've Fixed ✅
1. **Frontend Timing Issue**: Removed 2-second delay in SSE connection establishment
2. **Enhanced Logging**: Added detailed console logging for SSE events
3. **Verified Core Components**: 
   - ✅ SSE endpoint works and returns correct headers
   - ✅ Redis connection and pub/sub works
   - ✅ Progress events can be published and retrieved
   - ✅ React component logic handles SSE events correctly

## Root Cause Analysis

### What's Working:
- SSE endpoint (`/api/crawl-v2/[id]/stream`) returns proper headers and connected event
- Redis connection works in test environment  
- React component logic correctly processes SSE events
- Frontend timing issue fixed (no more 2-second delay)

### What's NOT Working:
The most likely issues (in order of probability):

1. **Queue Worker Not Running in Development** ⭐ MOST LIKELY
   - The worker might not be started in dev mode
   - No progress events = no SSE updates

2. **Redis Pub/Sub Channel Mismatch**
   - Events published to wrong channel
   - SSE listening to different channel

3. **EventSource Not Firing in Browser**
   - Browser EventSource implementation issue
   - CORS or network problems

## Debugging Steps

### Step 1: Verify Queue Worker is Running
```bash
# Start development server
pnpm dev

# Check console logs for:
# "🏗️ Starting crawl worker with concurrency: 10"
# "🔍 WORKER DEBUG - This should appear in logs if worker starts!"
```

### Step 2: Test in Browser Console
1. Open browser to `localhost:3000`
2. Open Dev Tools → Console
3. Submit a crawl URL
4. Look for these logs:
   ```
   🔄 Connecting to SSE stream for crawl: [id]
   📡 SSE connection established
   📨 SSE update received: {type: "connected", crawlId: "[id]"}
   ```

### Step 3: Check Network Tab
1. Dev Tools → Network tab
2. Look for `/api/crawl-v2/[id]/stream` request
3. Should show:
   - Status: 200
   - Type: eventsource  
   - Status: (pending) - stream stays open

### Step 4: Check SSE Response Data
1. In Network tab, click on the stream request
2. Go to Response tab
3. Should see:
   ```
   data: {"type":"connected","crawlId":"..."}
   
   data: {"type":"progress","data":{...}}
   ```

## Likely Fixes

### Fix 1: Ensure Worker Starts in Development
Check if the worker is started when the first crawl begins. Look for:

```typescript
// In src/lib/crawler/queue-worker.ts
await startWorker(1) // This should be called
```

### Fix 2: Check Redis Channel Names
Verify the SSE stream subscribes to the same channel that events are published to:

**Publishing** (in queue-worker.ts):
```typescript
await redis.publish(`crawl:${crawlId}:progress`, JSON.stringify(eventWithMeta))
```

**Subscribing** (in stream route):
```typescript
await subscriber.subscribe(`crawl:${crawlId}:progress`)
```

### Fix 3: Add Worker Debugging
Add this to the queue worker to verify it's processing jobs:

```typescript
console.log(`🔥 BATCH JOB PROCESSING: ${crawlId}, batch ${batchNumber}`)
console.log(`📡 PUBLISHING PROGRESS EVENT FOR: ${crawlId}`)
```

## Quick Test Commands

```bash
# Test basic crawler without SSE
pnpm test simple-real-test.test.ts

# Test SSE endpoint directly  
pnpm test sse-endpoint-direct-test.test.ts

# Test environment variables
pnpm test debug-environment.test.ts
```

## Manual Browser Test

1. Run `pnpm dev`
2. Go to `localhost:3000`
3. Open Dev Tools Console + Network tab
4. Enter URL: `https://docs.lovable.dev/introduction`
5. Click "Paste It!"
6. **Expected**: See SSE connection + progress events
7. **Actual**: Probably see SSE connection but no progress events

## If Still Not Working

The issue is most likely that **the queue worker is not running** in development mode, which means:
- Crawl starts successfully ✅
- SSE connection established ✅  
- But no jobs are processed ❌
- So no progress events published ❌
- So SSE stream receives only "connected" event ❌

**Solution**: Ensure the worker starts automatically when first crawl begins.