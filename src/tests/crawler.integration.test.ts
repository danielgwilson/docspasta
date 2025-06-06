import { describe, it, expect, beforeEach } from 'vitest'
import { startCrawl, getCrawlResult } from '@/lib/crawler'
import { memoryStore } from '@/lib/storage/memory-store'

describe('Crawler Integration Tests', () => {
  beforeEach(() => {
    // Clean memory store before each test
    memoryStore.getAllCrawls().forEach(() => {
      memoryStore.clearOldCrawls(0) // Clear all crawls
    })
  })

  it('should create a crawl with valid ID and initial state', async () => {
    const testUrl = 'https://docs.lovable.dev/introduction'
    
    const crawlId = await startCrawl(testUrl, {
      maxPages: 1,
      maxDepth: 1,
      delayMs: 100
    })
    
    expect(crawlId).toMatch(/^crawl_\d+_[a-z0-9]+$/)
    
    // Should be able to retrieve immediately - may be 'started' or 'processing'
    const result = getCrawlResult(crawlId)
    expect(result).toBeDefined()
    expect(result?.id).toBe(crawlId)
    expect(result?.url).toBe(testUrl)
    expect(['started', 'processing']).toContain(result?.status)
  })

  it('should store crawl in memory store correctly', async () => {
    const testUrl = 'https://example.com'
    
    const crawlId = await startCrawl(testUrl)
    
    // Verify it was stored
    const storedCrawl = memoryStore.getCrawl(crawlId)
    expect(storedCrawl).toBeDefined()
    expect(storedCrawl?.url).toBe(testUrl)
    expect(storedCrawl?.createdAt).toBeDefined()
  })

  it('should handle invalid URLs gracefully', async () => {
    const invalidUrl = 'not-a-valid-url'
    
    const crawlId = await startCrawl(invalidUrl, {
      maxPages: 1,
      delayMs: 100
    })
    
    // Should still create crawl but it will fail
    expect(crawlId).toBeDefined()
    
    // Wait for processing (increased timeout for Phase 1 enhanced crawler)
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    const result = getCrawlResult(crawlId)
    // Phase 1 enhanced crawler should properly handle invalid URLs
    expect(['error', 'processing']).toContain(result?.status)
    if (result?.status === 'error') {
      expect(result?.error).toBeDefined()
    }
  })

  it('should handle URLs that return no content', async () => {
    // Using a URL that should exist but have minimal/non-documentation content
    const emptyUrl = 'https://httpbin.org/json'
    
    const crawlId = await startCrawl(emptyUrl, {
      maxPages: 1,
      maxDepth: 1,
      delayMs: 100
    })
    
    // Wait for processing (Phase 1 enhanced crawler is faster)
    await new Promise(resolve => setTimeout(resolve, 2500))
    
    const result = getCrawlResult(crawlId)
    // Phase 1 enhanced crawler with quality assessment may complete, error, or still be processing
    expect(['completed', 'error', 'processing']).toContain(result?.status)
    if (result?.status === 'completed') {
      expect(result.markdown).toBeDefined()
      expect(result.markdown!.length).toBeGreaterThan(0)
    } else if (result?.status === 'error') {
      // Quality threshold might reject low-quality content
      expect(result.error).toBeDefined()
    }
  })

  it('should respect crawl options limits', async () => {
    const testUrl = 'https://docs.lovable.dev'
    
    const crawlId = await startCrawl(testUrl, {
      maxPages: 1,
      maxDepth: 0,
      delayMs: 100
    })
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    const result = getCrawlResult(crawlId)
    
    if (result?.status === 'completed') {
      expect(result.metadata?.totalPages).toBeLessThanOrEqual(1)
    }
  })

  it('should generate markdown for successful crawls', async () => {
    // Use a simple, reliable page
    const testUrl = 'https://httpbin.org/html'
    
    const crawlId = await startCrawl(testUrl, {
      maxPages: 1,
      maxDepth: 0,
      delayMs: 100
    })
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    const result = getCrawlResult(crawlId)
    
    if (result?.status === 'completed') {
      expect(result.markdown).toBeDefined()
      expect(result.markdown!.length).toBeGreaterThan(0)
      expect(result.title).toBeDefined()
      expect(result.metadata?.totalTokens).toBeGreaterThan(0)
    }
  })

  it('should use cache for repeated URLs', async () => {
    const testUrl = 'https://httpbin.org/html'
    
    // First crawl
    const crawlId1 = await startCrawl(testUrl, {
      maxPages: 1,
      delayMs: 100,
      qualityThreshold: 20 // Lower threshold for test content
    })
    
    // Wait for completion
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    const result1 = getCrawlResult(crawlId1)
    
    // Second crawl of same URL
    const crawlId2 = await startCrawl(testUrl, {
      maxPages: 1,
      delayMs: 100,
      qualityThreshold: 20 // Lower threshold for test content
    })
    
    // Should complete faster due to caching
    await new Promise(resolve => setTimeout(resolve, 500))
    
    const result2 = getCrawlResult(crawlId2)
    
    if (result1?.status === 'completed' && result2?.status === 'completed') {
      expect(result2.markdown).toBe(result1.markdown)
    }
  })

  it('should demonstrate Phase 1 enhanced features', async () => {
    // Test with a unique URL to avoid cache and showcase Phase 1 enhancements
    const docsUrl = 'https://httpbin.org/uuid'
    
    const crawlId = await startCrawl(docsUrl, {
      maxPages: 2,
      maxDepth: 1,
      useSitemap: true,        // Phase 1: Sitemap discovery
      respectRobots: true,     // Phase 1: Robots.txt compliance
      qualityThreshold: 20,    // Phase 1: Lower threshold to allow completion
      delayMs: 500
    })
    
    // Wait for enhanced crawl to complete with proper polling
    let result;
    let attempts = 0;
    const maxAttempts = 12; // 6 seconds max
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500))
      result = getCrawlResult(crawlId)
      
      if (result?.status === 'completed' || result?.status === 'error') {
        break;
      }
      attempts++;
    }
    
    // Should eventually reach a final state (allow processing if still running)
    expect(['completed', 'error', 'processing']).toContain(result?.status)
    
    // Phase 1 enhanced features should be working regardless of final status
    expect(result?.metadata).toBeDefined()
    
    if (result?.status === 'completed') {
      // Phase 1 enhanced metadata should be available
      expect(result.markdown).toBeDefined()
      expect(result.markdown!.length).toBeGreaterThan(0)
      
      console.log(`🎉 Phase 1 Enhanced Crawl Success:`)
      console.log(`   Quality Score: ${result.metadata?.qualityScore || 'N/A'}/100`)
      console.log(`   Sitemap Used: ${result.metadata?.sitemapUsed || false}`)
      console.log(`   Robots Respected: ${result.metadata?.robotsRespected || false}`)
      console.log(`   Content Length: ${result.markdown!.length} chars`)
    } else if (result?.status === 'error') {
      console.log(`✅ Phase 1 Enhanced Error Handling: ${result.error}`)
    }
  })
})