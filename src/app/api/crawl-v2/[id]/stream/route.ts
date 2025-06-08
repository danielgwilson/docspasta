import { NextRequest } from 'next/server'
import { getRedisConnection } from '@/lib/crawler/queue-service'
import { getLatestProgressSnapshot } from '@/lib/crawler/streaming-progress'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: crawlId } = await params

  // Create a transform stream for Server-Sent Events with Redis pub/sub
  const encoder = new TextEncoder()
  let subscriber: ReturnType<typeof getRedisConnection> | null = null
  
  const stream = new ReadableStream({
    async start(controller) {
      console.log(`📡 Starting real-time stream for crawl: ${crawlId}`)
      
      try {
        // Send initial connection event
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'connected', crawlId })}\n\n`)
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

        // Set up Redis subscription for real-time updates
        subscriber = getRedisConnection().duplicate()
        await subscriber.subscribe(`crawl:${crawlId}:progress`)
        
        subscriber.on('message', async (channel: string, message: string) => {
          try {
            if (channel === `crawl:${crawlId}:progress`) {
              const eventData = JSON.parse(message)
              
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

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(sseUpdate)}\n\n`)
              )
            }
          } catch (parseError) {
            console.error('Error parsing progress event:', parseError)
          }
        })

        subscriber.on('error', (error: Error) => {
          console.error('Redis subscription error:', error)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ 
              type: 'error', 
              error: 'Subscription error' 
            })}\n\n`)
          )
          controller.close()
        })

        console.log(`✅ Real-time stream established for crawl: ${crawlId}`)
        
      } catch (error) {
        console.error('Error setting up stream:', error)
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            error: 'Failed to establish stream' 
          })}\n\n`)
        )
        controller.close()
      }
    },
    
    cancel() {
      console.log(`📡 Client disconnected from real-time stream: ${crawlId}`)
      if (subscriber) {
        subscriber.unsubscribe()
        subscriber.quit()
      }
    }
  })

  // Clean up subscription if request is aborted
  request.signal.addEventListener('abort', () => {
    if (subscriber) {
      subscriber.unsubscribe()
      subscriber.quit()
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  })
}