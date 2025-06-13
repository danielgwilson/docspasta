import { WebCrawler } from './web-crawler'
import { QueueManager } from './queue'
import { JobManager } from './jobs'
import { publishProgress } from './streaming'
import { extractValidLinks } from './url-utils'
import type { ProcessingResult } from './types'

export class URLProcessor {
  private crawler = new WebCrawler()
  private queueManager = new QueueManager()
  private jobManager = new JobManager()
  
  async processBatch(batchSize: number = 10): Promise<void> {
    const batch = await this.queueManager.getNextBatch(batchSize)
    
    if (batch.length === 0) {
      console.log('📝 No URLs to process')
      return
    }
    
    console.log(`🚀 Processing batch of ${batch.length} URLs`)
    
    // Process URLs in parallel
    await Promise.allSettled(
      batch.map(item => this.processUrl(item.jobId, item.urlId, item.url))
    )
  }
  
  private async processUrl(jobId: string, urlId: string, url: string): Promise<void> {
    try {
      // Mark as processing
      await this.queueManager.markUrlProcessing(urlId)
      
      // Get job configuration
      const jobConfig = await this.jobManager.getJobConfiguration(jobId)
      if (!jobConfig) {
        throw new Error(`Job ${jobId} not found`)
      }
      
      // Crawl the URL
      console.log(`📄 Processing: ${url}`)
      const result = await this.crawler.crawlPage(url, {
        timeout: 8000,
        qualityThreshold: jobConfig.qualityThreshold,
      })
      
      if (result.success && result.content) {
        // Store successful result WITHOUT content to save database space
        const processingResult: ProcessingResult = {
          url,
          title: result.title,
          // Don't store content in database - too large
          // content: result.content,
          links: result.links || [],
          success: true,
        }
        
        await this.queueManager.markUrlCompleted(urlId, processingResult)
        
        // Discover new URLs if within depth limit and we have links
        let validLinksCount = 0
        if (result.links && result.links.length > 0) {
          // Filter links to only include those within the original path prefix
          const validLinks = extractValidLinks(result.links, url, jobConfig.url)
          validLinksCount = validLinks.length
          
          if (validLinks.length > 0) {
            await this.queueManager.addUrlsToQueue(jobId, validLinks, url)
            
            console.log(`🔗 Discovered ${validLinks.length} valid URLs (filtered from ${result.links.length}) from ${url}`)
            
            // Publish urls_discovered event
            await publishProgress(jobId, {
              type: 'urls_discovered',
              jobId,
              discoveredUrls: validLinks.length,
            })
          } else {
            console.log(`⚠️ Discovered ${result.links.length} URLs but none within path prefix from ${url}`)
          }
        }
        
        // Publish progress
        await publishProgress(jobId, {
          type: 'url_completed',
          url,
          status: 'success',
          title: result.title,
          discoveredUrls: validLinksCount,
        })
        
      } else {
        const processingResult: ProcessingResult = {
          url,
          success: false,
          error: result.error || 'Unknown error',
        }
        
        await this.queueManager.markUrlFailed(urlId, result.error || 'Unknown error')
        
        await publishProgress(jobId, {
          type: 'url_completed',
          url,
          status: 'failed',
        })
      }
      
      // Check if job is complete
      const isComplete = await this.queueManager.checkJobCompletion(jobId)
      if (isComplete) {
        await publishProgress(jobId, {
          type: 'job_completed',
          jobId,
        })
      }
      
    } catch (error) {
      console.error(`❌ Failed to process ${url}:`, error)
      
      const processingResult: ProcessingResult = {
        url,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
      
      await this.queueManager.markUrlFailed(urlId, error instanceof Error ? error.message : 'Unknown error')
      
      await publishProgress(jobId, {
        type: 'url_completed',
        url,
        status: 'failed',
      })
    }
  }
}