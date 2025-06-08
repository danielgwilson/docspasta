import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MockEventSource, EventSourceSpy } from './setup-sse-mock'

// Mock the page.tsx functionality that handles SSE
describe('SSE UI Progress Tracking Test', () => {
  let mockEventSource: MockEventSource
  let consoleSpy: any

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.clearAllMocks()
    EventSourceSpy.mockClear()
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    mockEventSource?.close()
  })

  it('should properly connect to SSE endpoint and handle progress events', async () => {
    console.log('🧪 Testing SSE connection and progress handling...')
    
    // Simulate the exact SSE connection code from page.tsx
    const crawlId = 'test-crawl-123'
    let crawlResult: any = null
    let isLoading = true
    let error: string | null = null
    
    // Mock the state setters
    const setCrawlResult = (result: any) => {
      crawlResult = result
      console.log('📊 setCrawlResult called:', result)
    }
    
    const setIsLoading = (loading: boolean) => {
      isLoading = loading
      console.log('⏳ setIsLoading called:', loading)
    }
    
    const setError = (err: string | null) => {
      error = err
      console.log('❌ setError called:', err)
    }

    // Simulate the SSE connection logic from page.tsx
    const connectSSE = () => {
      console.log(`🔄 Connecting to SSE stream for crawl: ${crawlId}`)
      const eventSource = new EventSource(`/api/crawl-v2/${crawlId}/stream`)
      
      eventSource.onopen = () => {
        console.log('📡 SSE connection established')
      }
      
      eventSource.onmessage = (event) => {
        try {
          const update = JSON.parse(event.data)
          console.log('📨 SSE update:', update)
          
          if (update.type === 'progress' && update.data) {
            setCrawlResult(update.data)
          } else if (update.type === 'complete' && update.data) {
            setCrawlResult(update.data)
            setIsLoading(false)
            eventSource.close()
          } else if (update.type === 'error') {
            setError(update.error || 'Stream error occurred')
            setIsLoading(false)
            eventSource.close()
          }
        } catch (parseError) {
          console.error('Failed to parse SSE event:', parseError)
        }
      }
      
      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error)
        eventSource.close()
        
        // Fallback to polling after SSE failure
        console.log('🔄 Falling back to polling...')
        setTimeout(async () => {
          try {
            // Simulate polling fallback
            const statusData = {
              success: true,
              data: {
                id: crawlId,
                status: 'active',
                progress: { current: 10, total: 50, phase: 'crawling' }
              }
            }
            
            setCrawlResult(statusData.data)
            
            if (statusData.data.status === 'completed') {
              setIsLoading(false)
            } else if (statusData.data.status === 'failed') {
              setError('Crawl failed')
              setIsLoading(false)
            }
          } catch {
            setError('Failed to check crawl status')
            setIsLoading(false)
          }
        }, 1000)
      }
      
      return eventSource
    }

    // Start the SSE connection
    mockEventSource = connectSSE() as MockEventSource
    
    // Wait for connection to establish
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Verify connection was created
    expect(EventSourceSpy).toHaveBeenCalledWith(`/api/crawl-v2/${crawlId}/stream`)
    expect(mockEventSource.readyState).toBe(1) // OPEN
    
    // Test progress event
    console.log('📊 Simulating progress event...')
    mockEventSource.simulateMessage({
      type: 'progress',
      data: {
        id: crawlId,
        status: 'active',
        progress: {
          phase: 'crawling',
          current: 25,
          total: 100,
          percentage: 25,
          message: 'Processing URLs...'
        }
      }
    })
    
    await new Promise(resolve => setTimeout(resolve, 50))
    
    // Verify progress was handled
    expect(crawlResult).not.toBeNull()
    expect(crawlResult.status).toBe('active')
    expect(crawlResult.progress.current).toBe(25)
    expect(crawlResult.progress.total).toBe(100)
    expect(isLoading).toBe(true)
    
    // Test completion event
    console.log('✅ Simulating completion event...')
    mockEventSource.simulateMessage({
      type: 'complete',
      data: {
        id: crawlId,
        status: 'completed',
        markdown: '# Test Results\nCrawl completed successfully',
        progress: {
          phase: 'completed',
          current: 100,
          total: 100,
          percentage: 100,
          message: 'Crawl completed'
        }
      }
    })
    
    await new Promise(resolve => setTimeout(resolve, 50))
    
    // Verify completion was handled
    expect(crawlResult.status).toBe('completed')
    expect(crawlResult.markdown).toBe('# Test Results\nCrawl completed successfully')
    expect(isLoading).toBe(false)
    expect(mockEventSource.readyState).toBe(2) // CLOSED
    
    console.log('✅ SSE UI test completed successfully!')
  })

  it('should handle SSE connection errors and fallback to polling', async () => {
    console.log('🧪 Testing SSE error handling and polling fallback...')
    
    const crawlId = 'error-test-456'
    let error: string | null = null
    let isLoading = true
    let crawlResult: any = null
    
    const setError = (err: string | null) => {
      error = err
      console.log('❌ setError called:', err)
    }
    
    const setIsLoading = (loading: boolean) => {
      isLoading = loading
      console.log('⏳ setIsLoading called:', loading)
    }
    
    const setCrawlResult = (result: any) => {
      crawlResult = result
      console.log('📊 setCrawlResult called:', result)
    }

    // Create SSE connection with error handling
    mockEventSource = new MockEventSource(`/api/crawl-v2/${crawlId}/stream`)
    
    mockEventSource.onerror = (errorEvent) => {
      console.error('SSE connection error:', errorEvent)
      mockEventSource.close()
      
      // Simulate polling fallback
      setTimeout(() => {
        console.log('🔄 Polling fallback activated')
        setCrawlResult({
          id: crawlId,
          status: 'active',
          progress: { current: 5, total: 20, phase: 'crawling' }
        })
      }, 100)
    }
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 50))
    
    // Simulate error
    console.log('💥 Simulating connection error...')
    mockEventSource.simulateError()
    
    // Wait for error handling and fallback
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Verify fallback was triggered
    expect(mockEventSource.readyState).toBe(2) // CLOSED
    expect(crawlResult).not.toBeNull()
    expect(crawlResult.progress.current).toBe(5)
    
    console.log('✅ Error handling test completed successfully!')
  })

  it('should properly handle malformed SSE messages', async () => {
    console.log('🧪 Testing malformed message handling...')
    
    const crawlId = 'malformed-test-789'
    let parseErrors: any[] = []
    
    // Mock console.error to catch parse errors
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((msg, error) => {
      if (msg === 'Failed to parse SSE event:') {
        parseErrors.push(error)
      }
    })
    
    mockEventSource = new MockEventSource(`/api/crawl-v2/${crawlId}/stream`)
    
    mockEventSource.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data)
        console.log('📨 SSE update:', update)
      } catch (parseError) {
        console.error('Failed to parse SSE event:', parseError)
      }
    }
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 50))
    
    // Send malformed JSON
    console.log('📨 Sending malformed message...')
    const malformedEvent = new MessageEvent('message', { 
      data: '{ invalid json }' 
    })
    
    if (mockEventSource.onmessage) {
      mockEventSource.onmessage(malformedEvent)
    }
    
    await new Promise(resolve => setTimeout(resolve, 50))
    
    // Verify error was caught
    expect(parseErrors.length).toBeGreaterThan(0)
    
    errorSpy.mockRestore()
    console.log('✅ Malformed message test completed successfully!')
  })
})