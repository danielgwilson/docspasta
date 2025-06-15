# V4 Streaming Orchestrator Implementation Summary

## Overview

This document summarizes the complete implementation of the V4 streaming orchestrator for Docspasta, including requirements, architecture decisions, implementation details, issues encountered, and next steps.

## Core Requirements

### Architecture Requirements (Non-Negotiable)
1. **MUST use long-running Vercel functions** - 5-minute orchestrator pattern is intentional
2. **Three-function serverless pattern** must be maintained:
   - **Orchestrator** (`/api/v4/jobs/[id]/stream`) - Manages job lifecycle, streams progress
   - **Crawler** (`/api/v4/crawl`) - Stateless URL crawler
   - **Processor** (`/api/v4/process`) - Content processor
3. **NO caching** - Always crawl fresh (requirement changed from original design)
4. **Use resumable-stream correctly** - It expects `ReadableStream<string>`, NOT async generators

### Streaming Requirements
- Process URLs individually as they complete (no batch waiting)
- Limit concurrent crawls with p-queue
- Stream granular events for each step
- Send elapsed time updates every second
- Real-time progress visibility

## Architecture Deep Dive

### The Three-Function Pattern

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│   Orchestrator  │────▶│     Crawler     │────▶│    Processor    │
│  (5 min max)    │     │   (stateless)   │     │   (async)       │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                               │
        │                                               │
        ▼                                               ▼
   SSE Stream                                      Database
   to Client                                       Storage
```

### Resumable-Stream Pattern (CRITICAL)

**Key Understanding**: resumable-stream expects a function that returns `ReadableStream<string>`, NOT an async generator.

```typescript
// ✅ CORRECT - What resumable-stream expects
function makeJobStream(streamId: string): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      // Your orchestration logic here
      controller.enqueue(`event: progress\ndata: ${JSON.stringify(data)}\nid: ${id}\n\n`)
    }
  })
}

// ❌ WRONG - Not what resumable-stream expects
async function* makeJobStream(streamId: string): AsyncGenerator<string> {
  yield `event: progress\ndata: ${JSON.stringify(data)}\nid: ${id}\n\n`
}
```

## Implementation Steps Completed

### Step 1: Streaming URL Processing ✅

**Changed From**: Batch processing with `Promise.allSettled`
**Changed To**: Individual URL streaming with p-queue

**Key Implementation**:
```typescript
import PQueue from 'p-queue'

const queue = new PQueue({ concurrency: MAX_CONCURRENT_CRAWLS })

// Process each URL individually
const processUrl = async (url: string, depth: number) => {
  // Send url_started event
  controller.enqueue(`event: url_started\ndata: ${JSON.stringify({url, depth})}\nid: start-${Date.now()}\n\n`)
  
  // Crawl the URL
  const result = await crawlUrl(url)
  
  // Send url_crawled event
  controller.enqueue(`event: url_crawled\ndata: ${JSON.stringify(result)}\nid: crawl-${Date.now()}\n\n`)
  
  // Process discovered URLs
  if (result.discoveredUrls) {
    // Send urls_discovered event
    // Add new URLs to queue
  }
  
  // Send to processor (fire and forget)
  fetch('/api/v4/process', {...}).catch(console.error)
}
```

**Events Now Streamed**:
- `url_started` - When crawling begins
- `url_crawled` - When crawling completes
- `urls_discovered` - When new URLs found
- `sent_to_processing` - When content sent to processor
- `url_failed` - On errors
- `progress` - Queue status updates

### Step 2: Time Updates Every Second ✅

**Implementation**:
```typescript
const sendTimeUpdate = async () => {
  const elapsed = Math.floor((Date.now() - startTime) / 1000)
  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`
  
  controller.enqueue(`event: time_update\ndata: ${JSON.stringify({
    elapsed,
    formatted,
    totalProcessed,
    totalDiscovered,
    queueSize: queue.size,
    pendingCount: queue.pending
  })}\nid: time-${Date.now()}\n\n`)
}

const timeUpdateInterval = setInterval(sendTimeUpdate, 1000)
```

### Bonus: Zod Integration for Safe SSE Parsing ✅

**Problem**: UI was crashing with `JSON.parse()` errors on malformed SSE events

**Solution**: Created comprehensive Zod schemas for all SSE events

```typescript
// Before (unsafe)
const data = JSON.parse(event.data)  // Could throw!

// After (safe)
const data = parseSSEEvent(event.data)
if (!data || data.type !== 'url_crawled') {
  console.error('Failed to parse url_crawled event:', event.data)
  return
}
```

**Benefits**:
- No more JSON parse crashes
- Type-safe event handling
- Clear error messages for debugging
- Graceful handling of malformed data

## Issues Encountered and Resolved

### 1. SSE JSON Parse Error
**Issue**: Native EventSource error events don't have `data` property
**Fix**: Removed the problematic error event listener, rely on `onerror` handler

### 2. Stale Closure Bug
**Issue**: `status` variable in error handler was stale
**Fix**: Added `useRef` to track current status

### 3. Resumable-Stream Confusion
**Issue**: Initial assumption that it wanted async generators
**Resolution**: Library expects `ReadableStream<string>`, not generators

### 4. UI Not Updating
**Root Causes**:
- JSON parse errors were crashing event handlers
- Stale closures preventing reconnection
**Fix**: Zod parsing + proper closure handling

## Current State

### What's Working ✅
- Individual URL streaming with real-time events
- 1-second elapsed time updates with job metrics
- Safe SSE parsing with Zod validation
- Proper error handling and recovery
- Three-function architecture preserved
- Resumable-stream pattern correctly implemented

### Event Types Implemented
1. `stream_connected` - Initial connection
2. `url_started` - URL processing begins
3. `url_crawled` - URL successfully crawled
4. `urls_discovered` - New URLs found
5. `url_failed` - URL processing failed
6. `sent_to_processing` - Content sent to processor
7. `progress` - Queue and processing updates
8. `time_update` - Every second with elapsed time
9. `job_completed` - Job finished successfully
10. `job_failed` - Job failed with error
11. `job_timeout` - Job exceeded 5 minutes

## Next Steps

### Step 3: Smart URL Pattern Handling (Not Yet Implemented)

**Current Limitation**: Rigid `isWithinPathPrefix` function

**Planned Enhancement**:
```typescript
interface CrawlConfig {
  startUrl: string
  includePatterns?: string[]  // ["/docs/**", "/tutorials/**"]
  excludePatterns?: string[]  // ["/blog/**", "**/*-old"]
  allowedDomains?: string[]   // ["docs.example.com", "example.com"]
}
```

**Features to Add**:
- Auto-detect patterns from start URL
- Support subdomains (docs.example.com)
- Support multiple paths (/docs/*, /tutorials/*)
- Exclude specific sections
- Use micromatch for glob patterns

### Other Improvements to Consider

1. **Enhanced Error Recovery**
   - Retry failed URLs with exponential backoff
   - Better error categorization

2. **Performance Optimizations**
   - Dynamic concurrency adjustment based on response times
   - Smarter URL prioritization

3. **UI Enhancements**
   - Visual queue depth indicator
   - Per-URL progress tracking
   - Better error display

4. **Monitoring & Observability**
   - Structured logging with correlation IDs
   - Performance metrics
   - Error rate tracking

## Key Learnings

1. **Read the Library Source**: resumable-stream wanted `ReadableStream`, not generators
2. **Test Real Scenarios**: Many existing tests used old patterns
3. **Zod Everything**: Runtime validation prevents crashes
4. **EventSource Quirks**: Native error events are different from custom events
5. **Closure Pitfalls**: React hooks + async code = potential stale closures

## Testing Strategy

### Current Test Coverage
- ✅ Streaming URL processing
- ✅ Time update functionality  
- ✅ Zod schema validation
- ✅ CrawlCard error handling

### Tests to Add
- [ ] Resumable stream reconnection
- [ ] 5-minute timeout handling
- [ ] Concurrent crawl limits
- [ ] URL pattern matching (Step 3)

## Conclusion

The V4 streaming orchestrator successfully implements real-time URL processing with granular event streaming while maintaining the three-function serverless architecture. The addition of Zod validation makes the system robust against malformed data. The next major enhancement will be smart URL pattern handling to support various documentation site structures.