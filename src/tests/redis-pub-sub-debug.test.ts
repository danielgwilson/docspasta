import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Redis Pub/Sub Debug', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should debug why pub/sub is not working', async () => {
    console.log('🔍 Debugging Redis pub/sub...')

    const { getRedisConnection } = await import('@/lib/crawler/queue-service')
    
    // Get Redis connection
    const redis = getRedisConnection()
    console.log('✅ Got Redis connection')

    // Test basic operations first
    await redis.set('debug-key', 'debug-value')
    const value = await redis.get('debug-key')
    console.log('📊 Basic set/get:', value)
    expect(value).toBe('debug-value')

    // Test duplicate creation
    console.log('🔄 Testing duplicate creation...')
    const subscriber = redis.duplicate()
    const publisher = redis.duplicate()
    console.log('✅ Created subscriber and publisher')

    // Test the on() method exists
    console.log('🎯 Testing event listener setup...')
    console.log('subscriber.on is:', typeof subscriber.on)
    expect(typeof subscriber.on).toBe('function')

    let messageReceived = false
    let lastMessage: string | null = null

    // Set up the message listener
    subscriber.on('message', (channel: string, message: string) => {
      console.log(`📨 RECEIVED MESSAGE - Channel: ${channel}, Message: ${message}`)
      messageReceived = true
      lastMessage = message
    })

    // Subscribe to a channel
    console.log('📡 Subscribing to test-debug-channel...')
    await subscriber.subscribe('test-debug-channel')
    console.log('✅ Subscription completed')

    // Wait a bit for subscription to be established
    await new Promise(resolve => setTimeout(resolve, 100))

    // Publish a message
    console.log('📤 Publishing test message...')
    const result = await publisher.publish('test-debug-channel', 'DEBUG MESSAGE')
    console.log('📊 Publish result:', result)

    // Wait for message to be received
    console.log('⏳ Waiting for message...')
    await new Promise(resolve => setTimeout(resolve, 200))

    console.log('📊 Final state:')
    console.log('  messageReceived:', messageReceived)
    console.log('  lastMessage:', lastMessage)

    // Check if message was received
    expect(messageReceived).toBe(true)
    expect(lastMessage).toBe('DEBUG MESSAGE')

    // Cleanup
    await subscriber.unsubscribe()
    await subscriber.quit()
    await publisher.quit()

    console.log('✅ Redis pub/sub debug completed!')
  })

  it('should test the exact flow from SSE stream route', async () => {
    console.log('🧪 Testing exact SSE stream flow...')

    const { getRedisConnection } = await import('@/lib/crawler/queue-service')
    const { publishProgressEvent } = await import('@/lib/crawler/streaming-progress')
    
    const testCrawlId = 'sse-flow-test'
    
    // Set up subscriber like the SSE route does
    const subscriber = getRedisConnection().duplicate()
    
    let receivedEvents: any[] = []
    
    await subscriber.subscribe(`crawl:${testCrawlId}:progress`)
    
    subscriber.on('message', (channel: string, message: string) => {
      console.log(`📨 SSE-style event received - Channel: ${channel}`)
      console.log(`📨 Message: ${message}`)
      try {
        const eventData = JSON.parse(message)
        receivedEvents.push(eventData)
      } catch (error) {
        console.error('❌ Failed to parse message:', error)
      }
    })

    // Wait for subscription
    await new Promise(resolve => setTimeout(resolve, 100))

    // Publish an event like the streaming progress does
    console.log('📤 Publishing progress event...')
    await publishProgressEvent({
      crawlId: testCrawlId,
      phase: 'crawling',
      processed: 10,
      total: 50,
      discoveredUrls: 50
    })

    // Wait for event
    await new Promise(resolve => setTimeout(resolve, 500))

    console.log('📊 Received events:', receivedEvents.length)
    receivedEvents.forEach((event, i) => {
      console.log(`📨 Event ${i}:`, event)
    })

    expect(receivedEvents.length).toBeGreaterThan(0)
    
    const firstEvent = receivedEvents[0]
    expect(firstEvent.crawlId).toBe(testCrawlId)
    expect(firstEvent.phase).toBe('crawling')
    expect(firstEvent.processed).toBe(10)

    await subscriber.unsubscribe()
    await subscriber.quit()

    console.log('✅ SSE flow test completed!')
  })
})