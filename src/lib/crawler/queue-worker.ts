import { Worker, Job } from 'bullmq'
import { getCrawlQueue, getRedisConnection, crawlQueueName } from './queue-service'
import { 
  saveCrawl, 
  getCrawl, 
  updateCrawlProgress, 
  addCrawlResult,
  incrementCrawlCounter,
  markDiscoveryComplete,
  trackJob,
  markJobDone,
  type StoredCrawl 
} from './crawl-redis'
// Removed unused import
import { addBatchCrawlJobs, type BatchCrawlJobData } from './batch-jobs'
import type { 
  CrawlJobData, 
  KickoffJobData, 
  CrawlProgress, 
  CrawlResult,
 
} from './types'
import { WebCrawler } from './web-crawler'
import { getUrlDeduplicationCache } from './url-dedup-cache'
import { publishProgressEvent, handleUrlDiscovery, cleanupProgressTracking } from './streaming-progress'
import { incrementProgress, batchIncrementProgress } from './atomic-progress'

/**
 * Queue worker implementation following Firecrawl patterns
 * Handles kickoff jobs (sitemap discovery) and crawl jobs (individual pages)
 */

class CrawlWorker {
  private worker: Worker | null = null
  private isShuttingDown = false
  private runningJobs = new Set<string>()
  private urlCache = getUrlDeduplicationCache()

  async start(concurrency = 10) { // Increased concurrency for better parallelism
    console.log(`🏗️  Starting crawl worker with concurrency: ${concurrency}`)
    console.log(`🔍 WORKER DEBUG - This should appear in logs if worker starts!`)
    
    this.worker = new Worker(crawlQueueName, this.processJob.bind(this), {
      connection: getRedisConnection(),
      concurrency,
      lockDuration: 20 * 1000, // 20 seconds lock duration for debugging
      stalledInterval: 30 * 1000, // Check for stalled jobs every 30s (matching Firecrawl)
      maxStalledCount: 10, // Allow 10 stalls before giving up (matching Firecrawl)
    })

    this.worker.on('completed', (job) => {
      // Reduced logging for cleaner output
      this.runningJobs.delete(job.id!)
    })

    this.worker.on('failed', (job, err) => {
      console.error(`❌ Job failed: ${job?.id}`, err.message)
      if (job?.id) {
        this.runningJobs.delete(job.id)
      }
    })

    this.worker.on('stalled', (jobId) => {
      console.warn(`⏸️  Job stalled: ${jobId}`)
    })

    console.log('✨ Crawl worker started successfully')
  }

  async stop() {
    if (!this.worker) return
    
    console.log('🛑 Stopping crawl worker...')
    this.isShuttingDown = true
    
    // Wait for running jobs to complete
    while (this.runningJobs.size > 0) {
      console.log(`⏳ Waiting for ${this.runningJobs.size} jobs to complete...`)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    await this.worker.close()
    console.log('🔴 Crawl worker stopped')
  }

  private async processJob(job: Job): Promise<unknown> {
    if (this.isShuttingDown) {
      throw new Error('Worker is shutting down')
    }

    this.runningJobs.add(job.id!)
    
    // DEBUG: Log all job processing
    console.log(`🔍 DEBUG - Processing job: ${job.name} (ID: ${job.id})`)
    console.log(`🔍 DEBUG - Job data keys: ${Object.keys(job.data || {}).join(', ')}`)
    
    try {
      if (job.name === 'kickoff') {
        console.log(`🔍 DEBUG - Processing KICKOFF job`)
        return await this.processKickoffJob(job)
      } else if (job.name === 'crawl') {
        console.log(`🔍 DEBUG - Processing CRAWL job`)
        return await this.processCrawlJob(job)
      } else if (job.name === 'batch-crawl') {
        console.log(`🔍 DEBUG - Processing BATCH-CRAWL job`)
        return await this.processBatchCrawlJob(job)
      } else {
        throw new Error(`Unknown job type: ${job.name}`)
      }
    } catch (error) {
      console.error(`🔍 DEBUG - Job processing failed:`, error)
      throw error
    } finally {
      this.runningJobs.delete(job.id!)
    }
  }

  private async processKickoffJob(job: Job<KickoffJobData>): Promise<{ success: boolean }> {
    const { crawlId, url, options } = job.data
    
    console.log(`🚀 Processing kickoff job for: ${url}`)
    
    try {
      // Initialize crawl in Redis with enhanced tracking
      const crawl: StoredCrawl = {
        id: crawlId,
        url,
        status: 'active',
        createdAt: Date.now(),
        totalDiscovered: 0,
        totalQueued: 0,
        totalProcessed: 0,
        totalFiltered: 0,
        totalSkipped: 0,
        totalFailed: 0,
        discoveryComplete: false,
        progress: {
          current: 0,
          total: 0,
          phase: 'discovery',
          message: 'Starting crawl...',
          discovered: 0,
          queued: 0,
          processed: 0,
          filtered: 0,
          skipped: 0,
          failed: 0,
        },
        results: [],
      }
      
      await saveCrawl(crawl)

      // Create crawler instance
      const crawler = new WebCrawler()
      
      // Phase 1: Sitemap discovery with streaming progress
      await publishProgressEvent({
        crawlId,
        phase: 'discovering',
        processed: 0,
        total: 0,
        currentActivity: 'Discovering URLs via sitemap...',
      })
      
      const discoveredUrls = await crawler.discoverURLs(url, options)
      
      console.log(`🗺️  Discovered ${discoveredUrls.length} URLs from sitemap`)
      
      // Publish URL discovery event
      await handleUrlDiscovery({
        crawlId,
        newUrls: discoveredUrls.length,
        duplicateUrls: 0,
        totalDiscovered: discoveredUrls.length,
        source: 'sitemap',
      })
      
      // Update discovered count and ensure status stays active
      await updateCrawlProgress(crawlId, {
        totalDiscovered: discoveredUrls.length,
        progress: {
          current: 0,
          total: discoveredUrls.length,
          phase: 'crawling',
          message: `Found ${discoveredUrls.length} URLs to crawl`,
        },
      })

      // Phase 2: Queue batch crawl jobs with high-performance processing
      let skippedCount = 0
      
      // DEBUG: Log initial URL discovery details
      console.log(`🔍 DEBUG - Kickoff URL discovery for ${url}:`)
      console.log(`   Discovered URLs: ${discoveredUrls.length}`)
      console.log(`   Starting with: ${discoveredUrls.slice(0, 5).join(', ')}`)
      
      // 🚨 CRITICAL FIX: For sites without sitemaps, ensure starting URL gets processed
      // Don't run deduplication on the first URL - it needs to be processed to discover links
      const newUrls = discoveredUrls
      skippedCount = 0
      
      // DEBUG: Log deduplication results
      console.log(`🔍 DEBUG - URLs to process:`)
      console.log(`   URLs to queue: ${newUrls.length}`)
      console.log(`   Skipped (duplicates): ${skippedCount}`)
      
      // Mark all URLs as visited AFTER they're queued
      if (newUrls.length > 0) {
        await this.urlCache.markVisited(crawlId, newUrls)
      }
      
      // Update counts with actual queued and skipped
      const totalQueued = newUrls.length
      await updateCrawlProgress(crawlId, {
        totalQueued,
        totalSkipped: skippedCount,
        progress: {
          current: 0,
          total: totalQueued, // Update total to reflect actually queued URLs
          phase: 'crawling',
          message: `Queued ${totalQueued} URLs in batches (${skippedCount} duplicates skipped)`,
          discovered: discoveredUrls.length,
          queued: totalQueued,
          processed: 0,
          filtered: 0,
          skipped: skippedCount,
          failed: 0,
        },
      })
      
      if (newUrls.length > 0) {
        console.log(`🔍 DEBUG - About to queue ${newUrls.length} URLs as batch jobs`)
        console.log(`🔍 DEBUG - URLs to queue: ${newUrls.slice(0, 3).join(', ')}`)
        
        // Use batch job system for 20-50x performance improvement
        const jobIds = await addBatchCrawlJobs(crawlId, newUrls, {
          batchSize: 10, // Process 10 URLs per batch for optimal concurrency
          depth: 0,
          parentUrl: url,
          options, // CRITICAL FIX: Pass through the crawl options for link discovery
        })
        
        console.log(`🔍 DEBUG - Created ${jobIds.length} batch jobs with IDs: ${jobIds.slice(0, 3).join(', ')}`)
        
        // Track all jobs for completion detection
        await Promise.all(jobIds.map(jobId => trackJob(crawlId, jobId)))
        console.log(`🚀 Queued ${newUrls.length} URLs in ${jobIds.length} high-performance batch jobs`)
      } else {
        console.log(`🔍 DEBUG - NO URLs to queue! newUrls.length = 0`)
      }
      
      // Mark discovery phase complete
      await markDiscoveryComplete(crawlId)
      
      // 🚨 CRITICAL BUG FIX: Don't finish crawl if no URLs queued!
      // For sites without sitemaps (like Tailwind), we need to crawl the starting URL
      // to discover links through the actual page content
      console.log(`🔍 DEBUG - Kickoff decision: newUrls=${newUrls.length}, discoveredUrls=${discoveredUrls.length}`)
      
      if (newUrls.length === 0 && discoveredUrls.length <= 1) {
        console.log(`⚠️  No URLs to queue, but this might be normal for sitemap-less sites`)
        console.log(`   Will let the starting URL crawl and discover links during processing`)
        // DON'T finish the crawl yet - let the starting URL be processed
      }
      
      return { success: true }
    } catch (error) {
      console.error(`❌ Kickoff job failed:`, error)
      await this.finishCrawl(crawlId, error instanceof Error ? error.message : 'Unknown error')
      return { success: false }
    }
  }

  private async processCrawlJob(job: Job<CrawlJobData>): Promise<{ success: boolean; document?: unknown }> {
    const { crawlId, url, options, depth, parentUrl, jobId } = job.data
    
    console.log(`📄 Processing crawl job: ${url}`)
    
    try {
      // Check if crawl was cancelled
      const crawl = await getCrawl(crawlId)
      if (!crawl || crawl.status === 'cancelled') {
        console.log(`⏭️  Crawl cancelled, skipping: ${url}`)
        return { success: false }
      }

      // Create crawler instance with per-job timeout
      const crawler = new WebCrawler()
      
      // Crawl the individual page
      const result = await crawler.crawlPage(url, options)
      
      if (result.success && result.content) {
        // Store the result
        const crawlResult: CrawlResult = {
          url,
          title: result.title || 'Unknown',
          content: result.content,
          contentType: 'markdown',
          timestamp: Date.now(),
          statusCode: 200,
          parentUrl,
          depth,
        }
        
        await addCrawlResult(crawlId, crawlResult)
        
        // Extract new URLs if we haven't reached max depth
        if (depth < (options.maxDepth || 2) && result.links) {
          let newSkipped = 0
          
          // Fast batch deduplication check using high-performance cache
          const newUrls = await this.urlCache.filterNewUrls(crawlId, result.links)
          newSkipped = result.links.length - newUrls.length
          
          // Mark all new URLs as visited immediately to prevent race conditions
          if (newUrls.length > 0) {
            await this.urlCache.markVisited(crawlId, newUrls)
          }
          
          if (newUrls.length > 0 || newSkipped > 0) {
            // Update discovered and queued counts
            const updatedCrawl = await getCrawl(crawlId)
            if (updatedCrawl) {
              const newDiscovered = result.links.length
              const newQueued = newUrls.length
              
              await updateCrawlProgress(crawlId, {
                totalDiscovered: updatedCrawl.totalDiscovered + newDiscovered,
                totalQueued: updatedCrawl.totalQueued + newQueued,
                totalSkipped: updatedCrawl.totalSkipped + newSkipped,
                progress: {
                  ...updatedCrawl.progress,
                  total: updatedCrawl.totalQueued + newQueued, // Update total to reflect new queued URLs
                  discovered: (updatedCrawl.progress.discovered || 0) + newDiscovered,
                  queued: (updatedCrawl.progress.queued || 0) + newQueued,
                  skipped: (updatedCrawl.progress.skipped || 0) + newSkipped,
                },
              })
              
              // Publish URL discovery event for real-time updates
              await handleUrlDiscovery({
                crawlId,
                newUrls: newQueued,
                duplicateUrls: newSkipped,
                totalDiscovered: updatedCrawl.totalDiscovered + newDiscovered,
                source: 'links',
              })
              
              if (newUrls.length > 0) {
                // 🚀 FIXED: Use batch job processing for discovered URLs (20-50x performance improvement)
                const newJobIds = await addBatchCrawlJobs(crawlId, newUrls, {
                  batchSize: 10, // Process discovered URLs in batches for optimal performance
                  depth: depth + 1,
                  parentUrl: url,
                  options, // CRITICAL FIX: Pass through the crawl options for link discovery
                })
                // Track new batch jobs for completion detection
                await Promise.all(newJobIds.map(jobId => trackJob(crawlId, jobId)))
              }
              
              // Only log if we found substantial new URLs to avoid spam
              if (newQueued > 0 || newSkipped > 5) {
                console.log(`🔗 Found ${newDiscovered} URLs from: ${url} (${newQueued} batched, ${newSkipped} skipped)`)
              }
            }
          }
        }
      }
      
      // Update progress with streaming events
      await this.incrementProcessedCount(crawlId)
      
      // Publish real-time progress event
      const updatedCrawl = await getCrawl(crawlId)
      if (updatedCrawl) {
        await publishProgressEvent({
          crawlId,
          phase: 'crawling',
          processed: updatedCrawl.totalProcessed,
          total: updatedCrawl.totalQueued,
          percentage: Math.round((updatedCrawl.totalProcessed / Math.max(updatedCrawl.totalQueued, 1)) * 100),
          discoveredUrls: updatedCrawl.totalDiscovered,
          failedUrls: updatedCrawl.totalFailed,
          currentUrl: url,
          currentActivity: `Processing: ${result.success ? 'completed' : 'failed'}`,
        })
      }
      
      // Mark job as done and check for completion
      const trackingId = jobId || job.id?.toString() || 'unknown'
      const isFinished = await markJobDone(crawlId, trackingId)
      if (isFinished) {
        await this.finishCrawl(crawlId) // Success - no error message
      }
      
      return { success: true, document: result.content }
    } catch (error) {
      console.error(`❌ Crawl job failed for ${url}:`, error)
      
      // Store failed result
      const crawlResult: CrawlResult = {
        url,
        title: 'Error',
        content: '',
        contentType: 'error',
        timestamp: Date.now(),
        statusCode: 0,
        parentUrl,
        depth,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
      
      await addCrawlResult(crawlId, crawlResult)
      await incrementCrawlCounter(crawlId, 'totalFailed')
      await this.incrementProcessedCount(crawlId)
      
      // Publish real-time progress event for failed job
      const failedCrawl = await getCrawl(crawlId)
      if (failedCrawl) {
        await publishProgressEvent({
          crawlId,
          phase: 'crawling',
          processed: failedCrawl.totalProcessed,
          total: failedCrawl.totalQueued,
          percentage: Math.round((failedCrawl.totalProcessed / Math.max(failedCrawl.totalQueued, 1)) * 100),
          discoveredUrls: failedCrawl.totalDiscovered,
          failedUrls: failedCrawl.totalFailed,
          currentUrl: url,
          currentActivity: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
      
      // Mark failed job as done and check for completion
      const trackingId = jobId || job.id?.toString() || 'unknown'
      const isFinished = await markJobDone(crawlId, trackingId)
      if (isFinished) {
        await this.finishCrawl(crawlId) // Completion - not an error
      }
      
      return { success: false }
    }
  }

  private async processBatchCrawlJob(job: Job<BatchCrawlJobData>): Promise<{ success: boolean; results: unknown[] }> {
    const { crawlId, urls, batchNumber, totalBatches } = job.data
    
    console.log(`🚀 Processing batch ${batchNumber}/${totalBatches} with ${urls.length} URLs for crawl: ${crawlId}`)
    
    try {
      // Check if crawl was cancelled
      const crawl = await getCrawl(crawlId)
      if (!crawl || crawl.status === 'cancelled') {
        console.log(`⏭️  Crawl cancelled, skipping batch: ${batchNumber}`)
        return { success: false, results: [] }
      }

      // Create crawler instance
      const crawler = new WebCrawler()
      const results: unknown[] = []
      let processed = 0
      let failed = 0
      
      // Process URLs in parallel with controlled concurrency
      const { publishBatchProgressEvent } = await import('./streaming-progress')
      
      for (const url of urls) {
        try {
          // Crawl the individual page
          const result = await crawler.crawlPage(url, job.data.options || {})
          
          // Reduced logging for cleaner output
          if (result.links && result.links.length > 10) {
            console.log(`🔗 Found ${result.links.length} links on ${url}`)
          }
          
          if (result.success && result.content) {
            // Store the result
            const crawlResult: CrawlResult = {
              url,
              title: result.title || 'Unknown',
              content: result.content,
              contentType: 'markdown',
              timestamp: Date.now(),
              statusCode: 200,
              parentUrl: job.data.parentUrl,
              depth: job.data.depth || 0,
            }
            
            await addCrawlResult(crawlId, crawlResult)
            results.push(crawlResult)
            processed++
          } else {
            failed++
          }
          
          // Update progress
          await this.incrementProcessedCount(crawlId)
          
          // 🚀 CRITICAL FIX: FORCE link discovery for ALL successful crawls
          // This MUST happen for sites like Tailwind that rely on link discovery
          const depth = job.data.depth || 0
          const options = job.data.options || {}
          
          // FORCE link discovery regardless of depth - this is critical!
          if (result.links && result.links.length > 0) {
            let newSkipped = 0
            
            // Fast batch deduplication check using high-performance cache
            const newUrls = await this.urlCache.filterNewUrls(crawlId, result.links)
            newSkipped = result.links.length - newUrls.length
            
            // Mark all new URLs as visited immediately to prevent race conditions
            if (newUrls.length > 0) {
              await this.urlCache.markVisited(crawlId, newUrls)
            }
            
            if (newUrls.length > 0 || newSkipped > 0) {
              // Update discovered and queued counts
              const updatedCrawl = await getCrawl(crawlId)
              if (updatedCrawl) {
                const newDiscovered = result.links.length
                const newQueued = newUrls.length
                
                await updateCrawlProgress(crawlId, {
                  totalDiscovered: updatedCrawl.totalDiscovered + newDiscovered,
                  totalQueued: updatedCrawl.totalQueued + newQueued,
                  totalSkipped: updatedCrawl.totalSkipped + newSkipped,
                  progress: {
                    ...updatedCrawl.progress,
                    total: updatedCrawl.totalQueued + newQueued, // Update total to reflect new queued URLs
                    discovered: (updatedCrawl.progress.discovered || 0) + newDiscovered,
                    queued: (updatedCrawl.progress.queued || 0) + newQueued,
                    skipped: (updatedCrawl.progress.skipped || 0) + newSkipped,
                  },
                })
                
                // Publish URL discovery event for real-time updates
                await handleUrlDiscovery({
                  crawlId,
                  newUrls: newQueued,
                  duplicateUrls: newSkipped,
                  totalDiscovered: updatedCrawl.totalDiscovered + newDiscovered,
                  source: 'links',
                })
                
                if (newUrls.length > 0) {
                  // 🚀 Queue new batch jobs for discovered URLs
                  const newJobIds = await addBatchCrawlJobs(crawlId, newUrls, {
                    batchSize: 10, // Process discovered URLs in batches for optimal performance
                    depth: depth + 1,
                    parentUrl: url,
                    options, // CRITICAL FIX: Pass through the crawl options for link discovery
                  })
                  // Track new batch jobs for completion detection
                  await Promise.all(newJobIds.map(jobId => trackJob(crawlId, jobId)))
                  
                  console.log(`🔗 Batch found ${newDiscovered} URLs from: ${url} (${newQueued} batched, ${newSkipped} skipped)`)
                }
              }
            }
          }
          
        } catch (error) {
          console.error(`❌ Failed to crawl URL in batch: ${url}`, error)
          failed++
          
          // Store failed result
          const crawlResult: CrawlResult = {
            url,
            title: 'Error',
            content: '',
            contentType: 'error',
            timestamp: Date.now(),
            statusCode: 0,
            parentUrl: job.data.parentUrl,
            depth: job.data.depth || 0,
            error: error instanceof Error ? error.message : 'Unknown error',
          }
          
          await addCrawlResult(crawlId, crawlResult)
          await incrementCrawlCounter(crawlId, 'totalFailed')
          await this.incrementProcessedCount(crawlId)
        }
      }
      
      // Publish batch completion event
      await publishBatchProgressEvent({
        crawlId,
        batchNumber,
        totalBatches,
        batchProcessed: processed,
        batchFailed: failed,
        overallProgress: {
          processed: crawl.totalProcessed + processed,
          total: crawl.totalQueued,
          percentage: Math.round(((crawl.totalProcessed + processed) / Math.max(crawl.totalQueued, 1)) * 100),
        }
      })
      
      // Mark job as done and check for completion
      const trackingId = job.data.jobId || job.id?.toString() || 'unknown'
      const isFinished = await markJobDone(crawlId, trackingId)
      if (isFinished) {
        await this.finishCrawl(crawlId) // Success - no error message
      }
      
      console.log(`✅ Completed batch ${batchNumber}/${totalBatches}: ${processed} processed, ${failed} failed`)
      return { success: true, results }
      
    } catch (error) {
      console.error(`❌ Batch job failed for crawl ${crawlId}:`, error)
      
      // Mark failed job as done and check for completion
      const trackingId = job.data.jobId || job.id?.toString() || 'unknown'
      const isFinished = await markJobDone(crawlId, trackingId)
      if (isFinished) {
        await this.finishCrawl(crawlId) // Completion - not an error
      }
      
      return { success: false, results: [] }
    }
  }

  private async updateProgress(crawlId: string, progress: Partial<CrawlProgress>) {
    const currentCrawl = await getCrawl(crawlId)
    if (currentCrawl) {
      const updatedProgress = { ...currentCrawl.progress, ...progress }
      await updateCrawlProgress(crawlId, { progress: updatedProgress })
    }
  }

  private async incrementProcessedCount(crawlId: string) {
    // Use atomic increment to prevent race conditions
    const totalProcessed = await incrementProgress(crawlId, 'processed', 1)
    
    const progressCrawl = await getCrawl(crawlId)
    if (progressCrawl) {
      const percentComplete = progressCrawl.totalQueued > 0 
        ? Math.round((totalProcessed / progressCrawl.totalQueued) * 100)
        : 0
        
      await updateCrawlProgress(crawlId, {
        totalProcessed,
        progress: {
          ...progressCrawl.progress,
          current: totalProcessed,
          processed: totalProcessed,
          message: `Processed ${totalProcessed} of ${progressCrawl.totalQueued} pages (${percentComplete}%)`,
        },
      })
    }
  }

  private async checkCrawlCompletion(crawlId: string) {
    const queue = getCrawlQueue()
    const completionCrawl = await getCrawl(crawlId)
    
    if (!completionCrawl || completionCrawl.status !== 'active') {
      console.log(`⏭️  Skipping completion check for ${crawlId} (status: ${completionCrawl?.status})`)
      return
    }
    
    // Use a Redis lock to prevent multiple workers from finishing the same crawl
    const redis = getRedisConnection()
    const lockKey = `crawl:${crawlId}:finishing`
    const lockAcquired = await redis.setnx(lockKey, '1') // Set if not exists
    if (lockAcquired) {
      await redis.expire(lockKey, 5) // 5 second TTL
    }
    
    if (!lockAcquired) {
      console.log(`🔒 Another worker is already finishing crawl ${crawlId}`)
      return
    }
    
    try {
      // Get job counts for this crawl
      const [active, waiting, delayed] = await Promise.all([
        queue.getActive(),
        queue.getWaiting(),
        queue.getDelayed(),
      ])
      
      const activeCrawlJobs = active.filter(job => 
        job.data?.crawlId === crawlId && job.name === 'crawl'
      ).length
      
      const waitingCrawlJobs = waiting.filter(job => 
        job.data?.crawlId === crawlId && job.name === 'crawl'
      ).length
      
      const delayedCrawlJobs = delayed.filter(job => 
        job.data?.crawlId === crawlId && job.name === 'crawl'
      ).length
      
      const remainingJobs = activeCrawlJobs + waitingCrawlJobs + delayedCrawlJobs
      
      console.log(`📊 Crawl ${crawlId}: ${remainingJobs} jobs remaining (${activeCrawlJobs} active, ${waitingCrawlJobs} waiting, ${delayedCrawlJobs} delayed)`)
      
      if (remainingJobs === 0) {
        // Double-check the crawl is still active (another worker might have finished it)
        const currentCrawl = await getCrawl(crawlId)
        if (currentCrawl?.status !== 'active') {
          console.log(`⏭️  Crawl ${crawlId} already finished by another worker`)
          return
        }
        
        // Add a small delay to ensure all updates are flushed
        await new Promise(resolve => setTimeout(resolve, 200))
        console.log(`🏁 All jobs completed for crawl ${crawlId}, marking as complete`)
        await this.finishCrawl(crawlId)
      }
    } finally {
      // Always release the lock
      await redis.del(lockKey)
    }
  }

  private async finishCrawl(crawlId: string, errorMessage?: string) {
    // Use the fixed atomic completion logic
    const { completeWithSingleWriter } = await import('./crawl-redis-fixed')
    const completed = await completeWithSingleWriter(crawlId, errorMessage)
    
    if (!completed) {
      // Another worker handled it or it was already complete
      return
    }
    
    // Get final crawl data for completion event
    const finalCrawl = await getCrawl(crawlId)
    if (finalCrawl) {
      // Publish crawl completion event for real-time updates
      const { publishCrawlCompletionEvent } = await import('./streaming-progress')
      await publishCrawlCompletionEvent({
        crawlId,
        status: errorMessage ? 'failed' : 'completed',
        totalProcessed: finalCrawl.totalProcessed,
        totalFailed: finalCrawl.totalFailed,
        duration: Date.now() - finalCrawl.createdAt,
        errorMessage,
        finalResults: {
          urls: finalCrawl.results.map(r => r.url),
          content: finalCrawl.results.map(r => r.content).join('\n\n---\n\n'),
        }
      })
    }
    
    // Clean up progress tracking to prevent memory leaks
    await cleanupProgressTracking(crawlId)
    
    console.log(`🏁 Successfully finished crawl: ${crawlId} (error: ${errorMessage || 'none'})`)
  }
}

// Singleton worker instance
let workerInstance: CrawlWorker | null = null

export async function startWorker(concurrency = 5) {
  if (workerInstance) {
    console.log('⚠️  Worker already running')
    return workerInstance
  }
  
  workerInstance = new CrawlWorker()
  await workerInstance.start(concurrency)
  return workerInstance
}

export async function stopWorker() {
  if (workerInstance) {
    await workerInstance.stop()
    workerInstance = null
  }
}

export function getWorker() {
  return workerInstance
}