import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { CrawlCard } from '@/components/CrawlCard'
import { createSSEEvent } from '@/lib/schemas/sse-events'

// Mock EventSource
class MockEventSource {
  url: string
  readyState: number = 0
  onopen: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  listeners: Map<string, Array<(event: MessageEvent) => void>> = new Map()

  constructor(url: string) {
    this.url = url
    // Simulate connection opening
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
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  dispatchEvent(type: string, data: string) {
    const listeners = this.listeners.get(type)
    if (listeners) {
      const event = new MessageEvent(type, { data })
      listeners.forEach(listener => listener(event))
    }
  }

  close() {
    this.readyState = 2
  }
}

// Store original EventSource
const OriginalEventSource = global.EventSource

describe('CrawlCard Zod Parsing', () => {
  let mockEventSource: MockEventSource
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Mock EventSource globally
    global.EventSource = vi.fn().mockImplementation((url: string) => {
      mockEventSource = new MockEventSource(url)
      return mockEventSource
    }) as any

    // Spy on console.error to verify error handling
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    // Restore original EventSource
    global.EventSource = OriginalEventSource
    consoleErrorSpy.mockRestore()
  })

  it('should handle valid SSE events correctly', async () => {
    const onComplete = vi.fn()
    render(
      <CrawlCard
        jobId="test-job-123"
        url="https://example.com"
        onComplete={onComplete}
      />
    )

    // Wait for EventSource to be created
    await waitFor(() => {
      expect(mockEventSource).toBeDefined()
    })

    // Send valid stream_connected event
    const streamConnectedEvent = createSSEEvent.streamConnected({
      jobId: 'test-job-123',
      url: 'https://example.com',
    })
    mockEventSource.dispatchEvent('stream_connected', JSON.stringify(streamConnectedEvent))

    // Verify no console errors for valid event
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse stream_connected event'),
      expect.any(String)
    )

    // Send valid url_crawled event
    const urlCrawledEvent = createSSEEvent.urlCrawled({
      url: 'https://example.com/page1',
      success: true,
      content_length: 1500,
      title: 'Example Page',
      quality: { score: 85, reason: 'good' },
    })
    mockEventSource.dispatchEvent('url_crawled', JSON.stringify(urlCrawledEvent))

    // Check that processed count updated
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
    })

    // Send job_completed event
    const jobCompletedEvent = createSSEEvent.jobCompleted({
      jobId: 'test-job-123',
      totalProcessed: 5,
      totalDiscovered: 10,
    })
    mockEventSource.dispatchEvent('job_completed', JSON.stringify(jobCompletedEvent))

    // Verify completion
    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument()
      expect(onComplete).toHaveBeenCalledWith('test-job-123')
    })
  })

  it('should handle invalid JSON gracefully', async () => {
    render(
      <CrawlCard
        jobId="test-job-123"
        url="https://example.com"
      />
    )

    await waitFor(() => {
      expect(mockEventSource).toBeDefined()
    })

    // Send invalid JSON
    mockEventSource.dispatchEvent('url_crawled', 'not valid json {')

    // Verify error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to parse SSE event:',
      expect.any(Error)
    )

    // Verify component doesn't crash - should still be in processing state
    expect(screen.queryByText('Processing')).toBeDefined()
  })

  it('should reject events with wrong type field', async () => {
    render(
      <CrawlCard
        jobId="test-job-123"
        url="https://example.com"
      />
    )

    await waitFor(() => {
      expect(mockEventSource).toBeDefined()
    })

    // Send event with wrong type for the event listener
    const wrongTypeEvent = {
      type: 'wrong_type', // This doesn't match 'url_crawled'
      timestamp: new Date().toISOString(),
      url: 'https://example.com/page1',
      success: true,
      content_length: 1500,
    }
    mockEventSource.dispatchEvent('url_crawled', JSON.stringify(wrongTypeEvent))

    // Verify error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to parse url_crawled event:',
      JSON.stringify(wrongTypeEvent)
    )
  })

  it('should reject events with missing required fields', async () => {
    render(
      <CrawlCard
        jobId="test-job-123"
        url="https://example.com"
      />
    )

    await waitFor(() => {
      expect(mockEventSource).toBeDefined()
    })

    // Send event missing required fields
    const incompleteEvent = {
      type: 'url_crawled',
      timestamp: new Date().toISOString(),
      // Missing: url, success, content_length
    }
    mockEventSource.dispatchEvent('url_crawled', JSON.stringify(incompleteEvent))

    // Verify error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to parse url_crawled event:',
      JSON.stringify(incompleteEvent)
    )
  })

  it('should reject events with wrong data types', async () => {
    render(
      <CrawlCard
        jobId="test-job-123"
        url="https://example.com"
      />
    )

    await waitFor(() => {
      expect(mockEventSource).toBeDefined()
    })

    // Send event with wrong data types
    const wrongTypesEvent = {
      type: 'url_crawled',
      timestamp: new Date().toISOString(),
      url: 'not-a-valid-url', // Invalid URL
      success: 'yes', // Should be boolean
      content_length: 'large', // Should be number
    }
    mockEventSource.dispatchEvent('url_crawled', JSON.stringify(wrongTypesEvent))

    // Verify error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to parse SSE event:',
      expect.any(Error)
    )
  })

  it('should continue processing valid events after invalid ones', async () => {
    render(
      <CrawlCard
        jobId="test-job-123"
        url="https://example.com"
      />
    )

    await waitFor(() => {
      expect(mockEventSource).toBeDefined()
    })

    // Send invalid event first
    mockEventSource.dispatchEvent('progress', 'invalid json')

    // Then send valid event
    const validProgressEvent = createSSEEvent.progress({
      processed: 3,
      discovered: 10,
      queued: 5,
      pending: 2,
    })
    mockEventSource.dispatchEvent('progress', JSON.stringify(validProgressEvent))

    // Verify the valid event was processed
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument() // processed count
    })
  })

  it('should handle malformed timestamp gracefully', async () => {
    render(
      <CrawlCard
        jobId="test-job-123"
        url="https://example.com"
      />
    )

    await waitFor(() => {
      expect(mockEventSource).toBeDefined()
    })

    // Send event with invalid timestamp
    const badTimestampEvent = {
      type: 'stream_connected',
      timestamp: 'not-a-date',
      jobId: 'test-job-123',
      url: 'https://example.com',
    }
    mockEventSource.dispatchEvent('stream_connected', JSON.stringify(badTimestampEvent))

    // Verify error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to parse SSE event:',
      expect.any(Error)
    )
  })

  it('should handle extra unexpected fields gracefully', async () => {
    render(
      <CrawlCard
        jobId="test-job-123"
        url="https://example.com"
      />
    )

    await waitFor(() => {
      expect(mockEventSource).toBeDefined()
    })

    // Send event with extra fields (Zod will strip them by default)
    const eventWithExtras = {
      type: 'url_started',
      timestamp: new Date().toISOString(),
      url: 'https://example.com/page1',
      depth: 1,
      extraField: 'should be ignored',
      anotherExtra: 123,
    }
    mockEventSource.dispatchEvent('url_started', JSON.stringify(eventWithExtras))

    // Should process without errors (Zod strips unknown fields)
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse url_started event'),
      expect.any(String)
    )
  })

  it('should validate nested objects in events', async () => {
    render(
      <CrawlCard
        jobId="test-job-123"
        url="https://example.com"
      />
    )

    await waitFor(() => {
      expect(mockEventSource).toBeDefined()
    })

    // Send event with invalid nested quality object
    const invalidQualityEvent = {
      type: 'url_crawled',
      timestamp: new Date().toISOString(),
      url: 'https://example.com/page1',
      success: true,
      content_length: 1500,
      quality: {
        score: 150, // Invalid: exceeds max of 100
        reason: 123, // Invalid: should be string
      },
    }
    mockEventSource.dispatchEvent('url_crawled', JSON.stringify(invalidQualityEvent))

    // Verify error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to parse SSE event:',
      expect.any(Error)
    )
  })

  it('should handle job_failed event with optional fields', async () => {
    render(
      <CrawlCard
        jobId="test-job-123"
        url="https://example.com"
      />
    )

    await waitFor(() => {
      expect(mockEventSource).toBeDefined()
    })

    // Send job_failed without optional fields
    const minimalFailEvent = createSSEEvent.jobFailed({
      jobId: 'test-job-123',
      error: 'Connection timeout',
      // totalProcessed and totalDiscovered are optional
    })
    mockEventSource.dispatchEvent('job_failed', JSON.stringify(minimalFailEvent))

    // Should process without errors
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument()
    })
    
    // Check error message is displayed (appears in multiple places)
    const errorMessages = screen.getAllByText(/Connection timeout/)
    expect(errorMessages.length).toBeGreaterThan(0)
    
    // Verify no console errors for valid event with optional fields
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse job_failed event'),
      expect.any(String)
    )
  })
})