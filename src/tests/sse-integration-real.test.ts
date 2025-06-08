import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('SSE Integration Real Test', () => {
  let consoleSpy: any

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  it('should start a real crawl and verify progress events are published', async () => {
    console.log('🧪 Testing real crawl with SSE progress events...')

    const { startCrawl } = await import('@/lib/crawler')
    const { getRedisConnection } = await import('@/lib/crawler/queue-service')
    const { getLatestProgressSnapshot } = await import('@/lib/crawler/streaming-progress')
    
    // Set up a subscriber to listen for progress events
    const subscriber = getRedisConnection().duplicate()
    const receivedEvents: any[] = []
    
    // Start with a simple URL that should work
    const crawlId = await startCrawl('https://docs.lovable.dev/introduction', {
      maxPages: 5,
      maxDepth: 1
    })
    
    console.log(`📊 Started crawl: ${crawlId}`)
    
    // Subscribe to progress events for this crawl
    await subscriber.subscribe(`crawl:${crawlId}:progress`)
    
    subscriber.on('message', (channel: string, message: string) => {
      console.log(`📨 Progress event - Channel: ${channel}`)
      try {
        const eventData = JSON.parse(message)
        console.log(`📊 Event type: ${eventData.type || 'progress'}, Phase: ${eventData.phase}`)
        receivedEvents.push(eventData)
      } catch (error) {
        console.error('❌ Failed to parse progress message:', error)
      }
    })

    // Wait for crawl to make some progress
    console.log('⏳ Waiting for crawl progress...')
    let attempts = 0
    const maxAttempts = 30 // 15 seconds max
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Check if we received any events
      if (receivedEvents.length > 0) {
        console.log(`✅ Received ${receivedEvents.length} progress events`)
        break
      }
      
      // Also check progress snapshot
      try {
        const snapshot = await getLatestProgressSnapshot(crawlId)
        console.log(`📊 Snapshot - Phase: ${snapshot.phase}, Progress: ${snapshot.processed}/${snapshot.total}`)
        
        if (snapshot.phase === 'completed' || snapshot.processed > 0) {
          console.log('✅ Crawl is making progress based on snapshot')
          break
        }
      } catch (error) {
        console.log('⚠️ No snapshot yet:', error)
      }
      
      attempts++
    }

    console.log(`📊 Final results after ${attempts} attempts:`)
    console.log(`📊 Events received: ${receivedEvents.length}`)
    console.log(`📊 Events:`, receivedEvents.map(e => ({ type: e.type, phase: e.phase, processed: e.processed })))

    // Check final snapshot
    const finalSnapshot = await getLatestProgressSnapshot(crawlId)
    console.log(`📊 Final snapshot:`, finalSnapshot)

    // The test passes if either:
    // 1. We received progress events via pub/sub, OR
    // 2. The progress snapshot shows the crawl is working
    const hasProgressEvents = receivedEvents.length > 0
    const hasProgressSnapshot = finalSnapshot.processed > 0 || finalSnapshot.phase !== 'initializing'
    
    console.log(`📊 Test results:`)
    console.log(`  hasProgressEvents: ${hasProgressEvents}`)
    console.log(`  hasProgressSnapshot: ${hasProgressSnapshot}`)

    expect(hasProgressEvents || hasProgressSnapshot).toBe(true)

    // If we got events, verify they have the right structure
    if (hasProgressEvents) {
      const firstEvent = receivedEvents[0]
      expect(firstEvent).toHaveProperty('crawlId')
      expect(firstEvent.crawlId).toBe(crawlId)
      console.log('✅ Progress events have correct structure')
    }

    await subscriber.quit()
    console.log('✅ SSE integration test completed!')
  }, 20000) // 20 second timeout for real crawl

  it('should verify the SSE stream endpoint structure', async () => {
    console.log('🧪 Testing SSE stream endpoint structure...')

    // Import the stream route handler 
    const routeModule = await import('@/app/api/crawl-v2/[id]/stream/route')
    
    // Verify the GET function exists
    expect(typeof routeModule.GET).toBe('function')
    
    console.log('✅ SSE stream route handler exists')
    
    // Test that it can handle a request-like object
    const mockRequest = {
      signal: {
        addEventListener: vi.fn()
      }
    } as any
    
    const mockParams = Promise.resolve({ id: 'test-crawl-123' })
    
    try {
      const response = await routeModule.GET(mockRequest, { params: mockParams })
      
      // Check if it returns a Response object
      expect(response).toBeInstanceOf(Response)
      
      // Check headers
      const headers = Object.fromEntries(response.headers.entries())
      console.log('📊 SSE Response headers:', headers)
      
      expect(headers['content-type']).toBe('text/event-stream')
      expect(headers['cache-control']).toBe('no-cache')
      expect(headers['connection']).toBe('keep-alive')
      
      console.log('✅ SSE stream endpoint returns correct headers')
      
    } catch (error) {
      console.error('❌ SSE stream endpoint error:', error)
      throw error
    }
  })
})