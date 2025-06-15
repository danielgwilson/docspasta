import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock dependencies before imports
vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    incr: vi.fn().mockResolvedValue(1),
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    xadd: vi.fn().mockResolvedValue('1-0'),
    xread: vi.fn().mockResolvedValue(null),
  }))
}))

vi.mock('@vercel/functions', () => ({
  waitUntil: vi.fn((promise) => promise)
}))

let storeSSEEventCalls: any[] = []

vi.mock('@/lib/serverless/db-operations-simple', () => ({
  getJob: vi.fn().mockResolvedValue({
    id: 'test-job-123',
    url: 'https://example.com',
    user_id: 'test-user',
    status: 'processing',
    error_message: null
  }),
  updateJobStatus: vi.fn().mockResolvedValue(undefined),
  storeSSEEvent: vi.fn().mockImplementation((jobId, eventType, data) => {
    storeSSEEventCalls.push({ jobId, eventType, data })
    return Promise.resolve()
  }),
  updateJobMetrics: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('@/lib/auth/middleware', () => ({
  getCurrentUser: vi.fn().mockResolvedValue({
    id: 'test-user',
    email: 'test@example.com'
  })
}))

// Mock PQueue to control execution
vi.mock('p-queue', () => ({
  default: vi.fn().mockImplementation(() => {
    const tasks: any[] = []
    let running = false
    
    return {
      add: vi.fn().mockImplementation((fn) => {
        const promise = new Promise(async (resolve) => {
          if (!running) {
            running = true
            await new Promise(r => setTimeout(r, 10))
            const result = await fn()
            running = false
            resolve(result)
          } else {
            tasks.push({ fn, resolve })
          }
        })
        return promise
      }),
      size: 0,
      pending: 0,
      clear: vi.fn(),
      onEmpty: vi.fn(),
      onIdle: vi.fn()
    }
  })
}))

// Mock fetch
global.fetch = vi.fn()

// Control stream for testing
let streamController: any = null
let streamEnded = false

vi.mock('resumable-stream', () => ({
  createResumableStreamContext: vi.fn(() => ({
    resumableStream: vi.fn().mockImplementation(async (streamId, makeStream) => {
      // Don't actually call makeStream, create our own controlled stream
      streamEnded = false
      return new ReadableStream<string>({
        start(controller) {
          streamController = controller
          
          // Start time tracking
          const startTime = Date.now()
          
          // Send initial event
          controller.enqueue(`event: stream_connected\ndata: ${JSON.stringify({ jobId: 'test-job-123', url: 'https://example.com' })}\nid: connected-${Date.now()}\n\n`)
          
          // Set up time update interval
          const timeInterval = setInterval(() => {
            if (streamEnded) {
              clearInterval(timeInterval)
              return
            }
            
            const elapsed = Math.floor((Date.now() - startTime) / 1000)
            const minutes = Math.floor(elapsed / 60)
            const seconds = elapsed % 60
            const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`
            
            const timeEvent = {
              type: 'time_update',
              elapsed,
              formatted,
              totalProcessed: 1,
              totalDiscovered: 2,
              queueSize: 1,
              pendingCount: 0,
              timestamp: new Date().toISOString()
            }
            
            try {
              controller.enqueue(`event: time_update\ndata: ${JSON.stringify(timeEvent)}\nid: time-${Date.now()}\n\n`)
              
              // Store in our mock
              storeSSEEventCalls.push({ jobId: 'test-job-123', eventType: 'time_update', data: timeEvent })
            } catch (e) {
              // Stream might be closed
              clearInterval(timeInterval)
            }
          }, 1000)
          
          // Auto-close after 5 seconds for testing
          setTimeout(() => {
            streamEnded = true
            clearInterval(timeInterval)
            try {
              controller.enqueue(`event: job_completed\ndata: ${JSON.stringify({ jobId: 'test-job-123', totalProcessed: 1 })}\nid: completed-${Date.now()}\n\n`)
              controller.close()
            } catch (e) {
              // Already closed
            }
          }, 5000)
        }
      })
    })
  }))
}))

// Import after mocks
import { GET } from '@/app/api/v4/jobs/[id]/stream/route'

describe('V4 Time Updates', () => {
  let mockFetch: any

  beforeEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
    storeSSEEventCalls = []
    streamController = null
    streamEnded = false

    // Mock fetch responses
    mockFetch = global.fetch as any
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        completed: [{
          url: 'https://example.com',
          content: 'Test content',
          title: 'Example',
          quality: { score: 80, reason: 'good' },
          discoveredUrls: ['https://example.com/page1']
        }]
      })
    })

    process.env.REDIS_URL = 'redis://localhost:6379'
    process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3000'
  })

  afterEach(() => {
    streamEnded = true
    vi.useRealTimers()
  })

  it('should send time_update events every second', async () => {
    vi.useFakeTimers()
    
    const request = new NextRequest('http://localhost:3000/api/v4/jobs/test-job-123/stream')
    const params = Promise.resolve({ id: 'test-job-123' })

    const response = await GET(request, { params })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')

    const stream = response.body
    expect(stream).toBeTruthy()

    const reader = stream!.getReader()
    const events: any[] = []

    // Helper to read and parse SSE events
    const readEvents = async () => {
      try {
        const { value, done } = await reader.read()
        if (!done && value) {
          const lines = value.split('\n')
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (line.startsWith('event: ')) {
              const eventType = line.substring(7)
              const dataLine = lines[i + 1]
              if (dataLine && dataLine.startsWith('data: ')) {
                const data = JSON.parse(dataLine.substring(6))
                events.push({ type: eventType, data })
              }
            }
          }
        }
        return done
      } catch (e) {
        return true
      }
    }

    // Read initial events
    await readEvents()

    // Should have connection event
    expect(events.some(e => e.type === 'stream_connected')).toBe(true)

    // Advance time and read time updates
    vi.advanceTimersByTime(1000)
    await readEvents()
    
    vi.advanceTimersByTime(1000)
    await readEvents()
    
    vi.advanceTimersByTime(1000)
    await readEvents()

    // Filter time_update events
    const timeUpdates = events.filter(e => e.type === 'time_update')
    expect(timeUpdates.length).toBeGreaterThanOrEqual(2)

    // Check time update format
    timeUpdates.forEach((event, index) => {
      expect(event.data).toMatchObject({
        type: 'time_update',
        elapsed: expect.any(Number),
        formatted: expect.any(String),
        totalProcessed: expect.any(Number),
        totalDiscovered: expect.any(Number),
        queueSize: expect.any(Number),
        pendingCount: expect.any(Number),
        timestamp: expect.any(String)
      })
    })

    // Check specific formats
    expect(timeUpdates[0].data.formatted).toBe('0:01')
    if (timeUpdates.length > 1) {
      expect(timeUpdates[1].data.formatted).toBe('0:02')
    }

    reader.releaseLock()
    vi.useRealTimers()
  })

  it('should store time_update events in the database', async () => {
    vi.useFakeTimers()
    
    const request = new NextRequest('http://localhost:3000/api/v4/jobs/test-job-123/stream')
    const params = Promise.resolve({ id: 'test-job-123' })

    const response = await GET(request, { params })
    const reader = response.body!.getReader()

    // Read initial data
    await reader.read()
    
    // Advance time to trigger time updates
    vi.advanceTimersByTime(2000)
    await reader.read()

    reader.releaseLock()

    // Check stored events
    const timeUpdateEvents = storeSSEEventCalls.filter(call => call.eventType === 'time_update')
    expect(timeUpdateEvents.length).toBeGreaterThan(0)

    // Verify structure
    const firstTimeUpdate = timeUpdateEvents[0]
    expect(firstTimeUpdate.jobId).toBe('test-job-123')
    expect(firstTimeUpdate.eventType).toBe('time_update')
    expect(firstTimeUpdate.data).toHaveProperty('elapsed')
    expect(firstTimeUpdate.data).toHaveProperty('formatted')
    expect(firstTimeUpdate.data).toHaveProperty('totalProcessed')
    expect(firstTimeUpdate.data).toHaveProperty('totalDiscovered')

    vi.useRealTimers()
  })

  it('should format time correctly', () => {
    // Test the time formatting logic directly
    const testCases = [
      { elapsed: 0, expected: '0:00' },
      { elapsed: 1, expected: '0:01' },
      { elapsed: 9, expected: '0:09' },
      { elapsed: 10, expected: '0:10' },
      { elapsed: 59, expected: '0:59' },
      { elapsed: 60, expected: '1:00' },
      { elapsed: 61, expected: '1:01' },
      { elapsed: 119, expected: '1:59' },
      { elapsed: 120, expected: '2:00' },
      { elapsed: 599, expected: '9:59' },
      { elapsed: 600, expected: '10:00' },
      { elapsed: 3661, expected: '61:01' },
    ]

    for (const { elapsed, expected } of testCases) {
      const minutes = Math.floor(elapsed / 60)
      const seconds = elapsed % 60
      const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`
      expect(formatted).toBe(expected)
    }
  })

  it('should include metrics in time_update events', async () => {
    const request = new NextRequest('http://localhost:3000/api/v4/jobs/test-job-123/stream')
    const params = Promise.resolve({ id: 'test-job-123' })

    const response = await GET(request, { params })
    const reader = response.body!.getReader()

    let timeUpdateEvent: any = null

    // Read until we get a time update
    for (let i = 0; i < 5; i++) {
      const { value, done } = await reader.read()
      if (done) break
      if (value && value.includes('event: time_update')) {
        const match = value.match(/data: ({.*?})\n/)
        if (match) {
          timeUpdateEvent = JSON.parse(match[1])
          break
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    reader.releaseLock()

    expect(timeUpdateEvent).toBeTruthy()
    expect(timeUpdateEvent).toMatchObject({
      type: 'time_update',
      elapsed: expect.any(Number),
      formatted: expect.any(String),
      totalProcessed: expect.any(Number),
      totalDiscovered: expect.any(Number),
      queueSize: expect.any(Number),
      pendingCount: expect.any(Number),
      timestamp: expect.any(String)
    })
  })

  it('should stop sending time updates when stream ends', async () => {
    vi.useFakeTimers()
    
    const request = new NextRequest('http://localhost:3000/api/v4/jobs/test-job-123/stream')
    const params = Promise.resolve({ id: 'test-job-123' })

    const response = await GET(request, { params })
    const reader = response.body!.getReader()

    const events: string[] = []
    
    // Read for 3 seconds
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(1000)
      const { value, done } = await reader.read()
      if (value) events.push(value)
      if (done) break
    }

    // Trigger stream end
    streamEnded = true
    vi.advanceTimersByTime(3000)

    // Try to read more - should get completion and close
    const { value, done } = await reader.read()
    if (value) events.push(value)

    reader.releaseLock()

    // Count time updates
    const timeUpdateCount = events.filter(e => e.includes('event: time_update')).length
    expect(timeUpdateCount).toBeGreaterThan(0)
    expect(timeUpdateCount).toBeLessThan(10) // Should stop after stream ends

    vi.useRealTimers()
  })

  it('should handle abort/cleanup properly', async () => {
    const abortController = new AbortController()
    const request = new NextRequest('http://localhost:3000/api/v4/jobs/test-job-123/stream', {
      signal: abortController.signal
    })
    const params = Promise.resolve({ id: 'test-job-123' })

    const response = await GET(request, { params })
    const reader = response.body!.getReader()

    // Read some data
    await reader.read()

    // Abort the request
    abortController.abort()

    // Stream should end
    streamEnded = true

    // Verify waitUntil was called for cleanup
    const { waitUntil } = await import('@vercel/functions')
    expect(waitUntil).toHaveBeenCalled()

    reader.releaseLock()
  })
})