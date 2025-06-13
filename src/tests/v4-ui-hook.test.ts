import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useServerlessCrawl } from '@/hooks/useServerlessCrawl'

// Mock fetch
global.fetch = vi.fn()

// Mock EventSource
class MockEventSource {
  url: string
  readyState = 0
  listeners: Map<string, Function[]> = new Map()
  
  constructor(url: string) {
    this.url = url
  }
  
  addEventListener(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(callback)
  }
  
  close() {
    this.readyState = 2
  }
  
  // Helper to simulate events
  simulateEvent(type: string, data: any) {
    const callbacks = this.listeners.get(type) || []
    callbacks.forEach(cb => {
      cb({ data: JSON.stringify(data) })
    })
  }
}

global.EventSource = MockEventSource as any

describe('useServerlessCrawl Hook - V4 API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })
  
  it('should call V4 /api/v4/jobs endpoint when starting crawl', async () => {
    const mockFetch = global.fetch as any
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          jobId: 'test-job-id',
          streamUrl: '/api/v4/jobs/test-job-id/stream'
        }
      })
    })
    
    const { result } = renderHook(() => useServerlessCrawl())
    
    expect(result.current.isLoading).toBe(false)
    expect(result.current.jobId).toBeUndefined()
    
    // Start crawl
    await act(async () => {
      await result.current.startCrawl({
        url: 'https://example.com/docs',
        maxPages: 50,
        maxDepth: 2,
        qualityThreshold: 20
      })
    })
    
    // Verify V4 endpoint was called
    expect(mockFetch).toHaveBeenCalledWith('/api/v4/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com/docs',
        maxPages: 50,
        maxDepth: 2,
        qualityThreshold: 20
      })
    })
    
    expect(result.current.jobId).toBe('test-job-id')
    expect(result.current.isLoading).toBe(true)
  })
  
  it('should connect to V4 stream endpoint', async () => {
    const mockFetch = global.fetch as any
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          jobId: 'test-job-id',
          streamUrl: '/api/v4/jobs/test-job-id/stream'
        }
      })
    })
    
    const { result } = renderHook(() => useServerlessCrawl())
    
    let createdEventSource: MockEventSource | null = null
    const originalEventSource = global.EventSource
    global.EventSource = vi.fn().mockImplementation((url: string) => {
      createdEventSource = new MockEventSource(url)
      return createdEventSource
    }) as any
    
    // Start crawl
    await act(async () => {
      await result.current.startCrawl({
        url: 'https://example.com/docs',
        maxPages: 50,
        maxDepth: 2,
        qualityThreshold: 20
      })
    })
    
    // Verify EventSource was created with V4 endpoint
    expect(global.EventSource).toHaveBeenCalledWith('/api/v4/jobs/test-job-id/stream')
    
    // Simulate V4 events
    act(() => {
      createdEventSource!.simulateEvent('stream_connected', { jobId: 'test-job-id' })
      createdEventSource!.simulateEvent('batch_completed', {
        completed: 5,
        failed: 1,
        discovered: 10,
        fromCache: 2
      })
    })
    
    // Verify events were processed
    expect(result.current.events).toHaveLength(2)
    expect(result.current.events[0]).toEqual({ jobId: 'test-job-id' })
    expect(result.current.events[1]).toEqual({
      completed: 5,
      failed: 1,
      discovered: 10,
      fromCache: 2
    })
    
    // Cleanup
    global.EventSource = originalEventSource
  })
  
  it('should handle V4 job completion events', async () => {
    const mockFetch = global.fetch as any
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          jobId: 'test-job-id',
          streamUrl: '/api/v4/jobs/test-job-id/stream'
        }
      })
    })
    
    const { result } = renderHook(() => useServerlessCrawl())
    
    let createdEventSource: MockEventSource | null = null
    const originalEventSource = global.EventSource
    global.EventSource = vi.fn().mockImplementation((url: string) => {
      createdEventSource = new MockEventSource(url)
      return createdEventSource
    }) as any
    
    // Start crawl
    await act(async () => {
      await result.current.startCrawl({
        url: 'https://example.com/docs',
        maxPages: 50,
        maxDepth: 2,
        qualityThreshold: 20
      })
    })
    
    expect(result.current.isLoading).toBe(true)
    
    // Simulate job completion
    act(() => {
      createdEventSource!.simulateEvent('job_completed', { jobId: 'test-job-id' })
    })
    
    // Verify loading state is false after completion
    expect(result.current.isLoading).toBe(false)
    
    // Verify localStorage was cleared
    expect(localStorage.getItem('docspasta_active_job')).toBeNull()
    
    // Cleanup
    global.EventSource = originalEventSource
  })
})