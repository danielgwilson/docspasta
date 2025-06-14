import { NextRequest, NextResponse } from 'next/server'
import { 
  storeJobResults,
  updateJobMetrics 
} from '@/lib/serverless/db-operations'
import { publishEvent } from '@/lib/serverless/redis-stream'
import { combineToMarkdown } from '@/lib/serverless/quality'
import { getUserId } from '@/lib/serverless/auth'

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request)
    const { jobId, results } = await request.json()
    
    if (!jobId || !results || !Array.isArray(results)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request: jobId and results array required'
      }, { status: 400 })
    }
    
    console.log(`🔄 Processing ${results.length} results for job ${jobId}`)
    
    // Store the results
    await storeJobResults(userId, jobId, results)
    
    // Filter high-quality content (score >= 20)
    const goodContent = results.filter(r => r.quality?.score >= 20)
    
    if (goodContent.length > 0) {
      // Generate combined markdown
      const markdown = combineToMarkdown(goodContent)
      
      // Update job metrics
      const totalWords = goodContent.reduce((sum, r) => sum + r.wordCount, 0)
      await updateJobMetrics(userId, jobId, {
        pages_processed: results.length,
        total_words: totalWords,
        final_markdown: markdown
      })
      
      // Publish progress event
      await publishEvent(userId, jobId, {
        type: 'content_processed',
        pages: goodContent.length,
        totalWords,
        lowQualityFiltered: results.length - goodContent.length
      })
      
      console.log(`✅ Processed ${goodContent.length} quality pages (${totalWords} words)`)
    } else {
      // No quality content found
      await publishEvent(userId, jobId, {
        type: 'content_processed',
        pages: 0,
        totalWords: 0,
        lowQualityFiltered: results.length
      })
      
      console.log(`⚠️ No quality content found in ${results.length} pages`)
    }
    
    return NextResponse.json({ 
      success: true, 
      processed: results.length,
      goodContent: goodContent.length,
      totalWords: goodContent.reduce((sum, r) => sum + r.wordCount, 0)
    })
    
  } catch (error) {
    console.error('Processing error:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export const maxDuration = 10 // 10 second timeout