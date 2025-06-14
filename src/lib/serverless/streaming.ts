import type { ProgressEvent } from './types'
import { getUserJobKey, getUserStreamKey } from './auth'
import { withRedis, withRedisFallback } from './redis-connection'

// Publish progress event to Redis Stream
export async function publishProgress(userId: string, jobId: string, event: ProgressEvent): Promise<void> {
  const eventWithTimestamp = {
    ...event,
    timestamp: Date.now(),
    jobId,
  }
  
  await withRedisFallback(async (client) => {
    // Add event to Redis Stream with MAXLEN to prevent unbounded growth
    // The '*' tells Redis to auto-generate the ID (timestamp-based)
    const streamKey = getUserStreamKey(userId, jobId)
    await client.xAdd(
      streamKey,
      '*',
      {
        type: event.type,
        data: JSON.stringify(eventWithTimestamp),
      }
    )
    
    // Trim the stream to prevent unbounded growth
    // Using simple MAXLEN without modifiers for compatibility
    try {
      await client.xTrim(streamKey, 'MAXLEN', 1000)
    } catch (trimError) {
      console.error(`Failed to trim stream for job ${jobId}:`, trimError)
      // Don't fail the publish operation if trim fails
    }
    
    console.log(`📡 Published progress for user ${userId}, job ${jobId}:`, event.type)
    
    // If job completed, update job metadata
    if (event.type === 'job_completed') {
      const jobKey = getUserJobKey(userId, jobId)
      await client.hSet(jobKey, 'status', 'completed')
      // Set TTL on stream to clean up after 24 hours
      await client.expire(streamKey, 86400)
    }
  }, undefined, { logPrefix: 'PublishProgress' })
}

// Initialize job metadata
export async function initializeJob(userId: string, jobId: string): Promise<void> {
  await withRedis(async (client) => {
    const jobKey = getUserJobKey(userId, jobId)
    await client.hSet(jobKey, {
      status: 'running',
      startedAt: Date.now().toString(),
    })
    
    // Publish initial event
    await publishProgress(userId, jobId, {
      type: 'discovery_started',
      jobId,
    })
  }, { logPrefix: 'InitializeJob' })
}

// Mark job as completed
export async function completeJob(userId: string, jobId: string, finalMarkdown?: string): Promise<void> {
  await withRedis(async (client) => {
    const jobKey = getUserJobKey(userId, jobId)
    await client.hSet(jobKey, {
      status: 'completed',
      completedAt: Date.now().toString(),
      ...(finalMarkdown && { finalMarkdown }),
    })
    
    await publishProgress(userId, jobId, {
      type: 'job_completed',
      jobId,
    })
    
    // Set TTL on stream to clean up after 1 hour
    const streamTTL = 3600 // 1 hour
    const streamKey = getUserStreamKey(userId, jobId)
    await client.expire(streamKey, streamTTL)
    console.log(`🧹 Set TTL of ${streamTTL}s on ${streamKey}`)
  }, { logPrefix: 'CompleteJob' })
}

// Get job status from Redis
export async function getJobStatus(userId: string, jobId: string): Promise<string | null> {
  return await withRedisFallback(async (client) => {
    const jobKey = getUserJobKey(userId, jobId)
    return await client.hGet(jobKey, 'status')
  }, null, { logPrefix: 'GetJobStatus' })
}