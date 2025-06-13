import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createClient } from 'redis'
import { randomUUID } from 'crypto'

describe.skip('Resumable Stream SSE Integration (needs refactoring)', () => {
  let redisClient: ReturnType<typeof createClient>
  // Use unique job ID for each test run to ensure isolation
  const testJobId = `test-job-${randomUUID()}`
  
  beforeEach(async () => {
    // Create real Redis client for testing
    const redisUrl = process.env.REDIS_URL || process.env.KV_URL
    if (!redisUrl) {
      throw new Error('Redis URL not configured')
    }
    
    redisClient = createClient({ 
      url: redisUrl,
      socket: {
        tls: redisUrl.startsWith('rediss://'),
        rejectUnauthorized: false
      }
    })
    
    await redisClient.connect()
    
    // Clean up any existing test data
    await redisClient.del(`stream:${testJobId}`)
    await redisClient.del(`job:${testJobId}`)
  })
  
  afterEach(async () => {
    // Clean up test data
    await redisClient.del(`stream:${testJobId}`)
    await redisClient.del(`job:${testJobId}`)
    await redisClient.disconnect()
  })
  
  it('should connect to SSE stream and receive events', async () => {
    // Initialize job
    await redisClient.hSet(`job:${testJobId}`, {
      status: 'running',
      startedAt: Date.now().toString(),
    })
    
    // Add some test events to the stream
    await redisClient.xAdd(
      `stream:${testJobId}`,
      '*',
      {
        type: 'discovery_started',
        data: JSON.stringify({
          type: 'discovery_started',
          jobId: testJobId,
          timestamp: Date.now()
        })
      }
    )
    
    // Connect to SSE endpoint
    const response = await fetch(`http://localhost:3000/api/v3/jobs/${testJobId}/stream`, {
      headers: {
        'Accept': 'text/event-stream',
      }
    })
    
    expect(response.ok).toBe(true)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    
    // Read a chunk from the stream
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No reader available')
    
    const decoder = new TextDecoder()
    const { value, done } = await reader.read()
    
    expect(done).toBe(false)
    const chunk = decoder.decode(value)
    
    // Should contain SSE formatted data
    expect(chunk).toContain('event:')
    expect(chunk).toContain('data:')
    expect(chunk).toContain('id:')
    
    // Cancel the stream
    await reader.cancel()
  }, 30000)
  
  it('should resume from Last-Event-ID', async () => {
    // Initialize job
    await redisClient.hSet(`job:${testJobId}`, {
      status: 'running',
      startedAt: Date.now().toString(),
    })
    
    // Add multiple events
    const messageIds: string[] = []
    
    for (let i = 0; i < 5; i++) {
      const result = await redisClient.xAdd(
        `stream:${testJobId}`,
        '*',
        {
          type: 'progress',
          data: JSON.stringify({
            type: 'progress',
            jobId: testJobId,
            progress: i * 20,
            timestamp: Date.now()
          })
        }
      )
      messageIds.push(result)
    }
    
    // Connect with Last-Event-ID (resume from 3rd message)
    const lastEventId = messageIds[2]
    const response = await fetch(`http://localhost:3000/api/v3/jobs/${testJobId}/stream`, {
      headers: {
        'Accept': 'text/event-stream',
        'Last-Event-ID': lastEventId
      }
    })
    
    expect(response.ok).toBe(true)
    
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No reader available')
    
    const decoder = new TextDecoder()
    let buffer = ''
    
    // Read events until we get some data
    while (buffer.length < 100) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value)
    }
    
    // Should not contain events before the Last-Event-ID
    expect(buffer).not.toContain('"progress":0')
    expect(buffer).not.toContain('"progress":20')
    expect(buffer).not.toContain('"progress":40')
    
    // Should contain events after Last-Event-ID
    // The 4th and 5th events (progress: 60 and 80)
    const events = buffer.split('\n\n').filter(e => e.includes('data:'))
    expect(events.length).toBeGreaterThanOrEqual(2)
    
    await reader.cancel()
  }, 30000)
  
  it('should handle job completion gracefully', async () => {
    // Initialize job as running
    await redisClient.hSet(`job:${testJobId}`, {
      status: 'running',
      startedAt: Date.now().toString(),
    })
    
    // Connect to stream
    const response = await fetch(`http://localhost:3000/api/v3/jobs/${testJobId}/stream`)
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No reader available')
    
    // Add completion event
    await redisClient.xAdd(
      `stream:${testJobId}`,
      '*',
      {
        type: 'job_completed',
        data: JSON.stringify({
          type: 'job_completed',
          jobId: testJobId,
          timestamp: Date.now()
        })
      }
    )
    
    // Update job status
    await redisClient.hSet(`job:${testJobId}`, 'status', 'completed')
    
    const decoder = new TextDecoder()
    let buffer = ''
    let eventCount = 0
    
    // Read until stream closes
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value)
      eventCount++
      if (eventCount > 10) break // Safety limit
    }
    
    // Should contain the completion event
    expect(buffer).toContain('job_completed')
    
    // Stream should be closed
    const { done } = await reader.read()
    expect(done).toBe(true)
  }, 30000)
})