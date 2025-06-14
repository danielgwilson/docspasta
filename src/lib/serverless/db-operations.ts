import { neon } from '@neondatabase/serverless'
import { createUrlHash, normalizeUrl } from './url-utils'

const sql = neon(process.env.DATABASE_URL_UNPOOLED!)

// Job operations with user isolation
export async function createJob(userId: string, url: string): Promise<string> {
  const result = await sql`
    INSERT INTO jobs (user_id, url, status)
    VALUES (${userId}, ${url}, 'running')
    RETURNING id
  `
  return result[0].id
}

export async function getJob(userId: string, jobId: string) {
  const result = await sql`
    SELECT id, url, status, created_at, user_id
    FROM jobs
    WHERE id = ${jobId} AND user_id = ${userId}
  `
  return result[0] || null
}

export async function getActiveJobs(userId: string) {
  const result = await sql`
    SELECT id, url, status, created_at, pages_processed, pages_found
    FROM jobs
    WHERE user_id = ${userId} AND status = 'running'
    ORDER BY created_at DESC
    LIMIT 20
  `
  return result
}

export async function getRecentJobs(userId: string, limit: number = 10) {
  const result = await sql`
    SELECT id, url, status, created_at, completed_at, pages_processed, pages_found, total_words
    FROM jobs
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
  return result
}

export async function updateJobStatus(userId: string, jobId: string, status: string, error?: string) {
  await sql`
    UPDATE jobs 
    SET status = ${status},
        completed_at = ${status !== 'running' ? sql`NOW()` : null},
        error_message = ${error || null}
    WHERE id = ${jobId} AND user_id = ${userId}
  `
}

export async function updateJobMetrics(userId: string, jobId: string, metrics: {
  pages_found?: number
  pages_processed?: number
  total_words?: number
  final_markdown?: string
}) {
  await sql`
    UPDATE jobs 
    SET pages_found = COALESCE(${metrics.pages_found}, pages_found),
        pages_processed = COALESCE(${metrics.pages_processed}, pages_processed),
        total_words = COALESCE(${metrics.total_words}, total_words),
        final_markdown = COALESCE(${metrics.final_markdown}, final_markdown)
    WHERE id = ${jobId} AND user_id = ${userId}
  `
}

// Queue operations
export async function addUrlsToQueue(
  userId: string,
  jobId: string, 
  urls: string[], 
  depth: number = 0
): Promise<number> {
  if (urls.length === 0) return 0
  
  let newUrlsAdded = 0
  
  for (const url of urls) {
    const normalized = normalizeUrl(url)
    const hash = createUrlHash(normalized)
    
    try {
      const result = await sql`
        INSERT INTO job_queue (job_id, user_id, url_hash, url, depth)
        VALUES (${jobId}, ${userId}, ${hash}, ${normalized}, ${depth})
        ON CONFLICT (job_id, url_hash) DO NOTHING
        RETURNING id
      `
      
      if (result.length > 0) {
        newUrlsAdded++
      }
    } catch (error) {
      console.error(`Failed to add URL ${normalized}:`, error)
    }
  }
  
  return newUrlsAdded
}

export async function getNextBatch(userId: string, jobId: string, batchSize: number = 10) {
  const result = await sql`
    SELECT id, url, depth
    FROM job_queue
    WHERE job_id = ${jobId} AND user_id = ${userId} AND status = 'pending'
    ORDER BY created_at
    LIMIT ${batchSize}
  `
  
  return result.map(row => ({
    id: row.id,
    url: row.url,
    depth: row.depth
  }))
}

export async function markUrlsProcessing(urlIds: string[]) {
  if (urlIds.length === 0) return
  
  await sql`
    UPDATE job_queue
    SET status = 'processing'
    WHERE id = ANY(${urlIds})
  `
}

export async function markUrlCompleted(urlId: string) {
  await sql`
    UPDATE job_queue
    SET status = 'completed'
    WHERE id = ${urlId}
  `
}

export async function markUrlFailed(urlId: string) {
  await sql`
    UPDATE job_queue
    SET status = 'failed'
    WHERE id = ${urlId}
  `
}

// Cache operations
export async function getCachedContent(userId: string, url: string) {
  const hash = createUrlHash(url)
  
  const result = await sql`
    SELECT title, content, links, quality_score, word_count
    FROM url_cache
    WHERE url_hash = ${hash} AND user_id = ${userId}
  `
  
  return result[0] || null
}

export async function cacheContent(userId: string, url: string, data: {
  title: string
  content: string
  links: string[]
  quality_score?: number
  word_count?: number
}) {
  const hash = createUrlHash(url)
  const wordCount = data.word_count || data.content.split(/\s+/).length
  
  await sql`
    INSERT INTO url_cache (url_hash, user_id, url, title, content, links, quality_score, word_count)
    VALUES (
      ${hash}, 
      ${userId},
      ${normalizeUrl(url)}, 
      ${data.title},
      ${data.content},
      ${JSON.stringify(data.links)},
      ${data.quality_score || 0},
      ${wordCount}
    )
    ON CONFLICT (user_id, url_hash) DO UPDATE
    SET title = EXCLUDED.title,
        content = EXCLUDED.content,
        links = EXCLUDED.links,
        quality_score = EXCLUDED.quality_score,
        word_count = EXCLUDED.word_count,
        cached_at = NOW()
  `
}

// Job results storage
export async function storeJobResults(userId: string, jobId: string, results: Array<{
  url: string
  title: string
  content: string
  quality: { score: number }
  wordCount: number
}>) {
  // For now, we'll just update the job metrics
  // In a real implementation, you might want a separate results table
  const totalWords = results.reduce((sum, r) => sum + r.wordCount, 0)
  const goodPages = results.filter(r => r.quality.score >= 20).length
  
  await updateJobMetrics(userId, jobId, {
    pages_processed: results.length,
    total_words: totalWords
  })
}

// SSE event operations (for resumable streams)
export async function storeSSEEvent(userId: string, jobId: string, eventType: string, eventData: any) {
  const eventId = `${jobId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  await sql`
    INSERT INTO sse_events (job_id, user_id, event_id, event_type, event_data)
    VALUES (${jobId}, ${userId}, ${eventId}, ${eventType}, ${JSON.stringify(eventData)})
  `
  
  return eventId
}

export async function getCombinedMarkdown(userId: string, jobId: string) {
  const result = await sql`
    SELECT 
      j.url,
      j.final_markdown as content,
      j.pages_processed as "pageCount",
      COALESCE(
        (SELECT p.title FROM pages p 
         WHERE p.job_id = j.id 
         ORDER BY p.created_at 
         LIMIT 1), 
        'Documentation'
      ) as title
    FROM jobs j
    WHERE j.id = ${jobId}
      AND j.user_id = ${userId}
      AND j.status = 'completed'
      AND j.final_markdown IS NOT NULL
  `
  return result[0] || null
}

export async function getSSEEvents(userId: string, jobId: string, afterEventId?: string) {
  if (afterEventId) {
    // Get events after a specific event ID (for resume)
    const result = await sql`
      SELECT event_id, event_type, event_data, created_at
      FROM sse_events
      WHERE job_id = ${jobId}
        AND user_id = ${userId}
        AND created_at > (
          SELECT created_at FROM sse_events WHERE event_id = ${afterEventId} AND user_id = ${userId}
        )
      ORDER BY created_at
    `
    return result
  } else {
    // Get all events for the job
    const result = await sql`
      SELECT event_id, event_type, event_data, created_at
      FROM sse_events
      WHERE job_id = ${jobId}
        AND user_id = ${userId}
      ORDER BY created_at
    `
    return result
  }
}