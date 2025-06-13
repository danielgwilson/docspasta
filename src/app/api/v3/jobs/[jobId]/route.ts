import { NextRequest, NextResponse } from 'next/server'
import { JobManager } from '@/lib/serverless/jobs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<NextResponse> {
  try {
    const { jobId } = await params
    
    const jobManager = new JobManager()
    const jobState = await jobManager.getJobState(jobId)
    
    if (!jobState) {
      return NextResponse.json({
        success: false,
        error: 'Job not found'
      }, { status: 404 })
    }
    
    return NextResponse.json({
      success: true,
      data: jobState
    })
    
  } catch (error) {
    console.error('❌ Failed to get job status:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'