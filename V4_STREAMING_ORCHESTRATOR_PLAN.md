# V4 Streaming Orchestrator Implementation Plan

## Requirements

### Core Architecture Requirements
- **MUST use long-running Vercel functions** (5-minute orchestrator pattern)
- **Three-function pattern is INTENTIONAL and must be maintained**:
  1. **Orchestrator** (`/api/v4/jobs/[id]/stream`) - Manages job lifecycle, streams progress
  2. **Crawler** (`/api/v4/crawl`) - Stateless URL crawler
  3. **Processor** (`/api/v4/process`) - Content processor
- **NO caching** - Always crawl fresh (remove all cache-related code)
- **Real-time streaming** - Process and stream results as they arrive, not in batches

### Streaming Requirements
- **Process URLs individually** as they complete (no Promise.all batching)
- **Limit concurrent function calls** to N at a time
- **Stream events at each step**:
  - URL started crawling
  - URL crawled successfully/failed
  - Links extracted
  - New URLs discovered and queued
  - Content sent to processing
  - Progress updates
- **Send elapsed time to client every second**

## Current Issues

### 1. Batch Processing Blocks Streaming
**Current**: Waits for entire batch with `Promise.allSettled`
```typescript
// ❌ Blocks until all URLs complete
const results = await Promise.allSettled(
  urls.map(async (urlData) => {...})
)
```

### 2. Events Only Sent After Batch Completion
**Current**: Processes batch, then sends aggregate events
```typescript
// ❌ Delayed feedback
if (result.completed) {
  for (const crawled of result.completed) {
    // Send events after batch done
  }
}
```

### 3. No Regular Time Updates
**Current**: No elapsed time tracking sent to client

### 4. Caching Logic Present
**Current**: Checks cache before crawling (needs removal)

## Implementation Plan

### 1. Add Concurrency Control Library
```bash
pnpm add p-queue
```

### 2. Update Orchestrator Stream Function
```typescript
import PQueue from 'p-queue'

function makeJobStream(streamId: string, userId: string): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      const jobId = streamId.replace('v4-job-', '')
      const startTime = Date.now()
      const TIMEOUT_MS = 5 * 60 * 1000
      const MAX_CONCURRENT_CRAWLS = 10
      
      // Create concurrency-limited queue
      const crawlQueue = new PQueue({ concurrency: MAX_CONCURRENT_CRAWLS })
      
      // Start elapsed time updates
      const timeInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        controller.enqueue(`event: time_update\ndata: ${JSON.stringify({ 
          elapsed, 
          formatted: `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')}`,
          totalProcessed,
          totalDiscovered,
          queueSize: urlQueue.length
        })}\nid: time-${Date.now()}\n\n`)
      }, 1000)
      
      try {
        // Orchestration logic here...
        
        // Process URLs with streaming
        while (Date.now() - startTime < TIMEOUT_MS) {
          const batch = getNextUrlBatch(MAX_CONCURRENT_CRAWLS)
          
          if (batch.length === 0) {
            if (urlQueue.length === 0 && crawlQueue.size === 0) {
              // Job complete
              break
            }
            // Wait briefly for queue to drain
            await new Promise(resolve => setTimeout(resolve, 100))
            continue
          }
          
          // Add URLs to concurrent queue
          batch.forEach(urlData => {
            crawlQueue.add(async () => {
              await processUrlStreaming(urlData, controller, jobId, userId)
            })
          })
        }
        
        // Wait for final URLs to complete
        await crawlQueue.onIdle()
        
      } finally {
        clearInterval(timeInterval)
        controller.close()
      }
    }
  })
}
```

### 3. Implement Streaming URL Processing
```typescript
async function processUrlStreaming(
  urlData: UrlData,
  controller: ReadableStreamDefaultController,
  jobId: string,
  userId: string
) {
  const { url, depth, id: urlId } = urlData
  
  try {
    // 1. Notify URL started
    controller.enqueue(`event: url_started\ndata: ${JSON.stringify({ 
      url,
      depth,
      timestamp: Date.now()
    })}\nid: start-${urlId}\n\n`)
    
    // 2. Call crawler
    const crawlResponse = await fetch('/api/v4/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        jobId,
        urls: [{ id: urlId, url, depth }],
        originalJobUrl: job.url,
        forceRefresh: true // Always fresh
      }),
      signal: AbortSignal.timeout(30000)
    })
    
    const result = await crawlResponse.json()
    const crawled = result.completed?.[0] || result.failed?.[0]
    
    // 3. Notify crawl complete
    controller.enqueue(`event: url_crawled\ndata: ${JSON.stringify({ 
      url,
      success: result.completed?.length > 0,
      wordCount: crawled?.wordCount || 0,
      error: crawled?.error
    })}\nid: crawl-${urlId}\n\n`)
    
    if (result.completed?.length > 0) {
      const crawledData = result.completed[0]
      
      // 4. Extract and queue new URLs immediately
      if (crawledData.discoveredUrls?.length > 0 && depth < 3) {
        const newUrls = []
        for (const newUrl of crawledData.discoveredUrls) {
          if (!processedUrls.has(newUrl) && !processingUrls.has(newUrl)) {
            urlQueue.push({ url: newUrl, depth: depth + 1 })
            newUrls.push(newUrl)
            totalDiscovered++
          }
        }
        
        if (newUrls.length > 0) {
          controller.enqueue(`event: urls_discovered\ndata: ${JSON.stringify({ 
            count: newUrls.length,
            parentUrl: url,
            depth: depth + 1,
            urls: newUrls.slice(0, 10) // First 10 for preview
          })}\nid: discover-${Date.now()}\n\n`)
        }
      }
      
      // 5. Send to processor immediately (fire and forget)
      fetch('/api/v4/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          jobId,
          results: [{
            url: crawledData.url,
            content: crawledData.content,
            title: crawledData.title || url,
            quality: crawledData.quality,
            wordCount: crawledData.wordCount
          }]
        })
      }).then(() => {
        controller.enqueue(`event: sent_to_processing\ndata: ${JSON.stringify({ 
          url,
          wordCount: crawledData.wordCount
        })}\nid: process-${urlId}\n\n`)
      }).catch(err => {
        console.error('Process endpoint error:', err)
      })
      
      totalProcessed++
    }
    
    // 6. Send progress update
    controller.enqueue(`event: progress\ndata: ${JSON.stringify({ 
      url,
      totalProcessed,
      totalDiscovered,
      queueSize: urlQueue.length,
      activeCount: processingUrls.size
    })}\nid: progress-${Date.now()}\n\n`)
    
  } catch (error) {
    controller.enqueue(`event: url_failed\ndata: ${JSON.stringify({ 
      url,
      error: error instanceof Error ? error.message : 'Unknown error'
    })}\nid: error-${urlId}\n\n`)
  } finally {
    processedUrls.add(url)
    processingUrls.delete(url)
  }
}
```

### 4. Remove Caching from Crawler
```typescript
// In /api/v4/crawl/route.ts
export async function POST(request: NextRequest) {
  const { jobId, urls, originalJobUrl } = await request.json()
  
  // ❌ Remove these lines:
  // const cached = await getCachedContent(userId, url)
  // if (cached) { ... }
  // await cacheContent(userId, url, {...})
  
  // ✅ Always crawl fresh
  const crawler = new WebCrawler()
  const result = await crawler.crawlPage(url, { timeout: 8000 })
}
```

### 5. Client Event Stream Timeline
```
0:00.000 - event: stream_connected
0:00.100 - event: url_started {url: "https://example.com"}
0:00.200 - event: url_started {url: "https://example.com/about"}
0:01.000 - event: time_update {elapsed: 1, formatted: "0:01", totalProcessed: 0}
0:01.500 - event: url_crawled {url: "https://example.com", success: true, wordCount: 523}
0:01.600 - event: urls_discovered {count: 5, parentUrl: "https://example.com", urls: [...]}
0:01.700 - event: sent_to_processing {url: "https://example.com"}
0:01.800 - event: progress {totalProcessed: 1, totalDiscovered: 5, queueSize: 7}
0:02.000 - event: time_update {elapsed: 2, formatted: "0:02", totalProcessed: 1}
0:02.300 - event: url_crawled {url: "https://example.com/about", success: true}
... continuous streaming ...
4:59.000 - event: time_update {elapsed: 299, formatted: "4:59", totalProcessed: 127}
5:00.000 - event: job_completed {totalProcessed: 127, totalDiscovered: 245, duration: 300}
```

## Benefits

1. **Real-time Feedback**: Users see progress as it happens
2. **Better Resource Utilization**: No blocking on batch completion
3. **Granular Progress**: See each URL as it's processed
4. **Time Awareness**: Always know how long the job has been running
5. **Immediate Processing**: Content sent to processor as soon as crawled
6. **Maintains Architecture**: Three-function pattern preserved

## Smart URL Pattern Handling

### Current Limitations
The current implementation uses `isWithinPathPrefix` which is too rigid:
- Can't handle subdomain-based docs (docs.example.com)
- Can't handle multiple valid paths (e.g., /docs/* AND /tutorials/*)
- Can't exclude specific sections (e.g., exclude /blog/* but include /section/*)
- Doesn't handle trailing slash variations well

### Proposed Solution: Smart Pattern Matching

#### 1. Enhanced Input Options
Allow users to specify crawl boundaries through:

**Option A: Smart Auto-Detection (Default)**
```typescript
// User provides: https://docs.example.com
// System detects:
// - Start URL: https://docs.example.com
// - Allowed patterns: https://docs.example.com/**
// - Excluded patterns: []

// User provides: https://example.com/docs/
// System detects:
// - Start URL: https://example.com/docs/
// - Allowed patterns: https://example.com/docs/**
// - Excluded patterns: []
```

**Option B: Advanced Configuration (Optional)**
```typescript
interface CrawlConfig {
  // Required: Where to start
  startUrl: string
  
  // Optional: Additional allowed patterns
  includePatterns?: string[]  // e.g., ["/tutorials/**", "/guides/**"]
  
  // Optional: Exclude patterns (processed first)
  excludePatterns?: string[]  // e.g., ["/blog/**", "**/*-old", "**?preview=*"]
  
  // Optional: Stay within these domains (auto-detected if not provided)
  allowedDomains?: string[]   // e.g., ["docs.example.com", "example.com"]
}
```

#### 2. Implementation

**URL Normalization (Enhanced)**
```typescript
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    
    // Lowercase hostname
    parsed.hostname = parsed.hostname.toLowerCase()
    
    // Remove www prefix for consistency
    parsed.hostname = parsed.hostname.replace(/^www\./, '')
    
    // Remove hash
    parsed.hash = ''
    
    // Remove tracking parameters
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid', '_ga'
    ]
    trackingParams.forEach(param => parsed.searchParams.delete(param))
    
    // Sort parameters
    const sortedParams = new URLSearchParams(
      [...parsed.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b))
    )
    parsed.search = sortedParams.toString()
    
    // Normalize path: remove trailing slash unless root
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1)
    }
    
    return parsed.toString()
  } catch {
    return url
  }
}
```

**Pattern Matching System**
```typescript
import micromatch from 'micromatch'

export class UrlScopeMatcher {
  private includePatterns: string[]
  private excludePatterns: string[]
  private allowedDomains: Set<string>
  
  constructor(config: CrawlConfig) {
    // Auto-detect patterns from start URL
    const startParsed = new URL(config.startUrl)
    const basePath = this.getBasePath(startParsed)
    
    // Default include pattern based on start URL
    this.includePatterns = [
      `${startParsed.protocol}//${startParsed.host}${basePath}**`
    ]
    
    // Add any additional patterns
    if (config.includePatterns) {
      this.includePatterns.push(...config.includePatterns.map(p => 
        this.normalizePattern(p, startParsed)
      ))
    }
    
    // Exclude patterns
    this.excludePatterns = config.excludePatterns || []
    
    // Allowed domains (auto-detect if not provided)
    this.allowedDomains = new Set(
      config.allowedDomains || [startParsed.hostname]
    )
  }
  
  private getBasePath(url: URL): string {
    // If pathname is just /, crawl entire domain
    if (url.pathname === '/') return '/'
    
    // Otherwise, ensure path ends with / for prefix matching
    return url.pathname.endsWith('/') ? url.pathname : url.pathname + '/'
  }
  
  private normalizePattern(pattern: string, baseUrl: URL): string {
    // Convert relative patterns to absolute
    if (pattern.startsWith('/')) {
      return `${baseUrl.protocol}//${baseUrl.host}${pattern}`
    }
    return pattern
  }
  
  isInScope(url: string): boolean {
    const normalized = normalizeUrl(url)
    const parsed = new URL(normalized)
    
    // 1. Check domain first (fast rejection)
    if (!this.allowedDomains.has(parsed.hostname)) {
      return false
    }
    
    // 2. Check exclusions (takes precedence)
    if (this.excludePatterns.length > 0) {
      if (micromatch.isMatch(normalized, this.excludePatterns)) {
        return false
      }
    }
    
    // 3. Check inclusions
    return micromatch.isMatch(normalized, this.includePatterns)
  }
}
```

**Common Documentation Patterns**
```typescript
// Pre-configured patterns for common doc sites
const COMMON_DOC_PATTERNS = {
  // Include patterns
  include: [
    '**/docs/**',
    '**/documentation/**',
    '**/guide/**',
    '**/guides/**',
    '**/tutorial/**',
    '**/tutorials/**',
    '**/reference/**',
    '**/api/**',
    '**/manual/**',
    '**/handbook/**',
    '**/getting-started/**',
    '**/learn/**'
  ],
  
  // Exclude patterns
  exclude: [
    '**/blog/**',
    '**/news/**',
    '**/careers/**',
    '**/about/**',
    '**/contact/**',
    '**/pricing/**',
    '**/*.pdf',
    '**/*.zip',
    '**/download/**',
    '**/*-old/**',
    '**/*-deprecated/**',
    '**/*?preview=*',
    '**/*?draft=*'
  ]
}
```

#### 3. User Interface

**Simple Mode (Default)**
```typescript
// User just provides URL, we figure out the rest
const config = {
  startUrl: 'https://docs.example.com'
}
// Auto-configures to crawl all of docs.example.com
```

**Advanced Mode (When needed)**
```typescript
// User needs specific control
const config = {
  startUrl: 'https://example.com/docs',
  includePatterns: [
    '/tutorials/**',
    '/api/v2/**'  // Only v2 API docs
  ],
  excludePatterns: [
    '/api/v1/**',  // Skip old API
    '**/archive/**',
    '**/*-draft'
  ]
}
```

### Examples

**Example 1: Subdomain Documentation**
```
Input: https://docs.stripe.com
Result: Crawls all of docs.stripe.com/*
```

**Example 2: Path-based Documentation**
```
Input: https://nextjs.org/docs
Result: Crawls only nextjs.org/docs/*
```

**Example 3: Multiple Sections**
```
Input: https://example.com/learn
Include: ["/learn/**", "/tutorials/**", "/guides/**"]
Exclude: ["/blog/**"]
Result: Crawls learn, tutorials, and guides but not blog
```

**Example 4: Version-specific Docs**
```
Input: https://angular.io/docs
Include: ["/docs/**"]
Exclude: ["/docs/v1/**", "/docs/v2/**"]
Result: Only current version docs
```

### Benefits
1. **Automatic Detection**: Works for 90% of cases without configuration
2. **Flexible Patterns**: Handles complex requirements when needed
3. **Performance**: Fast domain and pattern matching
4. **User-Friendly**: Glob patterns instead of regex
5. **Robust**: Handles trailing slashes, subdomains, multiple paths

## Testing Checklist

- [ ] URLs process concurrently up to limit
- [ ] Events stream for each URL individually
- [ ] Time updates arrive every second
- [ ] No caching occurs (always fresh crawls)
- [ ] Processing happens immediately per URL
- [ ] Queue management works correctly
- [ ] 5-minute timeout handled gracefully
- [ ] Resumable-stream reconnection works
- [ ] URL pattern matching works for subdomains
- [ ] URL pattern matching works for path prefixes
- [ ] Include/exclude patterns work correctly
- [ ] Trailing slash normalization works