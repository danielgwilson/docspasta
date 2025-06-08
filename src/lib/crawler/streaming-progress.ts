import { getRedisConnection } from './queue-service'

/**
 * Real-time streaming progress system for docspasta v2
 * 
 * Architecture:
 * 1. Server-Sent Events (SSE) for real-time frontend updates
 * 2. Redis pub/sub for progress event distribution
 * 3. Progress snapshots in Redis for reconnection recovery
 * 4. Throttling and batching for high-frequency updates
 */

// Progress event types
export interface BaseProgressEvent {
  crawlId: string
  timestamp?: number
}

export interface ProgressEvent extends BaseProgressEvent {
  phase: 'initializing' | 'discovering' | 'crawling' | 'quality-assessment' | 'completed' | 'failed'
  processed: number
  total: number
  percentage?: number
  discoveredUrls?: number
  failedUrls?: number
  currentUrl?: string
  currentActivity?: string
  queueSize?: number
  qualityResults?: {
    highQuality: number
    mediumQuality: number
    lowQuality: number
  }
}

export interface BatchProgressEvent extends BaseProgressEvent {
  type: 'batch-progress'
  batchNumber: number
  totalBatches: number
  batchProcessed: number
  batchFailed: number
  overallProgress: {
    processed: number
    total: number
    percentage: number
  }
}

export interface CrawlCompletionEvent extends BaseProgressEvent {
  type: 'completion'
  status: 'completed' | 'failed'
  totalProcessed: number
  totalFailed: number
  duration: number
  finalResults?: {
    urls: string[]
    content: string
  }
  errorMessage?: string
}

export interface UrlDiscoveryEvent extends BaseProgressEvent {
  type: 'url-discovery'
  newUrls: number
  duplicateUrls: number
  totalDiscovered: number
  source: 'sitemap' | 'links' | 'manual'
}

// SSE Stream interface
export interface ProgressStream {
  close(): void
}

export interface StreamOptions {
  onProgress?: (data: ProgressEvent) => void
  onBatchProgress?: (data: BatchProgressEvent) => void
  onCompletion?: (data: CrawlCompletionEvent) => void
  onError?: (error: Event | Error) => void
  onReconnect?: () => void
  reconnectInterval?: number
}

// Progress snapshot for recovery
export interface ProgressSnapshot {
  crawlId: string
  phase: string
  processed: number
  total: number
  percentage: number
  discoveredUrls: number
  timestamp: number
}

/**
 * Global progress update throttling to prevent overwhelming clients
 */
const progressThrottleMap = new Map<string, { lastUpdate: number; pending: boolean }>()
const THROTTLE_INTERVAL = 500 // 500ms minimum between updates per crawl

/**
 * Cleanup function for memory leak prevention
 */
export async function cleanupProgressTracking(crawlId: string) {
  progressThrottleMap.delete(crawlId)
}

/**
 * Publish a progress event to Redis for streaming to clients
 */
export async function publishProgressEvent(event: ProgressEvent): Promise<void> {
  try {
    const redis = getRedisConnection()
    const now = Date.now()
    const crawlId = event.crawlId

    // Throttle high-frequency updates
    const throttleInfo = progressThrottleMap.get(crawlId)
    if (throttleInfo && (now - throttleInfo.lastUpdate) < THROTTLE_INTERVAL) {
      if (!throttleInfo.pending) {
        throttleInfo.pending = true
        // Schedule delayed update
        setTimeout(async () => {
          try {
            await redis.publish(`crawl:${crawlId}:progress`, JSON.stringify({
              ...event,
              timestamp: Date.now(),
            }))
            progressThrottleMap.set(crawlId, { lastUpdate: Date.now(), pending: false })
          } catch (error) {
            console.error(`⚠️  Failed to publish delayed progress for crawl ${crawlId}:`, error)
          }
        }, THROTTLE_INTERVAL)
      }
      return
    }

    // Immediate update
    const eventWithTimestamp = {
      ...event,
      timestamp: now,
      percentage: event.percentage || (event.total > 0 ? Math.round((event.processed / event.total) * 100) : 0),
    }

    await redis.publish(`crawl:${crawlId}:progress`, JSON.stringify(eventWithTimestamp))
    
    // Store progress snapshot for recovery
    await storeProgressSnapshot(eventWithTimestamp)
    
    // Update throttle tracking
    progressThrottleMap.set(crawlId, { lastUpdate: now, pending: false })
    
    console.log(`📡 Published progress: ${event.phase} ${event.processed}/${event.total} for crawl ${crawlId}`)
  } catch (error) {
    console.error(`⚠️  Failed to publish progress event for crawl ${event.crawlId}:`, error)
    // Continue gracefully - don't fail the crawl for streaming issues
  }
}

/**
 * Publish batch progress event
 */
export async function publishBatchProgressEvent(event: Omit<BatchProgressEvent, 'type' | 'timestamp'>): Promise<void> {
  try {
    const redis = getRedisConnection()
    const eventWithMeta = {
      type: 'batch-progress' as const,
      ...event,
      timestamp: Date.now(),
    }

    await redis.publish(`crawl:${event.crawlId}:progress`, JSON.stringify(eventWithMeta))
    
    console.log(`📦 Published batch progress: ${event.batchNumber}/${event.totalBatches} for crawl ${event.crawlId}`)
  } catch (error) {
    console.error(`⚠️  Failed to publish batch progress for crawl ${event.crawlId}:`, error)
  }
}

/**
 * Publish crawl completion event
 */
export async function publishCrawlCompletionEvent(event: Omit<CrawlCompletionEvent, 'type' | 'timestamp'>): Promise<void> {
  try {
    const redis = getRedisConnection()
    const eventWithMeta = {
      type: 'completion' as const,
      ...event,
      timestamp: Date.now(),
    }

    await redis.publish(`crawl:${event.crawlId}:progress`, JSON.stringify(eventWithMeta))
    
    console.log(`🎉 Published completion: ${event.status} for crawl ${event.crawlId}`)
    
    // Clean up throttling
    await cleanupProgressTracking(event.crawlId)
  } catch (error) {
    console.error(`⚠️  Failed to publish completion event for crawl ${event.crawlId}:`, error)
  }
}

/**
 * Store progress snapshot in Redis for reconnection recovery
 */
export async function storeProgressSnapshot(event: ProgressEvent): Promise<void> {
  try {
    const redis = getRedisConnection()
    const snapshot = {
      phase: event.phase,
      processed: event.processed.toString(),
      total: event.total.toString(),
      discoveredUrls: (event.discoveredUrls || 0).toString(),
      timestamp: (event.timestamp || Date.now()).toString(),
      lastUpdate: Date.now().toString(),
    }

    await redis.hset(`crawl:${event.crawlId}:snapshot`, snapshot)
  } catch (error) {
    console.error(`⚠️  Failed to store progress snapshot for crawl ${event.crawlId}:`, error)
  }
}

/**
 * Get latest progress snapshot for recovery
 */
export async function getLatestProgressSnapshot(crawlId: string): Promise<ProgressSnapshot> {
  try {
    const redis = getRedisConnection()
    const snapshot = await redis.hgetall(`crawl:${crawlId}:snapshot`)
    
    if (!snapshot.phase) {
      // No snapshot exists - return default
      return {
        crawlId,
        phase: 'initializing',
        processed: 0,
        total: 0,
        percentage: 0,
        discoveredUrls: 0,
        timestamp: Date.now(),
      }
    }

    const processed = parseInt(snapshot.processed || '0')
    const total = parseInt(snapshot.total || '0')
    
    return {
      crawlId,
      phase: snapshot.phase,
      processed,
      total,
      percentage: total > 0 ? Math.round((processed / total) * 100) : 0,
      discoveredUrls: parseInt(snapshot.discoveredUrls || '0'),
      timestamp: parseInt(snapshot.timestamp || '0'),
    }
  } catch (error) {
    console.error(`❌ Failed to get progress snapshot for crawl ${crawlId}:`, error)
    return {
      crawlId,
      phase: 'initializing',
      processed: 0,
      total: 0,
      percentage: 0,
      discoveredUrls: 0,
      timestamp: Date.now(),
    }
  }
}

/**
 * Create SSE stream connection for frontend
 */
export function createProgressStream(crawlId: string, options: StreamOptions = {}): ProgressStream {
  const eventSource = new EventSource(`/api/crawl-v2/${crawlId}/stream`)
  
  eventSource.onopen = () => {
    console.log(`📡 SSE connected for crawl: ${crawlId}`)
  }
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      
      if (data.type === 'batch-progress' && options.onBatchProgress) {
        options.onBatchProgress(data)
      } else if (data.type === 'completion' && options.onCompletion) {
        options.onCompletion(data)
      } else if (options.onProgress) {
        options.onProgress(data)
      }
    } catch (error) {
      console.error('Failed to parse SSE message:', error)
      options.onError?.(error instanceof Error ? error : new Error('Parse error'))
    }
  }
  
  eventSource.onerror = (error) => {
    console.error(`SSE connection error for crawl ${crawlId}:`, error)
    options.onError?.(error)
    
    // Handle reconnection
    if (eventSource.readyState === EventSource.CLOSED && options.onReconnect) {
      options.onReconnect()
      // Auto-reconnect after interval
      if (options.reconnectInterval) {
        setTimeout(() => {
          // Create new connection (simplified - real implementation would be more robust)
          console.log(`🔄 Attempting reconnection for crawl: ${crawlId}`)
        }, options.reconnectInterval)
      }
    }
  }

  return {
    close: () => {
      eventSource.close()
      console.log(`📡 SSE closed for crawl: ${crawlId}`)
    }
  }
}

/**
 * Handle batch completion and trigger progress updates
 */
export async function handleBatchCompletion(completion: {
  crawlId: string
  batchNumber: number
  totalBatches: number
  batchResults: {
    processed: number
    failed: number
    discoveredUrls?: string[]
  }
}): Promise<void> {
  try {
    // Publish batch-specific progress
    await publishBatchProgressEvent({
      crawlId: completion.crawlId,
      batchNumber: completion.batchNumber,
      totalBatches: completion.totalBatches,
      batchProcessed: completion.batchResults.processed,
      batchFailed: completion.batchResults.failed,
      overallProgress: {
        processed: completion.batchNumber * 20, // Estimate - real calculation would be more sophisticated
        total: completion.totalBatches * 20,
        percentage: Math.round((completion.batchNumber / completion.totalBatches) * 100),
      }
    })

    // Store the latest state
    const redis = getRedisConnection()
    await redis.hset(`crawl:${completion.crawlId}:snapshot`, {
      lastBatchCompleted: completion.batchNumber.toString(),
      totalBatches: completion.totalBatches.toString(),
      lastUpdate: Date.now().toString(),
    })
    
    console.log(`✅ Processed batch completion: ${completion.batchNumber}/${completion.totalBatches}`)
  } catch (error) {
    console.error(`⚠️  Failed to handle batch completion:`, error)
  }
}

/**
 * Handle URL discovery events
 */
export async function handleUrlDiscovery(discovery: Omit<UrlDiscoveryEvent, 'type' | 'timestamp'>): Promise<void> {
  try {
    const redis = getRedisConnection()
    const eventWithMeta = {
      type: 'url-discovery' as const,
      ...discovery,
      timestamp: Date.now(),
    }

    await redis.publish(`crawl:${discovery.crawlId}:progress`, JSON.stringify(eventWithMeta))
    
    console.log(`🔍 Published URL discovery: +${discovery.newUrls} new URLs from ${discovery.source}`)
  } catch (error) {
    console.error(`⚠️  Failed to publish URL discovery:`, error)
  }
}

/**
 * Batch multiple progress updates for efficiency
 */
export async function batchProgressUpdates(updates: ProgressEvent[]): Promise<void> {
  if (updates.length === 0) return

  try {
    const redis = getRedisConnection()
    const pipeline = redis.pipeline()
    
    for (const update of updates) {
      const eventWithTimestamp = {
        ...update,
        timestamp: Date.now(),
        percentage: update.percentage || (update.total > 0 ? Math.round((update.processed / update.total) * 100) : 0),
      }
      
      pipeline.publish(`crawl:${update.crawlId}:progress`, JSON.stringify(eventWithTimestamp))
      pipeline.hset(`crawl:${update.crawlId}:snapshot`, {
        phase: update.phase,
        processed: update.processed.toString(),
        total: update.total.toString(),
        timestamp: eventWithTimestamp.timestamp.toString(),
      })
    }
    
    await pipeline.exec()
    console.log(`📦 Batched ${updates.length} progress updates`)
  } catch (error) {
    console.error(`⚠️  Failed to batch progress updates:`, error)
  }
}

/**
 * Clean up progress data after crawl completion
 */
export async function cleanupProgressData(crawlId: string): Promise<void> {
  try {
    const redis = getRedisConnection()
    await Promise.all([
      redis.del(`crawl:${crawlId}:snapshot`),
      redis.del(`crawl:${crawlId}:progress`),
    ])
    
    // Clean up throttling
    await cleanupProgressTracking(crawlId)
    
    console.log(`🧹 Cleaned up progress data for crawl: ${crawlId}`)
  } catch (error) {
    console.error(`⚠️  Failed to cleanup progress data for crawl ${crawlId}:`, error)
  }
}

/**
 * Get streaming statistics for monitoring
 */
export async function getStreamingStats(): Promise<{
  activeStreams: number
  totalEventsSent: number
  averageLatency: number
  errorRate: number
}> {
  try {
    // In a real implementation, these would be tracked in Redis or memory
    return {
      activeStreams: progressThrottleMap.size,
      totalEventsSent: 0, // Would track this
      averageLatency: 0, // Would calculate this
      errorRate: 0, // Would track this
    }
  } catch (error) {
    console.error(`❌ Failed to get streaming stats:`, error)
    return {
      activeStreams: 0,
      totalEventsSent: 0,
      averageLatency: 0,
      errorRate: 0,
    }
  }
}