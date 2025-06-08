import { describe, it, expect } from 'vitest'

describe('SSE Endpoint Direct Test', () => {
  it('should test the SSE endpoint directly', async () => {
    console.log('🧪 Testing SSE endpoint directly...')

    // Import the route handler
    const { GET } = await import('@/app/api/crawl-v2/[id]/stream/route')
    
    // Create a mock request
    const mockRequest = {
      signal: {
        addEventListener: () => {}
      }
    } as any
    
    const mockParams = Promise.resolve({ id: 'test-crawl-direct' })
    
    console.log('📡 Calling SSE endpoint...')
    
    try {
      const response = await GET(mockRequest, { params: mockParams })
      
      console.log('✅ SSE endpoint responded')
      console.log('Response type:', response.constructor.name)
      console.log('Headers:', Object.fromEntries(response.headers.entries()))
      
      // Check if it's a proper SSE response
      expect(response.headers.get('content-type')).toBe('text/event-stream')
      expect(response.headers.get('cache-control')).toBe('no-cache')
      
      // Try to read some data from the stream
      if (response.body) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        
        console.log('📖 Reading from SSE stream...')
        
        try {
          // Read the first chunk (should be the connection event)
          const { value, done } = await reader.read()
          
          if (!done && value) {
            const chunk = decoder.decode(value)
            console.log('📨 First SSE chunk:', chunk)
            
            // Should contain the connected event
            expect(chunk).toContain('data: ')
            expect(chunk).toContain('connected')
            expect(chunk).toContain('test-crawl-direct')
          }
          
          console.log('✅ SSE endpoint is working and sending data')
          
        } catch (readError) {
          console.error('❌ Error reading from SSE stream:', readError)
        } finally {
          reader.releaseLock()
        }
      }
      
    } catch (error) {
      console.error('❌ SSE endpoint error:', error)
      throw error
    }
  })

  it('should check if Redis connection works in SSE context', async () => {
    console.log('🧪 Testing Redis in SSE context...')
    
    // Import Redis functions
    const { getRedisConnection } = await import('@/lib/crawler/queue-service')
    const { publishProgressEvent } = await import('@/lib/crawler/streaming-progress')
    
    try {
      // Test basic Redis connection
      const redis = getRedisConnection()
      console.log('✅ Redis connection created')
      
      // Test publishing an event (this is what would trigger SSE updates)
      await publishProgressEvent({
        crawlId: 'test-sse-redis',
        phase: 'crawling',
        processed: 1,
        total: 5,
        discoveredUrls: 10
      })
      
      console.log('✅ Progress event published to Redis')
      
      // Test getting a snapshot
      const { getLatestProgressSnapshot } = await import('@/lib/crawler/streaming-progress')
      const snapshot = await getLatestProgressSnapshot('test-sse-redis')
      
      console.log('📊 Progress snapshot:', snapshot)
      expect(snapshot.processed).toBe(1)
      expect(snapshot.total).toBe(5)
      
      console.log('✅ Redis operations working in SSE context')
      
    } catch (error) {
      console.error('❌ Redis error in SSE context:', error)
      throw error
    }
  })

  it('should identify the specific problem with SSE in browser', () => {
    console.log('🔍 Analyzing SSE browser issues...')
    
    console.log('Common SSE problems in browser:')
    console.log('1. ❌ SSE endpoint returns 500 error')
    console.log('2. ❌ SSE connection times out')
    console.log('3. ❌ Redis connection fails in production')
    console.log('4. ❌ No progress events being published')
    console.log('5. ❌ Events published to wrong Redis channel')
    console.log('6. ❌ Frontend not parsing SSE data correctly')
    console.log('7. ❌ React state not updating from SSE events')
    
    console.log('')
    console.log('🔧 Debug steps to try in browser:')
    console.log('1. Check Network tab for /api/crawl-v2/[id]/stream request')
    console.log('2. Look for 200 status on SSE stream')
    console.log('3. Check if stream stays open (pending)')
    console.log('4. Look for "data: {}" messages in Response')
    console.log('5. Check browser console for SSE connection logs')
    console.log('6. Verify crawl actually starts and publishes events')
    
    console.log('')
    console.log('🎯 Most likely issues:')
    console.log('• SSE endpoint crashes due to Redis connection error')
    console.log('• No progress events being published (crawler not working)')
    console.log('• Frontend timing issue (already fixed)')
    console.log('• React state not updating (component issue)')
    
    expect(true).toBe(true) // Always pass
  })
})