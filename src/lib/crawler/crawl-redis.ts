import { getRedisConnection } from './queue-service'
import type { CrawlProgress, CrawlResult } from './types'

/**
 * Redis storage layer for crawl state management
 * Following Firecrawl patterns for URL deduplication and progress tracking
 */

export interface StoredCrawl {
  id: string
  url: string
  status: 'active' | 'completed' | 'failed' | 'cancelled'
  createdAt: number
  completedAt?: number
  totalDiscovered: number
  totalProcessed: number
  progress: CrawlProgress
  results: CrawlResult[]
  errorMessage?: string
}

/**
 * Generate URL permutations to prevent duplicate crawling
 * Based on Firecrawl's generateURLPermutations function
 */
export function generateURLPermutations(url: string): string[] {
  const permutations = [url]
  
  try {
    const urlObj = new URL(url)
    const protocol = urlObj.protocol
    const hostname = urlObj.hostname
    const pathname = urlObj.pathname
    const search = urlObj.search
    const hash = urlObj.hash
    
    // Add www/non-www variants
    if (hostname.startsWith('www.')) {
      const nonWww = hostname.slice(4)
      permutations.push(`${protocol}//${nonWww}${pathname}${search}${hash}`)
    } else {
      permutations.push(`${protocol}//www.${hostname}${pathname}${search}${hash}`)
    }
    
    // Add http/https variants
    if (protocol === 'https:') {
      permutations.push(`http://${hostname}${pathname}${search}${hash}`)
      if (hostname.startsWith('www.')) {
        permutations.push(`http://${hostname.slice(4)}${pathname}${search}${hash}`)
      } else {
        permutations.push(`http://www.${hostname}${pathname}${search}${hash}`)
      }
    } else if (protocol === 'http:') {
      permutations.push(`https://${hostname}${pathname}${search}${hash}`)
      if (hostname.startsWith('www.')) {
        permutations.push(`https://${hostname.slice(4)}${pathname}${search}${hash}`)
      } else {
        permutations.push(`https://www.${hostname}${pathname}${search}${hash}`)
      }
    }
    
    // Add trailing slash variants for paths
    if (pathname === '' || pathname === '/') {
      // Don't add variants for root paths
    } else if (pathname.endsWith('/')) {
      const withoutSlash = pathname.slice(0, -1)
      permutations.push(`${protocol}//${hostname}${withoutSlash}${search}${hash}`)
    } else {
      permutations.push(`${protocol}//${hostname}${pathname}/${search}${hash}`)
    }
    
  } catch (error) {
    console.warn('❌ Failed to generate URL permutations:', error)
  }
  
  return [...new Set(permutations)] // Remove duplicates
}

/**
 * Atomically lock a URL to prevent duplicate crawling
 * Returns true if URL was successfully locked (new), false if already visited
 */
export async function lockURL(crawlId: string, url: string): Promise<boolean> {
  const redis = getRedisConnection()
  const permutations = generateURLPermutations(url)
  
  try {
    // Use Redis SADD to atomically add all permutations
    // Returns number of elements that were actually added (not already in set)
    const added = await redis.sadd(`crawl:${crawlId}:visited`, ...permutations)
    const success = added === permutations.length
    
    if (success) {
      console.log(`🔒 Locked URL: ${url}`)
    } else {
      console.log(`⏭️  URL already visited: ${url}`)
    }
    
    return success
  } catch (error) {
    console.error('❌ Failed to lock URL:', error)
    return false
  }
}

/**
 * Check if URL is already visited without locking
 */
export async function isURLVisited(crawlId: string, url: string): Promise<boolean> {
  const redis = getRedisConnection()
  const permutations = generateURLPermutations(url)
  
  try {
    // Check if any permutation exists in the visited set
    const pipeline = redis.pipeline()
    for (const perm of permutations) {
      pipeline.sismember(`crawl:${crawlId}:visited`, perm)
    }
    const results = await pipeline.exec()
    
    return results?.some(([err, result]) => err === null && result === 1) ?? false
  } catch (error) {
    console.error('❌ Failed to check URL visited status:', error)
    return false
  }
}

/**
 * Save crawl metadata to Redis
 */
export async function saveCrawl(crawl: StoredCrawl): Promise<void> {
  const redis = getRedisConnection()
  
  try {
    await redis.hset(`crawl:${crawl.id}:meta`, {
      id: crawl.id,
      url: crawl.url,
      status: crawl.status,
      createdAt: crawl.createdAt.toString(),
      completedAt: crawl.completedAt?.toString() || '',
      totalDiscovered: crawl.totalDiscovered.toString(),
      totalProcessed: crawl.totalProcessed.toString(),
      errorMessage: crawl.errorMessage || '',
      progress: JSON.stringify(crawl.progress),
      results: JSON.stringify(crawl.results),
    })
    
    // Set TTL for cleanup (24 hours)
    await redis.expire(`crawl:${crawl.id}:meta`, 86400)
    
    console.log(`💾 Saved crawl metadata: ${crawl.id}`)
  } catch (error) {
    console.error('❌ Failed to save crawl:', error)
    throw error
  }
}

/**
 * Get crawl metadata from Redis
 */
export async function getCrawl(crawlId: string): Promise<StoredCrawl | null> {
  const redis = getRedisConnection()
  
  try {
    const data = await redis.hgetall(`crawl:${crawlId}:meta`)
    
    if (!data || !data.id) {
      return null
    }
    
    return {
      id: data.id,
      url: data.url,
      status: data.status as StoredCrawl['status'],
      createdAt: parseInt(data.createdAt),
      completedAt: data.completedAt ? parseInt(data.completedAt) : undefined,
      totalDiscovered: parseInt(data.totalDiscovered) || 0,
      totalProcessed: parseInt(data.totalProcessed) || 0,
      errorMessage: data.errorMessage || undefined,
      progress: JSON.parse(data.progress || '{}'),
      results: JSON.parse(data.results || '[]'),
    }
  } catch (error) {
    console.error('❌ Failed to get crawl:', error)
    return null
  }
}

/**
 * Update crawl progress atomically
 */
export async function updateCrawlProgress(
  crawlId: string, 
  updates: Partial<Pick<StoredCrawl, 'totalDiscovered' | 'totalProcessed' | 'status' | 'progress' | 'completedAt' | 'errorMessage'>>
): Promise<void> {
  const redis = getRedisConnection()
  
  try {
    const updateFields: Record<string, string> = {}
    
    if (updates.totalDiscovered !== undefined) {
      updateFields.totalDiscovered = updates.totalDiscovered.toString()
    }
    if (updates.totalProcessed !== undefined) {
      updateFields.totalProcessed = updates.totalProcessed.toString()
    }
    if (updates.status !== undefined) {
      updateFields.status = updates.status
    }
    if (updates.progress !== undefined) {
      updateFields.progress = JSON.stringify(updates.progress)
    }
    if (updates.completedAt !== undefined) {
      updateFields.completedAt = updates.completedAt.toString()
    }
    if (updates.errorMessage !== undefined) {
      updateFields.errorMessage = updates.errorMessage
    }
    
    if (Object.keys(updateFields).length > 0) {
      await redis.hset(`crawl:${crawlId}:meta`, updateFields)
      console.log(`📊 Updated crawl progress: ${crawlId}`)
    }
  } catch (error) {
    console.error('❌ Failed to update crawl progress:', error)
    throw error
  }
}

/**
 * Add a result to the crawl
 */
export async function addCrawlResult(crawlId: string, result: CrawlResult): Promise<void> {
  const redis = getRedisConnection()
  
  try {
    // Store individual results in a list for streaming
    await redis.lpush(`crawl:${crawlId}:results`, JSON.stringify(result))
    
    // Also update the main results array (for backward compatibility)
    const crawl = await getCrawl(crawlId)
    if (crawl) {
      crawl.results.push(result)
      await updateCrawlProgress(crawlId, { progress: crawl.progress })
      await redis.hset(`crawl:${crawlId}:meta`, 'results', JSON.stringify(crawl.results))
    }
    
    console.log(`📄 Added result for: ${result.url}`)
  } catch (error) {
    console.error('❌ Failed to add crawl result:', error)
    throw error
  }
}

/**
 * Get recent crawl results (streaming)
 */
export async function getCrawlResults(crawlId: string, offset = 0, limit = 10): Promise<CrawlResult[]> {
  const redis = getRedisConnection()
  
  try {
    const resultStrings = await redis.lrange(`crawl:${crawlId}:results`, offset, offset + limit - 1)
    return resultStrings.map(str => JSON.parse(str)).reverse() // Reverse to get chronological order
  } catch (error) {
    console.error('❌ Failed to get crawl results:', error)
    return []
  }
}

/**
 * Clean up old crawl data
 */
export async function cleanupCrawl(crawlId: string): Promise<void> {
  const redis = getRedisConnection()
  
  try {
    await Promise.all([
      redis.del(`crawl:${crawlId}:meta`),
      redis.del(`crawl:${crawlId}:visited`),
      redis.del(`crawl:${crawlId}:results`),
    ])
    
    console.log(`🧹 Cleaned up crawl: ${crawlId}`)
  } catch (error) {
    console.error('❌ Failed to cleanup crawl:', error)
  }
}