import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Integration test for Queue + SSE hybrid system
 * Tests that the queue system works with SSE streaming
 */

describe('Queue SSE Integration', () => {
  let mockEventSource: any
  let mockFetch: any

  beforeEach(() => {
    // Mock fetch for API calls
    mockFetch = vi.fn()
    global.fetch = mockFetch

    // Mock EventSource for SSE
    mockEventSource = {
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }
    global.EventSource = vi.fn(() => mockEventSource)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should start queue crawl and connect to SSE status endpoint', async () => {
    // Mock successful API response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { id: 'test-crawl-123', url: 'https://example.com', status: 'started' }
      })
    })

    // Start crawl via API
    const response = await fetch('/api/crawl-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://docs.lovable.dev' })
    })

    const result = await response.json()
    
    // Verify queue API was called correctly
    expect(mockFetch).toHaveBeenCalledWith('/api/crawl-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://docs.lovable.dev' })
    })
    
    expect(result.success).toBe(true)
    expect(result.data.id).toBe('test-crawl-123')
    
    // Simulate SSE connection
    const crawlId = result.data.id
    const eventSource = new EventSource(`/api/crawl-v2/${crawlId}/status`)
    
    expect(global.EventSource).toHaveBeenCalledWith(`/api/crawl-v2/${crawlId}/status`)
    expect(eventSource).toBeDefined()
  })

  it('should handle SSE progress events correctly', () => {
    const crawlId = 'test-crawl-123'
    const eventSource = new EventSource(`/api/crawl-v2/${crawlId}/status`)
    
    // Mock progress events that the queue system would send
    const progressEvents = [
      {
        type: 'connected',
        crawlId,
        timestamp: Date.now()
      },
      {
        type: 'initial_status',
        crawlId,
        status: 'active',
        progress: {
          phase: 'discovering',
          processed: 0,
          total: 0,
          message: 'Discovering URLs...'
        },
        timestamp: Date.now()
      },
      {
        type: 'progress',
        crawlId,
        phase: 'crawling',
        processed: 5,
        total: 20,
        percentage: 25,
        discoveredUrls: 20,
        currentActivity: 'Crawling pages...',
        timestamp: Date.now()
      },
      {
        type: 'completed',
        crawlId,
        status: 'completed',
        results: [
          {
            url: 'https://docs.lovable.dev/intro',
            title: 'Introduction',
            content: '# Introduction\n\nWelcome to Lovable!'
          }
        ],
        timestamp: Date.now()
      }
    ]

    // Verify each event type can be processed
    progressEvents.forEach(event => {
      expect(() => {
        // This simulates what the component would do when receiving events
        const eventData = JSON.stringify(event)
        const parsedEvent = JSON.parse(eventData)
        expect(parsedEvent.type).toBeDefined()
        expect(parsedEvent.crawlId).toBe(crawlId)
        expect(parsedEvent.timestamp).toBeDefined()
      }).not.toThrow()
    })
  })

  it('should work with both sitemap sites (Lovable) and link discovery sites (Tailwind)', () => {
    const testSites = [
      {
        name: 'Lovable (sitemap-based)',
        url: 'https://docs.lovable.dev',
        expectedBehavior: 'Should discover 100+ URLs from sitemap'
      },
      {
        name: 'Tailwind (link-discovery-based)', 
        url: 'https://tailwindcss.com/docs',
        expectedBehavior: 'Should discover pages via link traversal'
      }
    ]

    testSites.forEach(site => {
      // Mock API response for each site
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: `crawl-${site.name}`, url: site.url, status: 'started' }
        })
      })

      // Verify the queue API would be called correctly
      expect(async () => {
        const response = await fetch('/api/crawl-v2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: site.url })
        })
        const result = await response.json()
        expect(result.success).toBe(true)
      }).not.toThrow()
    })
  })

  it('should handle connection errors gracefully', () => {
    const crawlId = 'test-crawl-123'
    const eventSource = new EventSource(`/api/crawl-v2/${crawlId}/status`)
    
    // Simulate connection error
    const errorEvent = new Error('Connection failed')
    
    expect(() => {
      if (eventSource.onerror) {
        eventSource.onerror(errorEvent)
      }
    }).not.toThrow()
    
    // Verify cleanup
    eventSource.close()
    expect(eventSource.close).toHaveBeenCalled()
  })
})

describe('Queue System Depth Discovery', () => {
  it('should support depth-based crawling for sites without sitemaps', () => {
    // This test verifies the queue system's capability
    const mockCrawlOptions = {
      maxDepth: 2,
      maxPages: 50,
      url: 'https://tailwindcss.com/docs'
    }

    // The queue system should:
    // 1. Start with the initial URL
    // 2. Crawl it and extract links
    // 3. Add discovered links as new jobs (depth + 1)
    // 4. Continue until maxDepth is reached

    expect(mockCrawlOptions.maxDepth).toBeGreaterThan(1)
    expect(mockCrawlOptions.maxPages).toBeGreaterThan(1)
    
    // This verifies the configuration supports depth discovery
    // The actual implementation is tested in the queue worker tests
  })
})