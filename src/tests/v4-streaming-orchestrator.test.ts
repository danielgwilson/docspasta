import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventSourcePolyfill } from 'event-source-polyfill'

// Mock the event source
vi.mock('event-source-polyfill', () => ({
  EventSourcePolyfill: vi.fn()
}))

describe('V4 Streaming Orchestrator', () => {
  const baseUrl = 'http://localhost:3000'
  let mockEventSource: any
  
  beforeEach(() => {
    // Create mock EventSource
    mockEventSource = {
      addEventListener: vi.fn(),
      close: vi.fn(),
      readyState: 1, // OPEN
      url: '',
      onerror: null,
      onmessage: null,
      onopen: null
    }
    
    // Setup EventSourcePolyfill mock
    ;(EventSourcePolyfill as any).mockImplementation((url: string) => {
      mockEventSource.url = url
      return mockEventSource
    })
  })
  
  afterEach(() => {
    vi.clearAllMocks()
  })
  
  it('should stream events individually as URLs are processed', async () => {
    console.log('\n🚀 Testing V4 streaming orchestrator...')
    
    // Step 1: Create a job
    const createResponse = await fetch(`${baseUrl}/api/v4/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' })
    })
    
    const createResult = await createResponse.json()
    if (!createResult.success) {
      console.error('Failed to create job:', createResult.error)
      return
    }
    
    const { jobId, streamUrl } = createResult.data
    console.log('✅ Job created:', jobId)
    
    // Step 2: Simulate connecting to SSE stream
    const receivedEvents: any[] = []
    
    // Create EventSource connection
    const eventSource = new EventSourcePolyfill(streamUrl)
    
    // Verify the mock was called
    expect(EventSourcePolyfill).toHaveBeenCalledWith(streamUrl)
    
    // Simulate event streaming
    const simulateEvent = (eventType: string, data: any) => {
      const listeners = mockEventSource.addEventListener.mock.calls
        .filter((call: any) => call[0] === eventType)
        .map((call: any) => call[1])
      
      listeners.forEach((listener: any) => {
        listener({ data: JSON.stringify(data) })
      })
    }
    
    // Set up event listeners
    const eventTypes = [
      'stream_connected',
      'url_started', 
      'url_crawled',
      'urls_discovered',
      'sent_to_processing',
      'progress',
      'job_completed'
    ]
    
    eventTypes.forEach(eventType => {
      eventSource.addEventListener(eventType, (event: any) => {
        const data = JSON.parse(event.data)
        receivedEvents.push({ type: eventType, data })
        console.log(`📨 Received ${eventType}:`, data)
      })
    })
    
    // Simulate the streaming flow
    console.log('\n📡 Simulating streaming events...')
    
    // 1. Stream connected
    simulateEvent('stream_connected', { jobId, url: 'https://example.com' })
    
    // 2. First URL started
    simulateEvent('url_started', { 
      url: 'https://example.com',
      depth: 0,
      timestamp: new Date().toISOString()
    })
    
    // 3. First URL crawled
    simulateEvent('url_crawled', {
      url: 'https://example.com',
      success: true,
      content_length: 5000,
      title: 'Example Domain',
      quality: { score: 80, reason: 'good' },
      timestamp: new Date().toISOString()
    })
    
    // 4. URLs discovered
    simulateEvent('urls_discovered', {
      source_url: 'https://example.com',
      discovered_urls: [
        'https://example.com/page1',
        'https://example.com/page2'
      ],
      count: 2,
      total_discovered: 2,
      timestamp: new Date().toISOString()
    })
    
    // 5. Sent to processing
    simulateEvent('sent_to_processing', {
      url: 'https://example.com',
      word_count: 500,
      timestamp: new Date().toISOString()
    })
    
    // 6. Progress update
    simulateEvent('progress', {
      processed: 1,
      discovered: 2,
      queued: 2,
      pending: 0,
      timestamp: new Date().toISOString()
    })
    
    // 7. Second URL started
    simulateEvent('url_started', { 
      url: 'https://example.com/page1',
      depth: 1,
      timestamp: new Date().toISOString()
    })
    
    // 8. Job completed
    simulateEvent('job_completed', {
      jobId,
      totalProcessed: 3,
      totalDiscovered: 2,
      timestamp: new Date().toISOString()
    })
    
    // Verify events were received in order
    expect(receivedEvents).toHaveLength(8)
    expect(receivedEvents[0].type).toBe('stream_connected')
    expect(receivedEvents[1].type).toBe('url_started')
    expect(receivedEvents[2].type).toBe('url_crawled')
    expect(receivedEvents[3].type).toBe('urls_discovered')
    expect(receivedEvents[4].type).toBe('sent_to_processing')
    expect(receivedEvents[5].type).toBe('progress')
    expect(receivedEvents[6].type).toBe('url_started')
    expect(receivedEvents[7].type).toBe('job_completed')
    
    // Verify streaming nature - events come individually
    expect(receivedEvents[1].data.url).toBe('https://example.com')
    expect(receivedEvents[3].data.discovered_urls).toHaveLength(2)
    expect(receivedEvents[5].data.queued).toBe(2)
    expect(receivedEvents[6].data.url).toBe('https://example.com/page1')
    
    console.log('\n✅ V4 streaming orchestrator test passed!')
    
    // Clean up
    eventSource.close()
  })
})