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

    // Ensure worker is running with higher concurrency
    try {
      await startWorker(3) // Test moderate concurrency - sweet spot
      console.log('✨ Queue worker is running')
    } catch (workerError) {
      console.error('Failed to start worker:', workerError)
      // Continue anyway - worker might already be running
    }

    // Generate unique crawl ID
    const crawlId = uuidv4()

    // Default crawl options optimized for realistic documentation crawling
    const crawlOptions: CrawlOptions = {
      maxDepth: options.maxDepth || 2, // Allow some depth for documentation 
      maxPages: options.maxPages || 50, // Reasonable limit for docs sites
      respectRobotsTxt: options.respectRobotsTxt ?? true,
      delay: options.delay || 0, // No delay for maximum speed
      timeout: options.timeout || 8000, // 8 second per-page timeout for debugging
      concurrency: options.concurrency || 3, // Test moderate concurrency
      includePatterns: options.includePatterns || [],
      excludePatterns: options.excludePatterns || [],
      qualityThreshold: options.qualityThreshold ?? 20,
    }

    // 🚀 TAILWIND FIX: Enhance discovery for sites that commonly lack sitemaps
    const hostname = parsedUrl.hostname.toLowerCase()
    if (hostname.includes('tailwindcss.com') || hostname.includes('bootstrap.com') || hostname.includes('bulma.io')) {
      console.log(`🎯 Detected CSS framework site: ${hostname} - optimizing for link discovery`)
      crawlOptions.maxDepth = Math.max(crawlOptions.maxDepth || 2, 3) // Increase depth for link discovery
      crawlOptions.qualityThreshold = Math.min(crawlOptions.qualityThreshold || 20, 15) // Lower threshold for CSS docs
    }

    // Pre-save crawl record so SSE can find it immediately
    try {
      const { saveCrawl } = await import('@/lib/crawler/crawl-redis')
      
      // Save initial crawl record
      console.log(`💾 Pre-saving crawl record for ${crawlId}`)
      await saveCrawl({
        id: crawlId,
        url,
        status: 'active',
        createdAt: Date.now(),
        totalDiscovered: 0,
        totalQueued: 0,
        totalProcessed: 0,
        totalFiltered: 0,
        totalSkipped: 0,
        totalFailed: 0,
        discoveryComplete: false,
        progress: {
          current: 0,
          total: 0,
          phase: 'initializing',
          message: 'Starting crawl...',
          discovered: 0,
          queued: 0,
          processed: 0,
          filtered: 0,
          skipped: 0,
          failed: 0,
        },
        results: [],
      })
      console.log(`✅ Pre-saved crawl record for ${crawlId}`)
      
      // Add kickoff job to queue
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