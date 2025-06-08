import { Queue } from 'bullmq'
import IORedis from 'ioredis'

export type QueueFunction = () => Queue<unknown, unknown, string, unknown, unknown, string>

let crawlQueue: Queue
let redisConnection: IORedis

// Redis connection with proper configuration for Upstash (following official docs)
export function getRedisConnection() {
  if (!redisConnection) {
    // Use Redis TLS URL instead of REST URL for BullMQ compatibility
    const redisUrl = process.env.REDIS_URL || process.env.KV_URL || 'redis://localhost:6379'
    
    if (redisUrl.startsWith('rediss://')) {
      // Secure Redis connection (Upstash) - following official Upstash BullMQ docs
      const url = new URL(redisUrl)
      redisConnection = new IORedis({
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password,
        username: url.username || 'default',
        tls: {}, // Enable TLS for Upstash
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: true,
        keepAlive: 30000,
        retryStrategy: (times) => Math.min(times * 50, 2000),
      })
      console.log(`🔗 Upstash Redis TLS connection created: ${url.hostname}:${url.port}`)
    } else {
      // Local Redis or non-TLS
      redisConnection = new IORedis({
        host: 'localhost',
        port: 6379,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: true,
      })
      console.log('🔗 Local Redis connection created')
    }
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