# V4 Event-Driven Queue Architecture

## Overview

The V4 architecture replaces the polling-based orchestrator with a fully event-driven, queue-based system. This provides better scalability, reliability, and separation of concerns.

## Key Components

### 1. Job Creation (`/api/v4/jobs`)
- Creates job record in database
- Initializes Redis queue with starting URL
- Spawns 3-5 initial workers
- Returns immediately with stream URL

### 2. Worker Endpoint (`/api/v4/worker`)
- Processes tasks from Redis queue
- Self-invokes for continuation (controlled recursion)
- Respects concurrency limits (max 5 workers per job)
- Handles batch processing of URLs

### 3. Stream Endpoint (`/api/v4/jobs/[id]/stream`)
- **Only reads events** from database
- No orchestration logic
- Uses resumable-stream for reconnection support
- Terminates on completion events

### 4. Redis Queue (`/lib/serverless/redis-queue`)
- LIST-based work queue (LPUSH/RPOP)
- URL deduplication with SET
- Worker count tracking
- Atomic operations

## Data Flow

```
User Request
    ↓
Job Creation
    ├→ Database: Create job record
    ├→ Redis: Initialize queue with URL
    └→ Workers: Spawn 3-5 initial workers
         ↓
Worker Processing (parallel)
    ├→ Pop tasks from Redis queue
    ├→ Call crawler API
    ├→ Store SSE events in database
    ├→ Add discovered URLs to queue
    └→ Self-invoke if more work exists
         ↓
Stream Reading (concurrent)
    ├→ Read events from database
    └→ Send to client via SSE
```

## Key Benefits

1. **Separation of Concerns**
   - Stream only reads events
   - Workers only process tasks
   - Queue manages work distribution

2. **Better Scalability**
   - Workers run independently
   - No central orchestrator bottleneck
   - Redis handles concurrent access

3. **Improved Reliability**
   - Workers can retry independently
   - Queue persists work state
   - No single point of failure

4. **Vercel-Optimized**
   - Short-lived worker invocations
   - Fire-and-forget pattern
   - Efficient resource usage

## Redis Data Structures

- `queue:{jobId}` - LIST of URL tasks to process
- `seen:{jobId}` - SET of URLs already queued (deduplication)
- `workers:{jobId}` - Counter for active workers

## Worker Lifecycle

1. Worker starts, increments counter
2. Processes up to 10 batches
3. Decrements counter on exit
4. Spawns continuation if needed
5. Completes job when queue empty

## Error Handling

- Workers handle errors independently
- Failed URLs marked in database
- Events stored for client visibility
- Graceful degradation on Redis issues