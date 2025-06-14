import { Redis } from '@upstash/redis'
import { storeSSEEvent } from './db-operations'
import { getUserJobKey } from './auth'

const STREAM_TTL = 3600 // 1 hour TTL for stream data

// Create a new Redis client for each operation
function createUpstashClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  
  if (!url || !token) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required')
  }
  
  return new Redis({ url, token })
}

export interface StreamEvent {
  id: string
  type: string
  data: any
  timestamp: number
}

/**
 * Publish an event to both Redis (for real-time) and PostgreSQL (for persistence)
 */
export async function publishEvent(userId: string, jobId: string, eventData: {
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
    await storeSSEEvent(userId, jobId, event.type, event.data)
    
    // Publish to Redis for real-time streaming
    const redis = createUpstashClient()
    const eventsKey = getUserJobKey(userId, jobId, 'events')
    await redis.publish(eventsKey, JSON.stringify(event))
    
    // Also store in Redis list for quick access
    const streamKey = getUserJobKey(userId, jobId, 'stream')
    await redis.lpush(streamKey, JSON.stringify(event))
    await redis.expire(streamKey, STREAM_TTL)
    
  } catch (error) {
    console.error('Failed to publish event:', error)
    // Don't throw - streaming should continue even if Redis fails
  }
}

/**
 * Get recent events from Redis (for quick resume)
 */
export async function getRecentEvents(userId: string, jobId: string, limit: number = 100): Promise<StreamEvent[]> {
  try {
    const redis = createUpstashClient()
    const streamKey = getUserJobKey(userId, jobId, 'stream')
    const events = await redis.lrange(streamKey, 0, limit - 1)
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
export async function initializeJobStream(userId: string, jobId: string) {
  await publishEvent(userId, jobId, {
    type: 'job_initialized',
    jobId,
    timestamp: Date.now()
  })
}

/**
 * Clean up Redis data for a completed job
 */
export async function cleanupJobStream(userId: string, jobId: string) {
  try {
    const redis = createUpstashClient()
    const streamKey = getUserJobKey(userId, jobId, 'stream')
    const eventsKey = getUserJobKey(userId, jobId, 'events')
    await redis.del(streamKey)
    await redis.del(eventsKey)
  } catch (error) {
    console.error('Failed to cleanup job stream:', error)
  }
}