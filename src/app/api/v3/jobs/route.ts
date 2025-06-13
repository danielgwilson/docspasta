import { NextRequest, NextResponse } from 'next/server'
import { JobManager, CreateJobSchema } from '@/lib/serverless/jobs'
import { QueueManager } from '@/lib/serverless/queue'
import { initializeJob } from '@/lib/serverless/streaming'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const jobRequest = CreateJobSchema.parse(body)
    
    // Validate URL to prevent SSRF
    try {
      const url = new URL(jobRequest.url)
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Invalid protocol')
      }
      // Block internal IPs and localhost
      const hostname = url.hostname.toLowerCase()
      if (hostname === 'localhost' || 
          hostname === '127.0.0.1' || 
          hostname.startsWith('169.254.') ||
          hostname.startsWith('10.') ||
          hostname.startsWith('172.16.') ||
          hostname.startsWith('192.168.')) {
        throw new Error('Internal URLs not allowed')
      }
    } catch (error) {
      return NextResponse.json({
        success: false,
        error: 'Invalid URL: must be a public http or https URL'
      }, { status: 400 })
    }
    
    const jobManager = new JobManager()
    const queueManager = new QueueManager()
    
    // Create job
    const jobId = await jobManager.createJob(jobRequest)
    
    // Initialize job stream in Redis (creates metadata and initial event)
    await initializeJob(jobId)
    
    // Add initial URL to queue
    await queueManager.addUrlsToQueue(jobId, [jobRequest.url])
    
    // Update job state
    await jobManager.updateJobState(jobId, {
      status: 'running',
      currentStep: 'discovery',
      totalUrls: 1,
      startedAt: Date.now(),
    })
    
    console.log(`✨ Created job ${jobId} for ${jobRequest.url}`)
    
    return NextResponse.json({
      success: true,
      data: {
        jobId,
        url: jobRequest.url,
        status: 'running',
        streamUrl: `/api/v3/jobs/${jobId}/stream`,
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