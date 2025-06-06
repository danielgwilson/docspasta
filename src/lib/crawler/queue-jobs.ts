import { getCrawlQueue } from './queue-service'
import type { CrawlJobData, KickoffJobData } from './types'

/**
 * Queue job management following Firecrawl patterns
 */

export async function addKickoffJob(data: KickoffJobData): Promise<string> {
  const queue = getCrawlQueue()
  
  try {
    const job = await queue.add('kickoff', data, {
      priority: 10, // High priority for kickoff jobs
      delay: 0,
    })
    
    console.log(`🚀 Added kickoff job: ${job.id}`)
    return job.id!.toString()
  } catch (error) {
    console.error('❌ Failed to add kickoff job:', error)
    throw error
  }
}

export async function addCrawlJob(data: CrawlJobData): Promise<string> {
  const queue = getCrawlQueue()
  
  try {
    const job = await queue.add('crawl', data, {
      priority: 5, // Normal priority for crawl jobs
      delay: data.delay || 0,
    })
    
    console.log(`📄 Added crawl job: ${data.url}`)
    return job.id!.toString()
  } catch (error) {
    console.error('❌ Failed to add crawl job:', error)
    throw error
  }
}

export async function addCrawlJobs(jobs: CrawlJobData[]): Promise<string[]> {
  const queue = getCrawlQueue()
  
  try {
    const queueJobs = jobs.map((data, index) => ({
      name: 'crawl',
      data,
      opts: {
        priority: 5,
        delay: data.delay || 0,
      }
    }))
    
    const addedJobs = await queue.addBulk(queueJobs)
    const jobIds = addedJobs.map(job => job.id!.toString())
    
    console.log(`📦 Added ${jobs.length} crawl jobs`)
    return jobIds
  } catch (error) {
    console.error('❌ Failed to add crawl jobs:', error)
    throw error
  }
}

export async function getCrawlJobCounts(crawlId: string) {
  const queue = getCrawlQueue()
  
  try {
    const [active, waiting, completed, failed] = await Promise.all([
      queue.getActive(),
      queue.getWaiting(),
      queue.getCompleted(),
      queue.getFailed(),
    ])
    
    // Filter by crawlId
    const filterByCrawlId = (jobs: any[]) => 
      jobs.filter(job => job.data?.crawlId === crawlId)
    
    return {
      active: filterByCrawlId(active).length,
      waiting: filterByCrawlId(waiting).length,
      completed: filterByCrawlId(completed).length,
      failed: filterByCrawlId(failed).length,
    }
  } catch (error) {
    console.error('❌ Failed to get job counts:', error)
    return { active: 0, waiting: 0, completed: 0, failed: 0 }
  }
}

export async function cancelCrawlJobs(crawlId: string): Promise<void> {
  const queue = getCrawlQueue()
  
  try {
    // Get all jobs for this crawl
    const [active, waiting] = await Promise.all([
      queue.getActive(),
      queue.getWaiting(),
    ])
    
    const allJobs = [...active, ...waiting]
    const crawlJobs = allJobs.filter(job => job.data?.crawlId === crawlId)
    
    // Remove all jobs for this crawl
    await Promise.all(crawlJobs.map(job => job.remove()))
    
    console.log(`❌ Cancelled ${crawlJobs.length} jobs for crawl: ${crawlId}`)
  } catch (error) {
    console.error('❌ Failed to cancel crawl jobs:', error)
    throw error
  }
}