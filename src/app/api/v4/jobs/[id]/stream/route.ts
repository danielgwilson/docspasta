import { NextRequest } from 'next/server'
import { createResumableStreamContext } from 'resumable-stream'
import { createClient } from 'redis'
import { waitUntil } from '@vercel/functions'
import PQueue from 'p-queue'
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
      let isShuttingDown = false
      
      // Create p-queue for concurrency control
      const queue = new PQueue({ concurrency: MAX_CONCURRENT_CRAWLS })
      
      // In-memory tracking
      const processedUrls = new Set<string>()
      const discoveredUrls = new Set<string>()
      
      // Variables to be set after job is loaded
      let job: any
      let forceRefresh: boolean
      
      // Function to process a single URL
      const processUrl = async (url: string, depth: number) => {
        // Skip if already processed or shutting down
        if (processedUrls.has(url) || isShuttingDown) {
          return
        }
        
        try {
          // Mark as processed immediately to avoid duplicates
          processedUrls.add(url)
          
          // Send url_started event
          const startEvent = {
            type: 'url_started',
            url,
            depth,
            timestamp: new Date().toISOString()
          }
          controller.enqueue(`event: url_started\ndata: ${JSON.stringify(startEvent)}\nid: start-${Date.now()}-${Math.random()}\n\n`)
          await storeSSEEvent(jobId, 'url_started', startEvent)
          
          // Call crawler for single URL
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/v4/crawl`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                jobId, 
                urls: [{ url, depth }],
                originalJobUrl: job.url,
                forceRefresh
              }),
              signal: AbortSignal.timeout(30000) // 30s timeout
            }
          )
          
          if (!response.ok) {
            throw new Error(`Crawler responded with ${response.status}`)
          }
          
          const result = await response.json()
          
          // Process the result
          if (result.completed && result.completed.length > 0) {
            const crawled = result.completed[0]
            totalProcessed++
            
            // Send url_crawled event
            const crawledEvent = {
              type: 'url_crawled',
              url: crawled.url,
              success: true,
              content_length: crawled.content?.length || 0,
              title: crawled.title,
              quality: crawled.quality,
              timestamp: new Date().toISOString()
            }
            controller.enqueue(`event: url_crawled\ndata: ${JSON.stringify(crawledEvent)}\nid: crawled-${Date.now()}-${Math.random()}\n\n`)
            await storeSSEEvent(jobId, 'url_crawled', crawledEvent)
            
            // Handle discovered URLs
            if (crawled.discoveredUrls && crawled.discoveredUrls.length > 0 && depth < 3) {
              const newUrls = crawled.discoveredUrls.filter((u: string) => !processedUrls.has(u) && !discoveredUrls.has(u))
              
              if (newUrls.length > 0) {
                newUrls.forEach((u: string) => discoveredUrls.add(u))
                totalDiscovered += newUrls.length
                
                // Send urls_discovered event
                const discoveredEvent = {
                  type: 'urls_discovered',
                  source_url: crawled.url,
                  discovered_urls: newUrls,
                  count: newUrls.length,
                  total_discovered: totalDiscovered,
                  timestamp: new Date().toISOString()
                }
                controller.enqueue(`event: urls_discovered\ndata: ${JSON.stringify(discoveredEvent)}\nid: discovered-${Date.now()}-${Math.random()}\n\n`)
                await storeSSEEvent(jobId, 'urls_discovered', discoveredEvent)
                
                // Add discovered URLs to queue (don't await, let them process in parallel)
                if (!isShuttingDown) {
                  newUrls.forEach((newUrl: string) => {
                    queue.add(() => processUrl(newUrl, depth + 1))
                  })
                }
              }
            }
            
            // Send to processing endpoint
            if (crawled.content) {
              const processResult = {
                url: crawled.url,
                content: crawled.content,
                title: crawled.title || crawled.url,
                quality: crawled.quality || { score: 0, reason: 'unknown' },
                wordCount: crawled.content.split(/\s+/).length
              }
              
              // Send sent_to_processing event
              const processingEvent = {
                type: 'sent_to_processing',
                url: crawled.url,
                word_count: processResult.wordCount,
                timestamp: new Date().toISOString()
              }
              controller.enqueue(`event: sent_to_processing\ndata: ${JSON.stringify(processingEvent)}\nid: processing-${Date.now()}-${Math.random()}\n\n`)
              await storeSSEEvent(jobId, 'sent_to_processing', processingEvent)
              
              // Fire and forget - don't await
              fetch(
                `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/v4/process`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ jobId, results: [processResult] })
                }
              ).catch(err => console.error('Process endpoint failed:', err))
            }
            
            // Send progress event
            const progressEvent = {
              type: 'progress',
              processed: totalProcessed,
              discovered: totalDiscovered,
              queued: queue.size,
              pending: queue.pending,
              timestamp: new Date().toISOString()
            }
            controller.enqueue(`event: progress\ndata: ${JSON.stringify(progressEvent)}\nid: progress-${Date.now()}-${Math.random()}\n\n`)
            await storeSSEEvent(jobId, 'progress', progressEvent)
            
          } else if (result.failed && result.failed.length > 0) {
            // Handle failed crawl
            const failed = result.failed[0]
            const errorEvent = {
              type: 'url_failed',
              url: failed.url,
              error: failed.error || 'Unknown error',
              timestamp: new Date().toISOString()
            }
            controller.enqueue(`event: url_failed\ndata: ${JSON.stringify(errorEvent)}\nid: failed-${Date.now()}-${Math.random()}\n\n`)
            await storeSSEEvent(jobId, 'url_failed', errorEvent)
          }
          
        } catch (error) {
          // Handle crawl error
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          const errorEvent = {
            type: 'url_failed',
            url,
            error: errorMessage,
            timestamp: new Date().toISOString()
          }
          controller.enqueue(`event: url_failed\ndata: ${JSON.stringify(errorEvent)}\nid: failed-${Date.now()}-${Math.random()}\n\n`)
          await storeSSEEvent(jobId, 'url_failed', errorEvent)
        }
      }
      
      // Heartbeat function
      const sendHeartbeat = () => {
        const now = Date.now()
        if (now - lastHeartbeat > HEARTBEAT_INTERVAL_MS && !isShuttingDown) {
          controller.enqueue(`: heartbeat\n\n`)
          lastHeartbeat = now
        }
      }
      
      // Set up heartbeat interval
      const heartbeatInterval = setInterval(sendHeartbeat, 1000)
      
      try {
        // Verify job exists and belongs to user
        job = await getJob(jobId, userId)
        if (!job) {
          controller.enqueue(`event: error\ndata: ${JSON.stringify({ error: 'Job not found' })}\nid: error-${Date.now()}\n\n`)
          controller.close()
          return
        }
        
        // Check if this is a force refresh job
        forceRefresh = job.error_message === 'FORCE_REFRESH'
        
        // Send initial connection event
        controller.enqueue(`event: stream_connected\ndata: ${JSON.stringify({ jobId, url: job.url })}\nid: connected-${Date.now()}\n\n`)
        
        // Store connection event in database
        await storeSSEEvent(jobId, 'stream_connected', { jobId, url: job.url })
        
        // Start processing the initial URL
        queue.add(() => processUrl(job.url, 0))
        
        // Monitor queue until completion or timeout
        while (Date.now() - startTime < TIMEOUT_MS) {
          // Check if queue is empty and no pending tasks
          if (queue.size === 0 && queue.pending === 0) {
            // Wait a bit to ensure no more URLs are being added
            await new Promise(resolve => setTimeout(resolve, 1000))
            
            // Double-check queue is still empty
            if (queue.size === 0 && queue.pending === 0) {
              // We're done!
              break
            }
          }
          
          // Brief pause to prevent tight loop
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        
        // Mark as shutting down to prevent new URLs from being added
        isShuttingDown = true
        
        // Wait for any remaining tasks to complete (with timeout)
        const shutdownTimeout = 10000 // 10 seconds
        const shutdownStart = Date.now()
        while (queue.pending > 0 && Date.now() - shutdownStart < shutdownTimeout) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        
        // Clear heartbeat interval
        clearInterval(heartbeatInterval)
        
        // Determine final status
        const timedOut = Date.now() - startTime >= TIMEOUT_MS
        const finalStatus = timedOut ? 'timeout' : (totalProcessed === 0 ? 'failed' : 'completed')
        const statusMessage = timedOut 
          ? 'Job exceeded 5-minute limit' 
          : (totalProcessed === 0 ? 'No URLs were successfully crawled' : undefined)
        
        console.log(`${totalProcessed === 0 ? '❌' : '✅'} Job ${jobId} ${finalStatus} - processed ${totalProcessed} URLs`)
        await updateJobStatus(jobId, finalStatus, statusMessage)
        
        // Send final event
        const finalEvent = {
          type: timedOut ? 'job_timeout' : (totalProcessed === 0 ? 'job_failed' : 'job_completed'),
          jobId,
          totalProcessed,
          totalDiscovered,
          timestamp: new Date().toISOString(),
          ...(statusMessage && { message: statusMessage })
        }
        controller.enqueue(`event: ${finalEvent.type}\ndata: ${JSON.stringify(finalEvent)}\nid: ${finalStatus}-${Date.now()}\n\n`)
        await storeSSEEvent(jobId, finalEvent.type, finalEvent)
        
      } catch (error) {
        console.error('Orchestrator error:', error)
        clearInterval(heartbeatInterval)
        isShuttingDown = true
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        
        await updateJobStatus(jobId, 'failed', errorMessage)
        const failedEvent = {
          type: 'job_failed',
          jobId,
          error: errorMessage,
          timestamp: new Date().toISOString()
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
      publisher,
      subscriber,
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