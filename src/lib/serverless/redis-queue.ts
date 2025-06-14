import crypto from 'crypto'
import { withRedis, withRedisFallback } from './redis-connection'
import type { RedisClientType } from 'redis'

// URL task structure
export interface UrlTask {
  id: string
  url: string
  depth: number
  jobId: string
}

// Add URLs to Redis queue
export async function addUrlsToRedisQueue(
  jobId: string,
  urls: string[],
  depth: number
): Promise<number> {
  if (urls.length === 0) return 0
  
  return await withRedis(async (redis) => {
    const queueKey = `queue:${jobId}`
    const seenKey = `seen:${jobId}`
    
    let added = 0
    const tasks: string[] = []
    
    for (const url of urls) {
      // Check if URL was already seen
      const isNew = await redis.sAdd(seenKey, url)
      if (isNew === 1) {
        // Generate a unique ID for this URL
        const id = crypto.randomBytes(16).toString('hex')
        const task: UrlTask = {
          id,
          url,
          depth,
          jobId
        }
        tasks.push(JSON.stringify(task))
        added++
      }
    }
    
    // Add all new tasks to queue
    if (tasks.length > 0) {
      await redis.lPush(queueKey, ...tasks)
      await redis.expire(queueKey, 3600) // 1 hour expiry
      await redis.expire(seenKey, 3600) // 1 hour expiry
    }
    
    return added
  }, { logPrefix: 'AddUrlsToQueue' })
}

// Get tasks from Redis queue
export async function getTasksFromRedisQueue(
  jobId: string,
  batchSize: number
): Promise<UrlTask[]> {
  return await withRedisFallback(async (redis) => {
    const queueKey = `queue:${jobId}`
    const tasks: UrlTask[] = []
    
    // Pop multiple items from the queue
    for (let i = 0; i < batchSize; i++) {
      const item = await redis.rPop(queueKey)
      if (!item) break
      
      try {
        const parsed = JSON.parse(item) as UrlTask
        tasks.push(parsed)
      } catch (error) {
        console.error('Failed to parse queue item:', item, error)
      }
    }
    
    return tasks
  }, [], { logPrefix: 'GetTasksFromQueue' })
}

// Check if queue is empty
export async function isQueueEmpty(
  jobId: string
): Promise<boolean> {
  return await withRedisFallback(async (redis) => {
    const queueKey = `queue:${jobId}`
    const length = await redis.lLen(queueKey)
    return length === 0
  }, true, { logPrefix: 'IsQueueEmpty' })
}

// Worker tracking
export async function incrementWorkerCount(
  jobId: string
): Promise<number> {
  return await withRedis(async (redis) => {
    const key = `workers:${jobId}`
    const count = await redis.incr(key)
    await redis.expire(key, 300) // 5 minute expiry
    return count
  }, { logPrefix: 'IncrementWorker' })
}

export async function decrementWorkerCount(
  jobId: string
): Promise<number> {
  return await withRedisFallback(async (redis) => {
    const key = `workers:${jobId}`
    const count = await redis.decr(key)
    if (count <= 0) {
      await redis.del(key)
    }
    return Math.max(0, count)
  }, 0, { logPrefix: 'DecrementWorker' })
}

export async function getWorkerCount(
  jobId: string
): Promise<number> {
  return await withRedisFallback(async (redis) => {
    const key = `workers:${jobId}`
    const count = await redis.get(key)
    return parseInt(count || '0', 10)
  }, 0, { logPrefix: 'GetWorkerCount' })
}

// Legacy function for backward compatibility
export function createRedisClient() {
  const redisUrl = process.env.REDIS_URL || process.env.KV_URL
  if (!redisUrl) {
    throw new Error('REDIS_URL or KV_URL environment variable is required')
  }
  
  // Import dynamically to avoid circular dependency
  const { createClient } = require('redis')
  return createClient({ url: redisUrl })
}