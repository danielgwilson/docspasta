import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SimpleCrawlResults } from '@/components/SimpleCrawlResults'

// Mock EventSource
const mockEventSource = {
  onopen: null as any,
  onmessage: null as any,
  onerror: null as any,
  close: vi.fn(),
  readyState: 1,
}

global.EventSource = vi.fn().mockImplementation(() => mockEventSource)

describe('SimpleCrawlResults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEventSource.close.mockClear()
  })

  it('should handle complete crawl flow', async () => {
    const onComplete = vi.fn()
    render(<SimpleCrawlResults crawlId="test-123" onComplete={onComplete} />)

    // Should show loading initially
    expect(screen.getByText('Connecting to crawler...')).toBeInTheDocument()

    // Simulate SSE connection open
    mockEventSource.onopen?.()

    // Should show active state
    await waitFor(() => {
      expect(screen.getByText('Crawling in progress...')).toBeInTheDocument()
    })

    // Simulate progress event
    mockEventSource.onmessage?.({
      data: JSON.stringify({
        type: 'progress',
        data: {
          progress: {
            processed: 5,
            total: 10
          }
        }
      })
    })

    await waitFor(() => {
      expect(screen.getByText('5 / 10 pages')).toBeInTheDocument()
      expect(screen.getByText('50% complete')).toBeInTheDocument()
    })

    // Simulate completion with markdown
    const markdown = '# Test Documentation\\n\\nThis is test content.'
    mockEventSource.onmessage?.({
      data: JSON.stringify({
        type: 'complete',
        data: {
          markdown: markdown,
          progress: {
            processed: 10,
            total: 10
          }
        }
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Crawl Complete!')).toBeInTheDocument()
      expect(screen.getByText('Successfully extracted 10 pages')).toBeInTheDocument()
      expect(screen.getByText(/Test Documentation/)).toBeInTheDocument()
      expect(onComplete).toHaveBeenCalledWith(markdown)
    })

    expect(mockEventSource.close).toHaveBeenCalled()
  })

  it('should handle completion without markdown in SSE', async () => {
    // Mock fetch for fallback
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        data: {
          markdown: '# Fallback Content',
          results: [
            { content: '# Fallback Content' }
          ]
        }
      })
    })

    const onComplete = vi.fn()
    render(<SimpleCrawlResults crawlId="test-456" onComplete={onComplete} />)

    // Simulate completion without markdown
    mockEventSource.onmessage?.({
      data: JSON.stringify({
        type: 'complete',
        data: {
          // No markdown field
          progress: {
            processed: 5,
            total: 5
          }
        }
      })
    })

    // Should fetch from API as fallback
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/crawl-v2/test-456')
      expect(onComplete).toHaveBeenCalledWith('# Fallback Content')
    })
  })

  it('should handle SSE errors and fallback to polling', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        json: async () => ({
          success: true,
          data: {
            status: 'active',
            progress: { processed: 3, total: 10 }
          }
        })
      })
      .mockResolvedValueOnce({
        json: async () => ({
          success: true,
          data: {
            status: 'completed',
            markdown: '# Polled Content',
            progress: { processed: 10, total: 10 }
          }
        })
      })

    render(<SimpleCrawlResults crawlId="test-789" />)

    // Simulate SSE error
    mockEventSource.onerror?.({})

    // Should start polling
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/crawl-v2/test-789')
    })

    // Wait for second poll that shows completion
    await waitFor(() => {
      expect(screen.getByText('Crawl Complete!')).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('should handle failed crawls', async () => {
    render(<SimpleCrawlResults crawlId="test-fail" />)

    mockEventSource.onmessage?.({
      data: JSON.stringify({
        type: 'error',
        error: 'Test error message'
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Crawl Failed')).toBeInTheDocument()
      expect(screen.getByText('Test error message')).toBeInTheDocument()
    })
  })
})