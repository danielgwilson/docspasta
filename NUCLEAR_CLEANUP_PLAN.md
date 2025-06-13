# Nuclear Cleanup Plan - Database Explosion Fix

**Goal**: Fix the 4.5M duplicate URL issue with maximum simplicity and zero backward compatibility concerns.

## Phase 1: Immediate Stop (5 minutes)

### 1.1 Disable Processing
```bash
# Edit vercel.json to disable cron
# Comment out or remove the cron schedule
```

### 1.2 Verify Stoppage
```bash
# Check Vercel dashboard - ensure no functions are running
# Verify in logs that processing has stopped
```

## Phase 2: Nuclear Schema Reset (30 minutes)

### 2.1 Create New Schema File
**File**: `src/lib/db/schema-v4.sql`

```sql
-- Jobs table (simplified)
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'running', -- running, completed, failed, cancelled
    max_pages INTEGER NOT NULL DEFAULT 50,
    max_depth INTEGER NOT NULL DEFAULT 2,
    quality_threshold INTEGER NOT NULL DEFAULT 20,
    
    -- Progress counters
    pages_crawled INTEGER NOT NULL DEFAULT 0,
    urls_discovered INTEGER NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Results
    final_markdown TEXT,
    error_message TEXT
);

-- Single authoritative queue table
CREATE TABLE crawl_queue (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    url_hash CHAR(64) NOT NULL, -- SHA256 of normalized URL
    url TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    depth INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0,
    
    -- Processing metadata
    discovered_from TEXT, -- which URL found this one
    processing_started_at TIMESTAMPTZ,
    
    -- Results (lightweight only)
    title TEXT,
    success BOOLEAN,
    error_message TEXT,
    links_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- THE SILVER BULLET: Unique constraint prevents duplicates
    CONSTRAINT uq_job_url UNIQUE (job_id, url_hash)
);

-- Indexes for performance
CREATE INDEX idx_queue_pending ON crawl_queue (job_id, status) WHERE status = 'pending';
CREATE INDEX idx_queue_processing ON crawl_queue (status, processing_started_at) WHERE status = 'processing';
CREATE INDEX idx_queue_status_updated ON crawl_queue (status, updated_at);

-- SSE Events table (preserve existing streaming functionality)
CREATE TABLE sse_events (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    event_data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sse_events_job ON sse_events (job_id, created_at);
```

### 2.2 Nuclear Database Reset Script
**File**: `scripts/nuclear-reset.js`

```javascript
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL_UNPOOLED!)

async function nuclearReset() {
  console.log('🚨 NUCLEAR DATABASE RESET - Starting...')
  
  try {
    // Drop existing tables (cascade removes dependencies)
    await sql`DROP TABLE IF EXISTS job_urls_v3 CASCADE`
    await sql`DROP TABLE IF EXISTS crawl_jobs_v3 CASCADE`
    await sql`DROP TABLE IF EXISTS sse_events CASCADE`
    await sql`DROP TABLE IF EXISTS crawl_queue CASCADE`
    await sql`DROP TABLE IF EXISTS jobs CASCADE`
    
    console.log('💥 Existing tables dropped')
    
    // Read and execute new schema
    const fs = await import('fs')
    const schemaSQL = fs.readFileSync('src/lib/db/schema-v4.sql', 'utf8')
    
    // Execute schema (split by semicolon for multiple statements)
    const statements = schemaSQL.split(';').filter(s => s.trim())
    for (const statement of statements) {
      if (statement.trim()) {
        await sql(statement)
      }
    }
    
    console.log('✨ New schema created successfully')
    console.log('🎯 Database reset complete - ready for new implementation')
    
  } catch (error) {
    console.error('❌ Reset failed:', error)
    process.exit(1)
  }
}

nuclearReset()
```

**Usage**: `node scripts/nuclear-reset.js`

## Phase 3: Implement Bulletproof Deduplication (2 hours)

### 3.1 URL Normalization Module
**File**: `src/lib/serverless/url-utils.ts`

```typescript
import normalizeUrl from 'normalize-url'
import { createHash } from 'crypto'

export function normalizeUrlForDedup(url: string): string {
  return normalizeUrl(url, {
    stripHash: true,
    stripWWW: false,
    removeQueryParameters: ['utm_source', 'utm_medium', 'utm_campaign'],
    sortQueryParameters: true,
  })
}

export function createUrlHash(url: string): string {
  const normalized = normalizeUrlForDedup(url)
  return createHash('sha256').update(normalized).digest('hex')
}
```

### 3.2 Atomic Queue Operations
**File**: `src/lib/serverless/queue-v4.ts`

```typescript
import { neon } from '@neondatabase/serverless'
import { normalizeUrlForDedup, createUrlHash } from './url-utils'

const sql = neon(process.env.DATABASE_URL_UNPOOLED!)

export class QueueV4 {
  
  // IDEMPOTENT: Add URLs with atomic deduplication
  async addUrls(jobId: string, urls: string[], discoveredFrom?: string, depth = 0): Promise<number> {
    if (urls.length === 0) return 0
    
    let newUrlsAdded = 0
    
    for (const url of urls) {
      const normalized = normalizeUrlForDedup(url)
      const hash = createUrlHash(normalized)
      
      try {
        const result = await sql`
          INSERT INTO crawl_queue (job_id, url_hash, url, depth, discovered_from)
          VALUES (${jobId}, ${hash}, ${normalized}, ${depth}, ${discoveredFrom})
          ON CONFLICT (job_id, url_hash) DO NOTHING
          RETURNING id
        `
        
        if (result.length > 0) {
          newUrlsAdded++
          console.log(`✅ [${jobId}] New URL: ${normalized}`)
        } else {
          console.log(`🔄 [${jobId}] Duplicate ignored: ${normalized}`)
        }
      } catch (error) {
        console.error(`❌ [${jobId}] Failed to add URL ${normalized}:`, error)
      }
    }
    
    return newUrlsAdded
  }
  
  // ATOMIC: Fetch and lock batch for processing
  async getNextBatch(batchSize = 10): Promise<Array<{id: string, jobId: string, url: string, depth: number}>> {
    const result = await sql`
      WITH next_batch AS (
        SELECT id, job_id, url, depth
        FROM crawl_queue
        WHERE status = 'pending'
        ORDER BY created_at
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE crawl_queue
      SET status = 'processing', 
          processing_started_at = NOW(),
          updated_at = NOW()
      WHERE id IN (SELECT id FROM next_batch)
      RETURNING id, job_id, url, depth
    `
    
    return result.map(row => ({
      id: row.id.toString(),
      jobId: row.job_id,
      url: row.url,
      depth: row.depth
    }))
  }
  
  // Mark URL as completed with results
  async markCompleted(urlId: string, result: {title?: string, success: boolean, linksCount?: number}): Promise<void> {
    await sql`
      UPDATE crawl_queue 
      SET status = 'completed',
          title = ${result.title || null},
          success = ${result.success},
          links_count = ${result.linksCount || 0},
          updated_at = NOW()
      WHERE id = ${urlId}
    `
  }
  
  // Mark URL as failed
  async markFailed(urlId: string, error: string): Promise<void> {
    await sql`
      UPDATE crawl_queue 
      SET status = 'failed',
          error_message = ${error},
          retry_count = retry_count + 1,
          updated_at = NOW()
      WHERE id = ${urlId}
    `
  }
  
  // Check if job has any pending work
  async isJobComplete(jobId: string): Promise<boolean> {
    const result = await sql`
      SELECT COUNT(*) as pending_count
      FROM crawl_queue 
      WHERE job_id = ${jobId} AND status IN ('pending', 'processing')
    `
    
    return parseInt(result[0].pending_count) === 0
  }
}
```

### 3.3 Janitor Process (Cleanup Stuck Jobs)
**File**: `src/lib/serverless/janitor.ts`

```typescript
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL_UNPOOLED!)

export async function cleanupStuckJobs(): Promise<void> {
  const TIMEOUT_MINUTES = 10
  
  // Reset jobs stuck in processing for too long
  const result = await sql`
    UPDATE crawl_queue 
    SET status = 'pending',
        processing_started_at = NULL,
        retry_count = retry_count + 1,
        updated_at = NOW()
    WHERE status = 'processing' 
      AND processing_started_at < NOW() - INTERVAL '${TIMEOUT_MINUTES} minutes'
      AND retry_count < 3
    RETURNING id, url, retry_count
  `
  
  if (result.length > 0) {
    console.log(`🧹 Janitor: Reset ${result.length} stuck jobs`)
  }
  
  // Mark permanently failed jobs (too many retries)
  await sql`
    UPDATE crawl_queue 
    SET status = 'failed',
        error_message = 'Max retries exceeded',
        updated_at = NOW()
    WHERE status = 'processing' 
      AND processing_started_at < NOW() - INTERVAL '${TIMEOUT_MINUTES} minutes'
      AND retry_count >= 3
  `
}
```

## Phase 4: Integration & Testing (1 hour)

### 4.1 Update Main Processor
Replace existing processor logic with QueueV4 calls

### 4.2 Add Limits Enforcement
Check `maxPages` and `maxDepth` before adding URLs

### 4.3 Integration Test
```bash
# Test deduplication with manual insertion
pnpm test:dedup
```

## Phase 5: Deploy & Validate (30 minutes)

### 5.1 Deploy New Code
```bash
pnpm build
# Deploy to Vercel
```

### 5.2 Run Nuclear Reset
```bash
node scripts/nuclear-reset.js
```

### 5.3 Re-enable Cron
Update `vercel.json` to restore cron schedule

### 5.4 Smoke Test
Start a crawl and verify:
- No duplicate URLs in database
- Proper depth limiting
- SSE streaming still works
- Job completion detection

## Success Metrics

- ✅ Database size stays under 50MB for normal crawls
- ✅ Zero duplicate URLs with same job_id + url_hash
- ✅ Crawls respect maxPages limits
- ✅ SSE streaming functionality preserved
- ✅ Jobs complete properly without infinite loops

## Rollback Plan

If issues arise:
1. Disable cron immediately
2. Keep database snapshot before nuclear reset
3. Can restore previous working state if needed

---

**Estimated Total Time**: 4 hours
**Risk Level**: Low (development environment, no production impact)
**Confidence**: High (database-enforced uniqueness is bulletproof)