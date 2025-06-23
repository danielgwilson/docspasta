/**
 * V5 React Hooks Tests  
 * Tests the custom hooks for crawl job management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { setupTestEnvironment, createTestJob, mockQStash } from '@/lib/test/setup'
import { useCrawlJob } from '@/hooks/useCrawlJob'

setupTestEnvironment()

// Mock EventSource for SSE testing
class MockEventSource {
  public onopen: ((event: Event) => void) | null = null
  public onmessage: ((event: MessageEvent) => void) | null = null
  public onerror: ((event: Event) => void) | null = null
  public readyState: number = 0
  private listeners: { [key: string]: ((event: Event) => void)[] } = {}
  
  constructor(public url: string) {
    // Simulate connection after a brief delay
    setTimeout(() => {
      this.readyState = 1
      if (this.onopen) {
        this.onopen(new Event('open'))
      }
    }, 10)
  }
  
  addEventListener(type: string, listener: (event: Event) => void) {
    if (!this.listeners[type]) {
      this.listeners[type] = []
    }
    this.listeners[type].push(listener)
  }
  
  removeEventListener(type: string, listener: (event: Event) => void) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter(l => l !== listener)
    }
  }
  
  close() {
    this.readyState = 2
  }
  
  // Helper method to simulate events
  simulateEvent(type: string, data: any) {
    const event = new MessageEvent('message', {
      data: JSON.stringify(data),
      type
    })
    
    if (this.listeners[type]) {
      this.listeners[type].forEach(listener => listener(event))
    }
  }
}

// Replace global EventSource
const originalEventSource = globalThis.EventSource
globalThis.EventSource = MockEventSource as any

describe('V5 React Hooks', () => {
  let unmockQStash: () => void
  
  beforeEach(() => {
    unmockQStash = mockQStash()
    
    // Mock fetch for job state endpoint
    globalThis.fetch = async (url: string) => {
      if (url.includes('/api/v5/jobs/') && url.includes('/state')) {
        return new Response(JSON.stringify({
          success: true,
          status: 'processing',
          totalProcessed: 5,
          totalDiscovered: 20,
          error: null
        }), { status: 200 })
      }
      
      return new Response('Not found', { status: 404 })
    }
  })
  
  afterEach(() => {
    unmockQStash?.()
    globalThis.EventSource = originalEventSource
  })
  
  describe('useCrawlJob', () => {
    it('should initialize with correct default state', () => {
      const { result } = renderHook(() => useCrawlJob(null))
      
      expect(result.current.status).toBe('idle')
      expect(result.current.processed).toBe(0)
      expect(result.current.discovered).toBe(0)
      expect(result.current.progress).toBe(0)
      expect(result.current.isRestoring).toBe(true)
    })
    
    it('should fetch and restore job state on mount', async () => {
      const { result } = renderHook(() => useCrawlJob('test-job-123'))
      
      await waitFor(() => {
        expect(result.current.isRestoring).toBe(false)
      })
      
      expect(result.current.status).toBe('connecting')
      expect(result.current.processed).toBe(5)
      expect(result.current.discovered).toBe(20)
      expect(result.current.progress).toBeGreaterThan(0)
    })
    
    it('should handle SSE connection and events', async () => {
      const { result } = renderHook(() => useCrawlJob('test-job-123'))
      
      await waitFor(() => {
        expect(result.current.isRestoring).toBe(false)
      })
      
      // Get the mock EventSource instance
      const mockEventSource = (globalThis.EventSource as any).mock?.instances?.[0] as MockEventSource
      
      if (mockEventSource) {
        // Simulate URL crawled event
        act(() => {
          mockEventSource.simulateEvent('url_crawled', {
            type: 'url_crawled',
            url: 'https://example.com/page1',
            success: true,
            content_length: 1500
          })
        })
        
        await waitFor(() => {
          expect(result.current.processed).toBeGreaterThan(5)
        })
        
        // Simulate URLs discovered event
        act(() => {
          mockEventSource.simulateEvent('urls_discovered', {
            type: 'urls_discovered',
            count: 5,
            total_discovered: 25
          })
        })
        
        await waitFor(() => {
          expect(result.current.discovered).toBe(25)
        })
        
        // Simulate job completion
        act(() => {
          mockEventSource.simulateEvent('job_completed', {
            type: 'job_completed',
            totalProcessed: 20,
            totalDiscovered: 25
          })
        })
        
        await waitFor(() => {
          expect(result.current.status).toBe('completed')
          expect(result.current.progress).toBe(100)
        })
      }
    })
    
    it('should handle connection errors gracefully', async () => {
      const { result } = renderHook(() => useCrawlJob('test-job-123'))
      
      await waitFor(() => {
        expect(result.current.isRestoring).toBe(false)
      })
      
      const mockEventSource = (globalThis.EventSource as any).mock?.instances?.[0] as MockEventSource
      
      if (mockEventSource && mockEventSource.onerror) {
        act(() => {
          mockEventSource.onerror(new Event('error'))
        })
        
        await waitFor(() => {
          expect(result.current.error).toBe('Connection lost')
        })
      }
    })
    
    it('should skip SSE for completed jobs', async () => {
      // Mock fetch to return completed job
      globalThis.fetch = async (url: string) => {
        if (url.includes('/state')) {
          return new Response(JSON.stringify({
            success: true,
            status: 'completed',
            totalProcessed: 25,
            totalDiscovered: 25,
            error: null
          }), { status: 200 })
        }
        return new Response('Not found', { status: 404 })
      }
      
      const { result } = renderHook(() => useCrawlJob('completed-job-123'))
      
      await waitFor(() => {
        expect(result.current.isRestoring).toBe(false)
      })
      
      expect(result.current.status).toBe('completed')
      expect(result.current.progress).toBe(100)
      
      // Should not create EventSource for completed jobs
      expect((globalThis.EventSource as any).mock?.instances?.length || 0).toBe(0)
    })
    
    it('should calculate progress correctly', async () => {
      const { result } = renderHook(() => useCrawlJob('test-job-123'))
      
      await waitFor(() => {
        expect(result.current.isRestoring).toBe(false)
      })
      
      const mockEventSource = (globalThis.EventSource as any).mock?.instances?.[0] as MockEventSource
      
      if (mockEventSource) {
        // Simulate progress update
        act(() => {
          mockEventSource.simulateEvent('progress', {
            type: 'progress',
            processed: 10,
            discovered: 50
          })
        })
        
        await waitFor(() => {
          expect(result.current.processed).toBe(10)
          expect(result.current.discovered).toBe(50)
          expect(result.current.total).toBe(50)
          expect(result.current.progress).toBe(20) // 10/50 * 100
        })
      }
    })
    
    it('should provide download URL for completed jobs', async () => {
      // Mock completed job state
      globalThis.fetch = async (url: string) => {
        if (url.includes('/state')) {
          return new Response(JSON.stringify({
            success: true,
            status: 'completed',
            totalProcessed: 25,
            totalDiscovered: 25,
            error: null
          }), { status: 200 })
        }
        return new Response('Not found', { status: 404 })
      }
      
      const { result } = renderHook(() => useCrawlJob('completed-job-123'))
      
      await waitFor(() => {
        expect(result.current.status).toBe('completed')
      })
      
      expect(result.current.downloadUrl).toBe('/api/v5/jobs/completed-job-123/download')
    })
  })
})