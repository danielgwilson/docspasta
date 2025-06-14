import { NextRequest, NextResponse } from 'next/server'
import { WebCrawler } from '@/lib/serverless/web-crawler'
import { 
  getCachedContent, 
  cacheContent,
  markUrlCompleted,
  markUrlFailed 
} from '@/lib/serverless/db-operations'
import { extractValidLinks } from '@/lib/serverless/url-utils'
import { assessContentQuality } from '@/lib/serverless/quality'
import { getUserId } from '@/lib/serverless/auth'

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request)
    const { jobId, urls, originalJobUrl, forceRefresh = false } = await request.json()
    
    if (!jobId || !urls || !Array.isArray(urls)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request: jobId and urls array required'
      }, { status: 400 })
    }
    
    const crawler = new WebCrawler()
    
    // Process URLs in parallel
    const results = await Promise.allSettled(
      urls.map(async (urlData) => {
        const { id: urlId, url, depth } = urlData
        
        try {
          // Check cache first (unless force refresh is enabled)
          const cached = !forceRefresh ? await getCachedContent(userId, url) : null
          if (cached) {
            console.log(`📦 Cache hit: ${url}`)
            
            // Mark URL as completed (only if it's a valid database ID)
            if (urlId && urlId.length > 16) {
              await markUrlCompleted(urlId).catch(() => {
                // Ignore errors for non-database IDs
              })
            }
            
            return {
              url,
              title: cached.title,
              content: cached.content,
              links: cached.links,
              discoveredUrls: cached.links, // Include links as discovered URLs
              quality: { score: cached.quality_score },
              wordCount: cached.word_count,
              success: true,
              fromCache: true,
              depth: depth
            }
          }
          
          // Crawl fresh
          console.log(`🕷️ Crawling: ${url}`)
          const result = await crawler.crawlPage(url, { timeout: 8000 })
          
          if (result.success && result.content) {
            // Assess quality
            const quality = assessContentQuality(result.content, url)
            const wordCount = result.content.split(/\s+/).length
            
            // Extract valid links (filtered by path prefix)
            const validLinks = extractValidLinks(result.links || [], url, originalJobUrl)
            
            // Cache the content
            await cacheContent(userId, url, {
              title: result.title || 'Untitled',
              content: result.content,
              links: validLinks,
              quality_score: quality.score,
              word_count: wordCount
            })
            
            // Mark URL as completed (only if it's a valid database ID)
            if (urlId && urlId.length > 16) {
              await markUrlCompleted(urlId).catch(() => {
                // Ignore errors for non-database IDs
              })
            }
            
            return {
              url,
              title: result.title,
              content: result.content,
              links: validLinks,
              discoveredUrls: validLinks, // Include links as discovered URLs
              quality,
              wordCount,
              success: true,
              fromCache: false,
              depth: depth
            }
          } else {
            // Mark URL as failed
            await markUrlFailed(urlId)
            
            console.error(`❌ Crawl failed for ${url}:`, result.error || 'No content returned')
            
            return { 
              url, 
              success: false, 
              error: result.error || 'Failed to crawl'
            }
          }
        } catch (error) {
          // Mark URL as failed (only if it's a valid database ID)
          if (urlId && urlId.length > 16) {
            await markUrlFailed(urlId).catch(() => {
              // Ignore errors for non-database IDs
            })
          }
          
          return {
            url,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      })
    )
    
    // Separate successful and failed results
    const completed = results
      .filter(r => r.status === 'fulfilled' && r.value.success)
      .map(r => (r as PromiseFulfilledResult<any>).value)
    
    const failed = results
      .filter(r => r.status === 'rejected' || !(r as PromiseFulfilledResult<any>).value?.success)
      .map(r => {
        if (r.status === 'fulfilled') {
          const value = (r as PromiseFulfilledResult<any>).value
          return {
            url: value.url,
            error: value.error || 'Unknown error'
          }
        } else {
          return {
            url: 'unknown',
            error: (r as PromiseRejectedResult).reason?.message || 'Unknown error'
          }
        }
      })
    
    // Extract discovered URLs from all results (both cached and fresh)
    const discoveredUrls = completed
      .flatMap(result => result.discoveredUrls || result.links || [])
      .filter((url, index, self) => self.indexOf(url) === index) // Dedupe
    
    console.log(`✅ Crawl complete: ${completed.length} success, ${failed.length} failed`)
    
    // Log failures for debugging
    if (failed.length > 0) {
      console.log('Failed URLs:', failed)
    }
    
    return NextResponse.json({
      success: true,
      completed,
      failed,
      discoveredUrls
    })
    
  } catch (error) {
    console.error('Crawler error:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export const maxDuration = 30 // 30 second timeout