import { kv } from '@vercel/kv'
import { neon } from '@neondatabase/serverless'
import type { QueueItem } from './types'

export class QueueManager {
  private sql = neon(process.env.DATABASE_URL_UNPOOLED!)
  
  async addUrlsToQueue(jobId: string, urls: string[], discoveredFrom?: string): Promise<void> {
    if (urls.length === 0) return
    
    // Batch insert URLs to PostgreSQL using Neon's approach
    for (const url of urls) {
      await this.sql`
        INSERT INTO job_urls_v3 (job_id, url, discovered_from, depth)
        VALUES (${jobId}, ${url}, ${discoveredFrom || null}, 0)
      `
    }
    
    // Add jobId to active processing queue (Vercel KV)
    await kv.sadd('active_jobs', jobId)
    
    console.log(`📥 Queued ${urls.length} URLs for job ${jobId}`)
  }
  
  async getNextBatch(batchSize: number = 10): Promise<QueueItem[]> {
    // Get active jobs from Vercel KV
    const activeJobs = await kv.smembers('active_jobs')
    if (activeJobs.length === 0) return []
    
    const results: QueueItem[] = []
    
    // Round-robin through jobs to ensure fairness
    for (const jobId of activeJobs) {
      if (results.length >= batchSize) break
      
      // Get pending URLs for this job (limit to prevent one job dominating)
      const remainingBatchSize = Math.min(3, batchSize - results.length)
      
      const urls = await this.sql`
        SELECT id, url FROM job_urls_v3 
        WHERE job_id = ${jobId} AND status = 'pending'
        ORDER BY created_at
        LIMIT ${remainingBatchSize}
      `
      
      for (const urlRow of urls) {
        results.push({
          jobId,
          urlId: urlRow.id,
          url: urlRow.url
        })
      }
    }
    
    if (results.length > 0) {
      console.log(`🔍 Found ${results.length} URLs to process from ${activeJobs.length} active jobs`)
    }
    
    return results
  }
  
  async markUrlProcessing(urlId: string): Promise<void> {
    await this.sql`
      UPDATE job_urls_v3 
      SET status = 'processing', processing_started_at = NOW(), last_attempt_at = NOW()
      WHERE id = ${urlId}
    `
  }
  
  async markUrlCompleted(urlId: string, result: any): Promise<void> {
    await this.sql`
      UPDATE job_urls_v3 
      SET status = 'completed', result = ${JSON.stringify(result)}
      WHERE id = ${urlId}
    `
  }
  
  async markUrlFailed(urlId: string, error: string): Promise<void> {
    await this.sql`
      UPDATE job_urls_v3 
      SET status = 'failed', error_message = ${error}, retry_count = retry_count + 1
      WHERE id = ${urlId}
    `
  }
  
  async checkJobCompletion(jobId: string): Promise<boolean> {
    const result = await this.sql`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing
      FROM job_urls_v3 
      WHERE job_id = ${jobId}
    `
    
    const stats = result[0]
    const isComplete = parseInt(stats.pending) === 0 && parseInt(stats.processing) === 0
    
    if (isComplete) {
      // Remove from active jobs
      await kv.srem('active_jobs', jobId)
      
      // Update job status
      const { JobManager } = await import('./jobs')
      const jobManager = new JobManager()
      await jobManager.updateJobState(jobId, {
        status: 'completed', // Always mark as completed, check results for failures
        currentStep: 'done',
        processedUrls: parseInt(stats.completed),
        failedUrls: parseInt(stats.failed),
        completedAt: Date.now(),
      })
      
      console.log(`🏁 Job ${jobId} completed: ${stats.completed} processed, ${stats.failed} failed`)
    }
    
    return isComplete
  }
  
  async getJobProgress(jobId: string) {
    const result = await this.sql`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing
      FROM job_urls_v3 
      WHERE job_id = ${jobId}
    `
    
    return result[0]
  }
}