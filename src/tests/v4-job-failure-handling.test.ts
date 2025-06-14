import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as streamGET } from '@/app/api/v4/jobs/[id]/stream/route'

// Mock dependencies
vi.mock('@/lib/serverless/db-operations-simple', () => ({
  getJob: vi.fn().mockResolvedValue({ 
    id: 'test-job-id', 
    url: 'https://bad-url-that-fails.com',
    user_id: 'test_user_default',
    error_message: null
  }),
  updateJobStatus: vi.fn(),
  storeSSEEvent: vi.fn()
}))

vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn()
  }))
}))

vi.mock('resumable-stream', () => ({
  createResumableStreamContext: vi.fn(() => ({
    resumableStream: vi.fn(() => {
      // Return a stream that simulates job failure
      return new ReadableStream({
        async start(controller) {
          // Simulate failed crawl
          controller.enqueue(`event: stream_connected\ndata: ${JSON.stringify({ jobId: 'test-job-id' })}\n\n`)
          
          // Wait a bit then close with no URLs processed
          await new Promise(resolve => setTimeout(resolve, 100))
          
          // This should trigger the failed status
          controller.enqueue(`event: job_failed\ndata: ${JSON.stringify({ 
            type: 'job_failed',
            jobId: 'test-job-id',
            totalProcessed: 0,
            totalDiscovered: 0,
            error: 'No URLs were successfully crawled'
          })}\n\n`)
          
          controller.close()
        }
      })
    })
  }))
}))

vi.mock('@vercel/functions', () => ({
  waitUntil: vi.fn()
}))

describe('V4 Job Failure Handling', () => {
  it('should mark job as failed when no URLs are processed', async () => {
    const { updateJobStatus } = await import('@/lib/serverless/db-operations-simple')
    const mockUpdateStatus = vi.mocked(updateJobStatus)
    
    const request = new NextRequest('http://localhost:3000/api/v4/jobs/test-job-id/stream')
    
    const response = await streamGET(request, { params: Promise.resolve({ id: 'test-job-id' }) })
    
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    
    // Read the stream to verify it contains failure event
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let events = ''
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      events += decoder.decode(value)
    }
    
    // Verify the stream contains job_failed event
    expect(events).toContain('event: job_failed')
    expect(events).toContain('No URLs were successfully crawled')
    
    // Wait a bit for async operations
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Verify job status was updated to failed
    expect(mockUpdateStatus).toHaveBeenCalledWith('test-job-id', 'failed', 'No URLs were successfully crawled')
  })
})