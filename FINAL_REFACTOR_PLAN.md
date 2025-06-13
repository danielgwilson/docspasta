# Final Refactor Plan - Simple Three-Function Architecture

**Use Case**: Paste docs URL → Get LLM-friendly markdown of all pages  
**Timeout**: 5 minutes BY DESIGN (no infinite crawling)  
**Complexity**: Keep it simple - this is NOT enterprise software  

## Core Principles

1. **Simple Function Chain**: Orchestrator → Crawler → Processor
2. **Content Caching**: Store URLs + content for reuse across users
3. **Fail Fast**: If job fails partway, mark failed and move on
4. **Resume Streams**: Redis for reconnection, PostgreSQL for persistence
5. **No Over-Engineering**: Avoid complex queue systems

## Three-Function Architecture

### 1. Job Orchestrator (`/api/v3/jobs/[id]/stream`)
**Role**: Coordinate crawl, stream results, 5-minute timeout  
**Timeout**: 5 minutes (Vercel max for streaming)

```typescript
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const jobId = params.id
  
  // Return resumable stream
  return new ReadableStream({
    async start(controller) {
      const startTime = Date.now()
      const TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
      
      try {
        // Stream initial event
        await publishEvent(jobId, { type: 'job_started' })
        
        // Main orchestration loop
        while (Date.now() - startTime < TIMEOUT_MS) {
          // Get next batch from queue (check cache first)
          const batch = await getNextBatch(jobId, 10)
          
          if (batch.length === 0) {
            // No more URLs - job complete
            await finalizeJob(jobId)
            await publishEvent(jobId, { type: 'job_completed' })
            break
          }
          
          // Call crawler function
          const crawlerResponse = await fetch('/api/v3/crawl', {
            method: 'POST',
            body: JSON.stringify({ jobId, urls: batch }),
            signal: AbortSignal.timeout(35000) // 35s timeout
          })
          
          if (!crawlerResponse.ok) {
            console.error('Crawler failed:', await crawlerResponse.text())
            continue // Try next batch
          }
          
          const results = await crawlerResponse.json()
          
          // Stream results immediately
          await publishEvent(jobId, {
            type: 'batch_completed',
            completed: results.completed.length,
            failed: results.failed.length,
            discovered: results.discoveredUrls?.length || 0
          })
          
          // Add new URLs to queue (with deduplication)
          if (results.discoveredUrls?.length > 0) {
            await addUrlsToQueue(jobId, results.discoveredUrls)
          }
          
          // Call content processor async (don't block)
          if (results.completed.length > 0) {
            fetch('/api/v3/process', {
              method: 'POST',
              body: JSON.stringify({ jobId, results: results.completed })
            }).catch(console.error)
          }
          
          // Brief pause to prevent tight loop
          await new Promise(resolve => setTimeout(resolve, 200))
        }
        
        // Handle timeout
        if (Date.now() - startTime >= TIMEOUT_MS) {
          await publishEvent(jobId, { type: 'job_timeout' })
          await markJobTimeout(jobId)
        }
        
      } catch (error) {
        await publishEvent(jobId, { type: 'job_failed', error: error.message })
        await markJobFailed(jobId, error.message)
      }
    }
  })
}
```

### 2. Crawler Function (`/api/v3/crawl`)
**Role**: Fetch batch of URLs, return content + links  
**Timeout**: 30 seconds

```typescript
export async function POST(request: NextRequest) {
  const { jobId, urls } = await request.json()
  
  // Check cache first for each URL
  const results = await Promise.allSettled(
    urls.map(async (urlData) => {
      // Check if we already have this content
      const cached = await getCachedContent(urlData.url)
      if (cached) {
        console.log(`📄 Using cached: ${urlData.url}`)
        return {
          url: urlData.url,
          title: cached.title,
          content: cached.content,
          links: cached.links,
          success: true,
          fromCache: true
        }
      }
      
      // Crawl fresh
      const result = await crawlPage(urlData.url, { timeout: 8000 })
      
      if (result.success) {
        // Cache the content for future use
        await cacheContent(urlData.url, {
          title: result.title,
          content: result.content,
          links: result.links
        })
        
        return {
          url: urlData.url,
          title: result.title,
          content: result.content,
          links: result.links,
          success: true,
          fromCache: false
        }
      } else {
        return { 
          url: urlData.url, 
          success: false, 
          error: result.error 
        }
      }
    })
  )
  
  const completed = results
    .filter(r => r.status === 'fulfilled' && r.value.success)
    .map(r => r.value)
    
  const failed = results
    .filter(r => r.status === 'rejected' || !r.value?.success)
    .map(r => ({ 
      url: r.status === 'fulfilled' ? r.value.url : 'unknown',
      error: r.status === 'fulfilled' ? r.value.error : 'Unknown error' 
    }))
  
  // Extract discovered URLs (only from fresh crawls)
  const discoveredUrls = completed
    .filter(result => !result.fromCache) // Only get links from fresh crawls
    .flatMap(result => result.links || [])
    .filter(Boolean)
  
  return NextResponse.json({
    completed,
    failed,
    discoveredUrls
  })
}

export const maxDuration = 30 // 30 second timeout
```

### 3. Content Processor (`/api/v3/process`)
**Role**: Process results, generate markdown  
**Timeout**: 10 seconds

```typescript
export async function POST(request: NextRequest) {
  const { jobId, results } = await request.json()
  
  try {
    // Process each result
    const processed = results.map(result => ({
      url: result.url,
      title: result.title,
      content: result.content,
      quality: assessContentQuality(result.content),
      wordCount: result.content?.split(' ').length || 0
    }))
    
    // Store processed results
    await storeJobResults(jobId, processed)
    
    // Generate combined markdown if we have enough content
    const goodContent = processed.filter(p => p.quality.score >= 20)
    if (goodContent.length > 0) {
      const markdown = combineToMarkdown(goodContent)
      await updateJobMarkdown(jobId, markdown)
      
      // Stream markdown update
      await publishEvent(jobId, {
        type: 'markdown_updated',
        pages: goodContent.length,
        totalWords: goodContent.reduce((sum, p) => sum + p.wordCount, 0)
      })
    }
    
    return NextResponse.json({ 
      success: true, 
      processed: processed.length,
      goodContent: goodContent.length 
    })
    
  } catch (error) {
    console.error('Processing failed:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export const maxDuration = 10 // 10 second timeout
```

## Simplified Database Schema

```sql
-- Jobs table - basic job tracking
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running', -- running, completed, failed, timeout
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    final_markdown TEXT,
    error_message TEXT,
    
    -- Simple metrics
    pages_found INTEGER DEFAULT 0,
    pages_processed INTEGER DEFAULT 0,
    total_words INTEGER DEFAULT 0
);

-- URL cache - content reuse across jobs  
CREATE TABLE url_cache (
    url_hash CHAR(64) PRIMARY KEY, -- SHA256 of normalized URL
    url TEXT NOT NULL,
    title TEXT,
    content TEXT,
    links JSONB, -- Array of discovered links
    quality_score INTEGER,
    word_count INTEGER,
    cached_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Simple deduplication
    UNIQUE(url_hash)
);

-- Job queue - URLs to process for each job
CREATE TABLE job_queue (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    url_hash CHAR(64) NOT NULL,
    url TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, completed, failed
    depth INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Deduplication per job
    UNIQUE(job_id, url_hash)
);

-- SSE events - for resumable streams (keep existing)
CREATE TABLE sse_events (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    event_id TEXT UNIQUE,
    event_type TEXT,
    event_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_job_queue_pending ON job_queue (job_id, status) WHERE status = 'pending';
CREATE INDEX idx_url_cache_lookup ON url_cache (url_hash);
CREATE INDEX idx_sse_events_job ON sse_events (job_id, created_at);
```

## Implementation Benefits

### 🚀 Simplicity
- **3 Functions**: Clear separation of concerns
- **No Complex Queues**: PostgreSQL handles everything
- **Cache First**: Reuse content across users
- **Fail Fast**: No complex retry logic

### 💰 Cost Efficiency  
- **Event Driven**: Functions only run when needed
- **Content Reuse**: Popular docs sites cached once
- **Quick Failures**: Don't waste time on broken crawls

### 🛡️ Robustness
- **Built-in Timeouts**: 5-minute job limit by design
- **Resumable Streams**: Redis + PostgreSQL persistence
- **Cache Hits**: Instant results for previously crawled content

## Migration Steps

1. **Stop Current System**: Disable existing cron
2. **Nuclear Reset**: Drop existing tables, create new schema
3. **Implement Functions**: Build three-function architecture
4. **Add Caching**: Implement URL content cache
5. **Test & Deploy**: Validate with real docs sites

## Expected Performance

- **Fresh Crawl**: 2-5 minutes for typical docs site
- **Cached Crawl**: 10-30 seconds (instant content reuse)
- **Timeout**: Hard stop at 5 minutes
- **Cost**: ~$0.01 per crawl (mostly function execution time)

**Bottom Line**: Keep it simple, cache aggressively, timeout by design. Perfect for a docs-to-markdown tool!