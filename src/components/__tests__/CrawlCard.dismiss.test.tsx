import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CrawlCard } from '../CrawlCard'

// Keep track of all EventSource instances
let mockEventSources: any[] = []

// Mock EventSource
class MockEventSource {
  url: string
  readyState: number = 0
  listeners: { [key: string]: ((event: MessageEvent) => void)[] } = {}
  
  constructor(url: string) {
    this.url = url
    mockEventSources.push(this)
    
    // Simulate connection after a tick
    setTimeout(() => {
      this.readyState = 1
      this.onopen?.({} as Event)
    }, 0)
  }
  
  close() {
    this.readyState = 2
  }
  
  onopen?: (event: Event) => void
  onerror?: (event: Event) => void
  onmessage?: (event: MessageEvent) => void
  
  addEventListener(event: string, handler: (event: MessageEvent) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = []
    }
    this.listeners[event].push(handler)
  }
  
  removeEventListener(event: string, handler: (event: MessageEvent) => void) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(h => h !== handler)
    }
  }
  
  // Helper to emit events
  emit(event: string, data: any) {
    const messageEvent = { data } as MessageEvent
    if (this.listeners[event]) {
      this.listeners[event].forEach(handler => handler(messageEvent))
    }
  }
}

// @ts-ignore
global.EventSource = MockEventSource

beforeEach(() => {
  mockEventSources = []
})

afterEach(() => {
  mockEventSources = []
})

describe('CrawlCard Dismiss Functionality', () => {
  it('should show dismiss button for completed jobs', async () => {
    const onDismiss = vi.fn()
    const { container } = render(
      <CrawlCard 
        jobId="test-123" 
        url="https://example.com"
        onDismiss={onDismiss}
      />
    )
    
    // Wait for EventSource to be created
    await waitFor(() => {
      expect(mockEventSources.length).toBeGreaterThan(0)
    })
    
    // Get the created EventSource instance
    const eventSource = mockEventSources[0]
    
    // Simulate job completion
    eventSource.emit('job_completed', JSON.stringify({
      type: 'job_completed',
      jobId: 'test-123',
      totalProcessed: 10,
      totalDiscovered: 10,
      timestamp: new Date().toISOString()
    }))
    
    // Check for dismiss button
    await waitFor(() => {
      const dismissButton = screen.getByLabelText('Dismiss')
      expect(dismissButton).toBeDefined()
    })
    
    // Click dismiss button
    const dismissButton = screen.getByLabelText('Dismiss')
    fireEvent.click(dismissButton)
    
    // Verify callback was called
    expect(onDismiss).toHaveBeenCalledWith('test-123')
  })
  
  it('should show dismiss button for failed jobs', async () => {
    const onDismiss = vi.fn()
    render(
      <CrawlCard 
        jobId="test-456" 
        url="https://example.com"
        onDismiss={onDismiss}
      />
    )
    
    // Wait for EventSource to be created
    await waitFor(() => {
      expect(mockEventSources.length).toBeGreaterThan(0)
    })
    
    // Get the created EventSource instance
    const eventSource = mockEventSources[0]
    
    // Simulate job failure
    eventSource.emit('job_failed', JSON.stringify({
      type: 'job_failed',
      jobId: 'test-456',
      error: 'Test error',
      timestamp: new Date().toISOString()
    }))
    
    // Check for dismiss button
    await waitFor(() => {
      const dismissButton = screen.getByLabelText('Dismiss')
      expect(dismissButton).toBeDefined()
    })
  })
  
  it('should show dismiss button during processing when onDismiss is provided', async () => {
    const onDismiss = vi.fn()
    render(
      <CrawlCard 
        jobId="test-789" 
        url="https://example.com"
        onDismiss={onDismiss}
      />
    )
    
    // Wait for EventSource to be created
    await waitFor(() => {
      expect(mockEventSources.length).toBeGreaterThan(0)
    })
    
    // Get the created EventSource instance
    const eventSource = mockEventSources[0]
    
    // Simulate processing
    eventSource.emit('stream_connected', JSON.stringify({
      type: 'stream_connected',
      jobId: 'test-789',
      url: 'https://example.com',
      timestamp: new Date().toISOString()
    }))
    
    // Should find dismiss button even during processing
    await waitFor(() => {
      const dismissButton = screen.getByLabelText('Dismiss')
      expect(dismissButton).toBeDefined()
    })
    
    // Click dismiss button
    const dismissButton = screen.getByLabelText('Dismiss')
    fireEvent.click(dismissButton)
    
    // Verify callback was called
    expect(onDismiss).toHaveBeenCalledWith('test-789')
  })
  
  it('should not show dismiss button if onDismiss is not provided', async () => {
    render(
      <CrawlCard 
        jobId="test-999" 
        url="https://example.com"
      />
    )
    
    // Wait for EventSource to be created
    await waitFor(() => {
      expect(mockEventSources.length).toBeGreaterThan(0)
    })
    
    // Get the created EventSource instance
    const eventSource = mockEventSources[0]
    
    // Simulate job completion
    eventSource.emit('job_completed', JSON.stringify({
      type: 'job_completed',
      jobId: 'test-999',
      totalProcessed: 5,
      totalDiscovered: 5,
      timestamp: new Date().toISOString()
    }))
    
    // Should not find dismiss button
    await waitFor(() => {
      const dismissButton = screen.queryByLabelText('Dismiss')
      expect(dismissButton).toBeNull()
    })
  })
})