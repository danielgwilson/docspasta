/**
 * Job Finalization Module
 * Handles job completion detection and final markdown generation
 */

import { db } from '@/lib/db/connection'
import { crawlingJobs, crawledPages, pageContentChunks } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import {
  markJobAsCompleted,
  markJobAsFailed,
} from '@/lib/v5-state-management'

/**
 * Check if job is complete and finalize if all pages are processed
 */
export async function checkAndFinalizeJob(jobId: string, userId: string): Promise<void> {
  try {
    // Check if any pages are still pending
    const pendingCount = await db.select({
      count: sql<number>`count(*)::int`,
    })
    .from(crawledPages)
    .innerJoin(crawlingJobs, eq(crawledPages.jobId, crawlingJobs.id))
    .where(and(
      eq(crawlingJobs.id, jobId),
      eq(crawlingJobs.userId, userId),
      eq(crawledPages.status, 'pending')
    ))
    
    if (pendingCount[0].count > 0) {
      console.log(`🔄 [V5] Job ${jobId} still has ${pendingCount[0].count} pending pages`)
      return // Still has pending work
    }
    
    // All pages processed - generate final markdown
    console.log(`🏁 [V5] Finalizing job ${jobId}`)
    
    const finalMarkdown = await generateFinalMarkdown(jobId, userId)
    await markJobAsCompleted(jobId, userId, finalMarkdown)
    
    console.log(`✅ [V5] Job ${jobId} completed successfully`)
    
  } catch (error) {
    console.error(`❌ [V5] Job finalization failed for ${jobId}:`, error)
    
    await markJobAsFailed(
      jobId,
      userId,
      `Finalization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Generate final markdown from all successful pages
 */
export async function generateFinalMarkdown(jobId: string, userId: string): Promise<string> {
  // Get all successful pages with content
  const pages = await db.select({
    url: crawledPages.url,
    title: crawledPages.title,
    content: pageContentChunks.content,
    qualityScore: crawledPages.qualityScore,
  })
  .from(crawledPages)
  .innerJoin(crawlingJobs, eq(crawledPages.jobId, crawlingJobs.id))
  .innerJoin(pageContentChunks, eq(crawledPages.id, pageContentChunks.pageId))
  .where(and(
    eq(crawlingJobs.id, jobId),
    eq(crawlingJobs.userId, userId),
    eq(crawledPages.status, 'crawled')
  ))
  .orderBy(crawledPages.qualityScore)
  
  if (pages.length === 0) {
    return '# Crawl Results\\n\\nNo content was successfully extracted.'
  }
  
  const sections = pages.map(page => 
    `## ${page.title || page.url}\\n\\n${page.content}\\n\\n---\\n`
  )
  
  return `# Crawl Results\\n\\n${sections.join('\\n')}`
}