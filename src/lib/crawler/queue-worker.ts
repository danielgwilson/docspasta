import { Worker, Job } from 'bullmq'
import { getCrawlQueue, getRedisConnection, crawlQueueName } from './queue-service'
import { 
  lockURL, 
  saveCrawl, 
  getCrawl, 
  updateCrawlProgress, 
  addCrawlResult,
  type StoredCrawl 
} from './crawl-redis'
import { addCrawlJobs } from './queue-jobs'
import type { 
  CrawlJobData, 
  KickoffJobData, 
  CrawlProgress, 
  CrawlResult,
  CrawlOptions 
} from './types'
import { WebCrawler } from './web-crawler'

/**
 * Queue worker implementation following Firecrawl patterns
 * Handles kickoff jobs (sitemap discovery) and crawl jobs (individual pages)
 */

class CrawlWorker {
  private worker: Worker | null = null
  private isShuttingDown = false
  private runningJobs = new Set<string>()

  async start(concurrency = 5) {
    console.log(`🏗️  Starting crawl worker with concurrency: ${concurrency}`)
    
    this.worker = new Worker(crawlQueueName, this.processJob.bind(this), {
      connection: getRedisConnection(),
      concurrency,
      lockDuration: 60 * 1000, // 1 minute job lock
      stalledInterval: 30 * 1000, // Check for stalled jobs every 30s
      maxStalledCount: 3, // Max 3 stalled attempts
    })

    this.worker.on('completed', (job, result) => {
      console.log(`✅ Job completed: ${job.id}`)
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

  private async processJob(job: Job): Promise<any> {
    if (this.isShuttingDown) {
      throw new Error('Worker is shutting down')
    }

    this.runningJobs.add(job.id!)
    
    try {
      if (job.name === 'kickoff') {
        return await this.processKickoffJob(job)
      } else if (job.name === 'crawl') {
        return await this.processCrawlJob(job)
      } else {
        throw new Error(`Unknown job type: ${job.name}`)
      }
    } finally {
      this.runningJobs.delete(job.id!)
    }
  }

  private async processKickoffJob(job: Job<KickoffJobData>): Promise<{ success: boolean }> {
    const { crawlId, url, options } = job.data
    
    console.log(`🚀 Processing kickoff job for: ${url}`)
    
    try {
      // Initialize crawl in Redis
      const crawl: StoredCrawl = {
        id: crawlId,
        url,
        status: 'active',
        createdAt: Date.now(),
        totalDiscovered: 0,
        totalProcessed: 0,
        progress: {
          current: 0,
          total: 0,
          phase: 'discovery',
          message: 'Starting crawl...',
        },
        results: [],
      }
      
      await saveCrawl(crawl)

      // Create crawler instance
      const crawler = new WebCrawler()
      
      // Phase 1: Sitemap discovery
      await this.updateProgress(crawlId, {
        phase: 'discovery',
        message: 'Discovering URLs via sitemap...',
      })
      
      const discoveredUrls = await crawler.discoverURLs(url, options)
      
      console.log(`🗺️  Discovered ${discoveredUrls.length} URLs from sitemap`)
      
      // Update discovered count
      await updateCrawlProgress(crawlId, {
        totalDiscovered: discoveredUrls.length,
        progress: {
          current: 0,
          total: discoveredUrls.length,
          phase: 'crawling',
          message: `Found ${discoveredUrls.length} URLs to crawl`,
        },
      })

      // Phase 2: Queue individual crawl jobs
      const crawlJobs: CrawlJobData[] = []
      
      for (const discoveredUrl of discoveredUrls) {
        // Atomic URL locking to prevent duplicates
        if (await lockURL(crawlId, discoveredUrl)) {
          crawlJobs.push({
            crawlId,
            url: discoveredUrl,
            options,
            depth: 0,
            parentUrl: url,
          })
        }
      }
      
      if (crawlJobs.length > 0) {
        await addCrawlJobs(crawlJobs)
        console.log(`📦 Queued ${crawlJobs.length} crawl jobs`)
      }
      
      // Check if we need to finish immediately (no valid URLs found)
      if (crawlJobs.length === 0) {
        await this.finishCrawl(crawlId, 'No valid URLs found to crawl')
      }
      
      return { success: true }
    } catch (error) {
      console.error(`❌ Kickoff job failed:`, error)
      await this.finishCrawl(crawlId, error instanceof Error ? error.message : 'Unknown error')
      return { success: false }
    }
  }

  private async processCrawlJob(job: Job<CrawlJobData>): Promise<{ success: boolean; document?: any }> {
    const { crawlId, url, options, depth, parentUrl } = job.data
    
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
        if (depth < (options.maxDepth || 3) && result.links) {
          const newJobs: CrawlJobData[] = []
          
          for (const link of result.links) {
            if (await lockURL(crawlId, link)) {
              newJobs.push({
                crawlId,
                url: link,
                options,
                depth: depth + 1,
                parentUrl: url,
              })
            }
          }
          
          if (newJobs.length > 0) {
            await addCrawlJobs(newJobs)
            
            // Update discovered count
            const updatedCrawl = await getCrawl(crawlId)
            if (updatedCrawl) {
              await updateCrawlProgress(crawlId, {
                totalDiscovered: updatedCrawl.totalDiscovered + newJobs.length,
              })
            }
            
            console.log(`🔗 Found ${newJobs.length} new URLs from: ${url}`)
          }
        }
      }
      
      // Update progress
      await this.incrementProcessedCount(crawlId)
      
      // Check if crawl is complete
      await this.checkCrawlCompletion(crawlId)
      
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
      await this.incrementProcessedCount(crawlId)
      await this.checkCrawlCompletion(crawlId)
      
      return { success: false }
    }
  }

  private async updateProgress(crawlId: string, progress: Partial<CrawlProgress>) {
    const crawl = await getCrawl(crawlId)
    if (crawl) {
      const updatedProgress = { ...crawl.progress, ...progress }
      await updateCrawlProgress(crawlId, { progress: updatedProgress })
    }
  }

  private async incrementProcessedCount(crawlId: string) {
    const crawl = await getCrawl(crawlId)
    if (crawl) {
      const totalProcessed = crawl.totalProcessed + 1
      await updateCrawlProgress(crawlId, {
        totalProcessed,
        progress: {
          ...crawl.progress,
          current: totalProcessed,
          message: `Processed ${totalProcessed} of ${crawl.totalDiscovered} pages`,
        },
      })
    }
  }

  private async checkCrawlCompletion(crawlId: string) {
    const queue = getCrawlQueue()
    const crawl = await getCrawl(crawlId)
    
    if (!crawl || crawl.status !== 'active') return
    
    // Get job counts for this crawl
    const [active, waiting] = await Promise.all([
      queue.getActive(),
      queue.getWaiting(),
    ])
    
    const activeCrawlJobs = active.filter(job => 
      job.data?.crawlId === crawlId && job.name === 'crawl'
    ).length
    
    const waitingCrawlJobs = waiting.filter(job => 
      job.data?.crawlId === crawlId && job.name === 'crawl'
    ).length
    
    const remainingJobs = activeCrawlJobs + waitingCrawlJobs
    
    console.log(`📊 Crawl ${crawlId}: ${remainingJobs} jobs remaining`)
    
    if (remainingJobs === 0) {
      await this.finishCrawl(crawlId)
    }
  }

  private async finishCrawl(crawlId: string, errorMessage?: string) {
    console.log(`🏁 Finishing crawl: ${crawlId}`)
    
    const crawl = await getCrawl(crawlId)
    if (!crawl) return
    
    await updateCrawlProgress(crawlId, {
      status: errorMessage ? 'failed' : 'completed',
      completedAt: Date.now(),
      errorMessage,
      progress: {
        ...crawl.progress,
        phase: 'completed',
        message: errorMessage || `Crawl completed! Processed ${crawl.totalProcessed} pages.`,
      },
    })
    
    console.log(`✨ Crawl ${errorMessage ? 'failed' : 'completed'}: ${crawlId}`)
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