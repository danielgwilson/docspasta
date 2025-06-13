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

export async function POST(request: NextRequest) {
  try {
    const { jobId, urls, originalJobUrl } = await request.json()
    
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
          // Check cache first
          const cached = await getCachedContent(url)
          if (cached) {
            console.log(`📦 Cache hit: ${url}`)
            
            // Mark URL as completed
            await markUrlCompleted(urlId)
            
            return {
              url,
              title: cached.title,
              content: cached.content,
              links: cached.links,
              quality: { score: cached.quality_score },
              wordCount: cached.word_count,
              success: true,
              fromCache: true
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
            await cacheContent(url, {
              title: result.title || 'Untitled',
              content: result.content,
              links: validLinks,
              quality_score: quality.score,
              word_count: wordCount
            })
            
            // Mark URL as completed
            await markUrlCompleted(urlId)
            
            return {
              url,
              title: result.title,
              content: result.content,
              links: validLinks,
              quality,
              wordCount,
              success: true,
              fromCache: false
            }
          } else {
            // Mark URL as failed
            await markUrlFailed(urlId)
            
            return { 
              url, 
              success: false, 
              error: result.error || 'Failed to crawl'
            }
          }
        } catch (error) {
          // Mark URL as failed
          await markUrlFailed(urlId)
          
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
    
    // Extract discovered URLs (only from fresh crawls)
    const discoveredUrls = completed
      .filter(result => !result.fromCache)
      .flatMap(result => result.links || [])
      .filter((url, index, self) => self.indexOf(url) === index) // Dedupe
    
    console.log(`✅ Crawl complete: ${completed.length} success, ${failed.length} failed`)
    
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