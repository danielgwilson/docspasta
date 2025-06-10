import { describe, it, expect, vi } from 'vitest'

/**
 * SSE Redis Connection Debug Test
 * 
 * This test diagnoses whether Redis pub/sub is working correctly
 * between the queue worker and SSE endpoint.
 */

describe('SSE Redis Connection Debug', () => {
  it('should verify Redis pub/sub connection between worker and SSE', async () => {
    console.log('🔍 Testing Redis pub/sub connection...')

    // Import Redis components
    const { getRedisConnection } = await import('@/lib/crawler/queue-service')
    const { publishProgressEvent } = await import('@/lib/crawler/streaming-progress')

    // Create test crawl ID
    const testCrawlId = 'redis-debug-test-12345'
    console.log(`📊 Testing with crawl ID: ${testCrawlId}`)

    try {
      // Test 1: Basic Redis connection
      const redis = getRedisConnection()
      const testKey = `test:${Date.now()}`
      await redis.set(testKey, 'test-value')
      const retrievedValue = await redis.get(testKey)
      await redis.del(testKey)
      
      expect(retrievedValue).toBe('test-value')
      console.log('✅ Basic Redis connection working')

      // Test 2: Redis pub/sub setup
      const subscriber = getRedisConnection().duplicate()
      const publisher = getRedisConnection().duplicate()
      
      const channelName = `crawl:${testCrawlId}:progress`
      console.log(`📡 Testing channel: ${channelName}`)
      
      // Set up subscriber
      let receivedMessage: any = null
      subscriber.on('message', (channel: string, message: string) => {
        console.log(`📨 Received message on channel ${channel}:`, message)
        if (channel === channelName) {
          receivedMessage = JSON.parse(message)
        }
      })
      
      await subscriber.subscribe(channelName)
      console.log(`👂 Subscribed to channel: ${channelName}`)
      
      // Publish test message using publishProgressEvent
      await publishProgressEvent({
        crawlId: testCrawlId,
        phase: 'crawling',
        processed: 5,
        total: 10,
        percentage: 50,
        currentActivity: 'Redis pub/sub test'
      })
      
      // Wait for message propagation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Clean up
      await subscriber.unsubscribe(channelName)
      await subscriber.quit()
      await publisher.quit()
      
      // Verify message was received
      expect(receivedMessage).toBeTruthy()
      expect(receivedMessage.crawlId).toBe(testCrawlId)
      expect(receivedMessage.phase).toBe('crawling')
      expect(receivedMessage.processed).toBe(5)
      expect(receivedMessage.total).toBe(10)
      
      console.log('✅ Redis pub/sub working correctly')
      
    } catch (error) {
      console.error('❌ Redis pub/sub test failed:', error)
      throw error
    }
  })

  it('should test actual crawl ID format from API', async () => {
    console.log('🔍 Testing crawl ID format consistency...')
    
    // Simulate API crawl ID generation
    const { v4: uuidv4 } = await import('uuid')
    const apiCrawlId = uuidv4()
    
    console.log(`🆔 API generated crawl ID: ${apiCrawlId}`)
    
    // Test that it matches UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    expect(uuidRegex.test(apiCrawlId)).toBe(true)
    
    // Test Redis channel name generation
    const channelName = `crawl:${apiCrawlId}:progress`
    console.log(`📡 Expected Redis channel: ${channelName}`)
    
    // Test SSE endpoint URL generation  
    const sseUrl = `/api/crawl-v2/${apiCrawlId}/stream`
    console.log(`🌐 Expected SSE URL: ${sseUrl}`)
    
    expect(channelName).toContain(apiCrawlId)
    expect(sseUrl).toContain(apiCrawlId)
    
    console.log('✅ Crawl ID format consistency verified')
  })

  it('should test timing between API response and worker job creation', async () => {
    console.log('🔍 Testing timing between API and worker...')
    
    // This simulates what happens when user starts a crawl
    const { v4: uuidv4 } = await import('uuid')
    const { saveCrawl } = await import('@/lib/crawler/crawl-redis')
    
    const crawlId = uuidv4()
    console.log(`⏱️  Testing timing for crawl: ${crawlId}`)
    
    // Step 1: API saves initial crawl record (this happens first)
    const startTime = Date.now()
    
    await saveCrawl({
      id: crawlId,
      url: 'https://example.com',
      status: 'active',
      createdAt: startTime,
      totalDiscovered: 0,
      totalQueued: 0,
      totalProcessed: 0,
      totalFiltered: 0,
      totalSkipped: 0,
      totalFailed: 0,
      discoveryComplete: false,
      progress: {
        current: 0,
        total: 0,
        phase: 'initializing',
        message: 'Starting crawl...',
        discovered: 0,
        queued: 0,
        processed: 0,
        filtered: 0,
        skipped: 0,
        failed: 0,
      },
      results: [],
    })
    
    console.log(`💾 Crawl record saved at: ${Date.now() - startTime}ms`)
    
    // Step 2: Check if SSE endpoint can find the crawl record
    const { getCrawl } = await import('@/lib/crawler/crawl-redis')
    const foundCrawl = await getCrawl(crawlId)
    
    expect(foundCrawl).toBeTruthy()
    expect(foundCrawl!.id).toBe(crawlId)
    expect(foundCrawl!.status).toBe('active')
    
    console.log(`🔍 Crawl record found at: ${Date.now() - startTime}ms`)
    
    // Step 3: Check progress snapshot
    const { getLatestProgressSnapshot } = await import('@/lib/crawler/streaming-progress')
    const snapshot = await getLatestProgressSnapshot(crawlId)
    
    expect(snapshot.crawlId).toBe(crawlId)
    expect(snapshot.phase).toBe('initializing')
    
    console.log(`📷 Progress snapshot at: ${Date.now() - startTime}ms`)
    console.log(`✅ Timing test completed in ${Date.now() - startTime}ms`)
  })

  it('should simulate the exact user scenario', async () => {
    console.log('🚨 Simulating exact user scenario...')
    
    // This replicates the user's exact flow
    const { v4: uuidv4 } = await import('uuid')
    const crawlId = uuidv4()
    
    console.log(`🧪 User scenario with crawl ID: ${crawlId}`)
    
    // Step 1: User clicks crawl button -> API creates crawl
    const apiResponse = {
      success: true,
      data: {
        id: crawlId,
        url: 'https://docs.example.com',
        status: 'started'
      }
    }
    
    console.log(`🎯 API Response:`, apiResponse)
    
    // Step 2: Frontend creates SSE connection
    const sseUrl = `/api/crawl-v2/${crawlId}/stream`
    const sessionId = `ui-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    console.log(`📡 Frontend SSE URL: ${sseUrl}`)
    console.log(`🔖 Frontend Session: ${sessionId}`)
    
    // Step 3: Check if Redis subscription would work
    const { getRedisConnection } = await import('@/lib/crawler/queue-service')
    const subscriber = getRedisConnection().duplicate()
    
    const channelName = `crawl:${crawlId}:progress`
    let connectionWorking = false
    
    subscriber.on('message', (channel: string, message: string) => {
      if (channel === channelName) {
        connectionWorking = true
        console.log(`✅ SSE would receive:`, JSON.parse(message))
      }
    })
    
    await subscriber.subscribe(channelName)
    
    // Step 4: Simulate worker publishing progress
    const { publishProgressEvent } = await import('@/lib/crawler/streaming-progress')
    
    await publishProgressEvent({
      crawlId,
      phase: 'discovering',
      processed: 0,
      total: 0,
      currentActivity: 'Discovering URLs via sitemap...'
    })
    
    await publishProgressEvent({
      crawlId,
      phase: 'crawling',
      processed: 3,
      total: 10,
      percentage: 30,
      currentActivity: 'Processing page 3 of 10'
    })
    
    // Wait for events
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Cleanup
    await subscriber.unsubscribe(channelName)
    await subscriber.quit()
    
    expect(connectionWorking).toBe(true)
    console.log('✅ User scenario simulation successful - SSE should work!')
  })
})