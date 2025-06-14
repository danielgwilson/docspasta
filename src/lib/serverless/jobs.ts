import { kv } from '@vercel/kv'
import { neon } from '@neondatabase/serverless'
import { z } from 'zod'
import type { CreateJobRequest, JobState } from './types'

// Validation schemas
export const CreateJobSchema = z.object({
  url: z.string().url(),
  maxPages: z.number().min(1).max(200).default(50),
  maxDepth: z.number().min(1).max(5).default(2),
  qualityThreshold: z.number().min(0).max(100).default(20),
})

export type ValidatedCreateJobRequest = z.infer<typeof CreateJobSchema>

export class JobManager {
  private sql = neon(process.env.DATABASE_URL_UNPOOLED!)
  
  async createJob(request: CreateJobRequest): Promise<string> {
    const validated = CreateJobSchema.parse(request)
    
    const result = await this.sql`
      INSERT INTO jobs (url, status)
      VALUES (${validated.url}, 'running')
      RETURNING id
    `
    
    const jobId = result[0].id
    
    // Store job config in KV for the worker
    await kv.hset(`job:${jobId}:config`, {
      maxPages: validated.maxPages,
      maxDepth: validated.maxDepth,
      qualityThreshold: validated.qualityThreshold
    })
    
    // Add to pending jobs queue (Vercel KV)
    await kv.sadd('pending_jobs', jobId)
    
    console.log(`✨ Created job ${jobId} for ${validated.url}`)
    return jobId
  }
  
  async getJobState(jobId: string): Promise<JobState | null> {
    const result = await this.sql`
      SELECT id, status, url, 
             EXTRACT(EPOCH FROM created_at) as created_at,
             EXTRACT(EPOCH FROM completed_at) as completed_at,
             error_message, final_markdown,
             pages_found, pages_processed, total_words
      FROM jobs 
      WHERE id = ${jobId}
    `
    
    if (result.length === 0) return null
    
    const row = result[0]
    
    // Get current step from KV
    const kvData = await kv.hgetall(`job:${jobId}:state`) || {}
    
    return {
      id: row.id,
      status: row.status,
      currentStep: kvData.currentStep || 'init',
      totalUrls: kvData.totalUrls || 0,
      processedUrls: row.pages_processed || 0,
      failedUrls: kvData.failedUrls || 0,
      discoveredUrls: row.pages_found || 0,
      createdAt: row.created_at * 1000, // Convert to milliseconds
      updatedAt: Date.now(), // V4 doesn't track updated_at
      startedAt: row.created_at * 1000, // Use created_at as started_at
      completedAt: row.completed_at ? row.completed_at * 1000 : undefined,
      errorDetails: row.error_message ? { message: row.error_message } : undefined,
      results: kvData.results || [],
      finalMarkdown: row.final_markdown,
    }
  }
  
  async updateJobState(jobId: string, updates: Partial<JobState>): Promise<void> {
    if (Object.keys(updates).length === 0) return
    
    // Update database fields that exist in V4
    if (updates.status) {
      if (updates.status === 'completed' || updates.status === 'failed') {
        await this.sql`
          UPDATE jobs 
          SET status = ${updates.status},
              completed_at = NOW(),
              error_message = ${updates.errorDetails?.message || null}
          WHERE id = ${jobId}
        `
      } else {
        await this.sql`
          UPDATE jobs 
          SET status = ${updates.status},
              error_message = ${updates.errorDetails?.message || null}
          WHERE id = ${jobId}
        `
      }
    }
    
    if (updates.processedUrls !== undefined) {
      await this.sql`
        UPDATE jobs 
        SET pages_processed = ${updates.processedUrls}
        WHERE id = ${jobId}
      `
    }
    
    if (updates.discoveredUrls !== undefined) {
      await this.sql`
        UPDATE jobs 
        SET pages_found = ${updates.discoveredUrls}
        WHERE id = ${jobId}
      `
    }
    
    if (updates.finalMarkdown) {
      await this.sql`
        UPDATE jobs 
        SET final_markdown = ${updates.finalMarkdown},
            total_words = ${updates.finalMarkdown.split(/\s+/).length}
        WHERE id = ${jobId}
      `
    }
    
    // Store state that doesn't exist in V4 schema in KV
    const kvUpdates: Record<string, any> = {}
    if (updates.currentStep) kvUpdates.currentStep = updates.currentStep
    if (updates.totalUrls !== undefined) kvUpdates.totalUrls = updates.totalUrls
    if (updates.failedUrls !== undefined) kvUpdates.failedUrls = updates.failedUrls
    if (updates.results) kvUpdates.results = updates.results
    
    if (Object.keys(kvUpdates).length > 0) {
      await kv.hset(`job:${jobId}:state`, kvUpdates)
    }
    
    console.log(`📊 Updated job ${jobId} state:`, Object.keys(updates).join(', '))
  }
  
  async getJobConfiguration(jobId: string) {
    const result = await this.sql`
      SELECT url
      FROM jobs 
      WHERE id = ${jobId}
    `
    
    if (result.length === 0) return null
    
    // Get config from KV
    const config = await kv.hgetall(`job:${jobId}:config`) || {}
    
    return {
      url: result[0].url,
      maxPages: config.maxPages || 50,
      maxDepth: config.maxDepth || 2,
      qualityThreshold: config.qualityThreshold || 20,
    }
  }
}