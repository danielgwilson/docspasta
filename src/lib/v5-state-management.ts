import { db } from '@/lib/db/connection'
import { crawlingJobs, crawledPages } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'

/**
 * V5 State Management for Efficient SSE Streaming
 * 
 * These functions handle atomic state updates with automatic version incrementing
 * for ultra-efficient SSE polling patterns.
 */

interface ProgressUpdate {
  discoveredUrls?: number
  failedUrls?: number
}

interface JobUpdate {
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'partial_success'
  statusMessage?: string | null
  progress?: ProgressUpdate
  finalMarkdown?: string | null
  completedAt?: Date | null
}

/**
 * Atomically update job state with automatic state version incrementing
 */
export async function updateJobState(
  jobId: string, 
  userId: string, 
  updates: JobUpdate
): Promise<{ success: boolean; newStateVersion?: number }> {
  try {
    // Build the update object
    const updateData: any = {}
    
    if (updates.status !== undefined) {
      updateData.status = updates.status
    }
    
    if (updates.statusMessage !== undefined) {
      updateData.statusMessage = updates.statusMessage
    }
    
    if (updates.finalMarkdown !== undefined) {
      updateData.finalMarkdown = updates.finalMarkdown
    }
    
    if (updates.completedAt !== undefined) {
      updateData.completedAt = updates.completedAt
    }
    
    // Handle progress summary updates
    if (updates.progress) {
      // Use PostgreSQL jsonb_set to update only specified fields
      const progressUpdates = Object.entries(updates.progress)
        .filter(([_, value]) => value !== undefined)
        .map(([key, value]) => `'{"${key}": ${value}}'::jsonb`)
        .join(', ')
      
      if (progressUpdates) {
        updateData.progressSummary = sql`progress_summary || ${sql.raw(`jsonb_build_object(${Object.entries(updates.progress)
          .filter(([_, value]) => value !== undefined)
          .map(([key, value]) => `'${key}', ${value}`)
          .join(', ')})`)}::jsonb`
      }
    }
    
    // Set updated timestamp (trigger will handle state_version)
    updateData.updatedAt = new Date()
    
    // Perform atomic update with user authorization
    const result = await db.update(crawlingJobs)
      .set(updateData)
      .where(and(
        eq(crawlingJobs.id, jobId),
        eq(crawlingJobs.userId, userId)
      ))
      .returning({ stateVersion: crawlingJobs.stateVersion })
    
    if (result.length === 0) {
      console.warn(`⚠️ [V5] Job update failed - not found or unauthorized: ${jobId}`)
      return { success: false }
    }
    
    const newStateVersion = result[0].stateVersion
    console.log(`📈 [V5] Job ${jobId} updated to state version ${newStateVersion}`)
    
    return { success: true, newStateVersion }
    
  } catch (error) {
    console.error(`❌ [V5] Failed to update job state for ${jobId}:`, error)
    return { success: false }
  }
}

/**
 * Increment page counts atomically
 */
export async function incrementPageCounts(
  jobId: string,
  userId: string,
  increment: {
    discovered?: number
    failed?: number
  }
): Promise<{ success: boolean; newStateVersion?: number }> {
  try {
    // Only track counts that can't be calculated from crawled_pages table
    const incrementSql = sql`
      progress_summary || jsonb_build_object(
        'discoveredUrls', (COALESCE((progress_summary->>'discoveredUrls')::int, 0) + ${increment.discovered || 0}),
        'failedUrls', (COALESCE((progress_summary->>'failedUrls')::int, 0) + ${increment.failed || 0})
      )::jsonb
    `
    
    const result = await db.update(crawlingJobs)
      .set({
        progressSummary: incrementSql,
        updatedAt: new Date(),
      })
      .where(and(
        eq(crawlingJobs.id, jobId),
        eq(crawlingJobs.userId, userId)
      ))
      .returning({ stateVersion: crawlingJobs.stateVersion })
    
    if (result.length === 0) {
      console.warn(`⚠️ [V5] Page count increment failed - job not found: ${jobId}`)
      return { success: false }
    }
    
    const newStateVersion = result[0].stateVersion
    console.log(`📊 [V5] Job ${jobId} counts incremented to state version ${newStateVersion}`)
    
    return { success: true, newStateVersion }
    
  } catch (error) {
    console.error(`❌ [V5] Failed to increment page counts for ${jobId}:`, error)
    return { success: false }
  }
}


/**
 * Get current job state for SSE streaming
 */
export async function getJobState(jobId: string, userId: string) {
  try {
    const result = await db.select({
      id: crawlingJobs.id,
      status: crawlingJobs.status,
      stateVersion: crawlingJobs.stateVersion,
      progressSummary: crawlingJobs.progressSummary,
      statusMessage: crawlingJobs.statusMessage,
      updatedAt: crawlingJobs.updatedAt,
    })
    .from(crawlingJobs)
    .where(and(
      eq(crawlingJobs.id, jobId),
      eq(crawlingJobs.userId, userId)
    ))
    .limit(1)
    
    return result.length > 0 ? result[0] : null
    
  } catch (error) {
    console.error(`❌ [V5] Failed to get job state for ${jobId}:`, error)
    return null
  }
}

/**
 * Mark job as running (called when first URL processing starts)
 */
export async function markJobAsRunning(jobId: string, userId: string) {
  return updateJobState(jobId, userId, {
    status: 'running',
    statusMessage: null,
  })
}

/**
 * Mark job as completed with final markdown
 */
export async function markJobAsCompleted(
  jobId: string, 
  userId: string, 
  finalMarkdown: string
) {
  return updateJobState(jobId, userId, {
    status: 'completed',
    statusMessage: null,
    finalMarkdown,
    completedAt: new Date(),
  })
}

/**
 * Mark job as failed with error message
 */
export async function markJobAsFailed(
  jobId: string, 
  userId: string, 
  errorMessage: string
) {
  return updateJobState(jobId, userId, {
    status: 'failed',
    statusMessage: errorMessage,
    completedAt: new Date(),
  })
}

/**
 * Utility: Get page counts for a job (for debugging/monitoring)
 */
export async function getPageCounts(jobId: string, userId: string) {
  try {
    const result = await db.select({
      status: crawledPages.status,
      count: sql<number>`count(*)::int`,
    })
    .from(crawledPages)
    .innerJoin(crawlingJobs, eq(crawledPages.jobId, crawlingJobs.id))
    .where(and(
      eq(crawlingJobs.id, jobId),
      eq(crawlingJobs.userId, userId)
    ))
    .groupBy(crawledPages.status)
    
    return result.reduce((acc, item) => {
      acc[item.status] = item.count
      return acc
    }, {} as Record<string, number>)
    
  } catch (error) {
    console.error(`❌ [V5] Failed to get page counts for ${jobId}:`, error)
    return {}
  }
}

/**
 * Get comprehensive job statistics calculated dynamically from database
 */
export async function getJobStatistics(jobId: string, userId: string) {
  try {
    // Get page counts by status
    const pageCounts = await getPageCounts(jobId, userId)
    
    // Calculate total word count for completed pages
    const wordCountResult = await db.select({
      totalWords: sql<number>`COALESCE(SUM(word_count), 0)::int`,
    })
    .from(crawledPages)
    .innerJoin(crawlingJobs, eq(crawledPages.jobId, crawlingJobs.id))
    .where(and(
      eq(crawlingJobs.id, jobId),
      eq(crawlingJobs.userId, userId),
      eq(crawledPages.status, 'crawled')
    ))
    
    // Get progress summary for non-derived counts
    const progressResult = await db.select({
      progressSummary: crawlingJobs.progressSummary,
    })
    .from(crawlingJobs)
    .where(and(
      eq(crawlingJobs.id, jobId),
      eq(crawlingJobs.userId, userId)
    ))
    .limit(1)
    
    const progress = progressResult[0]?.progressSummary || {}
    
    return {
      pagesProcessed: pageCounts.crawled || 0,
      pagesFound: Object.values(pageCounts).reduce((total, count) => total + count, 0),
      totalWords: wordCountResult[0]?.totalWords || 0,
      discoveredUrls: progress.discoveredUrls || 0,
      failedUrls: pageCounts.error || 0,
      pendingPages: pageCounts.pending || 0,
    }
    
  } catch (error) {
    console.error(`❌ [V5] Failed to get job statistics for ${jobId}:`, error)
    return {
      pagesProcessed: 0,
      pagesFound: 0,
      totalWords: 0,
      discoveredUrls: 0,
      failedUrls: 0,
      pendingPages: 0,
    }
  }
}