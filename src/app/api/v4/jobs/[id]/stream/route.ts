import { NextRequest } from 'next/server'
import { createResumableStreamContext } from 'resumable-stream'
import { createClient } from 'redis'
import { waitUntil } from '@vercel/functions'
import { 
  addUrlsToQueue, 
  getNextBatch, 
  markUrlsProcessing,
  updateJobStatus,
  getJob
} from '@/lib/serverless/db-operations'

// Create Redis client helper
function createRedisClient() {
  const redisUrl = process.env.REDIS_URL || process.env.KV_URL
  if (!redisUrl) {
    throw new Error('REDIS_URL or KV_URL environment variable is required')
  }
  return createClient({ url: redisUrl })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params
  
  console.log(`🚀 Starting V4 orchestrator for job: ${jobId}`)
  
  // Create Redis clients for resumable-stream
  const publisher = createRedisClient()
  const subscriber = createRedisClient()
  
  publisher.on('error', (err) => console.error('Redis Publisher Error:', err))
  subscriber.on('error', (err) => console.error('Redis Subscriber Error:', err))
  
  try {
    await Promise.all([
      publisher.connect(),
      subscriber.connect()
    ])
    
    // Create resumable stream context with waitUntil for Node.js runtime
    const streamContext = createResumableStreamContext({
      redis: { publisher, subscriber },
      waitUntil // Required for Node.js runtime
    })
    
    // Create the stream - resumable-stream handles all SSE protocol details
    const stream = await streamContext.resumableStream(
      `v4-job-${jobId}`, // Unique stream key
      () => {
        // Return a ReadableStream that orchestrates the crawl
        return new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder()
            const startTime = Date.now()
            const TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
            
            // Helper to send SSE events
            const sendEvent = (type: string, data: any, id?: string) => {
              const eventId = id || `${type}-${Date.now()}`
              let message = ''
              if (type !== 'heartbeat') {
                message += `event: ${type}\n`
                message += `data: ${JSON.stringify(data)}\n`
                message += `id: ${eventId}\n\n`
              } else {
                message = ': heartbeat\n\n'
              }
              controller.enqueue(encoder.encode(message))
            }
            
            try {
              // Get job details
              const job = await getJob(jobId)
              if (!job) {
                sendEvent('error', { error: 'Job not found' })
                controller.close()
                return
              }
              
              // Send initial connection event
              sendEvent('stream_connected', { jobId, url: job.url })
              
              // Main orchestration loop
              while (Date.now() - startTime < TIMEOUT_MS) {
                // Check if client disconnected
                if (request.signal.aborted) {
                  console.log('Client disconnected, stopping orchestration')
                  break
                }
                
                // Get next batch from queue
                const batch = await getNextBatch(jobId, 10)
                
                if (batch.length === 0) {
                  // No more URLs - job complete
                  await updateJobStatus(jobId, 'completed')
                  sendEvent('job_completed', { jobId })
                  break
                }
                
                // Mark URLs as processing
                const urlIds = batch.map(item => item.id)
                await markUrlsProcessing(urlIds)
                
                try {
                  // Call the stateless crawler function
                  const response = await fetch(
                    `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/v4/crawl`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        jobId, 
                        urls: batch.map(item => ({
                          id: item.id,
                          url: item.url,
                          depth: item.depth
                        })),
                        originalJobUrl: job.url
                      }),
                      signal: AbortSignal.timeout(35000) // 35s timeout
                    }
                  )
                  
                  if (!response.ok) {
                    console.error('Crawler failed:', await response.text())
                    continue
                  }
                  
                  const results = await response.json()
                  
                  // Send batch results
                  sendEvent('batch_completed', {
                    completed: results.completed.length,
                    failed: results.failed.length,
                    discovered: results.discoveredUrls?.length || 0,
                    fromCache: results.completed.filter((r: any) => r.fromCache).length
                  })
                  
                  // Add discovered URLs to queue
                  if (results.discoveredUrls?.length > 0) {
                    const currentDepth = Math.max(...batch.map(item => item.depth))
                    if (currentDepth < 2) { // Max depth of 2
                      const newUrls = await addUrlsToQueue(
                        jobId, 
                        results.discoveredUrls,
                        currentDepth + 1
                      )
                      
                      sendEvent('urls_discovered', {
                        count: newUrls,
                        depth: currentDepth + 1
                      })
                    }
                  }
                  
                  // Trigger content processor (async, don't await)
                  if (results.completed.length > 0) {
                    fetch(
                      `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/v4/process`,
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                          jobId, 
                          results: results.completed 
                        })
                      }
                    ).catch(error => {
                      console.error('Failed to call processor:', error)
                    })
                  }
                  
                } catch (error) {
                  console.error('Crawler error:', error)
                  sendEvent('batch_error', {
                    error: error instanceof Error ? error.message : 'Unknown error'
                  })
                }
                
                // Send heartbeat every 10 seconds
                if (Date.now() % 10000 < 200) {
                  sendEvent('heartbeat', {})
                }
                
                // Brief pause to prevent tight loop
                await new Promise(resolve => setTimeout(resolve, 200))
              }
              
              // Handle timeout
              if (Date.now() - startTime >= TIMEOUT_MS) {
                await updateJobStatus(jobId, 'timeout', 'Job exceeded 5-minute limit')
                sendEvent('job_timeout', { jobId })
              }
              
            } catch (error) {
              console.error('Orchestrator error:', error)
              const errorMessage = error instanceof Error ? error.message : 'Unknown error'
              
              await updateJobStatus(jobId, 'failed', errorMessage)
              sendEvent('job_failed', { error: errorMessage })
            } finally {
              controller.close()
            }
          }
        })
      }
    )
    
    // Return SSE response - resumable-stream handles all the headers
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable Nginx buffering
      }
    })
    
  } catch (error) {
    console.error('Failed to create stream:', error)
    
    // Clean up connections on error
    await Promise.all([
      publisher?.disconnect?.().catch(() => {}),
      subscriber?.disconnect?.().catch(() => {})
    ].filter(Boolean))
    
    return new Response('Internal Server Error', { status: 500 })
  }
}

export const maxDuration = 300 // 5 minutes