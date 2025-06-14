import { NextRequest, NextResponse } from 'next/server'
import { createJob, addUrlsToQueue, getActiveJobs } from '@/lib/serverless/db-operations'
import { isValidCrawlUrl } from '@/lib/serverless/url-utils'
import { getUserId } from '@/lib/serverless/auth'
import { waitUntil } from '@vercel/functions'
import { addUrlsToRedisQueue } from '@/lib/serverless/redis-queue'

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request)
    const jobs = await getActiveJobs(userId)
    
    return NextResponse.json({
      success: true,
      data: jobs
    })
  } catch (error) {
    console.error('Failed to get active jobs:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request)
    const body = await request.json()
    const { url } = body
    
    if (!url || typeof url !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'URL is required'
      }, { status: 400 })
    }
    
    // Validate URL
    if (!isValidCrawlUrl(url)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid URL. Must be a valid http/https URL.'
      }, { status: 400 })
    }
    
    // Create job in database
    const jobId = await createJob(userId, url)
    
    // Add initial URL to database queue (for tracking)
    await addUrlsToQueue(userId, jobId, [url], 0)
    
    // Add the initial URL to Redis queue
    await addUrlsToRedisQueue(jobId, [url], 0)
    
    console.log(`✨ Created job ${jobId} for user ${userId}, URL: ${url}`)
    
    // Spawn initial workers (3-5) using fire-and-forget pattern
    const INITIAL_WORKERS = 3
    const workerPromises = []
    
    for (let i = 0; i < INITIAL_WORKERS; i++) {
      workerPromises.push(
        fetch(
          `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/v4/worker`,
          {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'x-test-user-id': userId
            },
            body: JSON.stringify({ jobId, initialWorker: true })
          }
        ).catch(err => console.error(`Failed to spawn worker ${i + 1}:`, err))
      )
    }
    
    // Use waitUntil to ensure workers are spawned even after response is sent
    waitUntil(Promise.all(workerPromises))
    
    return NextResponse.json({
      success: true,
      data: {
        jobId,
        url,
        streamUrl: `/api/v4/jobs/${jobId}/stream`
      }
    })
    
  } catch (error) {
    console.error('Failed to create job:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}