import { NextRequest, NextResponse } from 'next/server'
import { URLProcessor } from '@/lib/serverless/processor'

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Verify this is called from Vercel Cron
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    console.log('⏰ Cron triggered - processing queue')
    
    const processor = new URLProcessor()
    await processor.processBatch(20) // Process up to 20 URLs
    
    return NextResponse.json({
      success: true,
      message: 'Batch processed'
    })
    
  } catch (error) {
    console.error('❌ Cron processing failed:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 1 minute for cron job