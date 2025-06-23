import {
  discoverUrlsFromSite,
  createPageRecords,
  processUrlJob,
  checkAndFinalizeJob,
} from '@/lib/crawler'
import {
  updateJobState,
  incrementPageCounts,
  markJobAsRunning,
  markJobAsCompleted,
  markJobAsFailed,
} from '@/lib/v5-state-management'
import {
  StartCrawlJob,
  ProcessUrlJob,
  FinalizeJob,
  JobPayload,
} from '@/lib/queue/types'
import { publishUrlProcessingBatch } from '@/lib/queue/operations'

/**
 * V5 QStash Worker Functions
 * Clean separation of concerns with efficient state management
 */

/**
 * Process start-crawl job: create initial pages and fan out to processing
 */
export async function processV5StartCrawlJob(payload: StartCrawlJob): Promise<void> {
  const { jobId, userId, url, maxPages, maxDepth, qualityThreshold } = payload
  
  console.log(`🚀 [V5] Starting crawl job ${jobId} for URL: ${url}`)
  
  try {
    // Mark job as running
    await markJobAsRunning(jobId, userId)
    
    // 1. Discover URLs from sitemap and robots.txt
    console.log(`🗺️ [V5] Discovering URLs for ${url}...`)
    const discoveredUrls = await discoverUrlsFromSite(url, maxDepth, maxPages)
    
    if (discoveredUrls.length === 0) {
      console.warn(`⚠️ [V5] No URLs discovered for ${url}, processing root URL only`)
      discoveredUrls.push(url)
    }
    
    // 2. Create page records in database (idempotent)
    const pageRecords = await createPageRecords(jobId, userId, discoveredUrls)
    console.log(`📝 [V5] Created ${pageRecords.length} page records`)
    
    // 3. Update job with discovered count
    await incrementPageCounts(jobId, userId, {
      discovered: pageRecords.length,
    })
    
    // 4. Fan out to URL processing jobs (batched for efficiency)
    const processingJobs = pageRecords.map(page => ({
      jobId,
      userId,
      url: page.url,
      urlId: page.id, // Use actual database ID
      originalJobUrl: url,
      qualityThreshold,
    }))
    
    console.log(`📦 [V5] Publishing ${processingJobs.length} URL processing jobs...`)
    await publishUrlProcessingBatch(processingJobs, {
      concurrency: 5,
      // Note: delay is not supported with batch enqueue operations
    })
    
    console.log(`✅ [V5] Start-crawl job ${jobId} completed successfully`)
    
  } catch (error) {
    console.error(`❌ [V5] Start-crawl job ${jobId} failed:`, error)
    
    await markJobAsFailed(
      jobId,
      userId,
      error instanceof Error ? error.message : 'Unknown start-crawl error'
    )
    
    throw error
  }
}

/**
 * Process single URL job with idempotency and atomic state updates
 */
export async function processV5UrlJob(payload: ProcessUrlJob): Promise<void> {
  const { jobId, userId, url, urlId, originalJobUrl } = payload
  
  // Add qualityThreshold default for compatibility
  const processPayload = {
    ...payload,
    qualityThreshold: payload.qualityThreshold || 50, // Default threshold
  }
  
  await processUrlJob(processPayload)
  
  // Check if job is complete after processing this URL
  await checkAndFinalizeJob(jobId, userId)
}

// Export individual functions for testing
export const startCrawlJob = processV5StartCrawlJob
export const processUrlJobV5 = processV5UrlJob
export const finalizeJob = async (payload: { jobId: string }) => {
  // V5 uses automatic finalization, so this is a no-op
  console.log(`🏁 [V5] Manual finalize job called for ${payload.jobId} (auto-finalization in use)`)
}

/**
 * Main V5 worker entry point
 */
export async function processV5QStashJob(payload: JobPayload): Promise<void> {
  console.log(`💼 [V5] Processing ${payload.type} job ${payload.jobId} (retry: ${payload.retryCount})`)
  
  try {
    switch (payload.type) {
      case 'start-crawl':
        await processV5StartCrawlJob(payload)
        break
        
      case 'process-url':
        await processV5UrlJob(payload)
        break
        
      case 'finalize-job':
        // V5 uses automatic finalization, this type is deprecated
        console.log(`⚠️ [V5] Finalize-job type is deprecated in V5`)
        break
        
      default:
        throw new Error(`Unknown job type: ${(payload as any).type}`)
    }
    
    console.log(`✅ [V5] Job completed: ${payload.type} ${payload.jobId}`)
    
  } catch (error) {
    console.error(`❌ [V5] Job failed: ${payload.type} ${payload.jobId}`, error)
    throw error
  }
}