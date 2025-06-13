import { createClient } from 'redis'
import type { ProgressEvent } from './types'

// Create a single Redis client for writing to streams (singleton pattern)
let redisClient: ReturnType<typeof createClient> | null = null

async function getRedisClient() {
  // Return existing client if already connected
  if (redisClient?.isOpen) {
    return redisClient
  }
  
  // Use the Redis URL directly (not the REST URL)
  const redisUrl = process.env.REDIS_URL || process.env.KV_URL
  
  if (!redisUrl) {
    throw new Error('REDIS_URL or KV_URL environment variable is required')
  }
  
  console.log('🔄 Creating new Redis client for streaming...')
  
  redisClient = createClient({ 
    url: redisUrl
  })
  
  redisClient.on('error', (err) => console.error('Redis Client Error:', err))
  redisClient.on('reconnecting', () => console.log('🔄 Redis client reconnecting...'))
  
  await redisClient.connect()
  console.log('✅ Redis client connected for streaming')
  
  return redisClient
}

// Publish progress event to Redis Stream
export async function publishProgress(jobId: string, event: ProgressEvent): Promise<void> {
  const eventWithTimestamp = {
    ...event,
    timestamp: Date.now(),
    jobId,
  }
  
  try {
    const client = await getRedisClient()
    
    // Add event to Redis Stream with MAXLEN to prevent unbounded growth
    // The '*' tells Redis to auto-generate the ID (timestamp-based)
    await client.xAdd(
      `stream:${jobId}`,
      '*',
      {
        type: event.type,
        data: JSON.stringify(eventWithTimestamp),
      }
    )
    
    // Trim the stream to prevent unbounded growth
    // Using simple MAXLEN without modifiers for compatibility
    try {
      await client.xTrim(`stream:${jobId}`, 'MAXLEN', 1000)
    } catch (trimError) {
      console.error(`Failed to trim stream for job ${jobId}:`, trimError)
      // Don't fail the publish operation if trim fails
    }
    
    console.log(`📡 Published progress for job ${jobId}:`, event.type)
    
    // If job completed, update job metadata
    if (event.type === 'job_completed') {
      await client.hSet(`job:${jobId}`, 'status', 'completed')
      // Set TTL on stream to clean up after 24 hours
      await client.expire(`stream:${jobId}`, 86400)
    }
  } catch (error) {
    console.error(`❌ Failed to publish progress:`, error)
  }
}

// Initialize job metadata
export async function initializeJob(jobId: string): Promise<void> {
  const client = await getRedisClient()
  
  await client.hSet(`job:${jobId}`, {
    status: 'running',
    startedAt: Date.now().toString(),
  })
  
  // Publish initial event
  await publishProgress(jobId, {
    type: 'discovery_started',
    jobId,
  })
}

// Mark job as completed
export async function completeJob(jobId: string, finalMarkdown?: string): Promise<void> {
  const client = await getRedisClient()
  
  await client.hSet(`job:${jobId}`, {
    status: 'completed',
    completedAt: Date.now().toString(),
    ...(finalMarkdown && { finalMarkdown }),
  })
  
  await publishProgress(jobId, {
    type: 'job_completed',
    jobId,
  })
  
  // Set TTL on stream to clean up after 1 hour
  const streamTTL = 3600 // 1 hour
  await client.expire(`stream:${jobId}`, streamTTL)
  console.log(`🧹 Set TTL of ${streamTTL}s on stream:${jobId}`)
}

// Get job status from Redis
export async function getJobStatus(jobId: string): Promise<string | null> {
  const client = await getRedisClient()
  return await client.hGet(`job:${jobId}`, 'status')
}