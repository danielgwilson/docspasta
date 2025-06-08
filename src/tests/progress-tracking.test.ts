import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { 
  saveCrawl, 
  getCrawl, 
  updateCrawlProgress, 
  incrementCrawlCounter,
  markDiscoveryComplete,
  type StoredCrawl 
} from '@/lib/crawler/crawl-redis'
import { getUrlDeduplicationCache } from '@/lib/crawler/url-dedup-cache'
import { getRedisConnection } from '@/lib/crawler/queue-service'

describe('Enhanced Progress Tracking', () => {
  let redis: ReturnType<typeof getRedisConnection>
  const testCrawlId = 'test-crawl-progress'
  
  beforeEach(async () => {
    redis = getRedisConnection()
    // Clean up any existing test data
    await redis.del(`crawl:${testCrawlId}:meta`)
    await redis.del(`crawl:${testCrawlId}:visited`)
  })
  
  afterEach(async () => {
    // Clean up test data
    await redis.del(`crawl:${testCrawlId}:meta`)
    await redis.del(`crawl:${testCrawlId}:visited`)
  })

  it('should initialize crawl with all tracking fields', async () => {
    const crawl: StoredCrawl = {
      id: testCrawlId,
      url: 'https://example.com',
      status: 'active',
      createdAt: Date.now(),
      totalDiscovered: 0,
      totalQueued: 0,
      totalProcessed: 0,
      totalFiltered: 0,
      totalSkipped: 0,
      totalFailed: 0,
      discoveryComplete: false,
      progress: {
        current: 0,
        total: 0,
        phase: 'discovery',
        message: 'Starting crawl...',
        discovered: 0,
        queued: 0,
        processed: 0,
        filtered: 0,
        skipped: 0,
        failed: 0,
      },
      results: [],
    }
    
    await saveCrawl(crawl)
    const retrieved = await getCrawl(testCrawlId)
    
    expect(retrieved).toBeTruthy()
    expect(retrieved?.totalDiscovered).toBe(0)
    expect(retrieved?.totalQueued).toBe(0)
    expect(retrieved?.totalProcessed).toBe(0)
    expect(retrieved?.totalFiltered).toBe(0)
    expect(retrieved?.totalSkipped).toBe(0)
    expect(retrieved?.totalFailed).toBe(0)
    expect(retrieved?.discoveryComplete).toBe(false)
    expect(retrieved?.progress.discovered).toBe(0)
    expect(retrieved?.progress.queued).toBe(0)
  })

  it('should track URL discovery and queueing separately', async () => {
    // Initialize crawl
    const crawl: StoredCrawl = {
      id: testCrawlId,
      url: 'https://example.com',
      status: 'active',
      createdAt: Date.now(),
      totalDiscovered: 0,
      totalQueued: 0,
      totalProcessed: 0,
      totalFiltered: 0,
      totalSkipped: 0,
      totalFailed: 0,
      discoveryComplete: false,
      progress: {
        current: 0,
        total: 0,
        phase: 'discovery',
        message: 'Starting crawl...',
      },
      results: [],
    }
    await saveCrawl(crawl)
    
    // Simulate discovering 100 URLs
    await updateCrawlProgress(testCrawlId, {
      totalDiscovered: 100,
      progress: {
        current: 0,
        total: 100,
        phase: 'discovery',
        message: 'Discovered 100 URLs',
        discovered: 100,
      },
    })
    
    // Simulate queueing 80 URLs (20 were duplicates)
    const urls = Array.from({ length: 100 }, (_, i) => `https://example.com/page${i}`)
    let queued = 0
    let skipped = 0
    
    for (const url of urls) {
      if (Math.random() > 0.2) { // 80% success rate
        const urlCache = getUrlDeduplicationCache()
        const hasVisited = await urlCache.hasVisited(testCrawlId, url)
        if (!hasVisited) {
          await urlCache.markVisited(testCrawlId, [url])
        }
        const locked = !hasVisited
        if (locked) queued++
        else skipped++
      } else {
        skipped++
      }
    }
    
    await updateCrawlProgress(testCrawlId, {
      totalQueued: queued,
      totalSkipped: skipped,
      progress: {
        current: 0,
        total: queued, // Total should reflect actually queued URLs
        phase: 'crawling',
        message: `Queued ${queued} URLs (${skipped} skipped)`,
        discovered: 100,
        queued: queued,
        skipped: skipped,
      },
    })
    
    const updated = await getCrawl(testCrawlId)
    expect(updated?.totalDiscovered).toBe(100)
    expect(updated?.totalQueued).toBeGreaterThan(50) // Should queue most URLs
    expect(updated?.totalSkipped).toBeGreaterThan(0) // Some should be skipped
    expect(updated?.progress.total).toBe(updated?.totalQueued) // Total should match queued
  })

  it('should track filtered and failed URLs', async () => {
    const crawl: StoredCrawl = {
      id: testCrawlId,
      url: 'https://example.com',
      status: 'active',
      createdAt: Date.now(),
      totalDiscovered: 50,
      totalQueued: 40,
      totalProcessed: 0,
      totalFiltered: 10,
      totalSkipped: 0,
      totalFailed: 0,
      discoveryComplete: false,
      progress: {
        current: 0,
        total: 40,
        phase: 'crawling',
        message: 'Starting to crawl...',
      },
      results: [],
    }
    await saveCrawl(crawl)
    
    // Simulate some failures
    await incrementCrawlCounter(testCrawlId, 'totalFailed', 5)
    await incrementCrawlCounter(testCrawlId, 'totalFiltered', 3)
    
    const updated = await getCrawl(testCrawlId)
    expect(updated?.totalFailed).toBe(5)
    expect(updated?.totalFiltered).toBe(13) // 10 + 3
  })

  it('should track discovery phase completion', async () => {
    const crawl: StoredCrawl = {
      id: testCrawlId,
      url: 'https://example.com',
      status: 'active',
      createdAt: Date.now(),
      totalDiscovered: 100,
      totalQueued: 80,
      totalProcessed: 0,
      totalFiltered: 20,
      totalSkipped: 0,
      totalFailed: 0,
      discoveryComplete: false,
      progress: {
        current: 0,
        total: 80,
        phase: 'discovery',
        message: 'Discovery in progress...',
      },
      results: [],
    }
    await saveCrawl(crawl)
    
    // Mark discovery complete
    await markDiscoveryComplete(testCrawlId)
    
    const updated = await getCrawl(testCrawlId)
    expect(updated?.discoveryComplete).toBe(true)
  })

  it('should handle dynamic URL discovery during crawling', async () => {
    // Initialize with some discovered URLs
    const crawl: StoredCrawl = {
      id: testCrawlId,
      url: 'https://example.com',
      status: 'active',
      createdAt: Date.now(),
      totalDiscovered: 50,
      totalQueued: 45,
      totalProcessed: 10,
      totalFiltered: 5,
      totalSkipped: 0,
      totalFailed: 0,
      discoveryComplete: true,
      progress: {
        current: 10,
        total: 45,
        phase: 'crawling',
        message: 'Crawling in progress...',
        discovered: 50,
        queued: 45,
        processed: 10,
      },
      results: [],
    }
    await saveCrawl(crawl)
    
    // Simulate discovering 20 new URLs during crawling
    const newUrls = Array.from({ length: 20 }, (_, i) => `https://example.com/new${i}`)
    let newQueued = 0
    let newSkipped = 0
    
    for (const url of newUrls) {
      const urlCache = getUrlDeduplicationCache()
      const hasVisited = await urlCache.hasVisited(testCrawlId, url)
      if (!hasVisited) {
        await urlCache.markVisited(testCrawlId, [url])
      }
      const locked = !hasVisited
      if (locked) newQueued++
      else newSkipped++
    }
    
    // Update with new discoveries
    const current = await getCrawl(testCrawlId)
    if (current) {
      await updateCrawlProgress(testCrawlId, {
        totalDiscovered: current.totalDiscovered + newUrls.length,
        totalQueued: current.totalQueued + newQueued,
        totalSkipped: current.totalSkipped + newSkipped,
        progress: {
          ...current.progress,
          total: current.totalQueued + newQueued, // Update total to include new URLs
          discovered: (current.progress.discovered || 0) + newUrls.length,
          queued: (current.progress.queued || 0) + newQueued,
          skipped: (current.progress.skipped || 0) + newSkipped,
        },
      })
    }
    
    const updated = await getCrawl(testCrawlId)
    expect(updated?.totalDiscovered).toBe(70) // 50 + 20
    expect(updated?.totalQueued).toBeGreaterThan(45) // Should have queued some new URLs
    expect(updated?.progress.total).toBe(updated?.totalQueued) // Total should match queued
  })

  it('should calculate accurate progress percentages', async () => {
    const crawl: StoredCrawl = {
      id: testCrawlId,
      url: 'https://example.com',
      status: 'active',
      createdAt: Date.now(),
      totalDiscovered: 100,
      totalQueued: 80,
      totalProcessed: 40,
      totalFiltered: 20,
      totalSkipped: 0,
      totalFailed: 5,
      discoveryComplete: true,
      progress: {
        current: 40,
        total: 80,
        phase: 'crawling',
        message: 'Processing...',
        discovered: 100,
        queued: 80,
        processed: 40,
        failed: 5,
      },
      results: [],
    }
    await saveCrawl(crawl)
    
    const retrieved = await getCrawl(testCrawlId)
    expect(retrieved).toBeTruthy()
    
    // Calculate percentage based on queued (not discovered)
    const percentComplete = Math.round((40 / 80) * 100)
    expect(percentComplete).toBe(50)
    
    // Verify we're tracking the right total
    expect(retrieved?.progress.total).toBe(80) // Should be queued, not discovered
    expect(retrieved?.progress.current).toBe(40) // Should be processed
  })

  it('should show immediate progress after crawl start', async () => {
    // This tests that progress is shown immediately, not delayed
    const crawl: StoredCrawl = {
      id: testCrawlId,
      url: 'https://lovable.dev',
      status: 'active',
      createdAt: Date.now(),
      totalDiscovered: 0,
      totalQueued: 0,
      totalProcessed: 0,
      totalFiltered: 0,
      totalSkipped: 0,
      totalFailed: 0,
      discoveryComplete: false,
      progress: {
        current: 0,
        total: 0,
        phase: 'discovery',
        message: 'Starting crawl...',
      },
      results: [],
    }
    
    await saveCrawl(crawl)
    
    // Immediately after save, progress should be retrievable
    const immediate = await getCrawl(testCrawlId)
    expect(immediate).toBeTruthy()
    expect(immediate?.status).toBe('active')
    expect(immediate?.progress.phase).toBe('discovery')
    expect(immediate?.progress.message).toBe('Starting crawl...')
  })
})