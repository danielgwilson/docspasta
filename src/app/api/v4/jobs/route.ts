import { NextRequest, NextResponse } from 'next/server'
import { createJob, getActiveJobs, getRecentJobs } from '@/lib/serverless/db-operations-simple'
import { isValidCrawlUrl } from '@/lib/serverless/url-utils'
import { getCurrentUser } from '@/lib/auth/middleware'

export async function GET(request: NextRequest) {
  try {
    // Get current user (authenticated or anonymous)
    const user = await getCurrentUser(request)
    
    // Fetch recent jobs (both running and recently completed)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    
    const jobs = await getRecentJobs(user.id, oneHourAgo)
    
    return NextResponse.json({
      success: true,
      data: jobs
    })
  } catch (error) {
    console.error('Failed to get recent jobs:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get current user (authenticated or anonymous)
    const user = await getCurrentUser(request)
    
    const body = await request.json()
    const { url, force = false } = body
    
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
    
    // Create job in database with user ID
    const jobId = await createJob(url, user.id, force)
    
    console.log(`✨ Created job ${jobId} for URL: ${url} (user: ${user.id}, anonymous: ${user.isAnonymous}, force: ${force})`)
    
    // The stream endpoint will orchestrate the crawling
    
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