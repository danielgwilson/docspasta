import { pgTable, text, timestamp, integer, jsonb, pgEnum, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql, eq } from 'drizzle-orm'
import { relations } from 'drizzle-orm'
import { z } from 'zod'

/**
 * DOCSPASTA V2 REBUILD - Clean 3-Table Architecture
 * Based on Gemini's analysis with production-ready patterns
 */

// Status enums for type safety
export const jobStatusEnum = pgEnum('job_status', [
  'pending',
  'running', 
  'completed',
  'failed',
  'partial_success'
])

export const pageStatusEnum = pgEnum('page_status', [
  'pending',
  'crawled', 
  'error',
  'skipped'
])

// Crawl configuration schema for validation
export const crawlConfigSchema = z.object({
  maxDepth: z.number().min(1).max(10).default(2),
  maxPages: z.number().min(1).max(1000).default(50),
  qualityThreshold: z.number().min(0).max(100).default(20),
  includeSelectors: z.array(z.string()).optional(),
  excludeSelectors: z.array(z.string()).optional(),
  respectRobots: z.boolean().default(true),
  followSitemaps: z.boolean().default(true),
})

export type CrawlConfig = z.infer<typeof crawlConfigSchema>

// 1. CRAWLING JOBS - Main job metadata and configuration
export const crawlingJobs = pgTable('crawling_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(), // User isolation
  url: text('url').notNull(),
  config: jsonb('config').$type<CrawlConfig>().notNull().default({}),
  status: jobStatusEnum('status').notNull().default('pending'),
  statusMessage: text('status_message'), // For error details

  finalMarkdown: text('final_markdown'),
  // V5 State versioning for efficient SSE streaming
  stateVersion: integer('state_version').notNull().default(1),
  progressSummary: jsonb('progress_summary').$type<{
    totalProcessed: number
    totalDiscovered: number
    totalWords: number
    discoveredUrls: number
    failedUrls: number
  }>().notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
}, (table) => ({
  // Critical indexes for performance
  userIdIdx: index('crawling_jobs_user_id_idx').on(table.userId),
  statusIdx: index('crawling_jobs_status_idx').on(table.status),
  createdAtIdx: index('crawling_jobs_created_at_idx').on(table.createdAt),
  // Partial index for worker queries (pending jobs only)
  pendingJobsIdx: index('crawling_jobs_pending_idx').on(table.id).where(sql`status = 'pending'`),
}))

// 2. CRAWLED PAGES - Individual page metadata and status
export const crawledPages = pgTable('crawled_pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').notNull().references(() => crawlingJobs.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  urlHash: text('url_hash').notNull(), // For deduplication
  title: text('title'),
  status: pageStatusEnum('status').notNull().default('pending'),
  httpStatus: integer('http_status'), // HTTP response code
  errorMessage: text('error_message'),
  depth: integer('depth').notNull().default(0),
  discoveredFrom: text('discovered_from'), // Source URL
  qualityScore: integer('quality_score').default(0),
  wordCount: integer('word_count').default(0),
  crawledAt: timestamp('crawled_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  // Foreign key index (Drizzle doesn't auto-create these!)
  jobIdIdx: index('crawled_pages_job_id_idx').on(table.jobId),
  // URL deduplication index
  urlHashIdx: index('crawled_pages_url_hash_idx').on(table.urlHash),
  // Status queries
  statusIdx: index('crawled_pages_status_idx').on(table.status),
  // Unique constraint per job (CRITICAL: prevents duplicate URLs per job)
  uniqueJobUrl: uniqueIndex('crawled_pages_job_url_unique').on(table.jobId, table.urlHash),
}))

// 3. PAGE CONTENT CHUNKS - Chunked content for efficient processing
export const pageContentChunks = pgTable('page_content_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  pageId: uuid('page_id').notNull().references(() => crawledPages.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  contentType: text('content_type').notNull().default('markdown'), // 'raw', 'markdown', 'processed'
  chunkIndex: integer('chunk_index').notNull().default(0),
  startPosition: integer('start_position'),
  endPosition: integer('end_position'),
  metadata: jsonb('metadata').$type<{
    chunkIndex: number
    startPosition: number
    endPosition: number
    extractionMethod?: string
    qualityScore?: number
  }>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  // Foreign key index
  pageIdIdx: index('page_content_chunks_page_id_idx').on(table.pageId),
  // Chunk ordering
  chunkOrderIdx: index('page_content_chunks_order_idx').on(table.pageId, table.chunkIndex),
}))

// TypeScript types
export type CrawlingJob = typeof crawlingJobs.$inferSelect
export type NewCrawlingJob = typeof crawlingJobs.$inferInsert
export type CrawledPage = typeof crawledPages.$inferSelect
export type NewCrawledPage = typeof crawledPages.$inferInsert
export type PageContentChunk = typeof pageContentChunks.$inferSelect
export type NewPageContentChunk = typeof pageContentChunks.$inferInsert

// Zod schemas for API validation
export const newCrawlingJobSchema = z.object({
  url: z.string().url(),
  config: crawlConfigSchema.optional(),
})

export const crawlingJobUpdateSchema = z.object({
  status: z.enum(['pending', 'running', 'completed', 'failed', 'partial_success']).optional(),
  statusMessage: z.string().optional(),
  pagesProcessed: z.number().optional(),
  pagesFound: z.number().optional(),
  totalWords: z.number().optional(),
  finalMarkdown: z.string().optional(),
  completedAt: z.date().optional(),
})

export const newCrawledPageSchema = z.object({
  jobId: z.string().uuid(),
  url: z.string().url(),
  urlHash: z.string(),
  title: z.string().optional(),
  status: z.enum(['pending', 'crawled', 'error', 'skipped']).optional(),
  httpStatus: z.number().optional(),
  errorMessage: z.string().optional(),
  depth: z.number().min(0).default(0),
  discoveredFrom: z.string().optional(),
  qualityScore: z.number().min(0).max(100).optional(),
  wordCount: z.number().min(0).optional(),
})

// User-scoped query helpers
export const createUserScopedQueries = (userId: string) => ({
  getUserJobs: () => sql`SELECT * FROM ${crawlingJobs} WHERE user_id = ${userId}`,
  getUserJobById: (jobId: string) => 
    sql`SELECT * FROM ${crawlingJobs} WHERE id = ${jobId} AND user_id = ${userId}`,
  getUserPages: (jobId: string) => 
    sql`SELECT p.* FROM ${crawledPages} p 
        JOIN ${crawlingJobs} j ON p.job_id = j.id 
        WHERE j.id = ${jobId} AND j.user_id = ${userId}`,
})

// Migration helpers for transitioning from old schema
export const migrationMapping = {
  // Old table -> New table
  jobs: crawlingJobs,
  urls: crawledPages,
  raw_content: pageContentChunks, // Raw content becomes first chunk
  processed_content: pageContentChunks, // Processed content becomes additional chunks
}

// Drizzle relations for improved query ergonomics
export const crawlingJobsRelations = relations(crawlingJobs, ({ many }) => ({
  crawledPages: many(crawledPages),
}))

export const crawledPagesRelations = relations(crawledPages, ({ one, many }) => ({
  job: one(crawlingJobs, {
    fields: [crawledPages.jobId],
    references: [crawlingJobs.id],
  }),
  contentChunks: many(pageContentChunks),
}))

export const pageContentChunksRelations = relations(pageContentChunks, ({ one }) => ({
  page: one(crawledPages, {
    fields: [pageContentChunks.pageId],
    references: [crawledPages.id],
  }),
}))