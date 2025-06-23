import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/middleware'
import { db } from '@/lib/db/connection'
import { crawlingJobs } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserContext(request)
    const { id: jobId } = await params
    
    // Get job with user isolation
    const [job] = await db
      .select()
      .from(crawlingJobs)
      .where(and(
        eq(crawlingJobs.id, jobId),
        eq(crawlingJobs.userId, user.userId)
      ))
    
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      )
    }
    
    if (job.status !== 'completed') {
      return NextResponse.json(
        { success: false, error: 'Job not completed yet' },
        { status: 400 }
      )
    }
    
    if (!job.finalMarkdown) {
      return NextResponse.json(
        { success: false, error: 'No content available for download' },
        { status: 404 }
      )
    }
    
    // Return markdown content as downloadable file
    return new NextResponse(job.finalMarkdown, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="crawl-${jobId}.md"`,
        'Cache-Control': 'public, max-age=3600'
      }
    })
    
  } catch (error) {
    console.error('❌ [V5] Failed to download job content:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to download content'
      },
      { status: 500 }
    )
  }
}