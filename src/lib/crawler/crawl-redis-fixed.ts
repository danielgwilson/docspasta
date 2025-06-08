/**
 * Fixed version of updateCrawlProgress with atomic status transitions
 * Addresses the race condition where status remains 'active' after completion
 */

import { getRedisConnection } from './queue-service'
import type { StoredCrawl } from './crawl-redis'

/**
 * Atomically update crawl progress with proper status transitions
 * This fixes the bug where crawls remain 'active' even after completion
 */
export async function updateCrawlProgressAtomic(
  crawlId: string,
  updates: Partial<StoredCrawl>
): Promise<void> {
  const redis = getRedisConnection()
  
  try {
    // If updating to completed/failed status, use atomic transaction
    if (updates.status === 'completed' || updates.status === 'failed') {
      // Use Redis MULTI/EXEC for atomic update
      const multi = redis.multi()
      
      // Update all fields atomically
      const updateFields: Record<string, string> = {}
      
      if (updates.status) updateFields.status = updates.status
      if (updates.completedAt) updateFields.completedAt = updates.completedAt.toString()
      if (updates.errorMessage !== undefined) updateFields.errorMessage = updates.errorMessage
      if (updates.progress) updateFields.progress = JSON.stringify(updates.progress)
      if (updates.totalDiscovered !== undefined) updateFields.totalDiscovered = updates.totalDiscovered.toString()
      if (updates.totalQueued !== undefined) updateFields.totalQueued = updates.totalQueued.toString()
      if (updates.totalProcessed !== undefined) updateFields.totalProcessed = updates.totalProcessed.toString()
      if (updates.totalFiltered !== undefined) updateFields.totalFiltered = updates.totalFiltered.toString()
      if (updates.totalSkipped !== undefined) updateFields.totalSkipped = updates.totalSkipped.toString()
      if (updates.totalFailed !== undefined) updateFields.totalFailed = updates.totalFailed.toString()
      if (updates.discoveryComplete !== undefined) updateFields.discoveryComplete = updates.discoveryComplete ? '1' : '0'
      
      // Add all updates to transaction
      for (const [field, value] of Object.entries(updateFields)) {
        multi.hset(`crawl:${crawlId}:meta`, field, value)
      }
      
      // Execute transaction atomically
      const results = await multi.exec()
      
      if (!results || results.some(([err]) => err !== null)) {
        throw new Error('Failed to execute atomic update transaction')
      }
      
      console.log(`✅ Atomically updated crawl ${crawlId} to status: ${updates.status}`)
    } else {
      // For non-status updates, use regular update (backward compatible)
      const { updateCrawlProgress } = await import('./crawl-redis')
      await updateCrawlProgress(crawlId, updates)
    }
  } catch (error) {
    console.error('❌ Failed to update crawl progress atomically:', error)
    throw error
  }
}

/**
 * Enhanced completion detection with proper locking
 * Prevents multiple workers from trying to complete the same crawl
 */
export async function completeWithSingleWriter(
  crawlId: string,
  errorMessage?: string
): Promise<boolean> {
  const redis = getRedisConnection()
  
  try {
    // Try to acquire exclusive completion lock
    const lockKey = `crawl:${crawlId}:completing`
    const lockId = Math.random().toString(36).substring(7)
    
    // Upstash Redis API - use setex and setnx
    const acquired = await redis.setnx(lockKey, lockId)
    if (acquired) {
      await redis.expire(lockKey, 10)
    }
    
    if (!acquired) {
      console.log(`🔒 Another worker is already completing crawl ${crawlId}`)
      return false
    }
    
    try {
      // Get current crawl state
      const { getCrawl } = await import('./crawl-redis')
      const crawl = await getCrawl(crawlId)
      
      if (!crawl) {
        console.error(`❌ Crawl ${crawlId} not found`)
        return false
      }
      
      // Check if already completed
      if (crawl.status === 'completed' || crawl.status === 'failed') {
        console.log(`⏭️  Crawl ${crawlId} already ${crawl.status}`)
        return false
      }
      
      // Perform atomic status update
      await updateCrawlProgressAtomic(crawlId, {
        status: errorMessage ? 'failed' : 'completed',
        completedAt: Date.now(),
        errorMessage,
        progress: {
          ...crawl.progress,
          phase: 'completed',
          message: errorMessage || `Crawl completed! Processed ${crawl.totalProcessed} pages.`,
        },
      })
      
      console.log(`🎉 Successfully completed crawl ${crawlId}`)
      return true
    } finally {
      // Always release the lock
      const currentLockId = await redis.get(lockKey)
      if (currentLockId === lockId) {
        await redis.del(lockKey)
      }
    }
  } catch (error) {
    console.error('❌ Failed to complete crawl with single writer:', error)
    return false
  }
}