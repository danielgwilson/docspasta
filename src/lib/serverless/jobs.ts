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
      INSERT INTO crawl_jobs_v3 (initial_url, max_pages, max_depth, quality_threshold)
      VALUES (${validated.url}, ${validated.maxPages}, ${validated.maxDepth}, ${validated.qualityThreshold})
      RETURNING id
    `
    
    const jobId = result[0].id
    
    // Add to pending jobs queue (Vercel KV)
    await kv.sadd('pending_jobs', jobId)
    
    console.log(`✨ Created job ${jobId} for ${validated.url}`)
    return jobId
  }
  
  async getJobState(jobId: string): Promise<JobState | null> {
    const result = await this.sql`
      SELECT id, status, current_step, total_urls, processed_urls, failed_urls, 
             discovered_urls, EXTRACT(EPOCH FROM created_at) as created_at,
             EXTRACT(EPOCH FROM updated_at) as updated_at,
             EXTRACT(EPOCH FROM started_at) as started_at,
             EXTRACT(EPOCH FROM completed_at) as completed_at,
             error_details, results, final_markdown
      FROM crawl_jobs_v3 
      WHERE id = ${jobId}
    `
    
    if (result.length === 0) return null
    
    const row = result[0]
    return {
      id: row.id,
      status: row.status,
      currentStep: row.current_step,
      totalUrls: row.total_urls || 0,
      processedUrls: row.processed_urls || 0,
      failedUrls: row.failed_urls || 0,
      discoveredUrls: row.discovered_urls || 0,
      createdAt: row.created_at * 1000, // Convert to milliseconds
      updatedAt: row.updated_at * 1000,
      startedAt: row.started_at ? row.started_at * 1000 : undefined,
      completedAt: row.completed_at ? row.completed_at * 1000 : undefined,
      errorDetails: row.error_details,
      results: row.results,
      finalMarkdown: row.final_markdown,
    }
  }
  
  async updateJobState(jobId: string, updates: Partial<JobState>): Promise<void> {
    if (Object.keys(updates).length === 0) return
    
    // Build query manually for now (simplified approach)
    let query = `UPDATE crawl_jobs_v3 SET updated_at = NOW()`
    const queryValues: any[] = []
    let paramIndex = 1
    
    if (updates.status) {
      query += `, status = $${paramIndex}`
      queryValues.push(updates.status)
      paramIndex++
    }
    
    if (updates.currentStep) {
      query += `, current_step = $${paramIndex}`
      queryValues.push(updates.currentStep)
      paramIndex++
    }
    
    if (updates.totalUrls !== undefined) {
      query += `, total_urls = $${paramIndex}`
      queryValues.push(updates.totalUrls)
      paramIndex++
    }
    
    if (updates.processedUrls !== undefined) {
      query += `, processed_urls = $${paramIndex}`
      queryValues.push(updates.processedUrls)
      paramIndex++
    }
    
    if (updates.failedUrls !== undefined) {
      query += `, failed_urls = $${paramIndex}`
      queryValues.push(updates.failedUrls)
      paramIndex++
    }
    
    if (updates.discoveredUrls !== undefined) {
      query += `, discovered_urls = $${paramIndex}`
      queryValues.push(updates.discoveredUrls)
      paramIndex++
    }
    
    query += ` WHERE id = $${paramIndex}`
    queryValues.push(jobId)
    
    // Execute with manual query
    const sql = this.sql
    await sql.unsafe(query)
    
    console.log(`📊 Updated job ${jobId} state:`, Object.keys(updates).join(', '))
  }
  
  async getJobConfiguration(jobId: string) {
    const result = await this.sql`
      SELECT initial_url, max_pages, max_depth, quality_threshold
      FROM crawl_jobs_v3 
      WHERE id = ${jobId}
    `
    
    if (result.length === 0) return null
    
    const row = result[0]
    return {
      url: row.initial_url,
      maxPages: row.max_pages,
      maxDepth: row.max_depth,
      qualityThreshold: row.quality_threshold,
    }
  }
}