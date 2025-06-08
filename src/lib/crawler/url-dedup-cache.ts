import { getRedisConnection } from './queue-service'
import type IORedis from 'ioredis'

/**
 * High-performance URL deduplication cache with memory-first approach and Redis fallback
 * 
 * Architecture:
 * 1. Memory cache (Set) for instant O(1) lookups during active crawl
 * 2. Redis persistence for crash recovery and cross-worker consistency
 * 3. Lazy loading from Redis when URL not found in memory
 * 4. Async Redis updates to not block the crawling process
 */
export class UrlDeduplicationCache {
  private memoryCache: Map<string, Set<string>> = new Map()
  private redisConnection: IORedis

  constructor() {
    this.redisConnection = getRedisConnection()
  }

  /**
   * Check if a URL has been visited for a specific crawl
   * Fast path: Memory cache (microseconds)
   * Slow path: Redis fallback (milliseconds)
   */
  async hasVisited(crawlId: string, url: string): Promise<boolean> {
    try {
      // Fast path: Check memory cache first
      const crawlSet = this.memoryCache.get(crawlId)
      if (crawlSet?.has(url)) {
        return true
      }

      // Slow path: Check Redis if not in memory
      const exists = await this.redisConnection.sismember(`urls:${crawlId}`, url)
      
      // Cache the result in memory for future lookups
      if (exists) {
        this.addToMemory(crawlId, url)
      }

      return Boolean(exists)
    } catch (error) {
      console.error(`❌ Failed to check if URL visited: ${url}`, error)
      return false // Fail open - assume not visited to avoid infinite loops
    }
  }

  /**
   * Mark URLs as visited for a specific crawl
   * Updates memory immediately, syncs to Redis asynchronously
   */
  async markVisited(crawlId: string, urls: string[]): Promise<void> {
    if (urls.length === 0) return

    try {
      // Update memory cache immediately for instant future lookups
      urls.forEach(url => this.addToMemory(crawlId, url))

      // Async Redis update - fire and forget for performance
      // Don't await this to avoid blocking the crawling process
      this.redisConnection.sadd(`urls:${crawlId}`, ...urls).catch(error => {
        console.error(`⚠️  Failed to sync URLs to Redis for crawl ${crawlId}:`, error)
        // Continue anyway - memory cache will work for this session
      })
    } catch (error) {
      console.error(`❌ Failed to mark URLs as visited for crawl ${crawlId}:`, error)
      // Don't throw - we want crawling to continue even if cache fails
    }
  }

  /**
   * Clear all cached data for a specific crawl
   * Called when crawl completes to free memory
   */
  clearCrawl(crawlId: string): void {
    this.memoryCache.delete(crawlId)
    console.log(`🧹 Cleared memory cache for crawl: ${crawlId}`)
  }

  /**
   * Get memory cache statistics for monitoring
   */
  getStats(): { totalCrawls: number; totalUrls: number; memorySizeKB: number } {
    let totalUrls = 0
    for (const urlSet of this.memoryCache.values()) {
      totalUrls += urlSet.size
    }

    // Rough memory estimation (each URL ~100 bytes on average)
    const memorySizeKB = Math.round((totalUrls * 100) / 1024)

    return {
      totalCrawls: this.memoryCache.size,
      totalUrls,
      memorySizeKB,
    }
  }

  /**
   * Batch check if multiple URLs have been visited
   * More efficient than individual checks for large batches
   */
  async hasVisitedBatch(crawlId: string, urls: string[]): Promise<boolean[]> {
    if (urls.length === 0) return []

    try {
      const results: boolean[] = []
      const uncachedUrls: string[] = []
      const uncachedIndices: number[] = []

      // Check memory cache first
      const crawlSet = this.memoryCache.get(crawlId)
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i]
        if (crawlSet?.has(url)) {
          results[i] = true
        } else {
          results[i] = false // Placeholder
          uncachedUrls.push(url)
          uncachedIndices.push(i)
        }
      }

      // Batch check Redis for uncached URLs
      if (uncachedUrls.length > 0) {
        const pipeline = this.redisConnection.pipeline()
        uncachedUrls.forEach(url => {
          pipeline.sismember(`urls:${crawlId}`, url)
        })
        const redisResults = await pipeline.exec()

        // Update results and cache
        if (redisResults) {
          for (let i = 0; i < uncachedUrls.length; i++) {
            const redisResult = redisResults[i]
            const exists = redisResult && redisResult[1] === 1
            const originalIndex = uncachedIndices[i]
            
            results[originalIndex] = Boolean(exists)
            
            // Cache positive results in memory
            if (exists) {
              this.addToMemory(crawlId, uncachedUrls[i])
            }
          }
        }
      }

      return results
    } catch (error) {
      console.error(`❌ Failed to batch check URLs for crawl ${crawlId}:`, error)
      // Return all false on error to avoid infinite loops
      return urls.map(() => false)
    }
  }

  /**
   * Filter out URLs that have already been visited
   * High-performance method for deduplication during crawling
   */
  async filterNewUrls(crawlId: string, urls: string[]): Promise<string[]> {
    if (urls.length === 0) return []

    const visitedStatus = await this.hasVisitedBatch(crawlId, urls)
    const newUrls: string[] = []

    for (let i = 0; i < urls.length; i++) {
      if (!visitedStatus[i]) {
        newUrls.push(urls[i])
      }
    }

    return newUrls
  }

  /**
   * Private helper to add URL to memory cache
   */
  private addToMemory(crawlId: string, url: string): void {
    if (!this.memoryCache.has(crawlId)) {
      this.memoryCache.set(crawlId, new Set())
    }
    this.memoryCache.get(crawlId)!.add(url)
  }

  /**
   * Clean up old crawl data to prevent memory leaks
   * Call periodically or when memory usage gets high
   */
  cleanup(): void {
    // In a real implementation, we'd track crawl timestamps
    // For now, this is a placeholder for memory management
    const stats = this.getStats()
    console.log(`🧹 Cache cleanup - Crawls: ${stats.totalCrawls}, URLs: ${stats.totalUrls}, Memory: ${stats.memorySizeKB}KB`)
    
    // If memory usage is high (>50MB), we could implement LRU eviction
    if (stats.memorySizeKB > 50 * 1024) {
      console.warn(`⚠️  High memory usage: ${stats.memorySizeKB}KB. Consider clearing old crawls.`)
    }
  }
}

// Singleton instance for the application
let globalCache: UrlDeduplicationCache | null = null

/**
 * Get the global URL deduplication cache instance
 * Singleton pattern to ensure efficient memory usage across the application
 */
export function getUrlDeduplicationCache(): UrlDeduplicationCache {
  if (!globalCache) {
    globalCache = new UrlDeduplicationCache()
  }
  return globalCache
}

/**
 * Reset the global cache instance (mainly for testing)
 */
export function resetUrlDeduplicationCache(): void {
  globalCache = null
}