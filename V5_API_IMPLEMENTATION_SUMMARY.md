# V5 API Implementation Summary

## Overview

The V5 API is a complete rebuild of Docspasta's crawling system with clean separation of concerns and efficient resumable-stream SSE implementation. This replaces the 567-line V4 stream route monster with a proper architecture.

## Key Innovations

### 1. State Versioning for Ultra-Efficient SSE
- **Problem**: Naive SSE polling requires expensive database queries and redundant data transmission
- **Solution**: State versioning pattern with auto-incrementing `state_version` field
- **Benefit**: SSE polling becomes a single integer comparison - only sends data when state actually changes

### 2. Clean Architecture Separation
```
V4: Monolithic stream route (567 lines) with embedded orchestration
V5: Clean separation across 4 focused API routes + worker functions
```

- **`/api/v5/crawl`** - Job initiation (validates, creates job, publishes to QStash)
- **`/api/v5/jobs/[id]/stream`** - Resumable SSE stream (polls database state only)  
- **`/api/v5/jobs/[id]`** - Job details/results (includes final markdown)
- **`/api/v5/process`** - QStash webhook (uses worker functions)

### 3. Database-Driven Resumable Streams
- Uses resumable-stream v2.2.0 correctly with `after` from next/server
- Database polling every 1 second vs complex Redis pub/sub
- State reconstruction from relational data (NOT event replay)
- Proper client reconnection with Last-Event-ID handling

## Architecture Components

### Core API Routes

#### 1. POST /api/v5/crawl
**Purpose**: Job initiation with immediate response
- Validates input with Zod schemas
- Creates job record with initial state (version 1)
- Publishes start-crawl job to QStash  
- Returns 202 Accepted with job ID immediately

#### 2. GET /api/v5/jobs/[id]/stream  
**Purpose**: Resumable SSE stream for real-time updates
- Ultra-efficient state version polling (single integer comparison)
- Uses resumable-stream v2.2.0 with proper `ResumableReadableStream` pattern
- Handles client reconnection via Last-Event-ID
- Clean implementation using database polling instead of Redis

#### 3. GET /api/v5/jobs/[id]
**Purpose**: Job metadata and results
- Returns job details, metrics, recent pages
- Includes final markdown on completion
- User authorization with job ownership validation

#### 4. POST /api/v5/process
**Purpose**: QStash webhook processing
- Verifies QStash message signatures  
- Uses V5 worker functions for actual processing
- Proper error handling and retry logic

### Worker Functions (`v5-worker.ts`)

#### Fan-out Processing Pattern
1. **Start-crawl job**: Discovers URLs, creates page records, fans out to processing
2. **Process-url jobs**: Crawl individual pages with idempotency (FOR UPDATE locks)
3. **Auto-finalization**: Detects completion and generates final markdown

#### Idempotency & Concurrency
- FOR UPDATE locks prevent duplicate processing
- Atomic state updates with automatic version incrementing  
- Graceful handling of QStash's at-least-once delivery

### Database Schema (`schema-new.ts`)

#### 3-Table Clean Architecture
```sql
crawling_jobs:
  - Core job metadata and configuration
  - state_version (auto-incrementing for SSE efficiency)
  - progress_summary (cached counters for fast polling)

crawled_pages:
  - Individual page metadata and status
  - Proper indexing for performance queries

page_content_chunks:  
  - Chunked content for efficient processing
  - Supports multiple content types (raw, markdown, processed)
```

#### State Versioning Implementation
```sql
-- Auto-increment trigger
CREATE TRIGGER increment_state_version()
  BEFORE UPDATE ON crawling_jobs
  -- Only increments when meaningful fields change
  -- Sets updated_at automatically
```

### State Management (`v5-state-management.ts`)

#### Atomic Operations
- `updateJobState()` - Atomic job updates with auto-versioning
- `incrementPageCounts()` - Atomic counter increments  
- `markJobAsRunning/Completed/Failed()` - Convenience methods

#### Efficient Progress Tracking
```typescript
// Single database query for SSE polling
const state = await db.select({
  stateVersion, status, progressSummary  
}).where(eq(crawlingJobs.id, jobId))

// Only send SSE event if version changed
if (state.stateVersion > lastSeenVersion) {
  sendEvent('progress', state.progressSummary, state.stateVersion)
}
```

## Performance Characteristics

### SSE Streaming
- **V4**: Complex pub/sub with Redis streams, event replay, 567-line orchestration
- **V5**: Simple 1-second polling with state versioning, 50-line implementation
- **Efficiency**: Only transmits data when state actually changes

### Database Operations  
- **Indexes**: Proper indexing on foreign keys, user isolation, state versions
- **Atomicity**: All state updates are atomic with automatic versioning
- **Concurrency**: FOR UPDATE locks prevent race conditions

### Worker Processing
- **Fan-out**: Start-crawl → multiple process-url jobs (parallelization)
- **Idempotency**: Safe for QStash's at-least-once delivery 
- **Auto-completion**: No manual job finalization required

## Security & User Isolation

### Authorization Pattern
```typescript
// All queries include user authorization
WHERE job_id = ? AND user_id = ?
```

### Request Validation
- Zod schemas for all inputs
- URL validation for SSRF protection  
- QStash signature verification

## Migration Path

### Database Migration
```sql
-- v5-state-versioning.sql  
ALTER TABLE crawling_jobs 
ADD COLUMN state_version INTEGER NOT NULL DEFAULT 1,
ADD COLUMN progress_summary JSONB NOT NULL DEFAULT '{}';

-- Auto-increment trigger for state versioning
CREATE TRIGGER increment_state_version()...
```

### Frontend Integration
```typescript
// Replace V4 EventSource usage
const eventSource = new EventSource(`/api/v5/jobs/${jobId}/status`)

eventSource.addEventListener('progress', (event) => {
  const data = JSON.parse(event.data)
  // data.progress contains cached counters
  // event.lastEventId contains state version for resumption
})
```

## Benefits Over V4

### Developer Experience
- **V4**: 567-line monolithic stream route that's hard to debug/maintain
- **V5**: Clean separation with focused, testable components  

### Performance  
- **V4**: Expensive Redis operations, complex pub/sub, event replay
- **V5**: Ultra-efficient state versioning, minimal database queries

### Reliability
- **V4**: Complex race conditions, controller close errors, restart issues  
- **V5**: Database-driven state, proper idempotency, graceful error handling

### Resumability
- **V4**: Event replay from Redis (complex, error-prone)
- **V5**: State reconstruction from database (simple, reliable)

## Testing Strategy

### Unit Tests (`v5-api-validation.test.ts`)
- Schema validation
- API endpoint structure  
- Response format validation

### Integration Tests
- Full crawl workflow (initiate → process → complete)
- SSE stream reconnection
- Error handling and retry logic

## Production Readiness

### Monitoring
- Structured logging with job IDs and state versions
- Clear success/failure indicators  
- Performance metrics (processing times, queue depths)

### Error Handling
- Graceful degradation on failures
- Proper HTTP status codes  
- Detailed error messages for debugging

### Scalability
- Horizontal scaling via QStash fan-out
- Database connection pooling considerations
- State versioning prevents N+1 query problems

## Next Steps

1. **Run migration**: Apply v5-state-versioning.sql
2. **Deploy routes**: Enable V5 API endpoints  
3. **Update frontend**: Switch to V5 EventSource usage
4. **Monitor performance**: Compare V5 vs V4 metrics
5. **Deprecate V4**: Once V5 is proven stable