import { neon } from '@neondatabase/serverless'
import { createUrlHash, normalizeUrl } from './url-utils'

const sql = neon(process.env.DATABASE_URL_UNPOOLED!)

// Job operations
export async function createJob(url: string): Promise<string> {
  const result = await sql`
    INSERT INTO jobs (url, status)
    VALUES (${url}, 'running')
    RETURNING id
  `
  return result[0].id
}

export async function getJob(jobId: string) {
  const result = await sql`
    SELECT id, url, status, created_at
    FROM jobs
    WHERE id = ${jobId}
  `
  return result[0] || null
}

export async function updateJobStatus(jobId: string, status: string, error?: string) {
  await sql`
    UPDATE jobs 
    SET status = ${status},
        completed_at = ${status !== 'running' ? sql`NOW()` : null},
        error_message = ${error || null}
    WHERE id = ${jobId}
  `
}

export async function updateJobMetrics(jobId: string, metrics: {
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
    WHERE id = ${jobId}
  `
}

// Queue operations
export async function addUrlsToQueue(
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
        INSERT INTO job_queue (job_id, url_hash, url, depth)
        VALUES (${jobId}, ${hash}, ${normalized}, ${depth})
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

export async function getNextBatch(jobId: string, batchSize: number = 10) {
  const result = await sql`
    SELECT id, url, depth
    FROM job_queue
    WHERE job_id = ${jobId} AND status = 'pending'
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
export async function getCachedContent(url: string) {
  const hash = createUrlHash(url)
  
  const result = await sql`
    SELECT title, content, links, quality_score, word_count
    FROM url_cache
    WHERE url_hash = ${hash}
  `
  
  return result[0] || null
}

export async function cacheContent(url: string, data: {
  title: string
  content: string
  links: string[]
  quality_score?: number
  word_count?: number
}) {
  const hash = createUrlHash(url)
  const wordCount = data.word_count || data.content.split(/\s+/).length
  
  await sql`
    INSERT INTO url_cache (url_hash, url, title, content, links, quality_score, word_count)
    VALUES (
      ${hash}, 
      ${normalizeUrl(url)}, 
      ${data.title},
      ${data.content},
      ${JSON.stringify(data.links)},
      ${data.quality_score || 0},
      ${wordCount}
    )
    ON CONFLICT (url_hash) DO UPDATE
    SET title = EXCLUDED.title,
        content = EXCLUDED.content,
        links = EXCLUDED.links,
        quality_score = EXCLUDED.quality_score,
        word_count = EXCLUDED.word_count,
        cached_at = NOW()
  `
}

// Job results storage
export async function storeJobResults(jobId: string, results: Array<{
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
  
  await updateJobMetrics(jobId, {
    pages_processed: results.length,
    total_words: totalWords
  })
}

// SSE event operations (for resumable streams)
export async function storeSSEEvent(jobId: string, eventType: string, eventData: any) {
  const eventId = `${jobId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  await sql`
    INSERT INTO sse_events (job_id, event_id, event_type, event_data)
    VALUES (${jobId}, ${eventId}, ${eventType}, ${JSON.stringify(eventData)})
  `
  
  return eventId
}

export async function getCombinedMarkdown(jobId: string) {
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
      AND j.status = 'completed'
      AND j.final_markdown IS NOT NULL
  `
  return result[0] || null
}

export async function getSSEEvents(jobId: string, afterEventId?: string) {
  if (afterEventId) {
    // Get events after a specific event ID (for resume)
    const result = await sql`
      SELECT event_id, event_type, event_data, created_at
      FROM sse_events
      WHERE job_id = ${jobId}
        AND created_at > (
          SELECT created_at FROM sse_events WHERE event_id = ${afterEventId}
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
      ORDER BY created_at
    `
    return result
  }
}