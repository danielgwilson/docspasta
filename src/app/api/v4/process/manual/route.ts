import { NextRequest, NextResponse } from 'next/server'
import { URLProcessor } from '@/lib/serverless/processor'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { batchSize = 10 } = body
    
    console.log(`🔄 Manual process triggered with batch size: ${batchSize}`)
    
    const processor = new URLProcessor()
    await processor.processBatch(batchSize)
    
    return NextResponse.json({
      success: true,
      message: `Processed batch of up to ${batchSize} URLs`
    })
  } catch (error) {
    console.error('Manual process error:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export const maxDuration = 30 // 30 second timeout