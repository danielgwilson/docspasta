import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/middleware'
import { db } from '@/lib/db/connection'
import { crawlingJobs, crawledPages } from '@/lib/db/schema'
import { eq, and, count, sum } from 'drizzle-orm'
import { getJobStatistics } from '@/lib/v5-state-management'

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
    
    // Get real-time statistics from crawled_pages table
    const stats = await getJobStatistics(jobId, user.userId)
    
    return NextResponse.json({
      success: true,
      status: job.status,
      totalProcessed: stats.pagesProcessed,
      totalDiscovered: stats.pagesFound,
      totalWords: stats.totalWords,
      error: job.statusMessage,
      stateVersion: job.stateVersion,
      progressSummary: job.progressSummary,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      completedAt: job.completedAt?.toISOString()
    })
    
  } catch (error) {
    console.error('❌ [V5] Failed to get job status:', error)
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get job status',
        details: error instanceof Error ? error.stack : String(error)
      },
      { status: 500 }
    )
  }
}