import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/middleware'
import { db } from '@/lib/db/connection'
import { crawlingJobs } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
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
      job: {
        id: job.id,
        url: job.url,
        status: job.status,
        statusMessage: job.statusMessage,
        pagesProcessed: stats.pagesProcessed,
        pagesFound: stats.pagesFound,
        totalWords: stats.totalWords,
        stateVersion: job.stateVersion,
        progressSummary: job.progressSummary,
        config: job.config,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
        completedAt: job.completedAt?.toISOString()
      }
    })
    
  } catch (error) {
    console.error('❌ [V5] Failed to get job:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get job'
      },
      { status: 500 }
    )
  }
}