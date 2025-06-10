import { NextRequest } from 'next/server'
import { getRedisConnection } from '@/lib/crawler/queue-service'
import { getLatestProgressSnapshot } from '@/lib/crawler/streaming-progress'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: crawlId } = await params

  // 🔒 CRITICAL: Generate unique session ID for this SSE connection
  const sessionId = `sse-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  // Create a transform stream for Server-Sent Events with Redis pub/sub
  const encoder = new TextEncoder()
  let subscriber: ReturnType<typeof getRedisConnection> | null = null
  let isControllerClosed = false
  
  const stream = new ReadableStream({
    async start(controller) {
      console.log(`📡 [${sessionId}] Starting isolated stream for crawl: ${crawlId}`)
      
      try {
        // Send initial connection event with session ID for debugging
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ 
            type: 'connected', 
            crawlId,
            sessionId,
            timestamp: Date.now()
          })}\n\n`)
        )

        // Get initial progress snapshot for recovery
        try {
          const snapshot = await getLatestProgressSnapshot(crawlId)
          
          // Only send snapshot if we have real progress (not default 0/0)
          if (snapshot.total > 0 || snapshot.phase !== 'initializing') {
            const initialUpdate = {
              type: 'progress',
              data: {
                id: crawlId,
                status: snapshot.phase === 'completed' ? 'completed' : 'active',
                progress: {
                  phase: snapshot.phase,
                  current: snapshot.processed,
                  total: snapshot.total,
                  percentage: snapshot.percentage,
                  discovered: snapshot.discoveredUrls,
                  processed: snapshot.processed,
                  message: `Restored: ${snapshot.processed}/${snapshot.total} processed`,
                },
                timestamp: snapshot.timestamp,
              }
            }
            
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(initialUpdate)}\n\n`)
            )
          } else {
            console.log(`📷 No meaningful progress snapshot for crawl ${crawlId}, waiting for real events`)
          }
        } catch {
          console.log(`📷 No progress snapshot for crawl ${crawlId}, will wait for events`)
        }

        // 🔒 CRITICAL: Create isolated Redis subscriber for this specific session
        subscriber = getRedisConnection().duplicate()
        await subscriber.subscribe(`crawl:${crawlId}:progress`)
        
        subscriber.on('message', async (channel: string, message: string) => {
          try {
            // 🔒 SECURITY: Only process events for the exact crawl ID this session is subscribed to
            if (channel !== `crawl:${crawlId}:progress`) {
              console.log(`⚠️  [${sessionId}] Ignoring event from wrong channel: ${channel}`)
              return
            }

            // 🔒 ISOLATION: Check if controller is still open before processing
            if (isControllerClosed) {
              console.log(`⚠️  [${sessionId}] Controller closed, ignoring event`)
              return
            }

            const eventData = JSON.parse(message)
            
            // 🔒 VALIDATION: Double-check that event data matches this crawl ID
            const eventCrawlId = eventData.crawlId || eventData.id
            if (eventCrawlId && eventCrawlId !== crawlId) {
              console.log(`⚠️  [${sessionId}] Event crawl ID mismatch: got ${eventCrawlId}, expected ${crawlId}`)
              return
            }
            
            console.log(`📨 [${sessionId}] Processing event for crawl ${crawlId}:`, eventData.type)
              
              // Convert streaming progress event to SSE format
              let sseUpdate: Record<string, unknown>
              
              if (eventData.type === 'completion') {
                // Fetch the full crawl data to include results
                const { getCrawl } = await import('@/lib/crawler/crawl-redis')
                const crawlData = await getCrawl(crawlId)
                
                if (crawlData && crawlData.results) {
                  // Combine all content into markdown
                  const markdown = crawlData.results
                    .map((r: any) => r.content)
                    .filter(Boolean)
                    .join('\n\n---\n\n')
                  
                  sseUpdate = {
                    type: 'complete',
                    data: {
                      id: crawlId,
                      url: crawlData.url,
                      status: eventData.status === 'failed' ? 'failed' : 'completed',
                      markdown: markdown,
                      totalResults: eventData.totalProcessed || 0,
                      completedAt: eventData.timestamp,
                      errorMessage: eventData.errorMessage,
                      progress: {
                        current: crawlData.totalProcessed,
                        total: crawlData.totalQueued,
                        phase: 'completed' as const,
                        message: `Completed: ${crawlData.totalProcessed} pages processed`,
                        processed: crawlData.totalProcessed,
                        failed: crawlData.totalFailed,
                        discovered: crawlData.results.length
                      }
                    }
                  }
                } else {
                  // Fallback if we can't fetch crawl data
                  sseUpdate = {
                    type: 'complete',
                    data: {
                      id: crawlId,
                      status: eventData.status,
                      markdown: '',
                      totalResults: eventData.totalProcessed || 0,
                      completedAt: eventData.timestamp,
                      errorMessage: eventData.errorMessage || 'No results found',
                    }
                  }
                }
                
                // Close stream after completion
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(sseUpdate)}\n\n`)
                )
                controller.close()
                return
              } else if (eventData.type === 'batch-progress') {
                sseUpdate = {
                  type: 'progress',
                  data: {
                    id: crawlId,
                    status: 'active',
                    progress: {
                      phase: 'crawling',
                      current: eventData.overallProgress.processed,
                      total: eventData.overallProgress.total,
                      percentage: eventData.overallProgress.percentage,
                      batch: {
                        current: eventData.batchNumber,
                        total: eventData.totalBatches,
                        processed: eventData.batchProcessed,
                        failed: eventData.batchFailed,
                      },
                      message: `Batch ${eventData.batchNumber}/${eventData.totalBatches} completed`,
                    },
                    timestamp: eventData.timestamp,
                  }
                }
              } else if (eventData.type === 'url-discovery') {
                sseUpdate = {
                  type: 'progress',
                  data: {
                    id: crawlId,
                    status: 'active',
                    progress: {
                      phase: 'discovery',
                      discovered: eventData.totalDiscovered,
                      newUrls: eventData.newUrls,
                      duplicateUrls: eventData.duplicateUrls,
                      source: eventData.source,
                      message: `Discovered ${eventData.newUrls} new URLs from ${eventData.source}`,
                    },
                    timestamp: eventData.timestamp,
                  }
                }
              } else {
                // Regular progress event
                sseUpdate = {
                  type: 'progress',
                  data: {
                    id: crawlId,
                    status: eventData.phase === 'completed' || eventData.phase === 'failed' ? eventData.phase : 'active',
                    progress: {
                      phase: eventData.phase,
                      current: eventData.processed,
                      total: eventData.total,
                      percentage: eventData.percentage,
                      discovered: eventData.discoveredUrls,
                      processed: eventData.processed,
                      failed: eventData.failedUrls,
                      currentUrl: eventData.currentUrl,
                      currentActivity: eventData.currentActivity,
                      message: eventData.currentActivity || `${eventData.processed}/${eventData.total} processed`,
                    },
                    timestamp: eventData.timestamp,
                  }
                }
              }

              // 🔒 SAFETY: Final check before sending event
              if (!isControllerClosed) {
                try {
                  // Add session metadata for debugging
                  const eventWithSession = {
                    ...sseUpdate,
                    _sessionId: sessionId,
                    _crawlId: crawlId
                  }
                  
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(eventWithSession)}\n\n`)
                  )
                  console.log(`✅ [${sessionId}] Event sent successfully for crawl ${crawlId}`)
                } catch (enqueueError) {
                  console.error(`❌ [${sessionId}] Failed to enqueue event:`, enqueueError)
                  isControllerClosed = true
                }
              }
          } catch (parseError) {
            console.error('Error parsing progress event:', parseError)
          }
        })

        subscriber.on('error', (error: Error) => {
          console.error(`❌ [${sessionId}] Redis subscription error for crawl ${crawlId}:`, error)
          
          // 🔒 SAFETY: Only send error if controller is still open
          if (!isControllerClosed) {
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ 
                  type: 'error', 
                  error: 'Subscription error',
                  sessionId,
                  crawlId
                })}\n\n`)
              )
            } catch (err) {
              console.error(`❌ [${sessionId}] Failed to send error event:`, err)
            }
            isControllerClosed = true
            controller.close()
          }
        })

        console.log(`✅ [${sessionId}] Isolated stream established for crawl: ${crawlId}`)
        
      } catch (error) {
        console.error(`❌ [${sessionId}] Error setting up stream for crawl ${crawlId}:`, error)
        
        // 🔒 SAFETY: Mark as closed and cleanup
        isControllerClosed = true
        
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ 
              type: 'error', 
              error: 'Failed to establish stream',
              sessionId,
              crawlId
            })}\n\n`)
          )
        } catch (err) {
          console.error(`❌ [${sessionId}] Failed to send setup error:`, err)
        }
        controller.close()
      }
    },
    
    cancel() {
      console.log(`📡 [${sessionId}] Client disconnected from stream: ${crawlId}`)
      isControllerClosed = true
      
      // 🔒 CLEANUP: Properly cleanup Redis subscriber for this session
      if (subscriber) {
        try {
          subscriber.unsubscribe(`crawl:${crawlId}:progress`)
          subscriber.quit()
          console.log(`🧹 [${sessionId}] Redis subscriber cleaned up for crawl ${crawlId}`)
        } catch (cleanupError) {
          console.error(`⚠️  [${sessionId}] Error during Redis cleanup:`, cleanupError)
        }
      }
    }
  })

  // 🔒 CRITICAL: Enhanced cleanup on request abort to prevent contamination
  request.signal.addEventListener('abort', () => {
    console.log(`🛑 [${sessionId}] Request aborted for crawl ${crawlId}`)
    isControllerClosed = true
    
    if (subscriber) {
      try {
        subscriber.unsubscribe(`crawl:${crawlId}:progress`)
        subscriber.quit()
        console.log(`🧹 [${sessionId}] Abort cleanup completed for crawl ${crawlId}`)
      } catch (abortError) {
        console.error(`⚠️  [${sessionId}] Error during abort cleanup:`, abortError)
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',  // 🔒 Prevent caching/transformation
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',  // 🔒 Prevent proxy buffering  
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  })
}