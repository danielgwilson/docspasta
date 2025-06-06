import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { addKickoffJob } from '@/lib/crawler/queue-jobs'
import { startWorker } from '@/lib/crawler/queue-worker'
import type { CrawlOptions } from '@/lib/crawler/types'

interface CrawlRequest {
  url: string
  options?: Partial<CrawlOptions>
}

interface CrawlResponse {
  success: boolean
  data?: {
    id: string
    url: string
    status: 'started'
  }
  error?: string
}

export async function POST(request: NextRequest): Promise<NextResponse<CrawlResponse>> {
  try {
    const body: CrawlRequest = await request.json()
    const { url, options = {} } = body

    // Validate URL
    if (!url || typeof url !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'URL is required and must be a string'
      }, { status: 400 })
    }

    // Basic URL validation
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Invalid URL format'
      }, { status: 400 })
    }

    // Easter egg: Check if user is trying to crawl docspasta.com
    if (parsedUrl.hostname.includes('docspasta.com')) {
      const crawlId = `farewell_${Date.now()}_v2`
      
      return NextResponse.json({
        success: true,
        data: {
          id: crawlId,
          url,
          status: 'started'
        }
      })
    }

    // Ensure worker is running
    try {
      await startWorker(5) // 5 concurrent workers
      console.log('✨ Queue worker is running')
    } catch (workerError) {
      console.error('Failed to start worker:', workerError)
      // Continue anyway - worker might already be running
    }

    // Generate unique crawl ID
    const crawlId = uuidv4()

    // Default crawl options following Firecrawl patterns
    const crawlOptions: CrawlOptions = {
      maxDepth: options.maxDepth || 4,
      maxPages: options.maxPages || 200,
      respectRobotsTxt: options.respectRobotsTxt ?? true,
      delay: options.delay || 300,
      timeout: options.timeout || 30000, // 30 second per-page timeout
      concurrency: options.concurrency || 5,
      includePatterns: options.includePatterns || [],
      excludePatterns: options.excludePatterns || [],
    }

    // Add kickoff job to queue
    try {
      await addKickoffJob({
        crawlId,
        url,
        options: crawlOptions,
      })
      
      console.log(`🚀 Started queue-based crawl: ${crawlId} for ${url}`)
      
      return NextResponse.json({
        success: true,
        data: {
          id: crawlId,
          url,
          status: 'started'
        }
      })
    } catch (queueError) {
      console.error('Error adding kickoff job:', queueError)
      return NextResponse.json({
        success: false,
        error: `Failed to start crawl: ${queueError instanceof Error ? queueError.message : 'Unknown error'}`
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Crawl V2 API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}