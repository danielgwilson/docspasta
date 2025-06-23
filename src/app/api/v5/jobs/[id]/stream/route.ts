import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/middleware'
import { db } from '@/lib/db/connection'
import { crawlingJobs, crawledPages } from '@/lib/db/schema'
import { eq, and, count, sum } from 'drizzle-orm'
import { getJobStatistics } from '@/lib/v5-state-management'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserContext(request)
    const { id: jobId } = await params
    
    // Get job with user isolation
    const [job] = await db
      .select()
      .from(crawlingJobs)
      .where(and(
        eq(crawlingJobs.id, jobId),
        eq(crawlingJobs.userId, user.userId)
      ))
    
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      )
    }

    // Import resumable-stream and create context
    const { createResumableStreamContext } = await import('resumable-stream')
    
    // Detect test environment and provide appropriate waitUntil function
    const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'
    
    let waitUntilFn
    if (isTestEnvironment) {
      // In test environment, provide a no-op function
      waitUntilFn = (fn: () => Promise<any>) => {
        // Don't actually call the function in tests, just return a resolved promise
        return Promise.resolve()
      }
    } else {
      // In production/development, use the real 'after' function
      const { after } = await import('next/server')
      waitUntilFn = after
    }
    
    // Create resumable stream context (Redis is optional)
    const streamContext = createResumableStreamContext({
      waitUntil: waitUntilFn,
      // Redis will be auto-detected from environment variables if available
    })

    // Check if we should resume from a specific position
    const resumeAt = request.nextUrl.searchParams.get('resumeAt')
    const resumePosition = resumeAt ? parseInt(resumeAt) : undefined

    // Create the stream function that returns a ReadableStream
    function jobProgressStream() {
      const encoder = new TextEncoder()
      let lastStateVersion = resumePosition || 0
      let eventId = lastStateVersion

      return new ReadableStream({
        async start(controller) {
          try {
            while (true) {
              // Get current job state
              const [currentJob] = await db
                .select({
                  id: crawlingJobs.id,
                  status: crawlingJobs.status,
                  stateVersion: crawlingJobs.stateVersion,
                  progressSummary: crawlingJobs.progressSummary,
                  statusMessage: crawlingJobs.statusMessage,
                  finalMarkdown: crawlingJobs.finalMarkdown
                })
                .from(crawlingJobs)
                .where(eq(crawlingJobs.id, jobId))

              if (!currentJob) {
                controller.enqueue(encoder.encode(`id: ${++eventId}
event: error
data: ${JSON.stringify({
                  jobId,
                  error: 'Job not found',
                  timestamp: new Date().toISOString()
                })}

`))
                controller.close()
                return
              }

              // Only send updates if state version changed
              if (currentJob.stateVersion > lastStateVersion) {
                lastStateVersion = currentJob.stateVersion
                eventId = currentJob.stateVersion

                // Get real-time statistics
                const stats = await getJobStatistics(jobId, user.userId)

                // Send progress update with state version as event ID
                controller.enqueue(encoder.encode(`id: ${eventId}
event: progress
data: ${JSON.stringify({
                  jobId,
                  status: currentJob.status,
                  progress: currentJob.progressSummary || {
                    totalProcessed: stats.pagesProcessed,
                    totalDiscovered: stats.pagesFound,
                    totalWords: stats.totalWords
                  },
                  stateVersion: currentJob.stateVersion,
                  timestamp: new Date().toISOString()
                })}

`))

                // Check for completion
                if (currentJob.status === 'completed') {
                  controller.enqueue(encoder.encode(`id: ${eventId}
event: completed
data: ${JSON.stringify({
                    jobId,
                    totalProcessed: stats.pagesProcessed,
                    totalWords: stats.totalWords,
                    finalMarkdown: currentJob.finalMarkdown ? 'available' : 'not_available',
                    timestamp: new Date().toISOString()
                  })}

`))
                  
                  controller.close()
                  return
                }

                // Check for failure
                if (currentJob.status === 'failed') {
                  controller.enqueue(encoder.encode(`id: ${eventId}
event: failed
data: ${JSON.stringify({
                    jobId,
                    error: currentJob.statusMessage || 'Job failed',
                    timestamp: new Date().toISOString()
                  })}

`))
                  
                  controller.close()
                  return
                }
              }

              // Continue polling with 1 second delay
              await new Promise(resolve => setTimeout(resolve, 1000))
            }
            
          } catch (error) {
            console.error('❌ Failed to poll job status:', error)
            controller.enqueue(encoder.encode(`id: ${++eventId}
event: error
data: ${JSON.stringify({
              jobId,
              error: 'Failed to get job updates',
              timestamp: new Date().toISOString()
            })}

`))
            controller.close()
          }
        }
      })
    }

    // Create resumable stream using the context
    const stream = await streamContext.resumableStream(
      `job-${jobId}`, // Unique stream ID
      jobProgressStream,
      resumePosition
    )

    if (!stream) {
      return new Response('Stream is already done', {
        status: 422,
      })
    }

    // Return the stream with proper SSE headers
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control, Last-Event-ID'
      }
    })

  } catch (error) {
    console.error('❌ [V5] Failed to create SSE stream:', error)
    console.error('Stream error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create stream',
        details: error instanceof Error ? error.stack : String(error)
      },
      { status: 500 }
    )
  }
}


