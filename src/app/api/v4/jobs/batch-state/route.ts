import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { getCurrentUser } from '@/lib/auth/middleware'

interface JobState {
  status: string
  totalProcessed: number
  totalDiscovered: number
  recentActivity: any[]
  lastEventId: string | null
  error?: string | null
}

/**
 * POST /api/v4/jobs/batch-state
 * 
 * Returns the current state of multiple jobs in a single request.
 * 
 * Request body:
 * {
 *   "jobIds": ["job1", "job2", ...] // Max 20 jobs
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "states": {
 *     "job1": { status, totalProcessed, totalDiscovered, ... },
 *     "job2": { status, totalProcessed, totalDiscovered, ... }
 *   },
 *   "notFound": ["job3", "job4"]
 * }
 * 
 * Only returns jobs belonging to the authenticated user.
 */
export async function POST(request: NextRequest) {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED!)
  
  try {
    const user = await getCurrentUser(request)
    const userId = user.id
    const body = await request.json()
    const { jobIds } = body
    
    // Validate input
    if (!Array.isArray(jobIds)) {
      return NextResponse.json({
        success: false,
        error: 'jobIds must be an array'
      }, { status: 400 })
    }
    
    if (jobIds.length === 0) {
      return NextResponse.json({
        success: true,
        states: {},
        notFound: []
      })
    }
    
    if (jobIds.length > 20) {
      return NextResponse.json({
        success: false,
        error: 'Maximum 20 jobs per request'
      }, { status: 400 })
    }
    
    // Validate job IDs are valid UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const invalidIds = jobIds.filter(id => !uuidRegex.test(id))
    if (invalidIds.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Invalid job IDs: ${invalidIds.join(', ')}`
      }, { status: 400 })
    }
    
    // Fetch all jobs in a single query
    const jobsResult = await sql`
      SELECT 
        id,
        status,
        pages_processed as "totalProcessed",
        pages_found as "totalDiscovered",
        error_message
      FROM jobs
      WHERE id = ANY(${jobIds}::uuid[]) AND user_id = ${userId}
    `
    
    // Create a map of found jobs
    const foundJobs = new Map(jobsResult.map(job => [job.id, job]))
    
    // Get job IDs that were actually found
    const foundJobIds = Array.from(foundJobs.keys())
    
    // Fetch SSE events for all found jobs in a single query
    let eventsMap = new Map<string, any[]>()
    
    if (foundJobIds.length > 0) {
      const eventsResult = await sql`
        WITH ranked_events AS (
          SELECT 
            job_id,
            event_id,
            event_type,
            event_data,
            created_at,
            ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY created_at DESC) as rn
          FROM sse_events
          WHERE job_id = ANY(${foundJobIds}::uuid[]) AND user_id = ${userId}
        )
        SELECT 
          job_id,
          event_id,
          event_type,
          event_data,
          created_at
        FROM ranked_events
        WHERE rn <= 10
        ORDER BY job_id, created_at DESC
      `
      
      // Group events by job_id
      for (const event of eventsResult) {
        if (!eventsMap.has(event.job_id)) {
          eventsMap.set(event.job_id, [])
        }
        eventsMap.get(event.job_id)!.push(event)
      }
    }
    
    // Build the response
    const states: Record<string, JobState> = {}
    const notFound: string[] = []
    
    for (const jobId of jobIds) {
      const job = foundJobs.get(jobId)
      
      if (!job) {
        notFound.push(jobId)
        continue
      }
      
      // Get events for this job (already sorted by created_at DESC)
      const events = eventsMap.get(jobId) || []
      
      // Transform events into recent activity format (reverse to get chronological order)
      const recentActivity = events.reverse().map(event => {
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
      
      // Get the most recent event ID (events were originally sorted DESC, so after reverse, last is most recent)
      const lastEventId = events.length > 0 ? events[events.length - 1].event_id : null
      
      states[jobId] = {
        status: job.status,
        totalProcessed: job.totalProcessed || 0,
        totalDiscovered: job.totalDiscovered || 0,
        recentActivity,
        lastEventId,
        error: job.error_message
      }
    }
    
    return NextResponse.json({
      success: true,
      states,
      notFound
    })
    
  } catch (error) {
    console.error('Failed to get batch job states:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}