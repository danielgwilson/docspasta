import { NextRequest, NextResponse } from 'next/server'
import { getCrawl } from '@/lib/crawler/crawl-redis'
import { getCrawlJobCounts, cancelCrawlJobs } from '@/lib/crawler/queue-jobs'
import type { CrawlStatus } from '@/lib/crawler/types'

interface CrawlStatusResponse {
  success: boolean
  data?: CrawlStatus
  error?: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<CrawlStatusResponse>> {
  try {
    const { id: crawlId } = await params

    // Easter egg: Handle docspasta.com farewell crawls
    if (crawlId.startsWith('farewell_')) {
      // Simulate completed crawl with V1 farewell message
      const farewell: CrawlStatus = {
        id: crawlId,
        url: 'https://docspasta.com',
        status: 'completed',
        progress: {
          current: 42,
          total: 42,
          phase: 'completed',
          message: 'The legend of V1 lives on! 🫡'
        },
        results: [
          {
            url: 'https://docspasta.com',
            title: 'Docspasta V1 Farewell',
            content: `# Farewell to Docspasta V1 🫡

The original Docspasta crawler that started it all. Though V2 brings queue-based architecture, 
parallel processing, and real-time progress tracking, we'll always remember the scrappy 
V1 crawler that proved documentation extraction could be beautiful.

## The V1 Legacy
- Simple but effective crawler
- Quality-based content filtering  
- Markdown extraction pioneers
- Documentation tree understanding

## Enter V2
- BullMQ queue system with Redis
- Dynamic URL discovery
- Atomic URL locking
- Real-time progress tracking
- Hierarchical timeout system
- Parallel processing architecture

*The king is dead, long live the king!* 👑`,
            contentType: 'markdown' as const,
            timestamp: Date.now(),
            statusCode: 200,
            depth: 0,
          }
        ],
        createdAt: Date.now() - 10000,
        completedAt: Date.now(),
      }

      return NextResponse.json({
        success: true,
        data: farewell
      })
    }

    // Get crawl metadata from Redis
    const crawl = await getCrawl(crawlId)
    
    if (!crawl) {
      console.log(`❌ Crawl not found: ${crawlId}`)
      return NextResponse.json({
        success: false,
        error: 'Crawl not found'
      }, { status: 404 })
    }
    
    console.log(`📊 Crawl ${crawlId} status: ${crawl.status}, phase: ${crawl.progress?.phase}, processed: ${crawl.totalProcessed}/${crawl.totalQueued}`)

    // Get real-time job counts from queue
    const jobCounts = await getCrawlJobCounts(crawlId)
    
    // Build response with enhanced progress
    const status: CrawlStatus = {
      id: crawl.id,
      url: crawl.url,
      status: crawl.status,
      progress: {
        ...crawl.progress,
        current: crawl.totalProcessed,
        total: crawl.totalQueued, // Use queued instead of discovered for accurate progress
        // Include all tracking fields
        discovered: crawl.totalDiscovered,
        queued: crawl.totalQueued,
        processed: crawl.totalProcessed,
        filtered: crawl.totalFiltered,
        skipped: crawl.totalSkipped,
        failed: crawl.totalFailed,
      },
      results: crawl.results,
      createdAt: crawl.createdAt,
      completedAt: crawl.completedAt,
      errorMessage: crawl.errorMessage,
    }
    
    // Combine results into markdown if crawl is completed
    let markdown: string | undefined
    if (crawl.status === 'completed' && crawl.results.length > 0) {
      // Sort results by URL for consistent output
      const sortedResults = [...crawl.results].sort((a, b) => a.url.localeCompare(b.url))
      
      // Combine all content into a single markdown document
      const sections = sortedResults
        .filter(result => result.content && result.contentType !== 'error')
        .map(result => {
          const header = `# ${result.title || result.url}\n\n`
          const sourceInfo = `> Source: ${result.url}\n\n`
          const content = result.content.trim()
          return `${header}${sourceInfo}${content}`
        })
      
      if (sections.length > 0) {
        markdown = sections.join('\n\n---\n\n')
      }
    }

    // Add debug info for active crawls
    if (crawl.status === 'active') {
      status.progress.message = `${status.progress.message} (Active: ${jobCounts.active}, Waiting: ${jobCounts.waiting})`
    }

    return NextResponse.json({
      success: true,
      data: {
        ...status,
        markdown
      }
    })
  } catch (error) {
    console.error('Crawl status API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<{ success: boolean; error?: string }>> {
  try {
    const { id: crawlId } = await params

    // Cancel all jobs for this crawl
    await cancelCrawlJobs(crawlId)
    
    // Update crawl status to cancelled
    const { updateCrawlProgress } = await import('@/lib/crawler/crawl-redis')
    await updateCrawlProgress(crawlId, {
      status: 'cancelled',
      completedAt: Date.now(),
    })

    console.log(`❌ Cancelled crawl: ${crawlId}`)

    return NextResponse.json({
      success: true
    })
  } catch (error) {
    console.error('Cancel crawl API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}