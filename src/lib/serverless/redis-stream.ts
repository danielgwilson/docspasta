import { Redis } from '@upstash/redis'
import { storeSSEEvent } from './db-operations'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const STREAM_TTL = 3600 // 1 hour TTL for stream data

export interface StreamEvent {
  id: string
  type: string
  data: any
  timestamp: number
}

/**
 * Publish an event to both Redis (for real-time) and PostgreSQL (for persistence)
 */
export async function publishEvent(jobId: string, eventData: {
  type: string
  [key: string]: any
}) {
  const event: StreamEvent = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: eventData.type,
    data: eventData,
    timestamp: Date.now()
  }
  
  try {
    // Store in PostgreSQL for persistence
    await storeSSEEvent(jobId, event.type, event.data)
    
    // Publish to Redis for real-time streaming
    await redis.publish(`job:${jobId}:events`, JSON.stringify(event))
    
    // Also store in Redis list for quick access
    await redis.lpush(`job:${jobId}:stream`, JSON.stringify(event))
    await redis.expire(`job:${jobId}:stream`, STREAM_TTL)
    
  } catch (error) {
    console.error('Failed to publish event:', error)
    // Don't throw - streaming should continue even if Redis fails
  }
}

/**
 * Get recent events from Redis (for quick resume)
 */
export async function getRecentEvents(jobId: string, limit: number = 100): Promise<StreamEvent[]> {
  try {
    const events = await redis.lrange(`job:${jobId}:stream`, 0, limit - 1)
    return events
      .map(e => typeof e === 'string' ? JSON.parse(e) : e)
      .reverse() // Redis list is in reverse order
  } catch (error) {
    console.error('Failed to get recent events:', error)
    return []
  }
}

/**
 * Initialize a job stream in Redis
 */
export async function initializeJobStream(jobId: string) {
  await publishEvent(jobId, {
    type: 'job_initialized',
    jobId,
    timestamp: Date.now()
  })
}

/**
 * Clean up Redis data for a completed job
 */
export async function cleanupJobStream(jobId: string) {
  try {
    await redis.del(`job:${jobId}:stream`)
    await redis.del(`job:${jobId}:events`)
  } catch (error) {
    console.error('Failed to cleanup job stream:', error)
  }
}