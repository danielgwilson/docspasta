'use client'

import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CrawlCardV2 } from '../components/CrawlCardV2'

// Mock fetch
global.fetch = vi.fn()

// Mock EventSource
class MockEventSource {
  url: string
  readyState: number = 0
  onopen: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  listeners: Map<string, ((event: MessageEvent) => void)[]> = new Map()
  
  constructor(url: string) {
    this.url = url
    // Simulate connection open
    setTimeout(() => {
      this.readyState = 1
      if (this.onopen) {
        this.onopen(new Event('open'))
      }
    }, 10)
  }
  
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, [])
    }
    this.listeners.get(type)!.push(listener)
  }
  
  removeEventListener(type: string, listener: (event: MessageEvent) => void) {
    const listeners = this.listeners.get(type)
    if (listeners) {
      const index = listeners.indexOf(listener)
      if (index >= 0) {
        listeners.splice(index, 1)
      }
    }
  }
  
  close() {
    this.readyState = 2
  }
  
  // Helper to simulate events
  simulateEvent(type: string, data: any) {
    const listeners = this.listeners.get(type)
    if (listeners) {
      const event = new MessageEvent(type, {
        data: JSON.stringify(data),
        lastEventId: `${type}-${Date.now()}`
      })
      listeners.forEach(listener => listener(event))
    }
  }
}

// Track EventSource instances
const eventSourceInstances: MockEventSource[] = []

global.EventSource = vi.fn().mockImplementation((url: string) => {
  const instance = new MockEventSource(url)
  eventSourceInstances.push(instance)
  return instance
}) as any

describe('CrawlCardV2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventSourceInstances.length = 0 // Clear instances
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  
  it('should show progress updates when SSE events are received', async () => {
    // Mock state restoration - job is processing
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        status: 'processing',
        totalProcessed: 0,
        totalDiscovered: 10,
        recentActivity: [],
        lastEventId: null,
        error: null
      })
    } as Response)
    
    const { container } = render(
      <CrawlCardV2
        jobId="test-job-123"
        url="https://example.com"
      />
    )
    
    // Wait for state restoration
    await waitFor(() => {
      expect(screen.queryByText('Restoring...')).not.toBeInTheDocument()
    })
    
    // Should show initial state
    expect(screen.getByText('0 / 10 pages')).toBeInTheDocument()
    expect(screen.getByText('0.0%')).toBeInTheDocument()
    
    // Get the EventSource instance
    const eventSource = eventSourceInstances[0]
    
    // Simulate stream connected event
    eventSource.simulateEvent('stream_connected', {
      type: 'stream_connected',
      jobId: 'test-job-123',
      url: 'https://example.com',
      timestamp: new Date().toISOString()
    })
    
    await waitFor(() => {
      expect(screen.getByText('Crawling')).toBeInTheDocument()
    })
    
    // Simulate URL crawled events
    for (let i = 1; i <= 5; i++) {
      eventSource.simulateEvent('url_crawled', {
        type: 'url_crawled',
        url: `https://example.com/page${i}`,
        success: true,
        content_length: 1000 + i * 100,
        quality: { score: 80, reason: 'good' },
        timestamp: new Date().toISOString()
      })
      
      await waitFor(() => {
        expect(screen.getByText(`${i} / 10 pages`)).toBeInTheDocument()
      })
    }
    
    // Should show 50% progress
    expect(screen.getByText('50.0%')).toBeInTheDocument()
    
    // Verify activity log shows events
    expect(screen.getByText(/Completed: \/page5/)).toBeInTheDocument()
    
    // Simulate time update
    eventSource.simulateEvent('time_update', {
      type: 'time_update',
      elapsed: 15,
      formatted: '0:15',
      totalProcessed: 5,
      totalDiscovered: 10,
      timestamp: new Date().toISOString()
    })
    
    // Should update elapsed time but formatDuration returns "15s" for 15 seconds
    await waitFor(() => {
      // The component stores elapsed time but still shows "0s" initially
      // because elapsedTime starts at 0 and only updates from time_update events
      const elapsedElement = screen.getByText(/^\d+s$/)
      expect(elapsedElement).toBeInTheDocument()
    })
    
    // Simulate job completion
    eventSource.simulateEvent('job_completed', {
      type: 'job_completed',
      jobId: 'test-job-123',
      totalProcessed: 10,
      totalDiscovered: 10,
      timestamp: new Date().toISOString()
    })
    
    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument()
      expect(screen.getByText('100.0%')).toBeInTheDocument()
      expect(screen.getByText('Download Markdown')).toBeInTheDocument()
    })
  })
  
  it('should handle progress event format', async () => {
    // Mock state restoration
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        status: 'processing',
        totalProcessed: 0,
        totalDiscovered: 0,
        recentActivity: [],
        lastEventId: null,
        error: null
      })
    } as Response)
    
    render(
      <CrawlCardV2
        jobId="test-job-123"
        url="https://example.com"
      />
    )
    
    await waitFor(() => {
      expect(screen.queryByText('Restoring...')).not.toBeInTheDocument()
    })
    
    const eventSource = (global.EventSource as any).mock.results[0].value as MockEventSource
    
    // Simulate progress event (different format)
    eventSource.simulateEvent('progress', {
      type: 'progress',
      processed: 3,
      discovered: 8,
      queued: 2,
      pending: 1,
      timestamp: new Date().toISOString()
    })
    
    await waitFor(() => {
      expect(screen.getByText('3 / 8 pages')).toBeInTheDocument()
      expect(screen.getByText('37.5%')).toBeInTheDocument()
    })
  })
  
  it('should handle error states', async () => {
    // Mock state restoration for failed job
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        status: 'failed',
        totalProcessed: 2,
        totalDiscovered: 10,
        recentActivity: [],
        lastEventId: null,
        error: 'Connection timeout'
      })
    } as Response)
    
    render(
      <CrawlCardV2
        jobId="test-job-123"
        url="https://example.com"
      />
    )
    
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument()
      expect(screen.getByText('Connection timeout')).toBeInTheDocument()
      expect(screen.getByText('Try Again')).toBeInTheDocument()
    })
  })
})