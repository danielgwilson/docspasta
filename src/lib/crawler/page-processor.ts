/**
 * Page Processing Module
 * Handles crawling individual pages, extracting content, and assessing quality
 */

import { WebCrawler } from '@/lib/web-crawler'
import { assessContentQuality } from '@/lib/quality'
import { extractValidLinks } from '@/lib/url-utils'
import { db } from '@/lib/db/connection'
import { crawledPages, pageContentChunks } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import {
  incrementPageCounts,
} from '@/lib/v5-state-management'

/**
 * Process a single URL job: crawl page, extract content, assess quality
 */
export async function processUrlJob(payload: {
  jobId: string
  userId: string
  urlId: string
  url: string
  originalJobUrl: string
  qualityThreshold: number
}): Promise<void> {
  const { jobId, userId, urlId, url, originalJobUrl, qualityThreshold } = payload
  
  console.log(`🔍 [V5] Processing URL: ${url} (ID: ${urlId})`)
  
  try {
    // Atomically mark page as being processed
    const updateResult = await db.update(crawledPages)
      .set({ 
        status: 'crawled', 
        crawledAt: new Date() 
      })
      .where(
        and(
          eq(crawledPages.id, urlId),
          eq(crawledPages.status, 'pending')
        )
      )
      .returning({
        id: crawledPages.id,
        status: crawledPages.status,
        url: crawledPages.url,
      })
    
    if (updateResult.length === 0) {
      // Page was already processed or doesn't exist
      const existingPage = await db.select({
        id: crawledPages.id,
        status: crawledPages.status,
        url: crawledPages.url,
      })
      .from(crawledPages)
      .where(eq(crawledPages.id, urlId))
      .limit(1)
      
      if (existingPage.length === 0) {
        throw new Error(`Page not found: ${urlId}`)
      }
      
      console.log(`🔄 [V5] Page already processed: ${url} (status: ${existingPage[0].status})`)
      return
    }
    
    const pageResult = { alreadyProcessed: false, page: updateResult[0] }
    
    if (pageResult.alreadyProcessed) {
      return // Job already completed by another worker
    }
    
    // Crawl the page
    const crawler = new WebCrawler()
    const crawlResult = await crawler.crawlPage(url, { timeout: 8000 })
    
    if (!crawlResult.success || !crawlResult.content) {
      // Mark page as failed
      await updatePageStatus(urlId, 'error', crawlResult.error || 'No content returned')

      return
    }
    
    // Assess content quality
    const quality = assessContentQuality(crawlResult.content, url)
    const wordCount = crawlResult.content.split(/\s+/).length
    
    // Extract valid links for potential discovery
    const validLinks = extractValidLinks(crawlResult.links || [], url, originalJobUrl)
    
    // Store content in chunks
    await storePageContent(urlId, {
      title: crawlResult.title || 'Untitled',
      content: crawlResult.content,
      quality,
      wordCount,
      links: validLinks,
    })
    
    // Update page metadata
    await updatePageMetadata(urlId, {
      title: crawlResult.title || 'Untitled',
      httpStatus: 200, // Assume success if we got content
      qualityScore: quality.score,
      wordCount,
    })
    
    // Page counts are now calculated dynamically from crawled_pages table
    
    console.log(`✅ [V5] URL processed: ${url} (quality: ${quality.score}, words: ${wordCount})`)
    
  } catch (error) {
    console.error(`❌ [V5] URL processing failed for ${url}:`, error)
    
    // Mark page as failed
    await updatePageStatus(
      urlId,
      'error',
      error instanceof Error ? error.message : 'Unknown processing error'
    )
    
    await incrementPageCounts(jobId, userId, { failed: 1 })
    
    // Re-throw to trigger QStash retry
    throw error
  }
}

/**
 * Store page content in database chunks
 */
export async function storePageContent(pageId: string, content: {
  title: string
  content: string
  quality: { score: number; reason: string }
  wordCount: number
  links: string[]
}) {
  // Store as single chunk for simplicity
  await db.insert(pageContentChunks).values({
    id: crypto.randomUUID(),
    pageId,
    content: content.content,
    contentType: 'markdown',
    chunkIndex: 0,
    startPosition: 0,
    endPosition: content.content.length,
    metadata: {
      chunkIndex: 0,
      startPosition: 0,
      endPosition: content.content.length,
      extractionMethod: 'web-crawler',
      qualityScore: content.quality.score,
    },
    createdAt: new Date(),
  })
}

/**
 * Update page metadata after successful crawling
 */
export async function updatePageMetadata(pageId: string, metadata: {
  title: string
  httpStatus: number
  qualityScore: number
  wordCount: number
}) {
  await db.update(crawledPages)
    .set(metadata)
    .where(eq(crawledPages.id, pageId))
}

/**
 * Update page status and error message
 */
export async function updatePageStatus(pageId: string, status: 'crawled' | 'error' | 'skipped', errorMessage?: string) {
  await db.update(crawledPages)
    .set({
      status,
      ...(errorMessage && { errorMessage }),
      crawledAt: new Date(),
    })
    .where(eq(crawledPages.id, pageId))
}