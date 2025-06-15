import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL_UNPOOLED!)

// Job operations with user isolation
export async function createJob(url: string, userId: string, force: boolean = false): Promise<string> {
  const result = await sql`
    INSERT INTO jobs (url, status, user_id, error_message)
    VALUES (${url}, 'running', ${userId}, ${force ? 'FORCE_REFRESH' : null})
    RETURNING id
  `
  return result[0].id
}

export async function getJob(jobId: string, userId: string) {
  const result = await sql`
    SELECT id, url, status, created_at, user_id, error_message
    FROM jobs
    WHERE id = ${jobId} AND user_id = ${userId}
  `
  return result[0] || null
}

export async function getActiveJobs(userId: string) {
  const result = await sql`
    SELECT id, url, status, created_at, pages_processed, pages_found
    FROM jobs
    WHERE status = 'running' AND user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 20
  `
  return result
}

export async function getRecentJobs(userId: string, sinceTime: string) {
  const result = await sql`
    SELECT id, url, status, created_at, completed_at, pages_processed, pages_found, total_words
    FROM jobs
    WHERE user_id = ${userId}
      AND (
        status = 'running' 
        OR (status = 'completed' AND completed_at >= ${sinceTime})
        OR (status = 'failed' AND completed_at >= ${sinceTime})
      )
    ORDER BY created_at DESC
    LIMIT 20
  `
  return result
}

export async function updateJobStatus(jobId: string, status: string, error?: string) {
  await sql`
    UPDATE jobs 
    SET status = ${status},
        error_message = ${status === 'completed' ? null : (error || null)},
        completed_at = ${status === 'completed' || status === 'failed' ? sql`NOW()` : null}
    WHERE id = ${jobId}
  `
}

export async function updateJobMetrics(jobId: string, metrics: {
  pages_processed?: number
  pages_found?: number
  total_words?: number
}) {
  const updates = []
  const values = []
  
  if (metrics.pages_processed !== undefined) {
    updates.push(`pages_processed = $${values.length + 2}`)
    values.push(metrics.pages_processed)
  }
  
  if (metrics.pages_found !== undefined) {
    updates.push(`pages_found = $${values.length + 2}`)
    values.push(metrics.pages_found)
  }
  
  if (metrics.total_words !== undefined) {
    updates.push(`total_words = $${values.length + 2}`)
    values.push(metrics.total_words)
  }
  
  if (updates.length > 0) {
    await sql([
      `UPDATE jobs SET ${updates.join(', ')} WHERE id = $1`,
      jobId,
      ...values
    ])
  }
}

// SSE event operations
export async function storeSSEEvent(jobId: string, eventType: string, eventData: any) {
  const eventId = `${jobId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  await sql`
    INSERT INTO sse_events (job_id, event_id, event_type, event_data)
    VALUES (${jobId}, ${eventId}, ${eventType}, ${JSON.stringify(eventData)})
  `
  
  return eventId
}

export async function getSSEEvents(jobId: string, afterEventId?: string) {
  if (afterEventId) {
    const result = await sql`
      SELECT event_id, event_type, event_data, created_at
      FROM sse_events
      WHERE job_id = ${jobId}
        AND created_at > (
          SELECT created_at FROM sse_events 
          WHERE job_id = ${jobId} AND event_id = ${afterEventId}
        )
      ORDER BY created_at ASC
      LIMIT 100
    `
    return result
  } else {
    const result = await sql`
      SELECT event_id, event_type, event_data, created_at
      FROM sse_events
      WHERE job_id = ${jobId}
      ORDER BY created_at ASC
      LIMIT 100
    `
    return result
  }
}

export async function getCombinedMarkdown(jobId: string, userId: string) {
  const result = await sql`
    SELECT 
      j.url,
      j.final_markdown as content,
      j.pages_processed as "pageCount",
      CASE 
        WHEN j.url LIKE '%://%' THEN 
          SPLIT_PART(SPLIT_PART(j.url, '://', 2), '/', 1) || ' Documentation'
        ELSE 
          'Documentation'
      END as title
    FROM jobs j
    WHERE j.id = ${jobId}
      AND j.user_id = ${userId}
      AND j.status = 'completed'
      AND j.final_markdown IS NOT NULL
  `
  return result[0] || null
}