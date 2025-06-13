# DOCSPASTA V2: EXHAUSTIVE MIGRATION PLAN
## From BullMQ Workers → Vercel-Native Serverless Architecture

**Date**: June 11, 2025  
**Objective**: Complete architectural migration with zero backwards compatibility, rip-and-replace approach  
**Timeline**: 2-3 weeks for complete migration  
**Risk Level**: HIGH (full system replacement)

---

## EXECUTIVE SUMMARY

**Current Problem**: BullMQ + Redis workers architecture is fundamentally incompatible with serverless deployment on Vercel.

**Solution**: Hybrid PostgreSQL + Vercel KV architecture with cron-based processing and resumable-stream SSE.

**Approach**: Complete rebuild with no backwards compatibility to avoid any contamination from existing patterns.

---

## PHASE 0: FOUNDATION & DEPENDENCIES (Days 1-2)

### A. Environment Setup & Dependencies

#### 1. Package.json Changes
```bash
# REMOVE (delete these completely)
npm uninstall bullmq ioredis
npm uninstall @types/bullmq

# ADD (install these)
npm install @vercel/kv @upstash/redis resumable-stream zod
npm install --save-dev @types/node
```

#### 2. Environment Variables (Vercel Dashboard)
```bash
# Add to Vercel Environment Variables
VERCEL_KV_REST_API_URL=https://...
VERCEL_KV_REST_API_TOKEN=...
UPSTASH_REDIS_REST_URL=https://...  # For pub/sub
UPSTASH_REDIS_REST_TOKEN=...
DATABASE_URL=postgresql://...       # Keep existing
DATABASE_URL_UNPOOLED=postgresql://... # Keep existing

# REMOVE (delete these from Vercel)
REDIS_URL=rediss://...              # Delete - we're not using BullMQ Redis anymore
```

#### 3. New Directory Structure
```
src/
├── lib/
│   ├── serverless/              # NEW - serverless architecture
│   │   ├── jobs.ts              # Job creation & state management
│   │   ├── processor.ts         # URL processing logic
│   │   ├── queue.ts             # Vercel KV queue operations
│   │   ├── streaming.ts         # resumable-stream SSE setup
│   │   └── types.ts             # TypeScript definitions
│   ├── crawler/                 # KEEP - but refactor
│   │   ├── web-crawler.ts       # Keep core crawling logic
│   │   ├── content-extractor.ts # Keep
│   │   ├── quality.ts           # Keep
│   │   └── types.ts             # Keep but update
│   └── db/                      # EXTEND - add job tables
│       ├── schema.ts            # Update with new job tables
│       ├── job-operations.ts    # NEW - job CRUD operations
│       └── migrate.ts           # Update
└── app/
    └── api/
        ├── v3/                  # NEW API version (v3) - clean slate
        │   ├── jobs/
        │   │   ├── route.ts     # POST - create new job
        │   │   └── [jobId]/
        │   │       ├── route.ts # GET - job status
        │   │       └── stream/
        │   │           └── route.ts # GET - SSE stream
        │   └── process/
        │       └── route.ts     # Cron endpoint - process queue
        └── crawl-v2/            # DELETE ENTIRE DIRECTORY
```

### B. Database Schema Updates

#### 1. New Tables (PostgreSQL)
```sql
-- Job state machine table
CREATE TABLE crawl_jobs_v3 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  
  -- Job configuration
  initial_url TEXT NOT NULL,
  max_pages INTEGER NOT NULL DEFAULT 50,
  max_depth INTEGER NOT NULL DEFAULT 2,
  quality_threshold INTEGER NOT NULL DEFAULT 20,
  
  -- Progress tracking
  total_urls INTEGER NOT NULL DEFAULT 0,
  processed_urls INTEGER NOT NULL DEFAULT 0,
  failed_urls INTEGER NOT NULL DEFAULT 0,
  discovered_urls INTEGER NOT NULL DEFAULT 0,
  
  -- State management
  current_step TEXT NOT NULL DEFAULT 'init' CHECK (current_step IN ('init', 'discovery', 'processing', 'finalizing', 'done')),
  error_details JSONB,
  
  -- Results
  results JSONB DEFAULT '[]',
  final_markdown TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Index for efficient queries
CREATE INDEX idx_crawl_jobs_v3_status ON crawl_jobs_v3(status);
CREATE INDEX idx_crawl_jobs_v3_created_at ON crawl_jobs_v3(created_at);

-- URL processing queue table (for atomic operations)
CREATE TABLE job_urls_v3 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES crawl_jobs_v3(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  
  -- Processing details
  retry_count INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  processing_started_at TIMESTAMP WITH TIME ZONE,
  
  -- Results
  result JSONB,
  error_message TEXT,
  
  -- Metadata
  discovered_from TEXT, -- which URL discovered this one
  depth INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient processing
CREATE INDEX idx_job_urls_v3_job_id ON job_urls_v3(job_id);
CREATE INDEX idx_job_urls_v3_status ON job_urls_v3(status);
CREATE INDEX idx_job_urls_v3_pending ON job_urls_v3(job_id, status) WHERE status = 'pending';
```

#### 2. Migration Script
```typescript
// src/lib/db/migrate-v3.ts
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'

export async function migrateToV3() {
  // Apply new schema
  const sql = neon(process.env.DATABASE_URL_UNPOOLED!)
  
  // Run migration SQL above
  await sql`CREATE TABLE crawl_jobs_v3 (...)`
  await sql`CREATE TABLE job_urls_v3 (...)`
  
  console.log('✅ V3 schema migration complete')
}
```

---

## PHASE 1: CORE SERVERLESS INFRASTRUCTURE (Days 3-5)

### A. State Management System

#### 1. Job State Machine (`src/lib/serverless/jobs.ts`)
```typescript
import { kv } from '@vercel/kv'
import { neon } from '@neondatabase/serverless'
import { z } from 'zod'

// Validation schemas
export const CreateJobSchema = z.object({
  url: z.string().url(),
  maxPages: z.number().min(1).max(200).default(50),
  maxDepth: z.number().min(1).max(5).default(2),
  qualityThreshold: z.number().min(0).max(100).default(20),
})

export type CreateJobRequest = z.infer<typeof CreateJobSchema>

export interface JobState {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  currentStep: 'init' | 'discovery' | 'processing' | 'finalizing' | 'done'
  totalUrls: number
  processedUrls: number
  failedUrls: number
  discoveredUrls: number
  createdAt: number
  updatedAt: number
}

export class JobManager {
  private sql = neon(process.env.DATABASE_URL_UNPOOLED!)
  
  async createJob(request: CreateJobRequest): Promise<string> {
    const validated = CreateJobSchema.parse(request)
    
    const result = await this.sql`
      INSERT INTO crawl_jobs_v3 (initial_url, max_pages, max_depth, quality_threshold)
      VALUES (${validated.url}, ${validated.maxPages}, ${validated.maxDepth}, ${validated.qualityThreshold})
      RETURNING id
    `
    
    const jobId = result[0].id
    
    // Add to processing queue (Vercel KV)
    await kv.sadd('pending_jobs', jobId)
    
    return jobId
  }
  
  async getJobState(jobId: string): Promise<JobState | null> {
    const result = await this.sql`
      SELECT id, status, current_step, total_urls, processed_urls, failed_urls, 
             discovered_urls, EXTRACT(EPOCH FROM created_at) as created_at,
             EXTRACT(EPOCH FROM updated_at) as updated_at
      FROM crawl_jobs_v3 
      WHERE id = ${jobId}
    `
    
    if (result.length === 0) return null
    
    const row = result[0]
    return {
      id: row.id,
      status: row.status,
      currentStep: row.current_step,
      totalUrls: row.total_urls,
      processedUrls: row.processed_urls,
      failedUrls: row.failed_urls,
      discoveredUrls: row.discovered_urls,
      createdAt: row.created_at * 1000, // Convert to milliseconds
      updatedAt: row.updated_at * 1000,
    }
  }
  
  async updateJobState(jobId: string, updates: Partial<JobState>): Promise<void> {
    const setClause = []
    const values = [jobId]
    let paramIndex = 2
    
    if (updates.status) {
      setClause.push(`status = $${paramIndex}`)
      values.push(updates.status)
      paramIndex++
    }
    
    if (updates.currentStep) {
      setClause.push(`current_step = $${paramIndex}`)
      values.push(updates.currentStep)
      paramIndex++
    }
    
    if (updates.totalUrls !== undefined) {
      setClause.push(`total_urls = $${paramIndex}`)
      values.push(updates.totalUrls)
      paramIndex++
    }
    
    if (updates.processedUrls !== undefined) {
      setClause.push(`processed_urls = $${paramIndex}`)
      values.push(updates.processedUrls)
      paramIndex++
    }
    
    if (updates.failedUrls !== undefined) {
      setClause.push(`failed_urls = $${paramIndex}`)
      values.push(updates.failedUrls)
      paramIndex++
    }
    
    if (updates.discoveredUrls !== undefined) {
      setClause.push(`discovered_urls = $${paramIndex}`)
      values.push(updates.discoveredUrls)
      paramIndex++
    }
    
    setClause.push('updated_at = NOW()')
    
    if (setClause.length === 1) return // Only timestamp update, skip
    
    const query = `UPDATE crawl_jobs_v3 SET ${setClause.join(', ')} WHERE id = $1`
    await this.sql(query, values)
  }
}
```

#### 2. Queue Management (`src/lib/serverless/queue.ts`)
```typescript
import { kv } from '@vercel/kv'
import { neon } from '@neondatabase/serverless'

export class QueueManager {
  private sql = neon(process.env.DATABASE_URL_UNPOOLED!)
  
  async addUrlsToQueue(jobId: string, urls: string[], discoveredFrom?: string): Promise<void> {
    // Batch insert URLs to PostgreSQL
    const values = urls.map(url => `('${jobId}', '${url}', ${discoveredFrom ? `'${discoveredFrom}'` : 'NULL'})`)
    
    await this.sql`
      INSERT INTO job_urls_v3 (job_id, url, discovered_from)
      VALUES ${values.map(v => sql.raw(v)).join(', ')}
    `
    
    // Add jobId to active processing queue (Vercel KV)
    await kv.sadd('active_jobs', jobId)
  }
  
  async getNextBatch(batchSize: number = 10): Promise<Array<{jobId: string, urlId: string, url: string}>> {
    // Get active jobs
    const activeJobs = await kv.smembers('active_jobs')
    if (activeJobs.length === 0) return []
    
    // Round-robin through jobs to ensure fairness
    const results = []
    
    for (const jobId of activeJobs) {
      if (results.length >= batchSize) break
      
      // Get pending URLs for this job (limit to prevent one job dominating)
      const urls = await this.sql`
        SELECT id, url FROM job_urls_v3 
        WHERE job_id = ${jobId} AND status = 'pending'
        ORDER BY created_at
        LIMIT ${Math.min(3, batchSize - results.length)}
      `
      
      for (const urlRow of urls) {
        results.push({
          jobId,
          urlId: urlRow.id,
          url: urlRow.url
        })
      }
    }
    
    return results
  }
  
  async markUrlProcessing(urlId: string): Promise<void> {
    await this.sql`
      UPDATE job_urls_v3 
      SET status = 'processing', processing_started_at = NOW(), last_attempt_at = NOW()
      WHERE id = ${urlId}
    `
  }
  
  async markUrlCompleted(urlId: string, result: any): Promise<void> {
    await this.sql`
      UPDATE job_urls_v3 
      SET status = 'completed', result = ${JSON.stringify(result)}
      WHERE id = ${urlId}
    `
  }
  
  async markUrlFailed(urlId: string, error: string): Promise<void> {
    await this.sql`
      UPDATE job_urls_v3 
      SET status = 'failed', error_message = ${error}, retry_count = retry_count + 1
      WHERE id = ${urlId}
    `
  }
  
  async checkJobCompletion(jobId: string): Promise<boolean> {
    const result = await this.sql`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing
      FROM job_urls_v3 
      WHERE job_id = ${jobId}
    `
    
    const stats = result[0]
    const isComplete = stats.pending === 0 && stats.processing === 0
    
    if (isComplete) {
      // Remove from active jobs
      await kv.srem('active_jobs', jobId)
      
      // Update job status
      const jobManager = new JobManager()
      await jobManager.updateJobState(jobId, {
        status: stats.failed > 0 ? 'completed' : 'completed', // Always completed, check results for failures
        currentStep: 'done',
        processedUrls: parseInt(stats.completed),
        failedUrls: parseInt(stats.failed),
      })
    }
    
    return isComplete
  }
}
```

### B. URL Processing Engine

#### 1. Core Processor (`src/lib/serverless/processor.ts`)
```typescript
import { WebCrawler } from '@/lib/crawler/web-crawler'
import { QueueManager } from './queue'
import { JobManager } from './jobs'
import { publishProgress } from './streaming'

export class URLProcessor {
  private crawler = new WebCrawler()
  private queueManager = new QueueManager()
  private jobManager = new JobManager()
  
  async processBatch(batchSize: number = 10): Promise<void> {
    const batch = await this.queueManager.getNextBatch(batchSize)
    
    if (batch.length === 0) {
      console.log('📝 No URLs to process')
      return
    }
    
    console.log(`🚀 Processing batch of ${batch.length} URLs`)
    
    // Process URLs in parallel
    await Promise.allSettled(
      batch.map(item => this.processUrl(item.jobId, item.urlId, item.url))
    )
  }
  
  private async processUrl(jobId: string, urlId: string, url: string): Promise<void> {
    try {
      // Mark as processing
      await this.queueManager.markUrlProcessing(urlId)
      
      // Get job configuration
      const jobState = await this.jobManager.getJobState(jobId)
      if (!jobState) {
        throw new Error(`Job ${jobId} not found`)
      }
      
      // Crawl the URL
      console.log(`📄 Processing: ${url}`)
      const result = await this.crawler.crawlPage(url, {
        timeout: 8000,
        qualityThreshold: 20, // Use from job config in real implementation
      })
      
      if (result.success && result.content) {
        // Store successful result
        await this.queueManager.markUrlCompleted(urlId, {
          title: result.title,
          content: result.content,
          links: result.links || [],
          quality: result.quality,
        })
        
        // Discover new URLs if within depth limit
        if (result.links && result.links.length > 0) {
          await this.queueManager.addUrlsToQueue(jobId, result.links, url)
          
          console.log(`🔗 Discovered ${result.links.length} new URLs from ${url}`)
        }
        
        // Publish progress
        await publishProgress(jobId, {
          type: 'url_completed',
          url,
          status: 'success',
          title: result.title,
          discoveredUrls: result.links?.length || 0,
        })
        
      } else {
        await this.queueManager.markUrlFailed(urlId, result.error || 'Unknown error')
        
        await publishProgress(jobId, {
          type: 'url_completed',
          url,
          status: 'failed',
          error: result.error,
        })
      }
      
      // Check if job is complete
      const isComplete = await this.queueManager.checkJobCompletion(jobId)
      if (isComplete) {
        await publishProgress(jobId, {
          type: 'job_completed',
          jobId,
        })
      }
      
    } catch (error) {
      console.error(`❌ Failed to process ${url}:`, error)
      
      await this.queueManager.markUrlFailed(urlId, error instanceof Error ? error.message : 'Unknown error')
      
      await publishProgress(jobId, {
        type: 'url_completed',
        url,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
}
```

#### 2. Progress Streaming (`src/lib/serverless/streaming.ts`)
```typescript
import Redis from 'ioredis'

const redis = new Redis(process.env.UPSTASH_REDIS_REST_URL!)

export interface ProgressEvent {
  type: 'url_completed' | 'job_completed' | 'discovery_started' | 'error'
  jobId?: string
  url?: string
  status?: 'success' | 'failed' | 'processing'
  title?: string
  error?: string
  discoveredUrls?: number
  timestamp?: number
}

export async function publishProgress(jobId: string, event: ProgressEvent): Promise<void> {
  const eventWithTimestamp = {
    ...event,
    timestamp: Date.now(),
    jobId,
  }
  
  try {
    await redis.publish(`job-progress:${jobId}`, JSON.stringify(eventWithTimestamp))
    console.log(`📡 Published progress for job ${jobId}:`, event.type)
  } catch (error) {
    console.error(`❌ Failed to publish progress:`, error)
  }
}

export async function getJobProgress(jobId: string): Promise<ProgressEvent[]> {
  // For now, get current state from database
  // In future, could cache recent events in Redis list
  return []
}
```

---

## PHASE 2: API ENDPOINTS (Days 6-8)

### A. Job Creation Endpoint

#### 1. Create Job API (`src/app/api/v3/jobs/route.ts`)
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { JobManager, CreateJobSchema } from '@/lib/serverless/jobs'
import { QueueManager } from '@/lib/serverless/queue'
import { publishProgress } from '@/lib/serverless/streaming'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const jobRequest = CreateJobSchema.parse(body)
    
    const jobManager = new JobManager()
    const queueManager = new QueueManager()
    
    // Create job
    const jobId = await jobManager.createJob(jobRequest)
    
    // Add initial URL to queue
    await queueManager.addUrlsToQueue(jobId, [jobRequest.url])
    
    // Update job state
    await jobManager.updateJobState(jobId, {
      status: 'running',
      currentStep: 'discovery',
      totalUrls: 1,
    })
    
    // Publish start event
    await publishProgress(jobId, {
      type: 'discovery_started',
      url: jobRequest.url,
    })
    
    console.log(`✨ Created job ${jobId} for ${jobRequest.url}`)
    
    return NextResponse.json({
      success: true,
      data: {
        jobId,
        url: jobRequest.url,
        status: 'running',
      }
    })
    
  } catch (error) {
    console.error('❌ Failed to create job:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
```

#### 2. Job Status API (`src/app/api/v3/jobs/[jobId]/route.ts`)
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { JobManager } from '@/lib/serverless/jobs'

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
): Promise<NextResponse> {
  try {
    const { jobId } = params
    
    const jobManager = new JobManager()
    const jobState = await jobManager.getJobState(jobId)
    
    if (!jobState) {
      return NextResponse.json({
        success: false,
        error: 'Job not found'
      }, { status: 404 })
    }
    
    return NextResponse.json({
      success: true,
      data: jobState
    })
    
  } catch (error) {
    console.error('❌ Failed to get job status:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
```

### B. Streaming Endpoint

#### 1. SSE Stream (`src/app/api/v3/jobs/[jobId]/stream/route.ts`)
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createResumableStream } from 'resumable-stream'
import Redis from 'ioredis'

const redis = new Redis(process.env.UPSTASH_REDIS_REST_URL!)

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
): Promise<NextResponse> {
  const { jobId } = params
  
  console.log(`📡 Starting SSE stream for job: ${jobId}`)
  
  try {
    const streamContext = createResumableStream({
      redis,
      streamId: `job-progress:${jobId}`,
    })
    
    const stream = await streamContext.getOrCreateStream()
    
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      },
    })
    
  } catch (error) {
    console.error(`❌ SSE stream failed for job ${jobId}:`, error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes
```

### C. Processor Endpoint (Cron)

#### 1. Processing Cron (`src/app/api/v3/process/route.ts`)
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { URLProcessor } from '@/lib/serverless/processor'

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Verify this is called from Vercel Cron
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    console.log('⏰ Cron triggered - processing queue')
    
    const processor = new URLProcessor()
    await processor.processBatch(20) // Process up to 20 URLs
    
    return NextResponse.json({
      success: true,
      message: 'Batch processed'
    })
    
  } catch (error) {
    console.error('❌ Cron processing failed:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 1 minute for cron job
```

#### 2. Vercel Cron Configuration (`vercel.json`)
```json
{
  "crons": [
    {
      "path": "/api/v3/process",
      "schedule": "* * * * *"
    }
  ],
  "env": {
    "CRON_SECRET": "@cron_secret"
  }
}
```

---

## PHASE 3: FRONTEND INTEGRATION (Days 9-10)

### A. Replace Existing Components

#### 1. New Crawl Hook (`src/hooks/useServerlessCrawl.ts`)
```typescript
import { useState, useEffect, useRef } from 'react'
import { CreateJobRequest, JobState } from '@/lib/serverless/jobs'

interface CrawlResult {
  jobId?: string
  jobState?: JobState
  isLoading: boolean
  error: string | null
  events: ProgressEvent[]
}

export function useServerlessCrawl() {
  const [result, setResult] = useState<CrawlResult>({
    isLoading: false,
    error: null,
    events: [],
  })
  
  const eventSourceRef = useRef<EventSource | null>(null)
  
  const startCrawl = async (request: CreateJobRequest) => {
    setResult(prev => ({ ...prev, isLoading: true, error: null }))
    
    try {
      // Create job
      const response = await fetch('/api/v3/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      
      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error)
      }
      
      const jobId = data.data.jobId
      setResult(prev => ({ ...prev, jobId }))
      
      // Start SSE stream
      eventSourceRef.current = new EventSource(`/api/v3/jobs/${jobId}/stream`)
      
      eventSourceRef.current.onmessage = (event) => {
        const progressEvent = JSON.parse(event.data)
        
        setResult(prev => ({
          ...prev,
          events: [...prev.events, progressEvent],
        }))
        
        // Update job state on completion
        if (progressEvent.type === 'job_completed') {
          setResult(prev => ({ ...prev, isLoading: false }))
          eventSourceRef.current?.close()
        }
      }
      
      eventSourceRef.current.onerror = (error) => {
        console.error('SSE error:', error)
        setResult(prev => ({ 
          ...prev, 
          error: 'Connection lost', 
          isLoading: false 
        }))
      }
      
    } catch (error) {
      setResult(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false,
      }))
    }
  }
  
  const stopCrawl = () => {
    eventSourceRef.current?.close()
    setResult(prev => ({ ...prev, isLoading: false }))
  }
  
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close()
    }
  }, [])
  
  return {
    ...result,
    startCrawl,
    stopCrawl,
  }
}
```

#### 2. New Progress Component (`src/components/ServerlessProgress.tsx`)
```typescript
'use client'

import { useServerlessCrawl } from '@/hooks/useServerlessCrawl'
import { useState } from 'react'

export default function ServerlessProgress() {
  const [url, setUrl] = useState('')
  const { jobId, isLoading, error, events, startCrawl, stopCrawl } = useServerlessCrawl()
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!url) return
    
    await startCrawl({
      url,
      maxPages: 50,
      maxDepth: 2,
      qualityThreshold: 20,
    })
  }
  
  const completedUrls = events.filter(e => e.type === 'url_completed' && e.status === 'success').length
  const failedUrls = events.filter(e => e.type === 'url_completed' && e.status === 'failed').length
  const totalUrls = completedUrls + failedUrls
  
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Serverless Documentation Crawler</h1>
      
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter documentation URL..."
            className="flex-1 p-2 border border-gray-300 rounded"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !url}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
          >
            {isLoading ? 'Crawling...' : 'Start Crawl'}
          </button>
          {isLoading && (
            <button
              type="button"
              onClick={stopCrawl}
              className="px-4 py-2 bg-red-500 text-white rounded"
            >
              Stop
            </button>
          )}
        </div>
      </form>
      
      {error && (
        <div className="p-4 bg-red-100 text-red-700 rounded mb-4">
          Error: {error}
        </div>
      )}
      
      {jobId && (
        <div className="space-y-4">
          <div className="p-4 bg-gray-100 rounded">
            <h2 className="font-semibold">Job ID: {jobId}</h2>
            <div className="text-sm text-gray-600">
              Completed: {completedUrls} | Failed: {failedUrls} | Total: {totalUrls}
            </div>
          </div>
          
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {events.map((event, index) => (
              <div key={index} className="p-2 bg-white border rounded text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">{event.type}</span>
                  <span className="text-gray-500">
                    {new Date(event.timestamp || 0).toLocaleTimeString()}
                  </span>
                </div>
                {event.url && (
                  <div className="text-gray-600 truncate">{event.url}</div>
                )}
                {event.title && (
                  <div className="text-blue-600">{event.title}</div>
                )}
                {event.error && (
                  <div className="text-red-600">{event.error}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

---

## PHASE 4: CLEANUP & MIGRATION (Days 11-14)

### A. Remove Old System

#### 1. Files to DELETE (Complete Removal)
```bash
# Delete entire directories
rm -rf src/lib/crawler/queue-*
rm -rf src/lib/crawler/batch-*
rm -rf src/lib/crawler/streaming-progress.ts
rm -rf src/lib/crawler/crawl-redis*.ts
rm -rf src/lib/crawler/atomic-progress.ts
rm -rf src/lib/sse/

# Delete old API routes
rm -rf src/app/api/crawl-v2/

# Delete old components
rm -rf src/components/QueueSSECrawlResults.tsx
rm -rf src/components/RobustCrawlProgress.tsx
rm -rf src/hooks/useSSEConnection.ts
rm -rf src/hooks/useCrawlHistory*.ts

# Update package.json
npm uninstall bullmq ioredis @types/bullmq
```

#### 2. Files to KEEP but Update
```typescript
// src/lib/crawler/web-crawler.ts - KEEP (core crawling logic)
// src/lib/crawler/content-extractor.ts - KEEP
// src/lib/crawler/quality.ts - KEEP
// src/lib/crawler/types.ts - UPDATE (remove BullMQ types)
// src/lib/db/schema.ts - UPDATE (add v3 tables)
// src/lib/db/connection.ts - KEEP
```

#### 3. Update Page Component (`src/app/page.tsx`)
```typescript
import ServerlessProgress from '@/components/ServerlessProgress'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <ServerlessProgress />
    </div>
  )
}
```

### B. Environment Configuration

#### 1. Vercel Environment Variables
```bash
# ADD these to Vercel Dashboard
VERCEL_KV_REST_API_URL=          # From Vercel KV setup
VERCEL_KV_REST_API_TOKEN=        # From Vercel KV setup
UPSTASH_REDIS_REST_URL=          # For pub/sub (separate from KV)
UPSTASH_REDIS_REST_TOKEN=        # For pub/sub
CRON_SECRET=                     # Generate random secret for cron auth

# REMOVE these from Vercel Dashboard
REDIS_URL=                       # Delete (old BullMQ Redis)
KV_URL=                         # Delete if using separate UPSTASH setup
```

#### 2. Local Development Setup
```bash
# .env.local (for local development)
DATABASE_URL="postgresql://..."
DATABASE_URL_UNPOOLED="postgresql://..."
VERCEL_KV_REST_API_URL="..."
VERCEL_KV_REST_API_TOKEN="..."
UPSTASH_REDIS_REST_URL="..."
UPSTASH_REDIS_REST_TOKEN="..."
CRON_SECRET="local-dev-secret"
```

---

## PHASE 5: TESTING & VALIDATION (Days 15-17)

### A. Unit Tests

#### 1. Job Manager Tests (`src/tests/serverless-jobs.test.ts`)
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { JobManager } from '@/lib/serverless/jobs'

describe('JobManager', () => {
  let jobManager: JobManager
  
  beforeEach(() => {
    jobManager = new JobManager()
  })
  
  it('creates a job with valid parameters', async () => {
    const jobId = await jobManager.createJob({
      url: 'https://example.com',
      maxPages: 50,
      maxDepth: 2,
      qualityThreshold: 20,
    })
    
    expect(jobId).toBeTruthy()
    
    const jobState = await jobManager.getJobState(jobId)
    expect(jobState).toBeTruthy()
    expect(jobState?.status).toBe('pending')
  })
  
  it('updates job state correctly', async () => {
    const jobId = await jobManager.createJob({
      url: 'https://example.com',
    })
    
    await jobManager.updateJobState(jobId, {
      status: 'running',
      totalUrls: 10,
      processedUrls: 5,
    })
    
    const jobState = await jobManager.getJobState(jobId)
    expect(jobState?.status).toBe('running')
    expect(jobState?.totalUrls).toBe(10)
    expect(jobState?.processedUrls).toBe(5)
  })
})
```

#### 2. Queue Manager Tests (`src/tests/serverless-queue.test.ts`)
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { QueueManager } from '@/lib/serverless/queue'

describe('QueueManager', () => {
  let queueManager: QueueManager
  
  beforeEach(() => {
    queueManager = new QueueManager()
  })
  
  it('adds URLs to queue and retrieves them', async () => {
    const jobId = 'test-job-id'
    const urls = ['https://example.com/page1', 'https://example.com/page2']
    
    await queueManager.addUrlsToQueue(jobId, urls)
    
    const batch = await queueManager.getNextBatch(10)
    
    expect(batch.length).toBe(2)
    expect(batch[0].jobId).toBe(jobId)
    expect(batch[0].url).toBe(urls[0])
  })
})
```

### B. Integration Tests

#### 1. API Integration Test (`src/tests/api-v3-integration.test.ts`)
```typescript
import { describe, it, expect } from 'vitest'

describe('API v3 Integration', () => {
  it('creates a job and processes it end-to-end', async () => {
    // Create job
    const createResponse = await fetch('/api/v3/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com',
        maxPages: 5,
        maxDepth: 1,
      }),
    })
    
    const createData = await createResponse.json()
    expect(createData.success).toBe(true)
    
    const jobId = createData.data.jobId
    
    // Check job status
    const statusResponse = await fetch(`/api/v3/jobs/${jobId}`)
    const statusData = await statusResponse.json()
    
    expect(statusData.success).toBe(true)
    expect(statusData.data.id).toBe(jobId)
    expect(statusData.data.status).toBe('running')
  })
})
```

### C. Performance Tests

#### 1. Load Testing (`src/tests/performance.test.ts`)
```typescript
import { describe, it, expect } from 'vitest'

describe('Performance Tests', () => {
  it('handles multiple concurrent jobs', async () => {
    const startTime = Date.now()
    
    // Create 5 jobs concurrently
    const promises = Array.from({ length: 5 }, (_, i) =>
      fetch('/api/v3/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `https://example${i}.com`,
          maxPages: 3,
        }),
      })
    )
    
    const responses = await Promise.all(promises)
    const duration = Date.now() - startTime
    
    // All should succeed
    for (const response of responses) {
      const data = await response.json()
      expect(data.success).toBe(true)
    }
    
    // Should complete within reasonable time
    expect(duration).toBeLessThan(5000) // 5 seconds
  })
})
```

---

## ROLLBACK PLAN (Emergency)

### A. Git Strategy
```bash
# Before starting migration - create backup branch
git checkout -b backup-bullmq-system
git push origin backup-bullmq-system

# Create migration branch
git checkout main
git checkout -b migrate-to-serverless

# If rollback needed
git checkout main
git reset --hard backup-bullmq-system
git push --force-with-lease origin main
```

### B. Database Rollback
```sql
-- If needed, drop v3 tables
DROP TABLE IF EXISTS job_urls_v3 CASCADE;
DROP TABLE IF EXISTS crawl_jobs_v3 CASCADE;

-- Original tables remain untouched
```

### C. Vercel Configuration Rollback
```bash
# Restore original environment variables
# Remove v3 API routes
# Redeploy previous version
```

---

## RISK ASSESSMENT & MITIGATION

### A. High-Risk Items
1. **Database Schema Changes** - Mitigated by keeping old tables intact
2. **SSE Streaming Interruption** - Mitigated by resumable-stream package
3. **Cron Job Reliability** - Mitigated by idempotent processing
4. **Performance Degradation** - Mitigated by parallel processing and efficient queues

### B. Monitoring & Alerts
```typescript
// Add to each major function
console.log(`[${Date.now()}] ${operation} - ${status}`)

// Monitor these metrics:
// - Job creation rate
// - Processing time per URL
// - Queue depth
// - Error rates
// - SSE connection counts
```

---

## SUCCESS CRITERIA

### A. Functional Requirements ✅
- [ ] Jobs can be created via API
- [ ] URLs are processed in parallel
- [ ] Progress is streamed in real-time via SSE
- [ ] Jobs survive server restarts
- [ ] Failed URLs are retried appropriately
- [ ] System scales to 200+ URLs per job

### B. Performance Requirements ✅
- [ ] Job creation < 500ms
- [ ] Progress updates < 100ms latency
- [ ] Processing 50 URLs < 60 seconds
- [ ] System handles 10+ concurrent jobs

### C. Reliability Requirements ✅
- [ ] Zero data loss during server restarts
- [ ] Automatic retry for transient failures
- [ ] Graceful handling of malformed URLs
- [ ] Proper error reporting to users

---

## DEPLOYMENT CHECKLIST

### Pre-Deployment
- [ ] All tests passing
- [ ] Database migration tested
- [ ] Environment variables configured
- [ ] Cron job secret configured
- [ ] Performance benchmarks completed

### Deployment
- [ ] Deploy to preview environment first
- [ ] Run full integration tests
- [ ] Monitor error logs
- [ ] Test SSE streaming with multiple clients
- [ ] Verify cron job execution

### Post-Deployment
- [ ] Monitor job creation rates
- [ ] Check processing performance
- [ ] Verify SSE stability
- [ ] Monitor database performance
- [ ] Remove old code after 1 week stability

---

**TOTAL ESTIMATED TIMELINE: 17 days**
**ROLLBACK TIME: < 1 hour**
**RISK LEVEL: HIGH (complete rewrite)**
**CONFIDENCE LEVEL: HIGH (well-researched solution)**