import { NextRequest } from 'next/server'
import { createResumableStreamContext } from 'resumable-stream'
import { createClient } from 'redis'
import { waitUntil } from '@vercel/functions'
import { 
  getJob, 
  updateJobStatus,
  storeSSEEvent,
  updateJobMetrics
} from '@/lib/serverless/db-operations-simple'
import { getCurrentUser } from '@/lib/auth/middleware'

// Create Redis client helper
function createRedisClient() {
  const redisUrl = process.env.REDIS_URL || process.env.KV_URL
  if (!redisUrl) {
    throw new Error('REDIS_URL or KV_URL environment variable is required')
  }
  return createClient({ url: redisUrl })
}

// The orchestrator - runs for up to 5 minutes processing URLs
function makeJobStream(streamId: string, userId: string): ReadableStream<string> {
  const jobId = streamId.replace('v4-job-', '')
  
  return new ReadableStream<string>({
    async start(controller) {
      const startTime = Date.now()
      const TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
      const HEARTBEAT_INTERVAL_MS = 10000 // 10 seconds
      const MAX_CONCURRENT_CRAWLS = 10 // Limit concurrent crawls
      
      let lastHeartbeat = Date.now()
      let totalProcessed = 0
      let totalDiscovered = 0
      
      // In-memory queue of URLs to process
      const urlQueue: { url: string; depth: number }[] = []
      const processedUrls = new Set<string>()
      const processingUrls = new Set<string>()
      
      try {
        // Verify job exists and belongs to user
        const job = await getJob(jobId, userId)
        if (!job) {
          controller.enqueue(`event: error\ndata: ${JSON.stringify({ error: 'Job not found' })}\nid: error-${Date.now()}\n\n`)
          controller.close()
          return
        }
        
        // Check if this is a force refresh job
        const forceRefresh = job.error_message === 'FORCE_REFRESH'
        
        // Send initial connection event
        controller.enqueue(`event: stream_connected\ndata: ${JSON.stringify({ jobId, url: job.url })}\nid: connected-${Date.now()}\n\n`)
        
        // Store connection event in database
        await storeSSEEvent(jobId, 'stream_connected', { jobId, url: job.url })
        
        // Start with the initial URL
        urlQueue.push({ url: job.url, depth: 0 })
        
        // Main orchestration loop
        while (Date.now() - startTime < TIMEOUT_MS) {
          // Send heartbeat if needed
          const now = Date.now()
          if (now - lastHeartbeat > HEARTBEAT_INTERVAL_MS) {
            controller.enqueue(`: heartbeat\n\n`)
            lastHeartbeat = now
          }
          
          // Collect URLs to crawl in this batch
          const batch: { url: string; depth: number }[] = []
          
          while (urlQueue.length > 0 && batch.length < MAX_CONCURRENT_CRAWLS && processingUrls.size < MAX_CONCURRENT_CRAWLS) {
            const item = urlQueue.shift()!
            
            // Skip if already processed or processing
            if (processedUrls.has(item.url) || processingUrls.has(item.url)) {
              continue
            }
            
            processingUrls.add(item.url)
            batch.push(item)
          }
          
          // If we have URLs to crawl, process them
          if (batch.length > 0) {
            try {
              // Call crawler with batch
              const response = await fetch(
                `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/v4/crawl`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    jobId, 
                    urls: batch.map(item => ({
                      url: item.url,
                      depth: item.depth
                    })),
                    originalJobUrl: job.url,
                    forceRefresh
                  }),
                  signal: AbortSignal.timeout(30000) // 30s timeout
                }
              )
              
              if (!response.ok) {
                console.error('Crawler failed:', response.status)
                // Mark URLs as processed anyway to avoid infinite loop
                batch.forEach(item => {
                  processingUrls.delete(item.url)
                  processedUrls.add(item.url)
                })
                continue
              }
              
              const result = await response.json()
              
              // Process successful crawls
              if (result.completed) {
                for (const crawled of result.completed) {
                  processingUrls.delete(crawled.url)
                  processedUrls.add(crawled.url)
                  totalProcessed++
                  
                  // Send progress event
                  const progressEvent = {
                    type: 'url_processed',
                    url: crawled.url,
                    success: true,
                    discovered: crawled.discoveredUrls?.length || 0,
                    totalProcessed,
                    totalDiscovered
                  }
                  controller.enqueue(`event: progress\ndata: ${JSON.stringify(progressEvent)}\nid: progress-${Date.now()}\n\n`)
                  await storeSSEEvent(jobId, 'progress', progressEvent)
                  
                  // Add discovered URLs to queue
                  if (crawled.discoveredUrls && crawled.depth < 3) {
                    for (const newUrl of crawled.discoveredUrls) {
                      if (!processedUrls.has(newUrl) && !processingUrls.has(newUrl)) {
                        urlQueue.push({ url: newUrl, depth: crawled.depth + 1 })
                        totalDiscovered++
                      }
                    }
                  }
                }
              }
              
              // Process failed crawls
              if (result.failed) {
                for (const failed of result.failed) {
                  processingUrls.delete(failed.url)
                  processedUrls.add(failed.url)
                  
                  const errorEvent = {
                    type: 'url_failed',
                    url: failed.url,
                    error: failed.error || 'Unknown error'
                  }
                  controller.enqueue(`event: error\ndata: ${JSON.stringify(errorEvent)}\nid: error-${Date.now()}\n\n`)
                  await storeSSEEvent(jobId, 'error', errorEvent)
                }
              }
              
              // Send results to processing endpoint asynchronously
              if (result.completed && result.completed.length > 0) {
                const processResults = result.completed.map((item: any) => ({
                  url: item.url,
                  content: item.content,
                  title: item.title || item.url,
                  quality: item.quality || { score: 0, reason: 'unknown' },
                  wordCount: item.content ? item.content.split(/\s+/).length : 0
                }))
                
                // Fire and forget - don't await
                fetch(
                  `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/v4/process`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jobId, results: processResults })
                  }
                ).catch(err => console.error('Process endpoint failed:', err))
              }
              
            } catch (error) {
              console.error('Batch crawl error:', error)
              // Mark all URLs in batch as processed to avoid infinite loop
              batch.forEach(item => {
                processingUrls.delete(item.url)
                processedUrls.add(item.url)
              })
            }
          }
          
          // Check if we're done
          if (urlQueue.length === 0 && processingUrls.size === 0) {
            // Determine final status based on what was processed
            const finalStatus = totalProcessed === 0 ? 'failed' : 'completed'
            const statusMessage = totalProcessed === 0 ? 'No URLs were successfully crawled' : undefined
            
            console.log(`${totalProcessed === 0 ? '❌' : '✅'} Job ${jobId} ${finalStatus} - processed ${totalProcessed} URLs`)
            await updateJobStatus(jobId, finalStatus, statusMessage)
            
            const completedEvent = {
              type: totalProcessed === 0 ? 'job_failed' : 'job_completed',
              jobId,
              totalProcessed,
              totalDiscovered,
              ...(totalProcessed === 0 && { error: 'No URLs were successfully crawled' })
            }
            controller.enqueue(`event: ${completedEvent.type}\ndata: ${JSON.stringify(completedEvent)}\nid: ${finalStatus}-${Date.now()}\n\n`)
            await storeSSEEvent(jobId, completedEvent.type, completedEvent)
            break
          }
          
          // Brief pause to prevent tight loop
          await new Promise(resolve => setTimeout(resolve, 500))
        }
        
        // Handle timeout
        if (Date.now() - startTime >= TIMEOUT_MS) {
          await updateJobStatus(jobId, 'timeout', 'Job exceeded 5-minute limit')
          const timeoutEvent = {
            type: 'job_timeout',
            jobId,
            totalProcessed,
            totalDiscovered
          }
          controller.enqueue(`event: job_timeout\ndata: ${JSON.stringify(timeoutEvent)}\nid: timeout-${Date.now()}\n\n`)
          await storeSSEEvent(jobId, 'job_timeout', timeoutEvent)
        }
        
      } catch (error) {
        console.error('Orchestrator error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        
        await updateJobStatus(jobId, 'failed', errorMessage)
        const failedEvent = {
          type: 'job_failed',
          error: errorMessage
        }
        controller.enqueue(`event: job_failed\ndata: ${JSON.stringify(failedEvent)}\nid: failed-${Date.now()}\n\n`)
        await storeSSEEvent(jobId, 'job_failed', failedEvent)
      } finally {
        controller.close()
      }
    }
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params
  const resumeAt = request.nextUrl.searchParams.get("resumeAt")
  
  // Get current user (authenticated or anonymous)
  const user = await getCurrentUser(request)
  
  console.log(`🚀 Starting V4 orchestrator stream for job: ${jobId} (user: ${user.id})${resumeAt ? ` (resuming from ${resumeAt})` : ''}`)
  
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
    
    // Create resumable stream - pass a closure that captures userId
    const stream = await streamContext.resumableStream(
      `v4-job-${jobId}`,
      () => makeJobStream(`v4-job-${jobId}`, user.id),
      resumeAt ? parseInt(resumeAt) : undefined
    )
    
    if (!stream) {
      await cleanup()
      return new Response("Stream is already done", { status: 422 })
    }
    
    // Set up cleanup on request abort
    request.signal.addEventListener('abort', () => {
      console.log('Request aborted, cleaning up Redis connections')
      waitUntil(cleanup())
    })
    
    // Schedule cleanup after response (don't consume the stream here)
    waitUntil(
      new Promise((resolve) => {
        // Clean up after a delay to ensure stream has been consumed
        setTimeout(async () => {
          await cleanup()
          resolve(undefined)
        }, 310000) // 5 minutes + 10 seconds buffer
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