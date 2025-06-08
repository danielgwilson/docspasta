import { v4 as uuidv4 } from 'uuid'
import { getCrawlQueue, getRedisConnection } from './queue-service'

/**
 * Batch Crawl Job Data Structure
 * Optimized for high-performance parallel processing
 */
export interface BatchCrawlJobData {
  crawlId: string
  urls: string[]
  batchNumber: number
  totalBatches: number
  jobId: string
  options?: object
  parentUrl?: string
  depth?: number
}

/**
 * Batch Job Options
 */
export interface BatchJobOptions {
  batchSize?: number
  delay?: number
  priority?: number
  attempts?: number
  depth?: number
  parentUrl?: string
  options?: object // Add this to pass through the actual crawl options
}

/**
 * Batch Progress Data
 */
export interface BatchProgress {
  totalBatches: number
  completedBatches: number
  failedBatches: number
  completionPercentage?: number
}

/**
 * Batch Completion Data
 */
export interface BatchCompletionData {
  processed: number
  failed: number
  discoveredUrls?: string[]
}

/**
 * Add batch crawl jobs to the queue
 * High-performance alternative to individual URL jobs
 * 
 * @param crawlId - The crawl identifier
 * @param urls - Array of URLs to crawl
 * @param options - Batch configuration options
 * @returns Array of batch job IDs
 */
export async function addBatchCrawlJobs(
  crawlId: string,
  urls: string[],
  options: BatchJobOptions = {}
): Promise<string[]> {
  // Input validation
  if (!crawlId || crawlId.trim() === '') {
    throw new Error('Crawl ID is required')
  }
  
  if (urls.length === 0) {
    return []
  }

  const batchSize = options.batchSize !== undefined ? options.batchSize : 20
  if (batchSize <= 0) {
    throw new Error('Batch size must be greater than 0')
  }

  const queue = getCrawlQueue()
  const batches: Array<{ name: string; data: BatchCrawlJobData; opts: object }> = []
  const totalBatches = Math.ceil(urls.length / batchSize)
  const jobIds: string[] = []

  // Create batch jobs
  for (let i = 0; i < urls.length; i += batchSize) {
    const batchUrls = urls.slice(i, i + batchSize)
    const batchNumber = Math.floor(i / batchSize) + 1
    const jobId = uuidv4()
    
    jobIds.push(jobId)
    
    batches.push({
      name: 'batch-crawl',
      data: {
        crawlId,
        urls: batchUrls,
        batchNumber,
        totalBatches,
        jobId,
        options: options.options, // Pass through the actual crawl options
        parentUrl: options.parentUrl,
        depth: options.depth,
      },
      opts: {
        priority: options.priority || 5,
        delay: options.delay || 0,
        jobId, // Use our custom UUID for tracking
        attempts: options.attempts || 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }
    })
  }

  try {
    await queue.addBulk(batches)
    console.log(`📦 Created ${batches.length} batch jobs for ${urls.length} URLs (crawl: ${crawlId})`)
    
    // Initialize batch progress tracking
    await initializeBatchProgress(crawlId, totalBatches)
    
    return jobIds
  } catch (error) {
    console.error(`❌ Failed to create batch jobs for crawl ${crawlId}:`, error)
    throw error
  }
}

/**
 * Initialize batch progress tracking in Redis
 */
async function initializeBatchProgress(crawlId: string, totalBatches: number): Promise<void> {
  const redis = getRedisConnection()
  
  try {
    await redis.hset(`batch:${crawlId}:progress`, {
      totalBatches: totalBatches.toString(),
      completedBatches: '0',
      failedBatches: '0',
      createdAt: Date.now().toString(),
    })
  } catch (error) {
    console.error(`⚠️  Failed to initialize batch progress for crawl ${crawlId}:`, error)
    // Don't throw - continue without progress tracking
  }
}

/**
 * Mark a batch as complete and update progress
 */
export async function markBatchComplete(
  crawlId: string,
  batchNumber: number,
  completion: BatchCompletionData
): Promise<void> {
  const redis = getRedisConnection()
  
  try {
    const pipeline = redis.pipeline()
    
    // Mark this specific batch as complete
    pipeline.hset(`batch:${crawlId}:progress`, {
      [`batch_${batchNumber}_complete`]: '1',
      [`batch_${batchNumber}_processed`]: completion.processed.toString(),
      [`batch_${batchNumber}_failed`]: completion.failed.toString(),
      [`batch_${batchNumber}_completedAt`]: Date.now().toString(),
    })
    
    // Update overall counters
    if (completion.failed > 0) {
      pipeline.hincrby(`batch:${crawlId}:progress`, 'failedBatches', 1)
    } else {
      pipeline.hincrby(`batch:${crawlId}:progress`, 'completedBatches', 1)
    }
    
    await pipeline.exec()
    
    console.log(`✅ Batch ${batchNumber} completed for crawl ${crawlId}: ${completion.processed} processed, ${completion.failed} failed`)
  } catch (error) {
    console.error(`⚠️  Failed to mark batch ${batchNumber} complete for crawl ${crawlId}:`, error)
    // Don't throw - continue without progress tracking
  }
}

/**
 * Get batch progress for a crawl
 */
export async function getBatchProgress(crawlId: string): Promise<BatchProgress> {
  const redis = getRedisConnection()
  
  try {
    const progress = await redis.hgetall(`batch:${crawlId}:progress`)
    
    const totalBatches = parseInt(progress.totalBatches || '0')
    const completedBatches = parseInt(progress.completedBatches || '0')
    const failedBatches = parseInt(progress.failedBatches || '0')
    
    const completionPercentage = totalBatches > 0 
      ? Math.round((completedBatches / totalBatches) * 100)
      : 0
    
    return {
      totalBatches,
      completedBatches,
      failedBatches,
      completionPercentage,
    }
  } catch (error) {
    console.error(`❌ Failed to get batch progress for crawl ${crawlId}:`, error)
    return {
      totalBatches: 0,
      completedBatches: 0,
      failedBatches: 0,
      completionPercentage: 0,
    }
  }
}

/**
 * Check if all batches for a crawl are complete
 */
export async function areAllBatchesComplete(crawlId: string): Promise<boolean> {
  const progress = await getBatchProgress(crawlId)
  return progress.totalBatches > 0 && 
         (progress.completedBatches + progress.failedBatches) >= progress.totalBatches
}

/**
 * Get detailed batch status for debugging
 */
export async function getBatchDetails(crawlId: string): Promise<object | null> {
  const redis = getRedisConnection()
  
  try {
    const allData = await redis.hgetall(`batch:${crawlId}:progress`)
    const progress = await getBatchProgress(crawlId)
    
    // Extract individual batch details
    const batchDetails: Record<string, Record<string, string>> = {}
    for (const [key, value] of Object.entries(allData)) {
      if (key.startsWith('batch_') && key.includes('_')) {
        const [, batchNum, field] = key.split('_')
        if (!batchDetails[batchNum]) {
          batchDetails[batchNum] = {}
        }
        batchDetails[batchNum][field] = value
      }
    }
    
    return {
      overall: progress,
      batches: batchDetails,
      metadata: {
        createdAt: allData.createdAt ? parseInt(allData.createdAt) : null,
      }
    }
  } catch (error) {
    console.error(`❌ Failed to get batch details for crawl ${crawlId}:`, error)
    return null
  }
}

/**
 * Clean up batch progress data after crawl completion
 */
export async function cleanupBatchProgress(crawlId: string): Promise<void> {
  const redis = getRedisConnection()
  
  try {
    await redis.del(`batch:${crawlId}:progress`)
    console.log(`🧹 Cleaned up batch progress for crawl: ${crawlId}`)
  } catch (error) {
    console.error(`⚠️  Failed to cleanup batch progress for crawl ${crawlId}:`, error)
    // Don't throw - cleanup is optional
  }
}

/**
 * Get batch job counts for monitoring
 */
export async function getBatchJobCounts(crawlId: string): Promise<{
  active: number
  waiting: number
  completed: number
  failed: number
}> {
  const queue = getCrawlQueue()
  
  try {
    const [active, waiting, completed, failed] = await Promise.all([
      queue.getActive(),
      queue.getWaiting(),
      queue.getCompleted(),
      queue.getFailed(),
    ])
    
    // Filter jobs by crawl ID and batch type
    const filterBatchJobs = (jobs: Array<{ name: string; data?: { crawlId?: string } }>) => 
      jobs.filter(job => 
        job.name === 'batch-crawl' && 
        job.data?.crawlId === crawlId
      ).length
    
    return {
      active: filterBatchJobs(active),
      waiting: filterBatchJobs(waiting),
      completed: filterBatchJobs(completed),
      failed: filterBatchJobs(failed),
    }
  } catch (error) {
    console.error(`❌ Failed to get batch job counts for crawl ${crawlId}:`, error)
    return { active: 0, waiting: 0, completed: 0, failed: 0 }
  }
}