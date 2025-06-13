import { NextResponse } from 'next/server'
import { startDevProcessor } from '@/lib/serverless/dev-processor'

// Initialize development processor on first request
let initialized = false

export async function GET() {
  // V4 migration: Disabled old dev processor
  // if (!initialized && process.env.NODE_ENV === 'development') {
  //   initialized = true
  //   startDevProcessor()
  // }
  
  return NextResponse.json({ 
    initialized: true,
    environment: process.env.NODE_ENV,
    message: 'V4 migration: Dev processor disabled' 
  })
}