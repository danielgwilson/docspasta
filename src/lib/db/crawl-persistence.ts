import { db } from './connection'
import { crawlJobs, sseEvents, type CrawlJob, type NewCrawlJob, type NewSSEEvent, type SSEEventData } from './schema'
import { eq, desc, and, gte, or, inArray } from 'drizzle-orm'

// Define types locally since crawler module is removed
interface CrawlProgress {
  processed: number
  total: number
  status: 'active' | 'completed' | 'failed'
  phase?: 'crawling' | 'extracting' | 'completed'
  currentBatch?: number
  totalBatches?: number
  errors?: number
}

interface CrawlResult {
  id: string
  status: string
  progress: CrawlProgress
  markdown?: string
  completedAt?: Date
  errorMessage?: string
}

/**
 * Database persistence layer for crawl jobs and SSE events
 * Provides resumable SSE streams and server restart recovery
 */

// Event ID counter for unique SSE event identification
let eventCounter = 0

/**
 * Create a new crawl job in the database
 */
export async function createCrawlJob(crawlData: {
  id: string
  url: string
  status?: 'active' | 'completed' | 'failed' | 'cancelled'
}): Promise<CrawlJob> {
  const newCrawl: NewCrawlJob = {
    id: crawlData.id,
    url: crawlData.url,
    status: crawlData.status || 'active',
    totalDiscovered: 0,
    totalQueued: 0,
    totalProcessed: 0,
    totalFiltered: 0,
    totalSkipped: 0,
    totalFailed: 0,
    progress: { phase: 'initializing', processed: 0, total: 0, percentage: 0 },
    results: [],
    discoveryComplete: false,
  }

  const [created] = await db.insert(crawlJobs).values(newCrawl).returning()
  return created
}

/**
 * Update crawl job progress and metrics
 */
export async function updateCrawlProgress(crawlId: string, updates: {
  status?: 'active' | 'completed' | 'failed' | 'cancelled'
  totalDiscovered?: number
  totalQueued?: number
  totalProcessed?: number
  totalFiltered?: number
  totalSkipped?: number
  totalFailed?: number
  progress?: CrawlProgress
  discoveryComplete?: boolean
  completedAt?: Date
  errorMessage?: string
}): Promise<CrawlJob | null> {
  const updateData: Partial<NewCrawlJob> = {
    ...updates,
    updatedAt: new Date(),
  }

  const [updated] = await db
    .update(crawlJobs)
    .set(updateData)
    .where(eq(crawlJobs.id, crawlId))
    .returning()

  return updated || null
}

/**
 * Complete a crawl job with final results
 */
export async function completeCrawlJob(crawlId: string, data: {
  status: 'completed' | 'failed'
  results?: CrawlResult[]
  markdown?: string
  errorMessage?: string
  totalProcessed?: number
}): Promise<CrawlJob | null> {
  const updateData: Partial<NewCrawlJob> = {
    status: data.status,
    completedAt: new Date(),
    updatedAt: new Date(),
    ...(data.results && { results: data.results }),
    ...(data.markdown && { markdown: data.markdown }),
    ...(data.errorMessage && { errorMessage: data.errorMessage }),
    ...(data.totalProcessed && { totalProcessed: data.totalProcessed }),
  }

  const [updated] = await db
    .update(crawlJobs)
    .set(updateData)
    .where(eq(crawlJobs.id, crawlId))
    .returning()

  return updated || null
}

/**
 * Get a crawl job by ID
 */
export async function getCrawlJob(crawlId: string): Promise<CrawlJob | null> {
  const [crawl] = await db.select().from(crawlJobs).where(eq(crawlJobs.id, crawlId))
  return crawl || null
}

/**
 * Get recent crawl jobs for the RecentCrawls component
 */
export async function getRecentCrawlJobs(limit = 10): Promise<CrawlJob[]> {
  return await db
    .select()
    .from(crawlJobs)
    .orderBy(desc(crawlJobs.createdAt))
    .limit(limit)
}

/**
 * Check if a crawl job exists and is active
 */
export async function isCrawlJobActive(crawlId: string): Promise<boolean> {
  const [crawl] = await db
    .select({ status: crawlJobs.status })
    .from(crawlJobs)
    .where(and(eq(crawlJobs.id, crawlId), eq(crawlJobs.status, 'active')))
  
  return !!crawl
}

/**
 * Store an SSE event for resumable streams
 */
export async function storeSSEEvent(crawlId: string, eventData: SSEEventData): Promise<string> {
  // Generate unique event ID for resumable streams
  const eventId = `${crawlId}-${Date.now()}-${++eventCounter}`
  
  const newEvent: NewSSEEvent = {
    crawlId,
    eventId,
    eventType: eventData.type || 'progress',
    eventData,
  }

  await db.insert(sseEvents).values(newEvent)
  return eventId
}

/**
 * Get SSE events after a specific event ID for reconnection recovery
 */
export async function getSSEEventsAfter(crawlId: string, lastEventId?: string): Promise<{
  eventId: string
  eventType: string
  eventData: SSEEventData
  createdAt: Date
}[]> {
  let query = db
    .select({
      eventId: sseEvents.eventId,
      eventType: sseEvents.eventType,
      eventData: sseEvents.eventData,
      createdAt: sseEvents.createdAt,
    })
    .from(sseEvents)
    .where(eq(sseEvents.crawlId, crawlId))
    .orderBy(sseEvents.createdAt)

  // If lastEventId provided, only get events after that
  if (lastEventId) {
    // Parse timestamp from event ID (format: crawlId-timestamp-counter)
    const [, timestampStr] = lastEventId.split('-')
    const lastTimestamp = parseInt(timestampStr)
    
    if (!isNaN(lastTimestamp)) {
      const lastDate = new Date(lastTimestamp)
      query = db
        .select({
          eventId: sseEvents.eventId,
          eventType: sseEvents.eventType,
          eventData: sseEvents.eventData,
          createdAt: sseEvents.createdAt,
        })
        .from(sseEvents)
        .where(and(
          eq(sseEvents.crawlId, crawlId),
          gte(sseEvents.createdAt, lastDate)
        ))
        .orderBy(sseEvents.createdAt)
    }
  }

  const results = await query.limit(100) // Limit to prevent excessive replay
  return results as {
    eventId: string
    eventType: string
    eventData: SSEEventData
    createdAt: Date
  }[]
}

/**
 * Clean up old SSE events to prevent database bloat
 */
export async function cleanupOldSSEEvents(olderThanDays = 7): Promise<number> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

  const deleted = await db
    .delete(sseEvents)
    .where(gte(sseEvents.createdAt, cutoffDate))

  return deleted.rowCount || 0
}

/**
 * Get crawl job status for UI state reconciliation
 * Returns null if job doesn't exist (for cleaning stale localStorage)
 */
export async function getCrawlJobStatus(crawlId: string): Promise<{
  id: string
  status: string
  progress: CrawlProgress
  markdown?: string
  completedAt?: Date
  errorMessage?: string
} | null> {
  const [crawl] = await db
    .select({
      id: crawlJobs.id,
      status: crawlJobs.status,
      progress: crawlJobs.progress,
      markdown: crawlJobs.markdown,
      completedAt: crawlJobs.completedAt,
      errorMessage: crawlJobs.errorMessage,
    })
    .from(crawlJobs)
    .where(eq(crawlJobs.id, crawlId))

  if (!crawl) return null

  return {
    ...crawl,
    progress: crawl.progress as CrawlProgress,
    markdown: crawl.markdown || undefined,
    completedAt: crawl.completedAt || undefined,
    errorMessage: crawl.errorMessage || undefined,
  }
}

/**
 * Batch get crawl job statuses for multiple IDs
 * Used for localStorage state reconciliation after server restart
 */
export async function batchGetCrawlJobStatuses(crawlIds: string[]): Promise<Map<string, {
  id: string
  status: string
  progress: CrawlProgress
  markdown?: string
  completedAt?: Date
  errorMessage?: string
}>> {
  if (crawlIds.length === 0) return new Map()

  const crawls = await db
    .select({
      id: crawlJobs.id,
      status: crawlJobs.status,
      progress: crawlJobs.progress,
      markdown: crawlJobs.markdown,
      completedAt: crawlJobs.completedAt,
      errorMessage: crawlJobs.errorMessage,
    })
    .from(crawlJobs)
    .where(inArray(crawlJobs.id, crawlIds))

  const statusMap = new Map()
  for (const crawl of crawls) {
    statusMap.set(crawl.id, {
      ...crawl,
      progress: crawl.progress as CrawlProgress,
    })
  }

  return statusMap
}