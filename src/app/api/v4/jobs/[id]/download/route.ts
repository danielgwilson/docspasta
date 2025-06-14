import { NextRequest, NextResponse } from 'next/server'
import { getCombinedMarkdown } from '@/lib/serverless/db-operations-simple'
import { getCurrentUser } from '@/lib/auth/middleware'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params
    
    // Get current user (authenticated or anonymous)
    const user = await getCurrentUser(request)
    
    // Get the combined markdown for this job
    const result = await getCombinedMarkdown(jobId, user.id)
    
    if (!result || !result.content) {
      return NextResponse.json({
        success: false,
        error: 'No content found for this job'
      }, { status: 404 })
    }
    
    // Create filename from URL or title
    const hostname = new URL(result.url).hostname.replace(/\./g, '-')
    const timestamp = new Date().toISOString().split('T')[0]
    const filename = `${hostname}-${timestamp}.md`
    
    // Return markdown as downloadable file
    return new Response(result.content, {
      headers: {
        'Content-Type': 'text/markdown',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, max-age=3600'
      }
    })
    
  } catch (error) {
    console.error('Failed to download content:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}