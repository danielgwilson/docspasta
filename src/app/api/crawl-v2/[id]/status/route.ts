import { NextRequest } from 'next/server'
import { getCrawl } from '@/lib/crawler/crawl-redis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes for long crawls

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const crawlId = params.id
  
  console.log(`📡 Starting SSE polling stream for crawl: ${crawlId}`)

  // Create SSE stream with polling (Upstash Redis doesn't support pub/sub)
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      let heartbeatInterval: NodeJS.Timeout | null = null
      let pollingInterval: NodeJS.Timeout | null = null
      let isConnected = true
      let lastStatus = ''
      let lastProcessed = 0
      
      // Send SSE event
      const send = (data: any) => {
        if (!isConnected) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch (error) {
          console.error('Failed to send SSE event:', error)
          isConnected = false
        }
      }
      
      // Send initial connection event
      send({ type: 'connected', crawlId, timestamp: Date.now() })
      
      // Setup heartbeat to prevent timeout
      heartbeatInterval = setInterval(() => {
        if (isConnected) {
          send({ type: 'heartbeat', timestamp: Date.now() })
        }
      }, 30000) // Every 30 seconds
      
      // Poll crawl status instead of using pub/sub
      let retryCount = 0
      const maxRetries = 15 // Try for 30 seconds (15 * 2 seconds)
      
      const pollCrawlStatus = async () => {
        if (!isConnected) return
        
        try {
          console.log(`📡 SSE polling for crawl: ${crawlId}`)
          const currentCrawl = await getCrawl(crawlId)
          console.log(`📡 SSE getCrawl result:`, currentCrawl ? 'FOUND' : 'NOT_FOUND')
          
          if (!currentCrawl) {
            retryCount++
            if (retryCount <= maxRetries) {
              // Crawl might not be saved yet, wait and retry
              console.log(`📡 Crawl ${crawlId} not found yet, retry ${retryCount}/${maxRetries}`)
              return
            } else {
              console.error(`📡 FAILED: Crawl ${crawlId} not found after ${maxRetries} retries`)
              send({ 
                type: 'error', 
                message: `Crawl ${crawlId} not found after ${maxRetries} retries`,
                timestamp: Date.now()
              })
              controller.close()
              return
            }
          }
          
          // Reset retry count once we find the crawl
          retryCount = 0
          
          // Send initial status on first poll
          if (lastStatus === '') {
            send({ 
              type: 'initial_status', 
              crawlId,
              status: currentCrawl.status,
              progress: currentCrawl.progress,
              timestamp: Date.now()
            })
            lastStatus = currentCrawl.status
            lastProcessed = currentCrawl.progress?.processed || 0
          }
          
          // Check for status or progress changes
          const statusChanged = currentCrawl.status !== lastStatus
          const progressChanged = (currentCrawl.progress?.processed || 0) !== lastProcessed
          
          if (statusChanged || progressChanged) {
            send({ 
              type: 'progress',
              crawlId,
              phase: currentCrawl.progress?.phase,
              processed: currentCrawl.progress?.processed,
              total: currentCrawl.progress?.total,
              percentage: currentCrawl.progress?.percentage,
              discoveredUrls: currentCrawl.progress?.discovered,
              failedUrls: currentCrawl.progress?.failed,
              currentActivity: currentCrawl.progress?.message,
              timestamp: Date.now()
            })
            
            lastStatus = currentCrawl.status
            lastProcessed = currentCrawl.progress?.processed || 0
          }
          
          // If completed or failed, send final event and close
          if (currentCrawl.status === 'completed' || currentCrawl.status === 'failed') {
            send({ 
              type: 'completed', 
              crawlId,
              status: currentCrawl.status,
              results: currentCrawl.results,
              markdown: currentCrawl.markdown,
              timestamp: Date.now()
            })
            
            // Close stream after completion
            setTimeout(() => {
              cleanup()
              controller.close()
            }, 1000)
            return
          }
          
        } catch (error) {
          console.error('Error polling crawl status:', error)
          send({ 
            type: 'error', 
            message: 'Failed to check crawl status',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now()
          })
        }
      }
      
      // Start polling every 2 seconds
      pollingInterval = setInterval(pollCrawlStatus, 2000)
      
      // Do initial poll immediately
      pollCrawlStatus()
      
      // Cleanup function
      const cleanup = () => {
        isConnected = false
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval)
          heartbeatInterval = null
        }
        if (pollingInterval) {
          clearInterval(pollingInterval)
          pollingInterval = null
        }
        console.log(`📡 SSE cleanup completed for crawl: ${crawlId}`)
      }
      
      // Handle client disconnect
      request.signal.addEventListener('abort', cleanup)
    },
    
    cancel() {
      console.log(`📡 SSE stream cancelled for crawl: ${crawlId}`)
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Vercel-specific header for SSE
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  })
}