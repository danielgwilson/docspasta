import { Queue } from 'bullmq'
import IORedis from 'ioredis'

export type QueueFunction = () => Queue<any, any, string, any, any, string>

let crawlQueue: Queue
let redisConnection: IORedis

// Redis connection with proper configuration
export function getRedisConnection() {
  if (!redisConnection) {
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL || 'redis://localhost:6379'
    
    // For Upstash Redis REST, use regular Redis client with REST URL converted
    const url = redisUrl.replace('https://', 'redis://')
    
    redisConnection = new IORedis(url, {
      maxRetriesPerRequest: null,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      lazyConnect: true,
    })
    
    console.log('🔗 Redis connection created')
  }
  return redisConnection
}

export const crawlQueueName = '{crawlQueue}'

export function getCrawlQueue() {
  if (!crawlQueue) {
    crawlQueue = new Queue(crawlQueueName, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: {
          age: 3600, // 1 hour
          count: 100, // Keep max 100 completed jobs
        },
        removeOnFail: {
          age: 3600, // 1 hour  
          count: 50, // Keep max 50 failed jobs
        },
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        attempts: 3,
      },
    })
    console.log('🚀 Crawl queue created')
  }
  return crawlQueue
}

// Cleanup function for graceful shutdown
export async function cleanup() {
  if (crawlQueue) {
    await crawlQueue.close()
    console.log('📊 Crawl queue closed')
  }
  if (redisConnection) {
    redisConnection.disconnect()
    console.log('🔌 Redis connection closed')
  }
}