import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CrawlProgress } from '../CrawlProgress'

// Mock EventSource
class MockEventSource {
  url: string
  readyState: number = 0
  listeners: Map<string, Function[]> = new Map()
  
  constructor(url: string) {
    this.url = url
    this.readyState = 1 // OPEN
  }
  
  addEventListener(event: string, handler: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(handler)
  }
  
  removeEventListener(event: string, handler: Function) {
    const handlers = this.listeners.get(event)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index !== -1) {
        handlers.splice(index, 1)
      }
    }
  }
  
  close() {
    this.readyState = 2 // CLOSED
  }
  
  // Helper method for tests to trigger events
  triggerEvent(eventName: string, data: any) {
    const handlers = this.listeners.get(eventName)
    if (handlers) {
      handlers.forEach(handler => {
        handler({ data: typeof data === 'string' ? data : JSON.stringify(data) })
      })
    }
  }
}

// Store EventSource instances for testing
let eventSourceInstances: MockEventSource[] = []

vi.stubGlobal('EventSource', vi.fn().mockImplementation((url: string) => {
  const instance = new MockEventSource(url)
  eventSourceInstances.push(instance)
  return instance
}))

describe('CrawlProgress', () => {
  beforeEach(() => {
    eventSourceInstances = []
    vi.clearAllMocks()
  })
  
  it('renders initial state correctly', () => {
    render(<CrawlProgress jobId="test-123" url="https://example.com" />)
    
    expect(screen.getByText('example.com')).toBeInTheDocument()
    expect(screen.getByText('https://example.com')).toBeInTheDocument()
    expect(screen.getByText('Processing')).toBeInTheDocument()
    expect(screen.getByText('0 / ? pages')).toBeInTheDocument()
    expect(screen.getByText('0% complete')).toBeInTheDocument()
  })
  
  it('updates progress when receiving time_update events', async () => {
    render(<CrawlProgress jobId="test-123" url="https://example.com" />)
    
    const eventSource = eventSourceInstances[0]
    
    // Simulate time_update event
    eventSource.triggerEvent('time_update', {
      totalProcessed: 5,
      totalDiscovered: 20
    })
    
    await waitFor(() => {
      expect(screen.getByText('5 / 20 pages')).toBeInTheDocument()
      expect(screen.getByText('25% complete')).toBeInTheDocument()
    })
  })
  
  it('increments processed count on url_crawled events', async () => {
    render(<CrawlProgress jobId="test-123" url="https://example.com" />)
    
    const eventSource = eventSourceInstances[0]
    
    // First set total discovered
    eventSource.triggerEvent('time_update', {
      totalProcessed: 0,
      totalDiscovered: 10
    })
    
    // Simulate multiple url_crawled events
    eventSource.triggerEvent('url_crawled', {})
    eventSource.triggerEvent('url_crawled', {})
    eventSource.triggerEvent('url_crawled', {})
    
    await waitFor(() => {
      expect(screen.getByText('3 / 10 pages')).toBeInTheDocument()
      expect(screen.getByText('30% complete')).toBeInTheDocument()
    })
  })
  
  it('shows completed state and actions', async () => {
    render(<CrawlProgress jobId="test-123" url="https://example.com" />)
    
    const eventSource = eventSourceInstances[0]
    
    // Set progress
    eventSource.triggerEvent('time_update', {
      totalProcessed: 10,
      totalDiscovered: 10
    })
    
    // Complete the job
    eventSource.triggerEvent('completed', {})
    
    await waitFor(() => {
      expect(screen.getByText('Complete')).toBeInTheDocument()
      expect(screen.getByText('Copy Link')).toBeInTheDocument()
      expect(screen.getByText('View Results')).toBeInTheDocument()
    })
  })
  
  it('shows error state', async () => {
    render(<CrawlProgress jobId="test-123" url="https://example.com" />)
    
    const eventSource = eventSourceInstances[0]
    
    // Trigger error
    eventSource.triggerEvent('error', {
      message: 'Failed to crawl: Rate limit exceeded'
    })
    
    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument()
      expect(screen.getByText('Failed to crawl: Rate limit exceeded')).toBeInTheDocument()
    })
  })
  
  it('calls onDismiss when dismiss button is clicked', async () => {
    const onDismiss = vi.fn()
    render(
      <CrawlProgress 
        jobId="test-123" 
        url="https://example.com" 
        onDismiss={onDismiss}
      />
    )
    
    const dismissButton = screen.getByRole('button', { name: '' })
    fireEvent.click(dismissButton)
    
    expect(onDismiss).toHaveBeenCalledWith('test-123')
  })
  
  it('formats elapsed time correctly', async () => {
    vi.useFakeTimers()
    
    render(<CrawlProgress jobId="test-123" url="https://example.com" />)
    
    // Initially shows 0s
    expect(screen.getByText('0s')).toBeInTheDocument()
    
    // After 45 seconds
    vi.advanceTimersByTime(45000)
    await waitFor(() => {
      expect(screen.getByText('45s')).toBeInTheDocument()
    })
    
    // After 75 seconds (1m 15s)
    vi.advanceTimersByTime(30000)
    await waitFor(() => {
      expect(screen.getByText('1m 15s')).toBeInTheDocument()
    })
    
    vi.useRealTimers()
  })
  
  it('caps progress at 100%', async () => {
    render(<CrawlProgress jobId="test-123" url="https://example.com" />)
    
    const eventSource = eventSourceInstances[0]
    
    // Simulate more processed than discovered (edge case)
    eventSource.triggerEvent('time_update', {
      totalProcessed: 25,
      totalDiscovered: 20
    })
    
    await waitFor(() => {
      expect(screen.getByText('100% complete')).toBeInTheDocument()
    })
  })
})