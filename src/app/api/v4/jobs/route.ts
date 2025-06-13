import { NextRequest, NextResponse } from 'next/server'
import { createJob, addUrlsToQueue } from '@/lib/serverless/db-operations'
import { isValidCrawlUrl } from '@/lib/serverless/url-utils'

export async function POST(request: NextRequest) {
  try {
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
    const jobId = await createJob(url)
    
    // Add initial URL to queue
    await addUrlsToQueue(jobId, [url], 0)
    
    console.log(`✨ Created job ${jobId} for ${url}`)
    
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