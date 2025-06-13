import { NextRequest, NextResponse } from 'next/server'
import { createResumableStreamContext } from 'resumable-stream'
import { createClient } from 'redis'
import { waitUntil } from '@vercel/functions'
import { JobManager } from '@/lib/serverless/jobs'

// Simplified Redis client - let the library handle connection management
function createRedisClient() {
  const redisUrl = process.env.REDIS_URL || process.env.KV_URL
  
  if (!redisUrl) {
    throw new Error('REDIS_URL or KV_URL environment variable is required')
  }
  
  return createClient({
    url: redisUrl
  })
}

// Create Redis clients with proper error handling
async function createConnectedRedisClients() {
  console.log('🔄 Creating Redis clients for SSE streaming...')
  
  const streamClient = createRedisClient()
  const publisherClient = createRedisClient()
  
  streamClient.on('error', (err) => console.error('Redis Stream Client Error:', err))
  publisherClient.on('error', (err) => console.error('Redis Publisher Error:', err))
  
  await Promise.all([
    streamClient.connect(),
    publisherClient.connect()
  ])
  
  console.log('✅ Redis clients connected successfully')
  
  return { streamClient, publisherClient }
}

// Generator that reads from Redis Stream with graceful timeout and heartbeats
async function* streamGenerator(redisClient: any, jobId: string, lastId: string | null, abortSignal: AbortSignal) {
  const startTime = Date.now()
  const FUNCTION_TIMEOUT_MS = 50000 // 50 seconds - safe buffer for 60s Vercel limit
  const HEARTBEAT_INTERVAL_MS = 10000 // 10 seconds between heartbeats
  // Health check before starting
  try {
    await redisClient.ping()
  } catch (pingError) {
    console.error('Redis connection unhealthy:', pingError)
    yield {
      data: JSON.stringify({ type: 'error', message: 'Service temporarily unavailable' }),
      id: `error-${Date.now()}`,
      event: 'stream_error'
    }
    return
  }
  
  // Start from the beginning or from the last known position
  let currentId = lastId || '0-0'
  let lastHeartbeat = Date.now()
  
  while (!abortSignal.aborted && (Date.now() - startTime) < FUNCTION_TIMEOUT_MS) {
    try {
      // Check job status first
      const jobStatus = await redisClient.hGet(`job:${jobId}`, 'status')
      
      // Read from the stream with blocking (2 seconds for heartbeat interval)
      const response = await redisClient.xRead(
        { key: `stream:${jobId}`, id: currentId },
        { COUNT: 10, BLOCK: 2000 }
      )
      
      if (!response || response.length === 0) {
        // No new messages within block time - check if we need to send heartbeat
        const now = Date.now()
        if (now - lastHeartbeat > HEARTBEAT_INTERVAL_MS) {
          yield {
            data: '',
            id: `heartbeat-${now}`,
            event: 'heartbeat'
          }
          lastHeartbeat = now
        }
        
        // No new messages - check if job is terminal
        if (jobStatus === 'completed' || jobStatus === 'failed') {
          // Check for any remaining messages
          const remainingMessages = await redisClient.xRange(
            `stream:${jobId}`,
            currentId,
            '+'
          )
          
          if (remainingMessages.length === 0) {
            // Send final event based on job status
            const finalEvent = jobStatus === 'failed' 
              ? { type: 'error', jobId, message: 'Job processing failed' }
              : { type: 'stream_end', jobId }
            yield { 
              data: JSON.stringify(finalEvent), 
              id: `final-${Date.now()}`,
              event: finalEvent.type 
            }
            break
          }
        }
        // Continue waiting for more data
        continue
      }
      
      // CRITICAL: Handle null response when BLOCK times out
      if (!response) {
        // No new messages - send heartbeat to keep connection alive
        yield {
          data: '',
          id: `heartbeat-${Date.now()}`,
          event: 'heartbeat'
        }
        continue
      }
      
      // Process messages - node-redis v5 returns array of stream objects
      for (const stream of response) {
        for (const message of stream.messages) {
          try {
            currentId = message.id
            // In node-redis v5, message fields are in message.message object
            const eventData = JSON.parse(message.message.data)
            
            // Yield with proper event type and Redis message ID
            yield {
              data: JSON.stringify(eventData),
              id: message.id,
              event: eventData.type || 'progress'
            }
            
            // If this is a terminal event, close the stream
            if (eventData.type === 'job_completed' || eventData.type === 'error') {
              return
            }
          } catch (parseError) {
            // Poison pill protection - skip malformed messages
            console.error(`Skipping malformed message ${message.id}:`, parseError)
            currentId = message.id // CRITICAL: Move past the bad message
            
            // Send error event to client
            yield {
              data: JSON.stringify({ 
                type: 'processing_error', 
                message: 'Skipped malformed event',
                offendingId: message.id 
              }),
              id: `error-${message.id}`,
              event: 'processing_error'
            }
          }
        }
      }
    } catch (error) {
      console.error('Stream generator error:', error)
      yield {
        data: JSON.stringify({ type: 'error', jobId, message: 'Stream error occurred' }),
        id: `error-${Date.now()}`,
        event: 'error'
      }
      throw error
    }
  }
  
  // Graceful timeout - tell client to reconnect
  if ((Date.now() - startTime) >= FUNCTION_TIMEOUT_MS) {
    console.log(`🕒 Function timeout approaching for job ${jobId}, sending reconnect event`)
    yield {
      data: JSON.stringify({ 
        type: 'reconnect',
        reason: 'function_timeout',
        message: 'Reconnecting due to serverless function timeout...'
      }),
      id: `reconnect-${Date.now()}`,
      event: 'reconnect'
    }
  }
  
  // Client disconnected or timeout reached
  console.log(`Client disconnected for job ${jobId}`)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<Response> {
  const { jobId } = await params
  const { searchParams } = new URL(request.url)
  const lastEventId = request.headers.get('last-event-id') || searchParams.get('lastEventId')
  
  console.log(`📡 Starting SSE stream for job: ${jobId}${lastEventId ? ` (resuming from ${lastEventId})` : ''}`)
  
  // CRITICAL: Check job status first to handle completed/failed jobs
  const jobManager = new JobManager()
  const jobState = await jobManager.getJobState(jobId)
  
  if (!jobState) {
    // Fallback: Check if job exists in Redis (for backwards compatibility with tests)
    try {
      const tempClient = createRedisClient()
      await tempClient.connect()
      const redisJobStatus = await tempClient.hGet(`job:${jobId}`, 'status')
      await tempClient.disconnect()
      
      if (!redisJobStatus) {
        return NextResponse.json({
          success: false,
          error: 'Job not found'
        }, { status: 404 })
      }
      
      // Job exists in Redis, proceed with streaming (legacy behavior for tests)
      console.log(`⚠️  Job ${jobId} found in Redis but not in database (test mode)`)
    } catch (redisError) {
      console.error('Redis fallback check failed:', redisError)
      return NextResponse.json({
        success: false,
        error: 'Job not found'
      }, { status: 404 })
    }
  }
  
  // Handle terminal states immediately
  if (jobState && jobState.status === 'completed') {
    console.log(`✅ Job ${jobId} already completed, sending final event`)
    
    // Send a final completion event in SSE format
    const finalEvent = {
      type: 'job_completed',
      jobId,
      message: 'Job already completed',
      totalUrls: jobState.totalUrls,
      processedUrls: jobState.processedUrls,
      results: jobState.results
    }
    
    const sseData = `event: job_completed\ndata: ${JSON.stringify(finalEvent)}\nid: final-${Date.now()}\n\n`
    
    return new Response(sseData, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
  
  if (jobState && jobState.status === 'failed') {
    console.log(`❌ Job ${jobId} already failed, sending error event`)
    
    // Send a final error event in SSE format
    const errorEvent = {
      type: 'error',
      jobId,
      message: jobState.errorDetails || 'Job failed',
    }
    
    const sseData = `event: error\ndata: ${JSON.stringify(errorEvent)}\nid: error-${Date.now()}\n\n`
    
    return new Response(sseData, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
  
  let streamClient: any
  let publisherClient: any
  
  try {
    // Create Redis clients with simplified management
    const clients = await createConnectedRedisClients()
    streamClient = clients.streamClient
    publisherClient = clients.publisherClient
    
    // Create resumable stream context with proper waitUntil
    const streamContext = createResumableStreamContext({
      waitUntil
    })
    
    // Create the resumable stream with a ReadableStream
    const stream = await streamContext.resumableStream(
      `job-progress:${jobId}`,
      () => {
        // Convert our async generator to a ReadableStream<string>
        const generator = streamGenerator(streamClient, jobId, lastEventId, request.signal)
        
        return new ReadableStream<string>({
          async start(controller) {
            try {
              for await (const chunk of generator) {
                // resumable-stream expects the chunk to be a string in SSE format
                // We need to format it properly here
                if (chunk.event === 'heartbeat') {
                  controller.enqueue(': heartbeat\n\n')
                } else {
                  if (chunk.event) {
                    controller.enqueue(`event: ${chunk.event}\n`)
                  }
                  controller.enqueue(`data: ${chunk.data}\n`)
                  controller.enqueue(`id: ${chunk.id}\n\n`)
                }
              }
              controller.close()
            } catch (error) {
              // Only error if not aborted
              if (!request.signal.aborted) {
                controller.error(error)
              }
            }
          }
        })
      },
      // For resumable-stream v2, we need to pass skipCharacters based on lastEventId
      lastEventId ? undefined : undefined
    )
    
    if (!stream) {
      // Clean up connections
      try {
        await Promise.allSettled([
          streamClient?.disconnect(),
          publisherClient?.disconnect()
        ])
      } catch (err) {
        console.log('Cleanup error during stream not found (ignored):', err)
      }
      
      return new Response('Stream not found or already completed', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain',
        },
      })
    }
    
    // Clean up Redis connections when stream ends
    let cleanupDone = false
    const cleanup = async () => {
      if (cleanupDone) return // Prevent double cleanup
      cleanupDone = true
      
      console.log(`🔌 Cleaning up connections for job ${jobId}`)
      try {
        // Disconnect both clients
        await Promise.allSettled([
          streamClient?.disconnect(),
          publisherClient?.disconnect()
        ])
      } catch (err) {
        // Ignore disconnect errors during cleanup (expected during race conditions)
        console.log('Cleanup error (ignored):', err)
      }
    }
    
    // Register cleanup on abort
    request.signal.addEventListener('abort', () => {
      // Use waitUntil to ensure cleanup completes
      waitUntil(cleanup())
    })
    
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      },
    })
    
  } catch (error) {
    console.error(`❌ SSE stream failed for job ${jobId}:`, error)
    
    // Clean up on error
    try {
      await Promise.allSettled([
        streamClient?.disconnect(),
        publisherClient?.disconnect()
      ])
    } catch (cleanupErr) {
      console.log('Error cleanup failed (ignored):', cleanupErr)
    }
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes