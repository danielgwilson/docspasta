import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { getCurrentUser } from '@/lib/auth/middleware'

/**
 * GET /api/v4/jobs/[id]/state
 * 
 * Returns the current state of a job including:
 * - Current status (running, completed, failed, timeout)
 * - Progress counts (totalProcessed, totalDiscovered)
 * - Recent activity (last 10 SSE events)
 * - Last event ID for resumable SSE streams
 * 
 * Only returns jobs belonging to the authenticated user.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED!)
  try {
    const user = await getCurrentUser(request)
    const userId = user.id
    const { id: jobId } = await params
    
    // Fetch job info with progress counts
    const jobResult = await sql`
      SELECT 
        id,
        status,
        pages_processed as "totalProcessed",
        pages_found as "totalDiscovered",
        error_message
      FROM jobs
      WHERE id = ${jobId} AND user_id = ${userId}
    `
    
    const job = jobResult[0]
    if (!job) {
      return NextResponse.json({
        success: false,
        error: 'Job not found'
      }, { status: 404 })
    }
    
    // Fetch the last 10 SSE events for recent activity
    const eventsResult = await sql`
      SELECT 
        event_id,
        event_type,
        event_data,
        created_at
      FROM sse_events
      WHERE job_id = ${jobId} AND user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 10
    `
    
    // Transform events into recent activity format
    const recentActivity = eventsResult.reverse().map(event => {
      const data = event.event_data as any
      
      // Handle different event types
      if (event.event_type === 'url_crawled' && data.url) {
        return {
          type: 'url_crawled',
          url: data.url,
          timestamp: event.created_at.toISOString()
        }
      } else if (event.event_type === 'batch_progress' && data.urls) {
        // For batch progress, extract individual URLs
        return data.urls.map((url: string) => ({
          type: 'url_crawled',
          url,
          timestamp: event.created_at.toISOString()
        }))
      } else if (event.event_type === 'discovery' && data.discoveredUrls) {
        return {
          type: 'discovery',
          count: data.discoveredUrls,
          timestamp: event.created_at.toISOString()
        }
      } else if (event.event_type === 'progress') {
        return {
          type: 'progress',
          processed: data.processed,
          total: data.total,
          timestamp: event.created_at.toISOString()
        }
      }
      
      // Generic fallback
      return {
        type: event.event_type,
        data: data,
        timestamp: event.created_at.toISOString()
      }
    }).flat().filter(Boolean)
    
    // Get the most recent event ID
    const lastEventId = eventsResult.length > 0 ? eventsResult[0].event_id : null
    
    return NextResponse.json({
      success: true,
      status: job.status,
      totalProcessed: job.totalProcessed || 0,
      totalDiscovered: job.totalDiscovered || 0,
      recentActivity,
      lastEventId,
      error: job.error_message
    })
    
  } catch (error) {
    console.error('Failed to get job state:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}