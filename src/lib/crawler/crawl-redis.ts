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
  totalDiscovered: number  // Total URLs found (before filtering)
  totalQueued: number      // URLs that passed filters and were queued
  totalProcessed: number   // URLs actually crawled
  totalFiltered: number    // URLs filtered out
  totalSkipped: number     // URLs skipped (duplicates)
  totalFailed: number      // URLs that failed to crawl
  progress: CrawlProgress
  results: CrawlResult[]
  errorMessage?: string
  // Track discovery phase completion
  discoveryComplete?: boolean
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

// REMOVED: lockURL and isURLVisited functions - superseded by UrlDeduplicationCache
// These functions provided Redis-only deduplication but have been replaced by
// UrlDeduplicationCache which offers memory-first O(1) lookups with Redis fallback
// for 20-50x performance improvement

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
      totalQueued: crawl.totalQueued.toString(),
      totalProcessed: crawl.totalProcessed.toString(),
      totalFiltered: crawl.totalFiltered.toString(),
      totalSkipped: crawl.totalSkipped.toString(),
      totalFailed: crawl.totalFailed.toString(),
      discoveryComplete: crawl.discoveryComplete ? '1' : '0',
      errorMessage: crawl.errorMessage || '',
      progress: JSON.stringify(crawl.progress),
      results: JSON.stringify(crawl.results),
    })
    
    console.log(`🔧 Saved crawl with status: ${crawl.status} to Redis`)
    
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
      totalQueued: parseInt(data.totalQueued) || 0,
      totalProcessed: parseInt(data.totalProcessed) || 0,
      totalFiltered: parseInt(data.totalFiltered) || 0,
      totalSkipped: parseInt(data.totalSkipped) || 0,
      totalFailed: parseInt(data.totalFailed) || 0,
      discoveryComplete: data.discoveryComplete === '1',
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
  updates: Partial<Pick<StoredCrawl, 'totalDiscovered' | 'totalQueued' | 'totalProcessed' | 'totalFiltered' | 'totalSkipped' | 'totalFailed' | 'discoveryComplete' | 'status' | 'progress' | 'completedAt' | 'errorMessage'>>
): Promise<void> {
  const redis = getRedisConnection()
  
  try {
    const updateFields: Record<string, string> = {}
    
    if (updates.totalDiscovered !== undefined) {
      updateFields.totalDiscovered = updates.totalDiscovered.toString()
    }
    if (updates.totalQueued !== undefined) {
      updateFields.totalQueued = updates.totalQueued.toString()
    }
    if (updates.totalProcessed !== undefined) {
      updateFields.totalProcessed = updates.totalProcessed.toString()
    }
    if (updates.totalFiltered !== undefined) {
      updateFields.totalFiltered = updates.totalFiltered.toString()
    }
    if (updates.totalSkipped !== undefined) {
      updateFields.totalSkipped = updates.totalSkipped.toString()
    }
    if (updates.totalFailed !== undefined) {
      updateFields.totalFailed = updates.totalFailed.toString()
    }
    if (updates.discoveryComplete !== undefined) {
      updateFields.discoveryComplete = updates.discoveryComplete ? '1' : '0'
    }
    if (updates.status !== undefined) {
      updateFields.status = updates.status
    } else {
      // CRITICAL FIX: If status not provided, preserve existing status
      const existingCrawl = await getCrawl(crawlId)
      if (existingCrawl?.status) {
        updateFields.status = existingCrawl.status
      }
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
      console.log(`📊 Updated crawl progress: ${crawlId}`, {
        status: updateFields.status,
        phase: updates.progress?.phase,
        completedAt: updateFields.completedAt,
      })
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
 * Increment counter atomically
 */
export async function incrementCrawlCounter(
  crawlId: string,
  counter: 'totalFiltered' | 'totalSkipped' | 'totalFailed',
  amount: number = 1
): Promise<void> {
  const crawl = await getCrawl(crawlId)
  if (!crawl) return
  
  const updates: Partial<StoredCrawl> = {}
  updates[counter] = (crawl[counter] || 0) + amount
  
  await updateCrawlProgress(crawlId, updates)
}

/**
 * Mark discovery phase as complete
 */
export async function markDiscoveryComplete(crawlId: string): Promise<void> {
  const redis = getRedisConnection()
  
  try {
    // Use Redis to atomically mark discovery complete (following Firecrawl pattern)
    await redis.set(`crawl:${crawlId}:kickoff:finish`, '1')
    await updateCrawlProgress(crawlId, { discoveryComplete: true })
    console.log(`🏁 Marked discovery complete for crawl: ${crawlId}`)
  } catch (error) {
    console.error('❌ Failed to mark discovery complete:', error)
    throw error
  }
}

/**
 * Check if crawl is finished (following Firecrawl's completion detection)
 */
export async function isCrawlFinished(crawlId: string): Promise<boolean> {
  const redis = getRedisConnection()
  
  try {
    // Check if kickoff phase is complete
    const kickoffComplete = await redis.get(`crawl:${crawlId}:kickoff:finish`)
    if (!kickoffComplete) {
      return false
    }
    
    // Check if all jobs are done
    const [jobsDone, totalJobs] = await Promise.all([
      redis.scard(`crawl:${crawlId}:jobs_done`),
      redis.scard(`crawl:${crawlId}:jobs`),
    ])
    
    return jobsDone === totalJobs && totalJobs > 0
  } catch (error) {
    console.error('❌ Failed to check crawl completion:', error)
    return false
  }
}

/**
 * Mark job as done and check for crawl completion (ATOMIC)
 * Only returns true for the worker who completes the FINAL job
 */
export async function markJobDone(crawlId: string, jobId: string): Promise<boolean> {
  const redis = getRedisConnection()
  
  try {
    // Atomically add job to done set and check counts
    const pipeline = redis.pipeline()
    pipeline.sadd(`crawl:${crawlId}:jobs_done`, jobId)
    pipeline.scard(`crawl:${crawlId}:jobs_done`)
    pipeline.scard(`crawl:${crawlId}:jobs`)
    pipeline.get(`crawl:${crawlId}:kickoff:finish`)
    
    const results = await pipeline.exec()
    
    if (!results || results.length !== 4) {
      return false
    }
    
    const [addResult, jobsDone, totalJobs, kickoffComplete] = results.map(r => r?.[1])
    
    // Only return true if kickoff is complete AND we just completed the final job
    const isComplete = kickoffComplete && 
                      jobsDone === totalJobs && 
                      Number(totalJobs) > 0 &&
                      addResult === 1 // We actually added this job (wasn't duplicate)
    
    return Boolean(isComplete)
  } catch (error) {
    console.error('❌ Failed to mark job done:', error)
    return false
  }
}

/**
 * Track a job for completion detection
 */
export async function trackJob(crawlId: string, jobId: string): Promise<void> {
  const redis = getRedisConnection()
  
  try {
    await redis.sadd(`crawl:${crawlId}:jobs`, jobId)
  } catch (error) {
    console.error('❌ Failed to track job:', error)
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
      redis.del(`crawl:${crawlId}:jobs`),
      redis.del(`crawl:${crawlId}:jobs_done`),
      redis.del(`crawl:${crawlId}:kickoff:finish`),
    ])
    
    console.log(`🧹 Cleaned up crawl: ${crawlId}`)
  } catch (error) {
    console.error('❌ Failed to cleanup crawl:', error)
  }
}