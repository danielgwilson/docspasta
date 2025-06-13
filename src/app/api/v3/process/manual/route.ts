import { NextRequest, NextResponse } from 'next/server'
import { URLProcessor } from '@/lib/serverless/processor'

// Manual trigger endpoint for development
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    console.log('⏰ Manually triggered - processing queue')
    
    const processor = new URLProcessor()
    await processor.processBatch(20) // Process up to 20 URLs
    
    return NextResponse.json({
      success: true,
      message: 'Batch processed manually'
    })
    
  } catch (error) {
    console.error('❌ Manual processing failed:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 1 minute for manual trigger