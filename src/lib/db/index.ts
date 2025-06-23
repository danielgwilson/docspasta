import { drizzle } from 'drizzle-orm/neon-serverless'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'
import { eq } from 'drizzle-orm'

/**
 * Neon Database Connection with Singleton Pattern
 * Optimized for Vercel Edge Runtime
 */

// Validate environment variables
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required')
}

// Create connection using Neon serverless driver
const sql = neon(process.env.DATABASE_URL!)

// Create Drizzle instance with schema
export const db = drizzle(sql, { schema })

// Type exports
export type Database = typeof db
export * from './schema-new'

/**
 * User-scoped database operations
 * Ensures all queries are properly scoped to the current user
 */
export class UserScopedDB {
  constructor(private userId: string) {
    if (!userId) {
      throw new Error('User ID is required for database operations')
    }
  }

  // Get all jobs for the current user
  async getUserJobs() {
    return db.query.crawlingJobs.findMany({
      where: (jobs, { eq }) => eq(jobs.userId, this.userId),
      orderBy: (jobs, { desc }) => desc(jobs.createdAt),
    })
  }

  // Get a specific job by ID (user-scoped)
  async getUserJob(jobId: string) {
    const job = await db.query.crawlingJobs.findFirst({
      where: (jobs, { and, eq }) => 
        and(eq(jobs.id, jobId), eq(jobs.userId, this.userId)),
      with: {
        pages: {
          orderBy: (pages, { asc }) => asc(pages.createdAt),
        },
      },
    })
    
    if (!job) {
      throw new Error('Job not found or access denied')
    }
    
    return job
  }

  // Get pages for a job (user-scoped)
  async getJobPages(jobId: string, limit?: number) {
    // First verify the job belongs to the user
    await this.getUserJob(jobId)
    
    return db.query.crawledPages.findMany({
      where: (pages, { eq }) => eq(pages.jobId, jobId),
      limit,
      orderBy: (pages, { asc }) => asc(pages.createdAt),
    })
  }

  // Get content chunks for a page (user-scoped via job ownership)
  async getPageContent(pageId: string) {
    const page = await db.query.crawledPages.findFirst({
      where: (pages, { eq }) => eq(pages.id, pageId),
      with: {
        job: true,
        chunks: {
          orderBy: (chunks, { asc }) => asc(chunks.chunkIndex),
        },
      },
    })

    if (!page || page.job.userId !== this.userId) {
      throw new Error('Page not found or access denied')
    }

    return page
  }

  // Create a new crawling job
  async createJob(data: schema.NewCrawlingJob) {
    const jobData = {
      ...data,
      userId: this.userId,
      config: data.config || schema.crawlConfigSchema.parse({}),
    }

    const [job] = await db.insert(schema.crawlingJobs)
      .values(jobData)
      .returning()

    return job
  }

  // Update job status
  async updateJob(jobId: string, updates: Partial<schema.CrawlingJob>) {
    // Verify ownership
    await this.getUserJob(jobId)

    const [updatedJob] = await db.update(schema.crawlingJobs)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(schema.eq(schema.crawlingJobs.id, jobId))
      .returning()

    return updatedJob
  }

  // Add a discovered page
  async addPage(data: schema.NewCrawledPage) {
    // Verify the job belongs to the user
    await this.getUserJob(data.jobId)

    const [page] = await db.insert(schema.crawledPages)
      .values(data)
      .returning()

    return page
  }

  // Add content chunk
  async addContentChunk(data: schema.NewPageContentChunk) {
    // Verify page ownership via job
    const page = await this.getPageContent(data.pageId)

    const [chunk] = await db.insert(schema.pageContentChunks)
      .values(data)
      .returning()

    return chunk
  }

  // Delete a job and all related data (cascade)
  async deleteJob(jobId: string) {
    // Verify ownership
    await this.getUserJob(jobId)

    await db.delete(schema.crawlingJobs)
      .where(eq(schema.crawlingJobs.id, jobId))

    return true
  }

  // Get job statistics
  async getJobStats(jobId: string) {
    await this.getUserJob(jobId) // Verify ownership

    const stats = await db.select({
      totalPages: schema.sql<number>`count(*)`,
      completedPages: schema.sql<number>`count(*) filter (where status = 'crawled')`,
      errorPages: schema.sql<number>`count(*) filter (where status = 'error')`,
      avgQuality: schema.sql<number>`avg(quality_score)`,
      totalWords: schema.sql<number>`sum(word_count)`,
    })
    .from(schema.crawledPages)
    .where(eq(schema.crawledPages.jobId, jobId))

    return stats[0]
  }
}

/**
 * Helper function to get user-scoped database instance
 */
export function getUserDB(userId: string) {
  return new UserScopedDB(userId)
}

/**
 * Helper function for migrations and admin operations
 * Uses unpooled connection for better reliability
 */
export function getAdminDB() {
  if (!process.env.DATABASE_URL_UNPOOLED) {
    console.warn('DATABASE_URL_UNPOOLED not found, using regular DATABASE_URL for admin operations')
    return db
  }

  const adminSql = neon(process.env.DATABASE_URL_UNPOOLED!)
  return drizzle(adminSql, { schema })
}

// Re-export schema for convenience
export { schema }