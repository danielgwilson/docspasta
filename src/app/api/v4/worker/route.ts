import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { 
  getJob,
  updateJobStatus,
  storeSSEEvent,
  markUrlCompleted,
  markUrlFailed,
  addUrlsToQueue
} from '@/lib/serverless/db-operations'
import { getUserId } from '@/lib/serverless/auth'
import {
  getTasksFromRedisQueue,
  addUrlsToRedisQueue,
  isQueueEmpty,
  incrementWorkerCount,
  decrementWorkerCount,
  getWorkerCount
} from '@/lib/serverless/redis-queue'
import { withRedis } from '@/lib/serverless/redis-connection'

// Max concurrent workers per job
const MAX_WORKERS_PER_JOB = 5

// Process a single batch of work
async function processBatch(userId: string, jobId: string) {
  try {
    // Get job details
    const job = await getJob(userId, jobId)
    if (!job) {
      console.log(`❌ Job ${jobId} not found`)
      return { completed: true }
    }
    
    // Check if job is still running
    if (job.status !== 'running') {
      console.log(`⏸️ Job ${jobId} is not running (status: ${job.status})`)
      return { completed: true }
    }
    
    // Get tasks from Redis queue
    const tasks = await getTasksFromRedisQueue(jobId, 10)
    
    if (tasks.length === 0) {
      console.log(`📭 No more URLs in Redis queue for job ${jobId}`)
      
      // Check if queue is truly empty and no other workers are active
      const isEmpty = await isQueueEmpty(jobId)
      const workerCount = await getWorkerCount(jobId)
      
      if (isEmpty && workerCount <= 1) {
        // Mark job as completed
        await updateJobStatus(userId, jobId, 'completed')
        await storeSSEEvent(userId, jobId, 'job_completed', { jobId })
      }
      
      return { completed: true }
    }
    
    console.log(`📦 Processing batch of ${tasks.length} URLs for job ${jobId}`)
    
    // Store batch started event
    await storeSSEEvent(userId, jobId, 'batch_started', {
      count: tasks.length,
      urls: tasks.map(t => t.url)
    })
    
    // Add URLs to database for tracking (if not already there)
    for (const task of tasks) {
      await addUrlsToQueue(userId, jobId, [task.url], task.depth)
    }
    
    // Call the stateless crawler
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/v4/crawl`,
      {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-test-user-id': userId
        },
        body: JSON.stringify({ 
          jobId, 
          urls: tasks.map(task => ({
            id: task.id,
            url: task.url,
            depth: task.depth
          })),
          originalJobUrl: job.url
        }),
        signal: AbortSignal.timeout(35000) // 35s timeout
      }
    )
    
    if (!response.ok) {
      console.error('❌ Crawler failed:', await response.text())
      
      // Mark URLs as failed  
      for (const task of tasks) {
        await markUrlFailed(task.id)
      }
      
      await storeSSEEvent(userId, jobId, 'batch_error', { 
        error: 'Crawler failed',
        urls: tasks.map(t => t.url)
      })
      return { completed: false, error: true }
    }
    
    const results = await response.json()
    
    // Store batch completion event
    await storeSSEEvent(userId, jobId, 'batch_completed', {
      completed: results.completed.length,
      failed: results.failed.length,
      discovered: results.discoveredUrls?.length || 0,
      fromCache: results.completed.filter((r: any) => r.fromCache).length
    })
    
    // Add discovered URLs to Redis queue
    if (results.discoveredUrls?.length > 0) {
      const currentDepth = Math.max(...tasks.map(t => t.depth))
      if (currentDepth < 2) { // Max depth of 2
        const added = await addUrlsToRedisQueue(
          jobId,
          results.discoveredUrls,
          currentDepth + 1
        )
        
        if (added > 0) {
          await storeSSEEvent(userId, jobId, 'urls_discovered', {
            count: added,
            depth: currentDepth + 1
          })
        }
      }
    }
    
    // Trigger content processor asynchronously
    if (results.completed.length > 0) {
      fetch(
        `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/v4/process`,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-test-user-id': userId
          },
          body: JSON.stringify({ 
            jobId, 
            results: results.completed 
          })
        }
      ).catch(error => {
        console.error('Failed to call processor:', error)
      })
    }
    
    return { completed: false }
    
  } catch (error) {
    console.error('Worker error:', error)
    await storeSSEEvent(userId, jobId, 'worker_error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return { completed: false, error: true }
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request)
    const { jobId, initialWorker = false } = await request.json()
    
    if (!jobId) {
      return NextResponse.json({
        success: false,
        error: 'jobId is required'
      }, { status: 400 })
    }
    
    // Check worker count
    const currentWorkers = await getWorkerCount(jobId)
    if (currentWorkers >= MAX_WORKERS_PER_JOB && !initialWorker) {
      console.log(`🚫 Max workers (${MAX_WORKERS_PER_JOB}) reached for job ${jobId}`)
      return NextResponse.json({ success: true, message: 'Max workers reached' })
    }
    
    // Increment worker count
    const workerCount = await incrementWorkerCount(jobId)
    console.log(`👷 Worker ${workerCount} starting for job ${jobId}`)
    
    try {
      // Process work loop
      let continueProcessing = true
      let batchCount = 0
      const maxBatches = 10 // Process up to 10 batches per worker invocation
      
      while (continueProcessing && batchCount < maxBatches) {
        const result = await processBatch(userId, jobId)
        
        if (result.completed || result.error) {
          continueProcessing = false
        } else {
          batchCount++
          // Small delay between batches
          await new Promise(resolve => setTimeout(resolve, 200))
        }
      }
      
      // Decrement worker count
      const remainingWorkers = await decrementWorkerCount(jobId)
      console.log(`👷 Worker finished for job ${jobId}, ${remainingWorkers} workers remaining`)
      
      // If there's still work and we have capacity, spawn a new worker
      if (!continueProcessing && remainingWorkers < MAX_WORKERS_PER_JOB) {
        // Check if there are more URLs in the Redis queue
        const isEmpty = await isQueueEmpty(jobId)
        
        if (!isEmpty) {
          // Use waitUntil to spawn a new worker asynchronously
          waitUntil(
            fetch(
              `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/v4/worker`,
              {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'x-test-user-id': userId
                },
                body: JSON.stringify({ jobId })
              }
            ).catch(err => console.error('Failed to spawn continuation worker:', err))
          )
        }
      }
      
    } finally {
      // Always decrement on exit (in case of errors)
      await decrementWorkerCount(jobId).catch(() => {})
    }
    
    return NextResponse.json({ success: true })
    
  } catch (error) {
    console.error('Worker error:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const maxDuration = 60 // 1 minute per worker invocation