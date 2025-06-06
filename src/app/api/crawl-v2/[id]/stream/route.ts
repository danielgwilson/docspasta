import { NextRequest } from 'next/server'
import { getCrawl } from '@/lib/crawler/crawl-redis'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id: crawlId } = params

  // Create a readable stream for Server-Sent Events
  const encoder = new TextEncoder()
  
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', crawlId })}\n\n`)
      )
    },
    
    async cancel() {
      console.log(`📡 Client disconnected from crawl stream: ${crawlId}`)
    }
  })

  // Set up polling to send updates
  const interval = setInterval(async () => {
    try {
      const crawl = await getCrawl(crawlId)
      
      if (!crawl) {
        // Crawl not found, send error and close
        const writer = stream.getWriter()
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            error: 'Crawl not found' 
          })}\n\n`)
        )
        await writer.close()
        clearInterval(interval)
        return
      }

      // Send progress update
      const update = {
        type: 'progress',
        data: {
          id: crawl.id,
          status: crawl.status,
          progress: {
            ...crawl.progress,
            current: crawl.totalProcessed,
            total: crawl.totalDiscovered,
          },
          totalResults: crawl.results.length,
          timestamp: Date.now(),
        }
      }

      const writer = stream.getWriter()
      await writer.write(
        encoder.encode(`data: ${JSON.stringify(update)}\n\n`)
      )
      writer.releaseLock()

      // If crawl is complete, send final event and close
      if (crawl.status === 'completed' || crawl.status === 'failed' || crawl.status === 'cancelled') {
        const finalUpdate = {
          type: 'complete',
          data: {
            id: crawl.id,
            status: crawl.status,
            totalResults: crawl.results.length,
            completedAt: crawl.completedAt,
            errorMessage: crawl.errorMessage,
          }
        }

        const finalWriter = stream.getWriter()
        await finalWriter.write(
          encoder.encode(`data: ${JSON.stringify(finalUpdate)}\n\n`)
        )
        await finalWriter.close()
        clearInterval(interval)
      }
    } catch (error) {
      console.error('Error in crawl stream:', error)
      
      try {
        const writer = stream.getWriter()
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            error: 'Stream error' 
          })}\n\n`)
        )
        await writer.close()
      } catch (closeError) {
        console.error('Error closing stream:', closeError)
      }
      
      clearInterval(interval)
    }
  }, 1000) // Poll every second

  // Clean up interval if stream is aborted
  request.signal.addEventListener('abort', () => {
    clearInterval(interval)
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