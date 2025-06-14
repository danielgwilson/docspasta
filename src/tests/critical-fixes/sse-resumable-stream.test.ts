import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/v4/crawls/[crawlId]/stream/route'
import { createRedisClient } from '@/lib/v4/redis-client'
import { setTimeout } from 'timers/promises'

vi.mock('@/lib/v4/redis-client')

describe('SSE Resumable Stream - Critical Fix Tests', () => {
  let mockRedis: any
  let mockXRead: vi.Mock
  let mockQuit: vi.Mock
  
  beforeEach(() => {
    mockXRead = vi.fn()
    mockQuit = vi.fn()
    
    mockRedis = {
      xread: mockXRead,
      quit: mockQuit,
      disconnect: vi.fn(),
    }
    
    vi.mocked(createRedisClient).mockResolvedValue(mockRedis)
  })
  
  afterEach(() => {
    vi.clearAllMocks()
  })
  
  it('should use async generator correctly with resumable-stream', async () => {
    const crawlId = 'test-crawl-123'
    const request = new NextRequest(`http://localhost/api/v4/crawls/${crawlId}/stream`)
    
    // Mock Redis stream data
    mockXRead
      .mockResolvedValueOnce([
        {
          name: `crawl:${crawlId}:events`,
          messages: [
            { id: '1-0', fieldValues: { event: 'progress', data: JSON.stringify({ processed: 1, total: 10 }) } },
            { id: '2-0', fieldValues: { event: 'progress', data: JSON.stringify({ processed: 2, total: 10 }) } }
          ]
        }
      ])
      .mockResolvedValueOnce([
        {
          name: `crawl:${crawlId}:events`, 
          messages: [
            { id: '3-0', fieldValues: { event: 'completed', data: JSON.stringify({ success: true }) } }
          ]
        }
      ])
      .mockResolvedValueOnce(null)
    
    const response = await GET(request, { params: { crawlId } })
    
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform')
    
    // Verify response body is a ReadableStream
    expect(response.body).toBeInstanceOf(ReadableStream)
    
    // Read the stream
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    const chunks: string[] = []
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(decoder.decode(value, { stream: true }))
    }
    
    const fullResponse = chunks.join('')
    
    // Verify SSE format with proper event IDs
    expect(fullResponse).toContain('id: 1-0')
    expect(fullResponse).toContain('event: progress')
    expect(fullResponse).toContain('data: {"processed":1,"total":10}')
    
    expect(fullResponse).toContain('id: 2-0')
    expect(fullResponse).toContain('event: progress')
    expect(fullResponse).toContain('data: {"processed":2,"total":10}')
    
    expect(fullResponse).toContain('id: 3-0')
    expect(fullResponse).toContain('event: completed')
    expect(fullResponse).toContain('data: {"success":true}')
    
    // Verify Redis was properly cleaned up
    expect(mockQuit).toHaveBeenCalled()
  })
  
  it('should handle Last-Event-ID header for resumption', async () => {
    const crawlId = 'test-crawl-456'
    const lastEventId = '5-0'
    
    const request = new NextRequest(
      `http://localhost/api/v4/crawls/${crawlId}/stream`,
      { headers: { 'Last-Event-ID': lastEventId } }
    )
    
    // Mock Redis to return events after the last ID
    mockXRead.mockResolvedValueOnce([
      {
        name: `crawl:${crawlId}:events`,
        messages: [
          { id: '6-0', fieldValues: { event: 'progress', data: JSON.stringify({ processed: 6, total: 10 }) } },
          { id: '7-0', fieldValues: { event: 'completed', data: JSON.stringify({ success: true }) } }
        ]
      }
    ]).mockResolvedValueOnce(null)
    
    const response = await GET(request, { params: { crawlId } })
    
    // Verify xread was called with the correct starting position
    expect(mockXRead).toHaveBeenCalledWith(
      'STREAMS',
      `crawl:${crawlId}:events`,
      lastEventId
    )
    
    // Read and verify stream content
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    const chunks: string[] = []
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(decoder.decode(value, { stream: true }))
    }
    
    const fullResponse = chunks.join('')
    
    // Should not contain events before 6-0
    expect(fullResponse).not.toContain('id: 5-0')
    expect(fullResponse).toContain('id: 6-0')
    expect(fullResponse).toContain('id: 7-0')
  })
  
  it('should handle client disconnection gracefully', async () => {
    const crawlId = 'test-crawl-789'
    const abortController = new AbortController()
    
    const request = new NextRequest(
      `http://localhost/api/v4/crawls/${crawlId}/stream`,
      { signal: abortController.signal }
    )
    
    // Mock Redis to keep returning data
    mockXRead.mockImplementation(async () => {
      await setTimeout(100)
      return [{
        name: `crawl:${crawlId}:events`,
        messages: [
          { id: `${Date.now()}-0`, fieldValues: { event: 'progress', data: JSON.stringify({ processed: 1, total: 10 }) } }
        ]
      }]
    })
    
    const responsePromise = GET(request, { params: { crawlId } })
    
    // Simulate client disconnect after 200ms
    setTimeout(() => abortController.abort(), 200)
    
    const response = await responsePromise
    const reader = response.body!.getReader()
    
    // Try to read, should eventually close
    try {
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }
    } catch (error) {
      // Expected to throw on abort
    }
    
    // Verify Redis was cleaned up
    expect(mockQuit).toHaveBeenCalled()
  })
  
  it('should handle Redis errors gracefully', async () => {
    const crawlId = 'test-crawl-error'
    const request = new NextRequest(`http://localhost/api/v4/crawls/${crawlId}/stream`)
    
    // Mock Redis to throw an error
    mockXRead.mockRejectedValueOnce(new Error('Redis connection lost'))
    
    const response = await GET(request, { params: { crawlId } })
    
    // Should still return 200 and attempt to send error event
    expect(response.status).toBe(200)
    
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    const chunks: string[] = []
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(decoder.decode(value, { stream: true }))
    }
    
    const fullResponse = chunks.join('')
    
    // Should contain error event
    expect(fullResponse).toContain('event: error')
    expect(fullResponse).toContain('Redis connection lost')
    
    // Should still clean up
    expect(mockQuit).toHaveBeenCalled()
  })
  
  it('should not leak memory on repeated connections', async () => {
    const crawlId = 'test-crawl-memory'
    
    // Track Redis client creation
    const createdClients: any[] = []
    vi.mocked(createRedisClient).mockImplementation(async () => {
      const client = {
        xread: vi.fn().mockResolvedValue(null),
        quit: vi.fn(),
        disconnect: vi.fn(),
      }
      createdClients.push(client)
      return client
    })
    
    // Create multiple connections
    const connections = 5
    const responses: Response[] = []
    
    for (let i = 0; i < connections; i++) {
      const request = new NextRequest(`http://localhost/api/v4/crawls/${crawlId}/stream`)
      const response = await GET(request, { params: { crawlId } })
      responses.push(response)
      
      // Read and close each stream
      const reader = response.body!.getReader()
      await reader.read()
      await reader.cancel()
    }
    
    // Verify all clients were created and cleaned up
    expect(createdClients).toHaveLength(connections)
    createdClients.forEach(client => {
      expect(client.quit).toHaveBeenCalled()
    })
  })
})