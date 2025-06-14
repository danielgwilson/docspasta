import { NextRequest } from 'next/server'
import { createResumableStreamContext } from 'resumable-stream'
import { createClient } from 'redis'
import { waitUntil } from '@vercel/functions'
import { getSSEEvents, getJob } from '@/lib/serverless/db-operations'
import { getUserId } from '@/lib/serverless/auth'

// Create Redis client helper
function createRedisClient() {
  const redisUrl = process.env.REDIS_URL || process.env.KV_URL
  if (!redisUrl) {
    throw new Error('REDIS_URL or KV_URL environment variable is required')
  }
  return createClient({ url: redisUrl })
}

// Stream generator that only reads events from storage
async function* makeJobStream(streamId: string, request: NextRequest): AsyncGenerator<string> {
  const jobId = streamId.replace('v4-job-', '')
  const userId = await getUserId(request)
  const startTime = Date.now()
  const TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
  const HEARTBEAT_INTERVAL_MS = 10000 // 10 seconds
  
  let lastEventId: string | undefined
  let lastHeartbeat = Date.now()
  
  try {
    // Verify job exists and belongs to user
    const job = await getJob(userId, jobId)
    if (!job) {
      yield `event: error\ndata: ${JSON.stringify({ error: 'Job not found' })}\nid: error-${Date.now()}\n\n`
      return
    }
    
    // Send initial connection event
    yield `event: stream_connected\ndata: ${JSON.stringify({ jobId, url: job.url })}\nid: connected-${Date.now()}\n\n`
    
    // Main event reading loop
    while (Date.now() - startTime < TIMEOUT_MS) {
      // Check if client disconnected
      if (request.signal.aborted) {
        console.log('Client disconnected, stopping stream')
        break
      }
      
      // Send heartbeat if needed
      const now = Date.now()
      if (now - lastHeartbeat > HEARTBEAT_INTERVAL_MS) {
        yield `: heartbeat\n\n`
        lastHeartbeat = now
      }
      
      // Get new events from database
      const events = await getSSEEvents(userId, jobId, lastEventId)
      
      // Send each event
      for (const event of events) {
        yield `event: ${event.event_type}\ndata: ${JSON.stringify(event.event_data)}\nid: ${event.event_id}\n\n`
        lastEventId = event.event_id
        
        // Check for terminal events
        if (event.event_type === 'job_completed' || 
            event.event_type === 'job_failed' || 
            event.event_type === 'job_timeout') {
          console.log(`Job ${jobId} reached terminal state: ${event.event_type}`)
          return
        }
      }
      
      // If no new events, wait a bit before checking again
      if (events.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    
    // Handle timeout
    if (Date.now() - startTime >= TIMEOUT_MS) {
      yield `event: stream_timeout\ndata: ${JSON.stringify({ message: 'Stream timeout after 5 minutes' })}\nid: timeout-${Date.now()}\n\n`
    }
    
  } catch (error) {
    console.error('Stream error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    yield `event: stream_error\ndata: ${JSON.stringify({ error: errorMessage })}\nid: error-${Date.now()}\n\n`
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params
  const resumeAt = request.nextUrl.searchParams.get("resumeAt")
  
  console.log(`🚀 Starting V4 SSE stream for job: ${jobId}${resumeAt ? ` (resuming from ${resumeAt})` : ''}`)
  
  let publisher: ReturnType<typeof createRedisClient> | null = null
  let subscriber: ReturnType<typeof createRedisClient> | null = null
  
  // Cleanup function
  const cleanup = async () => {
    try {
      await Promise.all([
        publisher?.disconnect?.().catch((err) => console.error('Error disconnecting publisher:', err)),
        subscriber?.disconnect?.().catch((err) => console.error('Error disconnecting subscriber:', err))
      ].filter(Boolean))
      console.log('🔌 Redis connections cleaned up')
    } catch (error) {
      console.error('Error during cleanup:', error)
    } finally {
      publisher = null
      subscriber = null
    }
  }
  
  try {
    // Create Redis clients for resumable-stream
    publisher = createRedisClient()
    subscriber = createRedisClient()
    
    publisher.on('error', (err) => console.error('Redis Publisher Error:', err))
    subscriber.on('error', (err) => console.error('Redis Subscriber Error:', err))
    
    await Promise.all([
      publisher.connect(),
      subscriber.connect()
    ])
    
    // Create resumable stream context
    const streamContext = createResumableStreamContext({
      redis: { publisher, subscriber },
      waitUntil
    })
    
    // Create resumable stream
    const stream = await streamContext.resumableStream(
      `v4-job-${jobId}`,
      () => makeJobStream(`v4-job-${jobId}`, request),
      resumeAt ? parseInt(resumeAt) : undefined
    )
    
    if (!stream) {
      await cleanup()
      return new Response("Stream is already done", { status: 422 })
    }
    
    // Set up cleanup on request abort
    request.signal.addEventListener('abort', () => {
      console.log('Request aborted, cleaning up Redis connections')
      cleanup().catch(console.error)
    })
    
    // Ensure cleanup happens after stream ends
    waitUntil(
      new Promise(async (resolve) => {
        try {
          // Wait for stream to be consumed
          const reader = stream.getReader()
          while (true) {
            const { done } = await reader.read()
            if (done) break
          }
        } catch (error) {
          console.error('Error reading stream:', error)
        } finally {
          // Clean up after stream is done
          await cleanup()
          resolve(undefined)
        }
      })
    )
    
    // Return SSE response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      }
    })
    
  } catch (error) {
    console.error('Failed to create stream:', error)
    
    // Clean up connections on error
    await cleanup()
    
    return new Response('Internal Server Error', { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes