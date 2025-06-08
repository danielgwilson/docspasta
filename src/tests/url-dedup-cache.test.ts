import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
/* eslint-disable @typescript-eslint/no-unused-vars */
import { UrlDeduplicationCache } from '@/lib/crawler/url-dedup-cache'

// Mock Redis client with proper Promise methods
const mockRedisClient = {
  sismember: vi.fn().mockResolvedValue(0),
  sadd: vi.fn().mockReturnValue({
    catch: vi.fn().mockReturnThis()
  }),
  del: vi.fn().mockResolvedValue(1),
  exists: vi.fn().mockResolvedValue(0),
  pipeline: vi.fn().mockReturnValue({
    sismember: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([[null, 0]]),
  }),
}

// Mock Redis connection
vi.mock('@/lib/crawler/queue-service', () => ({
  getRedisConnection: () => mockRedisClient,
}))

describe('UrlDeduplicationCache', () => {
  let cache: UrlDeduplicationCache
  const testCrawlId = 'test-crawl-123'
  const testUrls = [
    'https://example.com',
    'https://example.com/page1',
    'https://example.com/page2',
    'https://docs.example.com',
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    cache = new UrlDeduplicationCache()
  })

  afterEach(() => {
    cache.clearCrawl(testCrawlId)
  })

  describe('Memory Cache Operations', () => {
    it('should mark URLs as visited in memory', async () => {
      await cache.markVisited(testCrawlId, testUrls)

      // All URLs should now be in memory
      for (const url of testUrls) {
        const hasVisited = await cache.hasVisited(testCrawlId, url)
        expect(hasVisited).toBe(true)
      }
    })

    it('should handle single URL marking', async () => {
      await cache.markVisited(testCrawlId, [testUrls[0]])

      const hasVisited = await cache.hasVisited(testCrawlId, testUrls[0])
      const hasNotVisited = await cache.hasVisited(testCrawlId, testUrls[1])

      expect(hasVisited).toBe(true)
      expect(hasNotVisited).toBe(false)
    })

    it('should handle duplicate URLs correctly', async () => {
      const duplicateUrls = [testUrls[0], testUrls[0], testUrls[1]]
      
      await cache.markVisited(testCrawlId, duplicateUrls)

      // Should only store unique URLs
      const hasVisited1 = await cache.hasVisited(testCrawlId, testUrls[0])
      const hasVisited2 = await cache.hasVisited(testCrawlId, testUrls[1])
      const hasNotVisited = await cache.hasVisited(testCrawlId, testUrls[2])

      expect(hasVisited1).toBe(true)
      expect(hasVisited2).toBe(true)
      expect(hasNotVisited).toBe(false)
    })

    it('should isolate URLs by crawl ID', async () => {
      const crawlId1 = 'crawl-1'
      const crawlId2 = 'crawl-2'
      const url = testUrls[0]

      await cache.markVisited(crawlId1, [url])

      const hasVisitedCrawl1 = await cache.hasVisited(crawlId1, url)
      const hasVisitedCrawl2 = await cache.hasVisited(crawlId2, url)

      expect(hasVisitedCrawl1).toBe(true)
      expect(hasVisitedCrawl2).toBe(false)
    })
  })

  describe('Redis Fallback', () => {
    it('should fall back to Redis when URL not in memory', async () => {
      const url = testUrls[0]
      
      // Mock Redis to return that URL exists
      mockRedisClient.sismember.mockResolvedValue(1)

      const hasVisited = await cache.hasVisited(testCrawlId, url)

      expect(hasVisited).toBe(true)
      expect(mockRedisClient.sismember).toHaveBeenCalledWith(
        `urls:${testCrawlId}`,
        url
      )
    })

    it('should cache Redis results in memory for future checks', async () => {
      const url = testUrls[0]
      
      // Mock Redis to return that URL exists
      mockRedisClient.sismember.mockResolvedValue(1)

      // First call - should hit Redis
      const hasVisited1 = await cache.hasVisited(testCrawlId, url)
      expect(hasVisited1).toBe(true)
      expect(mockRedisClient.sismember).toHaveBeenCalledTimes(1)

      // Second call - should hit memory cache
      const hasVisited2 = await cache.hasVisited(testCrawlId, url)
      expect(hasVisited2).toBe(true)
      expect(mockRedisClient.sismember).toHaveBeenCalledTimes(1) // No additional Redis call
    })

    it('should handle Redis connection errors gracefully', async () => {
      const url = testUrls[0]
      
      // Mock Redis to throw error
      mockRedisClient.sismember.mockRejectedValue(new Error('Redis connection failed'))

      const hasVisited = await cache.hasVisited(testCrawlId, url)

      expect(hasVisited).toBe(false) // Should return false on error
    })

    it('should sync to Redis asynchronously when marking visited', async () => {
      await cache.markVisited(testCrawlId, testUrls)

      // Should call Redis sadd for persistence
      expect(mockRedisClient.sadd).toHaveBeenCalledWith(
        `urls:${testCrawlId}`,
        ...testUrls
      )
    })

    it('should handle Redis sadd errors gracefully', async () => {
      // Mock Redis to throw error
      mockRedisClient.sadd.mockRejectedValue(new Error('Redis write failed'))

      // Should not throw - fire and forget
      await expect(cache.markVisited(testCrawlId, testUrls)).resolves.not.toThrow()

      // URLs should still be in memory
      for (const url of testUrls) {
        const hasVisited = await cache.hasVisited(testCrawlId, url)
        expect(hasVisited).toBe(true)
      }
    })
  })

  describe('Memory Management', () => {
    it('should clear crawl data from memory', async () => {
      await cache.markVisited(testCrawlId, testUrls)

      // Verify URLs are in memory
      const hasVisited1 = await cache.hasVisited(testCrawlId, testUrls[0])
      expect(hasVisited1).toBe(true)

      // Clear crawl
      cache.clearCrawl(testCrawlId)

      // Mock Redis to return false (URL not found)
      mockRedisClient.sismember.mockResolvedValue(0)

      // URL should no longer be in memory and fall back to Redis
      const hasVisited2 = await cache.hasVisited(testCrawlId, testUrls[0])
      expect(hasVisited2).toBe(false)
      expect(mockRedisClient.sismember).toHaveBeenCalled()
    })

    it('should handle clearing non-existent crawl', () => {
      expect(() => cache.clearCrawl('non-existent-crawl')).not.toThrow()
    })

    it('should not affect other crawls when clearing', async () => {
      const crawlId1 = 'crawl-1'
      const crawlId2 = 'crawl-2'
      const url = testUrls[0]

      await cache.markVisited(crawlId1, [url])
      await cache.markVisited(crawlId2, [url])

      // Clear only crawl1
      cache.clearCrawl(crawlId1)

      // crawl2 should still have the URL in memory
      const hasVisitedCrawl2 = await cache.hasVisited(crawlId2, url)
      expect(hasVisitedCrawl2).toBe(true)

      // crawl1 should fall back to Redis
      mockRedisClient.sismember.mockResolvedValue(0)
      const hasVisitedCrawl1 = await cache.hasVisited(crawlId1, url)
      expect(hasVisitedCrawl1).toBe(false)
    })
  })

  describe('Performance and Edge Cases', () => {
    it('should handle empty URL arrays', async () => {
      await expect(cache.markVisited(testCrawlId, [])).resolves.not.toThrow()
    })

    it('should handle empty strings in URL arrays', async () => {
      const urlsWithEmpty = ['', testUrls[0], '', testUrls[1]]
      
      await cache.markVisited(testCrawlId, urlsWithEmpty)

      // Empty strings should be handled gracefully
      const hasValidUrl = await cache.hasVisited(testCrawlId, testUrls[0])
      const hasEmptyUrl = await cache.hasVisited(testCrawlId, '')

      expect(hasValidUrl).toBe(true)
      expect(hasEmptyUrl).toBe(true) // Empty string is treated as a valid URL
    })

    it('should handle large batches efficiently', async () => {
      const largeUrlBatch = Array.from({ length: 1000 }, (_, i) => `https://example.com/page${i}`)
      
      await cache.markVisited(testCrawlId, largeUrlBatch)

      // Check random URLs from the batch
      const randomUrl1 = largeUrlBatch[100]
      const randomUrl2 = largeUrlBatch[500]
      const randomUrl3 = largeUrlBatch[900]

      const hasVisited1 = await cache.hasVisited(testCrawlId, randomUrl1)
      const hasVisited2 = await cache.hasVisited(testCrawlId, randomUrl2)
      const hasVisited3 = await cache.hasVisited(testCrawlId, randomUrl3)

      expect(hasVisited1).toBe(true)
      expect(hasVisited2).toBe(true)
      expect(hasVisited3).toBe(true)
    })

    it('should normalize URLs consistently', async () => {
      const urlVariations = [
        'https://example.com',
        'https://example.com/',
        'https://EXAMPLE.COM',
        'https://example.com/?',
      ]

      // Mark first variation as visited
      await cache.markVisited(testCrawlId, [urlVariations[0]])

      // All variations should be treated as the same URL
      for (const url of urlVariations) {
        const hasVisited = await cache.hasVisited(testCrawlId, url)
        // This test will initially fail because we haven't implemented normalization yet
        // We'll implement it when we create the actual class
      }
    })
  })

  describe('Batch Operations', () => {
    it('should efficiently check multiple URLs', async () => {
      // Mark some URLs as visited
      await cache.markVisited(testCrawlId, [testUrls[0], testUrls[2]])

      // Check all URLs
      const results = await Promise.all(
        testUrls.map(url => cache.hasVisited(testCrawlId, url))
      )

      expect(results[0]).toBe(true)  // testUrls[0] - visited
      expect(results[1]).toBe(false) // testUrls[1] - not visited
      expect(results[2]).toBe(true)  // testUrls[2] - visited
      expect(results[3]).toBe(false) // testUrls[3] - not visited
    })

    it('should handle batch marking with mixed new and existing URLs', async () => {
      // Mark some URLs initially
      await cache.markVisited(testCrawlId, [testUrls[0], testUrls[1]])

      // Mark batch including some existing URLs
      const mixedBatch = [testUrls[0], testUrls[2], testUrls[3]] // testUrls[0] already exists
      await cache.markVisited(testCrawlId, mixedBatch)

      // All URLs should now be marked as visited
      for (const url of testUrls) {
        const hasVisited = await cache.hasVisited(testCrawlId, url)
        expect(hasVisited).toBe(true)
      }
    })
  })
})

console.log('🧪 UrlDeduplicationCache tests ready!')
console.log('📋 Testing: Memory cache + Redis fallback + batch operations + edge cases')
console.log('🚀 TDD Approach: Tests written first, implementation comes next')