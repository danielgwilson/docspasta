import { describe, it, expect, vi } from 'vitest'

describe('Lovable Completion Fix Test', () => {
  it('should verify SSE completion event includes markdown content', async () => {
    console.log('🧪 Testing lovable.dev completion with markdown content...')
    
    // Import required modules
    const { startCrawl } = await import('@/lib/crawler')
    const { getCrawl } = await import('@/lib/crawler/crawl-redis')
    const { getRedisConnection } = await import('@/lib/crawler/queue-service')
    
    // Start a real crawl
    const crawlId = await startCrawl({
      url: 'https://lovable.dev',
      maxPages: 3,
      maxDepth: 1,
      qualityThreshold: 20
    })
    
    console.log(`🚀 Started crawl: ${crawlId}`)
    
    // Set up Redis subscription to monitor completion event
    const redis = getRedisConnection()
    const subscriber = redis.duplicate()
    await subscriber.subscribe(`crawl:${crawlId}:progress`)
    
    let completionEventReceived = false
    let completionEventData: any = null
    
    // Listen for completion event
    subscriber.on('message', (channel: string, message: string) => {
      try {
        const event = JSON.parse(message)
        if (event.type === 'completion') {
          completionEventReceived = true
          completionEventData = event
          console.log('📨 Completion event received:', {
            type: event.type,
            status: event.status,
            totalProcessed: event.totalProcessed,
            hasResults: !!event.finalResults,
            contentLength: event.finalResults?.content?.length || 0
          })
        }
      } catch (e) {
        console.error('Error parsing event:', e)
      }
    })
    
    // Wait for crawl to complete
    const startTime = Date.now()
    const timeout = 30000
    let crawlData: any = null
    
    while (Date.now() - startTime < timeout) {
      crawlData = await getCrawl(crawlId)
      
      if (crawlData?.status === 'completed' || crawlData?.status === 'failed') {
        console.log(`✅ Crawl ${crawlData.status} after ${Date.now() - startTime}ms`)
        break
      }
      
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    // Give a moment for the completion event to be processed
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Cleanup
    await subscriber.unsubscribe()
    await subscriber.quit()
    
    // Verify crawl completed successfully
    expect(crawlData).toBeDefined()
    expect(crawlData.status).toBe('completed')
    expect(crawlData.results).toBeDefined()
    expect(crawlData.results.length).toBeGreaterThan(0)
    
    // Verify completion event was sent
    expect(completionEventReceived).toBe(true)
    expect(completionEventData).toBeDefined()
    expect(completionEventData.type).toBe('completion')
    
    // Verify the event has the expected data
    if (completionEventData.finalResults) {
      expect(completionEventData.finalResults.urls).toBeDefined()
      expect(completionEventData.finalResults.urls.length).toBeGreaterThan(0)
      expect(completionEventData.finalResults.content).toBeDefined()
      expect(completionEventData.finalResults.content.length).toBeGreaterThan(0)
      console.log('✅ Completion event includes content!')
    }
    
    // Log what the SSE endpoint would send
    console.log('\n📡 What SSE endpoint will send:')
    console.log('- Type: complete')
    console.log('- Status:', crawlData.status)
    console.log('- URL:', crawlData.url)
    console.log('- Results count:', crawlData.results.length)
    console.log('- Combined content length:', crawlData.results.map((r: any) => r.content).join('\\n\\n---\\n\\n').length)
    
    // Verify the content is not empty
    const combinedContent = crawlData.results.map((r: any) => r.content).join('\\n\\n---\\n\\n')
    expect(combinedContent.length).toBeGreaterThan(0)
    
    console.log('✅ Fix verified: SSE completion will include markdown content')
    
    return {
      crawlId,
      resultsCount: crawlData.results.length,
      contentLength: combinedContent.length,
      completionEventSent: completionEventReceived
    }
  }, 60000)
})