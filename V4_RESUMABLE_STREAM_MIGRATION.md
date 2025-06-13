# V4 Resumable-Stream Migration Plan

## Overview

V4 uses the **three-function serverless architecture** (orchestrator pattern) but FORGOT to use resumable-stream for the SSE endpoint. We need to fix the `/stream` route to use resumable-stream while keeping the three-function pattern intact.

## Architecture Reminder

1. **POST /api/v4/jobs** - Creates job, adds to queue ✅
2. **GET /api/v4/jobs/[id]/stream** - SSE orchestrator ❌ (NEEDS RESUMABLE-STREAM)
3. **POST /api/v4/crawl** - Stateless crawler function ✅
4. **POST /api/v4/process** - Content processor (async) ✅

The orchestrator (#2) is what needs fixing!

## Key Files to Modify

### 1. `/src/app/api/v4/jobs/[id]/stream/route.ts` ❌ NEEDS RESUMABLE-STREAM

**Current (WRONG):**
```typescript
const stream = new ReadableStream({
  async start(controller) {
    // Custom implementation - reinventing the wheel
  }
})
```

**New (CORRECT) - Keep orchestrator logic, use resumable-stream:**
```typescript
import { NextRequest } from 'next/server'
import { createResumableStreamContext } from 'resumable-stream'
import { createClient } from 'redis'
import { waitUntil } from '@vercel/functions' // CRITICAL!
import { 
  addUrlsToQueue, 
  getNextBatch, 
  markUrlsProcessing,
  updateJobStatus,
  getJob
} from '@/lib/serverless/db-operations'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params
  
  // Create Redis clients for resumable-stream
  const publisher = createClient({ url: process.env.REDIS_URL })
  const subscriber = createClient({ url: process.env.REDIS_URL })
  
  await Promise.all([
    publisher.connect(),
    subscriber.connect()
  ])
  
  // Create resumable stream context
  const streamContext = createResumableStreamContext({
    redis: { publisher, subscriber },
    waitUntil // CRITICAL: Required for Node.js runtime!
  })
  
  // Use resumable-stream for the orchestrator
  return streamContext.stream(request, async (send) => {
    const startTime = Date.now()
    const TIMEOUT_MS = 5 * 60 * 1000
    
    try {
      // Get job details
      const job = await getJob(jobId)
      if (!job) {
        await send('error', { error: 'Job not found' })
        return
      }
      
      // Send initial connection event
      await send('stream_connected', { jobId, url: job.url })
      
      // ORCHESTRATION LOOP - This is the three-function pattern!
      while (Date.now() - startTime < TIMEOUT_MS) {
        // 1. Get next batch from queue
        const batch = await getNextBatch(jobId, 10)
        
        if (batch.length === 0) {
          // No more URLs - job complete
          await updateJobStatus(jobId, 'completed')
          await send('job_completed', { jobId })
          break
        }
        
        // 2. Mark URLs as processing
        const urlIds = batch.map(item => item.id)
        await markUrlsProcessing(urlIds)
        
        try {
          // 3. Call the stateless crawler function
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/v4/crawl`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                jobId, 
                urls: batch.map(item => ({
                  id: item.id,
                  url: item.url,
                  depth: item.depth
                })),
                originalJobUrl: job.url
              }),
              signal: AbortSignal.timeout(35000)
            }
          )
          
          if (!response.ok) {
            console.error('Crawler failed:', await response.text())
            continue
          }
          
          const results = await response.json()
          
          // 4. Send progress via resumable-stream
          await send('batch_completed', {
            completed: results.completed.length,
            failed: results.failed.length,
            discovered: results.discoveredUrls?.length || 0,
            fromCache: results.completed.filter((r: any) => r.fromCache).length
          })
          
          // 5. Add discovered URLs to queue
          if (results.discoveredUrls?.length > 0) {
            const currentDepth = Math.max(...batch.map(item => item.depth))
            if (currentDepth < 2) {
              const newUrls = await addUrlsToQueue(
                jobId, 
                results.discoveredUrls,
                currentDepth + 1
              )
              
              await send('urls_discovered', {
                count: newUrls,
                depth: currentDepth + 1
              })
            }
          }
          
          // 6. Trigger content processor (async, don't await)
          if (results.completed.length > 0) {
            fetch(
              `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/v4/process`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  jobId, 
                  results: results.completed 
                })
              }
            ).catch(error => {
              console.error('Failed to call processor:', error)
            })
          }
          
        } catch (error) {
          console.error('Crawler error:', error)
          await send('batch_error', {
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
        
        // Brief pause to prevent tight loop
        await new Promise(resolve => setTimeout(resolve, 200))
      }
      
      // Handle timeout
      if (Date.now() - startTime >= TIMEOUT_MS) {
        await updateJobStatus(jobId, 'timeout', 'Job exceeded 5-minute limit')
        await send('job_timeout', { jobId })
      }
      
    } catch (error) {
      console.error('Orchestrator error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      await updateJobStatus(jobId, 'failed', errorMessage)
      await send('job_failed', { error: errorMessage })
    } finally {
      // Clean up Redis connections
      await Promise.all([
        publisher.disconnect(),
        subscriber.disconnect()
      ])
    }
  })
}

export const maxDuration = 300 // 5 minutes
```

### 2. Remove Custom SSE Code

Delete or ignore these files that implement custom SSE:
- `/src/lib/serverless/redis-stream.ts` - We don't need custom pub/sub
- Any custom Last-Event-ID handling

### 3. Update PostgreSQL Event Storage

Since resumable-stream handles event replay from Redis, we might not need `getSSEEvents` from PostgreSQL. However, we can keep it for long-term storage if needed.

## What Changes

1. **SSE Protocol**: resumable-stream handles it correctly
2. **Event IDs**: Generated automatically by resumable-stream
3. **Reconnection**: Handled by resumable-stream + EventSource
4. **Redis Pub/Sub**: Managed by resumable-stream
5. **Three-Function Pattern**: STAYS THE SAME

## What Stays the Same

1. **Job Creation**: `/api/v4/jobs` unchanged
2. **Crawler Function**: `/api/v4/crawl` unchanged
3. **Processor Function**: `/api/v4/process` unchanged
4. **Database Operations**: All the queue management unchanged
5. **Orchestration Logic**: The while loop and batch processing unchanged

## Implementation Steps

1. **Install resumable-stream** (already installed)
2. **Copy the pattern from V3** for Redis client setup
3. **Wrap existing orchestration logic** in streamContext.stream()
4. **Replace controller.enqueue()** with await send()
5. **Remove custom stream handling**
6. **Test reconnection works**

## Testing Checklist

- [ ] Start a crawl with POST /api/v4/jobs
- [ ] Connect to SSE stream
- [ ] See batch_completed events
- [ ] Refresh page mid-crawl
- [ ] Verify resumption works (no duplicate events)
- [ ] Check 5-minute timeout
- [ ] Verify three functions still work together

## Remember

The three-function architecture is GOOD. We just need to use resumable-stream for the SSE part instead of reinventing it. Everything else stays exactly the same.