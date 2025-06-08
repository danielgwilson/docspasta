import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Home from '@/app/page'

// Mock fetch globally
global.fetch = vi.fn()

describe('UI Component SSE Test', () => {
  let mockEventSource: any
  let mockEventSourceInstance: any

  beforeEach(() => {
    // Create a mock EventSource that we can control
    mockEventSourceInstance = {
      readyState: 0, // CONNECTING
      onopen: null,
      onmessage: null,
      onerror: null,
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }

    mockEventSource = vi.fn().mockImplementation(() => {
      console.log('🔌 Mock EventSource created')
      // Simulate connection opening
      setTimeout(() => {
        mockEventSourceInstance.readyState = 1 // OPEN
        if (mockEventSourceInstance.onopen) {
          mockEventSourceInstance.onopen(new Event('open'))
        }
      }, 100)
      
      return mockEventSourceInstance
    })

    // Mock EventSource globally
    global.EventSource = mockEventSource
    
    // Mock fetch
    vi.mocked(fetch).mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should test the actual UI component SSE flow', async () => {
    console.log('🧪 Testing actual UI component with SSE...')

    // Mock the crawl start API response
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 'test-crawl-123',
          status: 'active'
        }
      })
    } as Response)

    // Render the actual Home component
    render(<Home />)

    // Find the URL input and submit button
    const urlInput = screen.getByPlaceholderText('https://docs.example.com')
    const submitButton = screen.getByText('Paste It!')

    expect(urlInput).toBeInTheDocument()
    expect(submitButton).toBeInTheDocument()

    // Enter a URL and submit
    fireEvent.change(urlInput, { target: { value: 'https://docs.lovable.dev/introduction' } })
    fireEvent.click(submitButton)

    console.log('📤 Form submitted, waiting for crawl start...')

    // Wait for the crawl to start and SSE connection to be created
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/crawl-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://docs.lovable.dev/introduction' })
      })
    }, { timeout: 1000 })

    console.log('✅ Crawl API called')

    // Wait for EventSource to be created
    await waitFor(() => {
      expect(mockEventSource).toHaveBeenCalledWith('/api/crawl-v2/test-crawl-123/stream')
    }, { timeout: 2000 })

    console.log('✅ EventSource created')

    // Verify the loading state is shown
    expect(screen.getByText('Crawling...')).toBeInTheDocument()

    // Simulate SSE connection opening
    await waitFor(() => {
      expect(mockEventSourceInstance.readyState).toBe(1)
    })

    console.log('📡 SSE connection opened')

    // Simulate receiving a progress message
    console.log('📨 Simulating progress message...')
    if (mockEventSourceInstance.onmessage) {
      const progressEvent = {
        data: JSON.stringify({
          type: 'progress',
          data: {
            id: 'test-crawl-123',
            status: 'active',
            progress: {
              phase: 'crawling',
              current: 5,
              total: 10,
              percentage: 50,
              message: 'Processing URLs...'
            }
          }
        })
      }
      mockEventSourceInstance.onmessage(progressEvent)
    }

    // Wait for progress to be displayed
    console.log('⏳ Waiting for progress display...')
    await waitFor(() => {
      // Look for any progress indicators
      const progressText = screen.queryByText(/processing/i) || 
                          screen.queryByText(/crawling/i) ||
                          screen.queryByText(/5.*10/i) ||
                          screen.queryByText(/50%/i)
      expect(progressText).toBeInTheDocument()
    }, { timeout: 2000 })

    console.log('📊 Progress displayed!')

    // Simulate completion message
    console.log('🎉 Simulating completion message...')
    if (mockEventSourceInstance.onmessage) {
      const completeEvent = {
        data: JSON.stringify({
          type: 'complete',
          data: {
            id: 'test-crawl-123',
            status: 'completed',
            markdown: '# Test Results\nCrawl completed successfully',
            progress: {
              phase: 'completed',
              current: 10,
              total: 10,
              percentage: 100
            }
          }
        })
      }
      mockEventSourceInstance.onmessage(completeEvent)
    }

    // Wait for completion to be displayed
    await waitFor(() => {
      const completedText = screen.queryByText(/completed/i) ||
                           screen.queryByText(/test results/i)
      expect(completedText).toBeInTheDocument()
    }, { timeout: 2000 })

    // Verify loading is no longer shown
    expect(screen.queryByText('Crawling...')).not.toBeInTheDocument()

    console.log('✅ UI Component SSE test completed!')
  }, 10000)

  it('should test SSE error handling in UI', async () => {
    console.log('🧪 Testing UI SSE error handling...')

    // Mock the crawl start API response
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 'error-test-456',
          status: 'active'
        }
      })
    } as Response)

    // Mock the fallback polling API response
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 'error-test-456',
          status: 'active',
          progress: {
            current: 3,
            total: 8,
            phase: 'crawling'
          }
        }
      })
    } as Response)

    render(<Home />)

    const urlInput = screen.getByPlaceholderText('https://docs.example.com')
    const submitButton = screen.getByText('Paste It!')

    fireEvent.change(urlInput, { target: { value: 'https://test.com' } })
    fireEvent.click(submitButton)

    // Wait for SSE connection
    await waitFor(() => {
      expect(mockEventSource).toHaveBeenCalledWith('/api/crawl-v2/error-test-456/stream')
    })

    // Simulate SSE error
    console.log('💥 Simulating SSE error...')
    if (mockEventSourceInstance.onerror) {
      mockEventSourceInstance.onerror(new Event('error'))
    }

    // Wait for fallback polling to kick in
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/crawl-v2/error-test-456')
    }, { timeout: 3000 })

    console.log('✅ Fallback polling activated after SSE error')
  })

  it('should debug what actually happens when SSE fails', async () => {
    console.log('🔍 Debugging real SSE failure scenario...')

    // Mock API to return successful crawl start
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { id: 'debug-crawl-789' }
      })
    } as Response)

    render(<Home />)

    const urlInput = screen.getByPlaceholderText('https://docs.example.com')
    const submitButton = screen.getByText('Paste It!')

    fireEvent.change(urlInput, { target: { value: 'https://debug.com' } })
    fireEvent.click(submitButton)

    // Wait for EventSource creation
    await waitFor(() => {
      expect(mockEventSource).toHaveBeenCalled()
    })

    console.log('📊 Current UI state after submission:')
    
    // Check what's actually rendered
    const loadingElements = screen.queryAllByText(/loading|crawling/i)
    const errorElements = screen.queryAllByText(/error|failed/i)
    const progressElements = screen.queryAllByText(/progress|processing/i)
    
    console.log('  Loading elements:', loadingElements.length)
    console.log('  Error elements:', errorElements.length) 
    console.log('  Progress elements:', progressElements.length)

    // Check if EventSource was called with correct URL
    const eventSourceCalls = mockEventSource.mock.calls
    console.log('  EventSource calls:', eventSourceCalls)

    // Wait a bit and check state again
    await new Promise(resolve => setTimeout(resolve, 1000))

    console.log('📊 UI state after 1 second:')
    console.log('  Still loading?', !!screen.queryByText(/crawling/i))
    console.log('  Any errors?', !!screen.queryByText(/error/i))

    // The test passes if we can identify what's happening
    expect(mockEventSource).toHaveBeenCalledWith('/api/crawl-v2/debug-crawl-789/stream')
  })
})