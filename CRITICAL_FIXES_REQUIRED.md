# Critical Fixes Required for Docspasta V2

## Overview

The current implementation has repeatedly diverged from the correct architectural patterns. This document outlines the EXACT fixes required to implement the proper three-function architecture using Vercel streaming patterns and resumable-stream.

## Core Architecture: Three Functions Pattern

### 1. **Job Creation Function** (`/api/v4/jobs`)
- Creates job record in database
- Initializes job state in Redis
- Returns job ID to client
- **Does NOT process anything**

### 2. **Crawl Worker Function** (`/api/v4/crawl`)
- Stateless crawler that processes URLs
- Receives batch of URLs to crawl
- Returns crawled content
- **Does NOT manage job state or streaming**

### 3. **Process Function** (`/api/v4/process`)
- Processes crawled content
- Updates job state
- Publishes progress events
- **Does NOT crawl or stream**

## Critical Fix #1: Implement Correct resumable-stream Pattern

### Current WRONG Implementation (Both V3 and V4)
```typescript
// ❌ WRONG - Creating custom ReadableStream
const stream = await streamContext.resumableStream(
  `job-${jobId}`,
  () => {
    return new ReadableStream({
      async start(controller) {
        // Custom implementation
      }
    })
  }
)
```

### CORRECT Implementation Pattern
```typescript
// ✅ CORRECT - Direct stream generation
import { createResumableStreamContext } from "resumable-stream";
import { waitUntil } from '@vercel/functions';

const streamContext = createResumableStreamContext({
  waitUntil,
  redis: { publisher, subscriber } // Optional, will create its own if not provided
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;
  const resumeAt = req.nextUrl.searchParams.get("resumeAt");
  
  // For idempotent API (recommended)
  const stream = await streamContext.resumableStream(
    `job-stream-${jobId}`,
    makeJobStream, // Generator function
    resumeAt ? parseInt(resumeAt) : undefined
  );
  
  if (!stream) {
    return new Response("Stream is already done", { status: 422 });
  }
  
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

// The stream generator function
async function* makeJobStream(streamId: string): AsyncGenerator<string> {
  const jobId = streamId.replace('job-stream-', '');
  let position = 0;
  
  while (true) {
    // Read from Redis Stream
    const events = await redis.xread(
      'BLOCK', 2000,
      'STREAMS', `events:${jobId}`, position || '$'
    );
    
    if (!events || events.length === 0) {
      // Check if job is complete
      const jobStatus = await redis.hget(`job:${jobId}`, 'status');
      if (jobStatus === 'completed' || jobStatus === 'failed') {
        break;
      }
      // Send heartbeat
      yield `: heartbeat\n\n`;
      continue;
    }
    
    // Process events
    for (const [stream, messages] of events) {
      for (const [id, fields] of messages) {
        position = id;
        const data = JSON.parse(fields[1]);
        yield `event: ${data.type}\ndata: ${JSON.stringify(data)}\nid: ${id}\n\n`;
      }
    }
  }
}
```

## Critical Fix #2: Implement User Isolation

### Database Schema Changes
```sql
-- Add user_id to jobs table
ALTER TABLE jobs ADD COLUMN user_id TEXT NOT NULL;
CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_user_id_created_at ON jobs(user_id, created_at DESC);
```

### Redis Key Namespacing
```typescript
// ❌ WRONG - Global keys
const jobKey = `job:${jobId}`;
const streamKey = `stream:${jobId}`;

// ✅ CORRECT - User-namespaced keys
const jobKey = `user:${userId}:job:${jobId}`;
const streamKey = `user:${userId}:stream:${jobId}`;
const queueKey = `user:${userId}:queue:${jobId}`;
```

### SQL Query Updates
```typescript
// ❌ WRONG - No user filtering
const job = await sql`SELECT * FROM jobs WHERE id = ${jobId}`;

// ✅ CORRECT - User-scoped queries
const job = await sql`
  SELECT * FROM jobs 
  WHERE id = ${jobId} AND user_id = ${userId}
`;
```

## Critical Fix #3: Replace Orchestrator with Event-Driven Queue

### Remove Polling Orchestrator
Delete the entire V4 orchestrator pattern that polls in a tight loop.

### Implement Queue-Based Processing
```typescript
// Job Creation - Initialize queue
export async function POST(req: NextRequest) {
  const { url } = await req.json();
  const userId = await getUserId(req); // Auth required
  
  // Create job in database
  const jobId = await createJob(userId, url);
  
  // Initialize Redis structures
  const queueKey = `user:${userId}:queue:${jobId}`;
  const stateKey = `user:${userId}:job:${jobId}:state`;
  
  // Add initial URL to queue
  await redis.lpush(queueKey, JSON.stringify({
    url,
    depth: 0,
    jobId,
    userId
  }));
  
  // Initialize job state
  await redis.hset(stateKey, {
    status: 'running',
    totalUrls: 1,
    processedUrls: 0,
    failedUrls: 0
  });
  
  // Fan out initial workers (limited concurrency)
  const INITIAL_WORKERS = 3;
  for (let i = 0; i < INITIAL_WORKERS; i++) {
    // Trigger worker function asynchronously
    fetch('/api/v4/worker', {
      method: 'POST',
      body: JSON.stringify({ jobId, userId })
    }).catch(() => {}); // Fire and forget
  }
  
  return NextResponse.json({ jobId });
}

// Worker Function - Process one item from queue
export async function POST(req: NextRequest) {
  const { jobId, userId } = await req.json();
  
  const queueKey = `user:${userId}:queue:${jobId}`;
  const task = await redis.rpop(queueKey);
  
  if (!task) {
    // Queue empty, check if job is done
    await checkJobCompletion(jobId, userId);
    return NextResponse.json({ done: true });
  }
  
  const { url, depth } = JSON.parse(task);
  
  try {
    // Call crawler
    const result = await crawlUrl(url);
    
    // Publish progress event
    await publishEvent(userId, jobId, {
      type: 'url_processed',
      url,
      success: true
    });
    
    // Add discovered URLs back to queue (if under depth limit)
    if (depth < 2 && result.discoveredUrls) {
      for (const newUrl of result.discoveredUrls) {
        await redis.lpush(queueKey, JSON.stringify({
          url: newUrl,
          depth: depth + 1,
          jobId,
          userId
        }));
      }
    }
    
    // Process content asynchronously
    fetch('/api/v4/process', {
      method: 'POST',
      body: JSON.stringify({ 
        jobId, 
        userId, 
        content: result.content 
      })
    }).catch(() => {});
    
    // Self-invoke to process next item
    fetch('/api/v4/worker', {
      method: 'POST',
      body: JSON.stringify({ jobId, userId })
    }).catch(() => {});
    
  } catch (error) {
    await publishEvent(userId, jobId, {
      type: 'url_failed',
      url,
      error: error.message
    });
  }
  
  return NextResponse.json({ processed: url });
}
```

## Critical Fix #4: Proper Resource Management

### Redis Connection Management
```typescript
// ✅ CORRECT - Proper cleanup pattern
import { createClient } from 'redis';

async function withRedis<T>(
  operation: (client: ReturnType<typeof createClient>) => Promise<T>
): Promise<T> {
  const client = createClient({ url: process.env.REDIS_URL });
  
  try {
    await client.connect();
    return await operation(client);
  } finally {
    await client.disconnect();
  }
}

// Usage
export async function GET(req: NextRequest) {
  return withRedis(async (redis) => {
    // Use redis client
    const data = await redis.get('key');
    return NextResponse.json({ data });
  });
}
```

### Serverless Function Timeouts
```typescript
// Set appropriate timeouts for each function type
export const config = {
  // Job creation - quick
  maxDuration: 10, // 10 seconds
};

// Worker functions - medium
export const config = {
  maxDuration: 30, // 30 seconds per URL
};

// Stream functions - can be longer
export const config = {
  maxDuration: 300, // 5 minutes for streaming
};
```

## Implementation Priority

1. **IMMEDIATE**: Fix SSE implementation to use correct resumable-stream pattern
2. **URGENT**: Add user isolation to prevent security breach
3. **HIGH**: Replace polling orchestrator with queue-based workers
4. **MEDIUM**: Implement proper resource cleanup
5. **ONGOING**: Add comprehensive error handling and monitoring

## Testing Requirements

1. **Multi-user isolation tests**: Verify users cannot access each other's jobs
2. **SSE reconnection tests**: Verify streams resume correctly after disconnect
3. **Concurrency tests**: Ensure system doesn't exceed Vercel limits
4. **Resource leak tests**: Verify all connections are properly closed
5. **Load tests**: Validate system handles multiple concurrent jobs

## Monitoring & Observability

1. Add structured logging with correlation IDs
2. Track Redis connection pool metrics
3. Monitor Vercel function invocation counts and durations
4. Alert on concurrency limit approaches
5. Track job completion rates and error rates

## Remember

- **ALWAYS** use resumable-stream's built-in patterns
- **NEVER** create custom ReadableStream for SSE
- **ALWAYS** namespace Redis keys by user
- **NEVER** use polling loops in serverless functions
- **ALWAYS** clean up resources in finally blocks

This is not optional. These patterns are required for a production-ready serverless application.