import { NextRequest, NextResponse } from 'next/server'
import { getCombinedMarkdown } from '@/lib/serverless/db-operations'
import { getUserId } from '@/lib/serverless/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId(request)
    const { id: jobId } = await params
    
    // Get combined markdown for the job
    const result = await getCombinedMarkdown(userId, jobId)
    
    if (!result) {
      return NextResponse.json({
        success: false,
        error: 'Job not found or not completed'
      }, { status: 404 })
    }
    
    return NextResponse.json({
      success: true,
      jobId,
      title: result.title,
      content: result.content,
      wordCount: result.content.split(/\s+/).length,
      pageCount: result.pageCount,
      url: result.url
    })
    
  } catch (error) {
    console.error('Failed to get job content:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}