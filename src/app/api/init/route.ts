import { NextResponse } from 'next/server'
import { startDevProcessor } from '@/lib/serverless/dev-processor'

// Initialize development processor on first request
let initialized = false

export async function GET() {
  // Enable dev processor for V4 in development
  if (!initialized && process.env.NODE_ENV === 'development') {
    initialized = true
    startDevProcessor()
  }
  
  return NextResponse.json({ 
    initialized: true,
    environment: process.env.NODE_ENV,
    message: 'V4 dev processor enabled' 
  })
}