import { NextRequest, NextResponse } from 'next/server'
import { processV5UrlJob, startCrawlJob, finalizeJob } from '@/lib/v5-worker'
import { JobPayload } from '@/lib/queue/types'

export async function POST(request: NextRequest) {
  try {
    const payload: JobPayload = await request.json()
    
    console.log(`🚀 [V5] Processing ${payload.type} job for ${payload.jobId}`)
    
    switch (payload.type) {
      case 'start-crawl':
        await startCrawlJob(payload)
        break
        
      case 'process-url':
        await processV5UrlJob(payload)
        break
        
      case 'finalize-job':
        await finalizeJob(payload)
        break
        
      default:
        console.warn(`⚠️ [V5] Unknown job type: ${(payload as any).type}`)
        return NextResponse.json(
          { success: false, error: `Unknown job type: ${(payload as any).type}` },
          { status: 400 }
        )
    }
    
    console.log(`✅ [V5] Job completed: ${payload.type} ${payload.jobId}`)
    
    return NextResponse.json({
      success: true,
      message: `Processed ${payload.type} job`,
      jobId: payload.jobId,
    })
    
  } catch (error) {
    console.error('❌ [V5] Process job failed:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Job processing failed'
      },
      { status: 500 }
    )
  }
}