import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware'
import { db } from '@/lib/db/connection'
import { crawlingJobs } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { getJobStatistics } from '@/lib/v5-state-management'

/**
 * GET /api/v5/jobs/active
 * Returns all non-terminal jobs (pending, running) for the current user
 * This allows state restoration across devices without localStorage
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Get all active jobs (pending or running) for the user
    const activeJobs = await db.select({
      id: crawlingJobs.id,
      url: crawlingJobs.url,
      status: crawlingJobs.status,
      statusMessage: crawlingJobs.statusMessage,
      stateVersion: crawlingJobs.stateVersion,
      createdAt: crawlingJobs.createdAt,
      updatedAt: crawlingJobs.updatedAt,
    })
    .from(crawlingJobs)
    .where(and(
      eq(crawlingJobs.userId, user.id),
      inArray(crawlingJobs.status, ['pending', 'running'])
    ))
    .orderBy(crawlingJobs.createdAt) // Most recent first

    // Get detailed statistics for each active job
    const jobsWithStats = await Promise.all(
      activeJobs.map(async (job) => {
        const stats = await getJobStatistics(job.id, user.id)
        return {
          ...job,
          statistics: stats,
        }
      })
    )

    return NextResponse.json({
      success: true,
      activeJobs: jobsWithStats,
      count: jobsWithStats.length,
    })

  } catch (error) {
    console.error('❌ [V5] Failed to fetch active jobs:', error)
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch active jobs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}