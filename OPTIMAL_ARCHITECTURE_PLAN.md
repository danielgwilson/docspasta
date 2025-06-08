# Docspasta V2 Optimal Architecture Plan

## Executive Summary

Transform the current per-URL job queue system into a high-performance batch processing architecture that maintains API/UX benefits while achieving 20-50x performance improvements.

**Key Insight**: Keep the job queue for progress tracking, but process URLs in batches with aggressive concurrency and in-memory deduplication.

## Current vs Optimal Architecture

### Current Architecture (Slow)
```
User Request → Kickoff Job → Discover URLs → Create 100 individual jobs
Each Job: Fetch 1 URL → Check Redis → Save to Redis → Create new jobs
Result: 100 URLs = 100 jobs = 100+ Redis operations = Sequential processing
```

### Optimal Architecture (Fast)
```
User Request → Kickoff Job → Discover URLs → Create 5 batch jobs (20 URLs each)
Each Batch Job: Fetch 20 URLs concurrently → Memory check → Batch save
Result: 100 URLs = 5 jobs = 5 Redis operations = 20x parallel processing
```

## Implementation Plan

### Phase 1: In-Memory URL Deduplication

#### Create `src/lib/crawler/url-dedup-cache.ts`
```typescript
export class UrlDeduplicationCache {
  private memoryCache: Map<string, Set<string>> = new Map()
  private redisConnection: Redis
  
  constructor() {
    this.redisConnection = getRedisConnection()
  }
  
  async hasVisited(crawlId: string, url: string): Promise<boolean> {
    // Check memory first (instant - O(1))
    const crawlSet = this.memoryCache.get(crawlId)
    if (crawlSet?.has(url)) return true
    
    // Fallback to Redis if not in memory (edge case)
    const exists = await this.redisConnection.sismember(`urls:${crawlId}`, url)
    
    // Cache in memory for future checks
    if (exists) {
      this.addToMemory(crawlId, url)
    }
    
    return Boolean(exists)
  }
  
  async markVisited(crawlId: string, urls: string[]): Promise<void> {
    // Update memory cache immediately
    urls.forEach(url => this.addToMemory(crawlId, url))
    
    // Async Redis update (fire and forget for speed)
    this.redisConnection.sadd(`urls:${crawlId}`, ...urls).catch(console.error)
  }
  
  private addToMemory(crawlId: string, url: string): void {
    if (!this.memoryCache.has(crawlId)) {
      this.memoryCache.set(crawlId, new Set())
    }
    this.memoryCache.get(crawlId)!.add(url)
  }
  
  // Cleanup memory after crawl completes
  clearCrawl(crawlId: string): void {
    this.memoryCache.delete(crawlId)
  }
}
```

### Phase 2: Batch Job System

#### Update `src/lib/crawler/queue-jobs.ts`
```typescript
export interface BatchCrawlJobData {
  crawlId: string
  urls: string[]
  batchNumber: number
  totalBatches: number
}

export async function addBatchCrawlJobs(
  crawlId: string, 
  urls: string[], 
  options: { batchSize?: number } = {}
): Promise<void> {
  const batchSize = options.batchSize || 20
  const batches: Array<{ name: string; data: BatchCrawlJobData }> = []
  const totalBatches = Math.ceil(urls.length / batchSize)
  
  for (let i = 0; i < urls.length; i += batchSize) {
    batches.push({
      name: 'batch-crawl',
      data: {
        crawlId,
        urls: urls.slice(i, i + batchSize),
        batchNumber: Math.floor(i / batchSize) + 1,
        totalBatches
      }
    })
  }
  
  await queue.addBulk(batches)
  console.log(`📦 Created ${batches.length} batch jobs for ${urls.length} URLs`)
}
```

### Phase 3: Concurrent Batch Processing

#### Update `src/lib/crawler/queue-worker.ts`
```typescript
import pLimit from 'p-limit'

class CrawlWorker {
  private urlCache = new UrlDeduplicationCache()
  
  async processBatchJob(job: Job<BatchCrawlJobData>): Promise<void> {
    const { crawlId, urls, batchNumber, totalBatches } = job.data
    console.log(`📦 Processing batch ${batchNumber}/${totalBatches} with ${urls.length} URLs`)
    
    // Create concurrency limiter
    const limit = pLimit(30) // 30 concurrent HTTP requests
    
    // Process all URLs in parallel with limit
    const crawlPromises = urls.map(url => 
      limit(async () => {
        try {
          // Skip if already visited (instant memory check)
          if (await this.urlCache.hasVisited(crawlId, url)) {
            return null
          }
          
          // Mark as visited immediately to prevent duplicates
          await this.urlCache.markVisited(crawlId, [url])
          
          // Crawl the page
          const result = await this.webCrawler.crawlPage(url, options)
          
          if (result.success) {
            // Stream result immediately
            await this.saveResult(crawlId, {
              url,
              content: result.content!,
              title: result.title!,
            })
            
            // Return discovered URLs for batching
            return result.links || []
          }
          
          return null
        } catch (error) {
          console.error(`❌ Failed to crawl ${url}:`, error)
          return null
        }
      })
    )
    
    // Wait for all to complete and collect discovered URLs
    const results = await Promise.allSettled(crawlPromises)
    const discoveredUrls: string[] = []
    
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        discoveredUrls.push(...result.value)
      }
    }
    
    // Batch newly discovered URLs if we have enough
    const newUrls = await this.filterNewUrls(crawlId, discoveredUrls)
    if (newUrls.length >= 10) {
      await addBatchCrawlJobs(crawlId, newUrls)
    } else if (newUrls.length > 0) {
      // Save for later batching
      await this.queueForLaterBatching(crawlId, newUrls)
    }
    
    // Update progress
    await updateCrawlProgress(crawlId, {
      batchesComplete: batchNumber,
      totalBatches,
      urlsProcessed: urls.length
    })
  }
  
  private async filterNewUrls(crawlId: string, urls: string[]): Promise<string[]> {
    const newUrls: string[] = []
    
    for (const url of urls) {
      if (!(await this.urlCache.hasVisited(crawlId, url))) {
        newUrls.push(url)
      }
    }
    
    return newUrls
  }
}
```

### Phase 4: Kickoff Job Updates

#### Update kickoff job to use batches
```typescript
async processKickoffJob(job: Job<KickoffJobData>): Promise<void> {
  const { crawlId, startUrl, options } = job.data
  
  // Discover initial URLs
  const discoveredUrls = await this.webCrawler.discoverURLs(startUrl, options)
  
  // Mark all as visited in batch
  await this.urlCache.markVisited(crawlId, discoveredUrls)
  
  // Create batch jobs instead of individual jobs
  await addBatchCrawlJobs(crawlId, discoveredUrls, {
    batchSize: options.concurrency || 20
  })
  
  // Update metadata
  await saveCrawlMetadata(crawlId, {
    totalUrls: discoveredUrls.length,
    totalBatches: Math.ceil(discoveredUrls.length / 20),
    status: 'active'
  })
}
```

## Performance Analysis

### Before (Current System)
- **Per URL**: 1 job creation + 1 Redis check + 1 HTTP request + 1 result save
- **100 URLs**: 100 jobs × 4 operations = 400 Redis operations
- **Concurrency**: 1 URL per worker at a time
- **Time**: ~30-60 seconds for 50 URLs

### After (Optimal System)
- **Per Batch**: 1 job creation + 20 memory checks + 20 concurrent HTTP requests + 1 batch save
- **100 URLs**: 5 jobs × 2 Redis operations = 10 Redis operations (40x reduction)
- **Concurrency**: 30 URLs being fetched simultaneously
- **Time**: ~2-5 seconds for 50 URLs

## Configuration Tuning

```typescript
interface OptimalConfig {
  batchSize: number      // URLs per job (10-30)
  concurrency: number    // Parallel HTTP requests (20-50)
  workerCount: number    // Queue workers (1-3)
  timeout: number        // Per-page timeout (3-8 seconds)
}

// Recommended settings by use case
const configs = {
  documentation: {
    batchSize: 20,
    concurrency: 30,
    workerCount: 1,
    timeout: 5000
  },
  largeSite: {
    batchSize: 50,
    concurrency: 50,
    workerCount: 3,
    timeout: 3000
  },
  careful: {
    batchSize: 10,
    concurrency: 10,
    workerCount: 1,
    timeout: 8000
  }
}
```

## Migration Strategy

### Step 1: Add Memory Cache (Non-Breaking)
- Deploy UrlDeduplicationCache
- Use alongside existing Redis checks
- Monitor performance improvement

### Step 2: Worker Dual-Mode (Non-Breaking)
- Update worker to handle both job types
- Keep existing single-URL job processing
- Add new batch job processing

### Step 3: Gradual Rollout
- Add feature flag for batch mode
- Test with small percentage of crawls
- Monitor and tune batch sizes

### Step 4: Full Migration
- Switch all kickoff jobs to batch mode
- Remove single-URL job code
- Optimize based on production metrics

## Success Metrics

1. **Performance**: 50+ pages/second (vs 1-2 pages/second current)
2. **Redis Load**: 95% reduction in operations
3. **Memory Usage**: <100MB per crawl (50k URLs = ~10MB)
4. **User Experience**: Same API, 10x faster results

## Risk Mitigation

1. **Memory Limits**: Auto-flush to Redis at 10k URLs per crawl
2. **Crash Recovery**: Periodic Redis sync for resumability
3. **Batch Failures**: Retry individual URLs from failed batches
4. **Backpressure**: Queue monitoring to prevent overload

## Conclusion

This architecture achieves the best of both worlds:
- ✅ Maintains job queue benefits (progress tracking, API response time)
- ✅ Achieves near-optimal crawling performance
- ✅ Reduces infrastructure load by 95%
- ✅ Simplifies completion detection
- ✅ Improves user experience dramatically

The key insight: **Batch processing + in-memory deduplication + high concurrency = optimal performance for documentation crawling**.