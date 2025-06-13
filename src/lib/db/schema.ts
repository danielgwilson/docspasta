import { pgTable, text, timestamp, integer, jsonb, boolean, serial } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * Database schema for persistent crawl job state and SSE events
 * Designed for resilient SSE connections that survive server restarts
 */

// Crawl jobs table - main persistent state
export const crawlJobs = pgTable('crawl_jobs', {
  // Primary identification
  id: text('id').primaryKey(), // UUID format crawl IDs - TEXT is optimal in modern PostgreSQL
  url: text('url').notNull(),
  
  // Status tracking
  status: text('status').notNull().default('active'), // 'active' | 'completed' | 'failed' | 'cancelled'
  
  // Timestamps
  createdAt: timestamp('created_at').notNull().default(sql`NOW()`),
  completedAt: timestamp('completed_at'),
  updatedAt: timestamp('updated_at').notNull().default(sql`NOW()`),
  
  // Progress counters
  totalDiscovered: integer('total_discovered').notNull().default(0), // URLs found via sitemap/robots
  totalQueued: integer('total_queued').notNull().default(0),         // URLs that passed filters
  totalProcessed: integer('total_processed').notNull().default(0),   // URLs actually crawled
  totalFiltered: integer('total_filtered').notNull().default(0),     // URLs filtered out
  totalSkipped: integer('total_skipped').notNull().default(0),       // Duplicate URLs skipped
  totalFailed: integer('total_failed').notNull().default(0),         // URLs that failed to crawl
  
  // Progress state (for UI display)
  progress: jsonb('progress').notNull().default('{}'), // CrawlProgress object
  
  // Results and content
  results: jsonb('results').notNull().default('[]'), // Array of CrawlResult objects
  markdown: text('markdown'), // Combined markdown content
  
  // Error handling
  errorMessage: text('error_message'),
  
  // Discovery phase tracking
  discoveryComplete: boolean('discovery_complete').notNull().default(false),
})

// SSE events table - for resumable streams
export const sseEvents = pgTable('sse_events', {
  id: serial('id').primaryKey(),
  
  // Foreign key to crawl job
  crawlId: text('crawl_id').notNull().references(() => crawlJobs.id, { onDelete: 'cascade' }),
  
  // Event identification for resumable streams
  eventId: text('event_id').notNull().unique(), // Format: crawlId-timestamp-counter
  
  // Event metadata  
  eventType: text('event_type').notNull(), // 'progress' | 'batch-progress' | 'completion' | 'error' | 'heartbeat'
  eventData: jsonb('event_data').notNull(), // Complete event payload
  
  // Timing
  createdAt: timestamp('created_at').notNull().default(sql`NOW()`),
})

// V3 Serverless Architecture Tables
// Job state machine table for serverless architecture
export const crawlJobsV3 = pgTable('crawl_jobs_v3', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  status: text('status').notNull().default('pending'), // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  
  // Job configuration
  initialUrl: text('initial_url').notNull(),
  maxPages: integer('max_pages').notNull().default(50),
  maxDepth: integer('max_depth').notNull().default(2),
  qualityThreshold: integer('quality_threshold').notNull().default(20),
  
  // Progress tracking
  totalUrls: integer('total_urls').notNull().default(0),
  processedUrls: integer('processed_urls').notNull().default(0),
  failedUrls: integer('failed_urls').notNull().default(0),
  discoveredUrls: integer('discovered_urls').notNull().default(0),
  
  // State management
  currentStep: text('current_step').notNull().default('init'), // 'init' | 'discovery' | 'processing' | 'finalizing' | 'done'
  errorDetails: jsonb('error_details'),
  
  // Results
  results: jsonb('results').default('[]'),
  finalMarkdown: text('final_markdown'),
  
  // Timestamps
  createdAt: timestamp('created_at').notNull().default(sql`NOW()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`NOW()`),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
})

// URL processing queue table for atomic operations
export const jobUrlsV3 = pgTable('job_urls_v3', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  jobId: text('job_id').notNull().references(() => crawlJobsV3.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'processing' | 'completed' | 'failed'
  
  // Processing details
  retryCount: integer('retry_count').default(0),
  lastAttemptAt: timestamp('last_attempt_at'),
  processingStartedAt: timestamp('processing_started_at'),
  
  // Results
  result: jsonb('result'),
  errorMessage: text('error_message'),
  
  // Metadata
  discoveredFrom: text('discovered_from'), // which URL discovered this one
  depth: integer('depth').notNull().default(0),
  
  createdAt: timestamp('created_at').notNull().default(sql`NOW()`),
})

// Types for TypeScript safety
export type CrawlJob = typeof crawlJobs.$inferSelect
export type NewCrawlJob = typeof crawlJobs.$inferInsert
export type SSEEvent = typeof sseEvents.$inferSelect
export type NewSSEEvent = typeof sseEvents.$inferInsert

// V3 Types
export type CrawlJobV3 = typeof crawlJobsV3.$inferSelect
export type NewCrawlJobV3 = typeof crawlJobsV3.$inferInsert
export type JobUrlV3 = typeof jobUrlsV3.$inferSelect
export type NewJobUrlV3 = typeof jobUrlsV3.$inferInsert

// Crawl job status enum for type safety
export type CrawlJobStatus = 'active' | 'completed' | 'failed' | 'cancelled'

// Progress structure (matches existing crawler types)
export interface CrawlProgress {
  phase: string
  processed: number
  total: number
  percentage: number
  discoveredUrls?: number
  failedUrls?: number
  currentActivity?: string
  currentUrl?: string
}

// Result structure (matches existing crawler types)
export interface CrawlResult {
  url: string
  title: string
  content: string
  success: boolean
  statusCode?: number
  error?: string
}

// SSE event data structure
export interface SSEEventData {
  type: string
  crawlId?: string
  status?: string
  phase?: string
  processed?: number
  total?: number
  percentage?: number
  discoveredUrls?: number
  failedUrls?: number
  currentUrl?: string
  currentActivity?: string
  results?: CrawlResult[]
  markdown?: string
  error?: string
  message?: string
  timestamp: number
  // For nested progress data
  progress?: CrawlProgress
  data?: {
    id?: string
    status?: string
    markdown?: string
    results?: CrawlResult[]
    progress?: CrawlProgress
  }
}