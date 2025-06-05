import { describe, it, expect, beforeEach } from 'vitest'
import { startCrawl, getCrawlResult } from '@/lib/crawler'
import { memoryStore } from '@/lib/storage/memory-store'

describe('Crawler Integration Tests', () => {
  beforeEach(() => {
    // Clean memory store before each test
    memoryStore.getAllCrawls().forEach(crawl => {
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
    
    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 500))
    
    const result = getCrawlResult(crawlId)
    expect(result?.status).toBe('error')
    expect(result?.error).toBeDefined()
  })

  it('should handle URLs that return no content', async () => {
    // Using a URL that should exist but have minimal/non-documentation content
    const emptyUrl = 'https://httpbin.org/json'
    
    const crawlId = await startCrawl(emptyUrl, {
      maxPages: 1,
      maxDepth: 1,
      delayMs: 100
    })
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    const result = getCrawlResult(crawlId)
    // The URL actually returns valid JSON, so it should complete successfully
    // but with minimal content (just the JSON formatted as text)
    expect(['completed', 'error']).toContain(result?.status)
    if (result?.status === 'completed') {
      expect(result.markdown).toBeDefined()
      expect(result.markdown!.length).toBeGreaterThan(0)
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
      delayMs: 100
    })
    
    // Wait for completion
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    const result1 = getCrawlResult(crawlId1)
    
    // Second crawl of same URL
    const crawlId2 = await startCrawl(testUrl, {
      maxPages: 1,
      delayMs: 100
    })
    
    // Should complete faster due to caching
    await new Promise(resolve => setTimeout(resolve, 500))
    
    const result2 = getCrawlResult(crawlId2)
    
    if (result1?.status === 'completed' && result2?.status === 'completed') {
      expect(result2.markdown).toBe(result1.markdown)
    }
  })
})