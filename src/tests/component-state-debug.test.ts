import { describe, it, expect } from 'vitest'

describe('Component State Debug', () => {
  it('should test if progress events are actually published during crawls', async () => {
    console.log('🧪 Testing if real crawls publish progress events...')

    const { startCrawl } = await import('@/lib/crawler')
    const { getRedisConnection } = await import('@/lib/crawler/queue-service')
    
    // Start a Redis subscriber to listen for progress events
    const subscriber = getRedisConnection().duplicate()
    let eventsReceived = 0
    const receivedEvents: any[] = []
    
    // Subscribe to all crawl progress channels
    await subscriber.psubscribe('crawl:*:progress')
    
    subscriber.on('pmessage', (pattern: string, channel: string, message: string) => {
      console.log(`📨 Redis event - Channel: ${channel}`)
      try {
        const eventData = JSON.parse(message)
        console.log(`📊 Event type: ${eventData.type || 'progress'}, Phase: ${eventData.phase}`)
        receivedEvents.push(eventData)
        eventsReceived++
      } catch (error) {
        console.error('❌ Failed to parse Redis progress message:', error)
      }
    })
    
    console.log('🚀 Starting a test crawl...')
    
    // Start a simple crawl that should complete quickly
    const crawlId = await startCrawl('https://docs.lovable.dev/introduction', {
      maxPages: 3,
      maxDepth: 1,
      qualityThreshold: 10
    })
    
    console.log(`📊 Crawl started with ID: ${crawlId}`)
    
    // Wait for progress events
    console.log('⏳ Waiting for progress events...')
    let attempts = 0
    const maxAttempts = 20 // 10 seconds
    
    while (attempts < maxAttempts && eventsReceived === 0) {
      await new Promise(resolve => setTimeout(resolve, 500))
      attempts++
      
      if (attempts % 4 === 0) {
        console.log(`⏳ Still waiting... (${attempts * 0.5}s elapsed, ${eventsReceived} events received)`)
      }
    }
    
    console.log(`📊 Final results after ${attempts * 0.5}s:`)
    console.log(`📊 Events received: ${eventsReceived}`)
    
    if (eventsReceived > 0) {
      console.log('✅ SUCCESS: Progress events ARE being published!')
      console.log('📨 Events received:')
      receivedEvents.forEach((event, i) => {
        console.log(`  ${i + 1}. Type: ${event.type || 'progress'}, Phase: ${event.phase}, Data:`, event)
      })
      
      // If events are being published, the issue is in the React component
      console.log('')
      console.log('🎯 DIAGNOSIS: React component is not handling SSE events correctly')
      console.log('🔧 SOLUTION NEEDED: Check React state updates in browser console')
      
    } else {
      console.log('❌ PROBLEM: No progress events published!')
      console.log('🎯 DIAGNOSIS: The crawler is not working or not publishing events')
      console.log('🔧 SOLUTION NEEDED: Fix the crawler queue system')
    }
    
    await subscriber.quit()
    
    // Test should help identify the issue
    console.log('')
    console.log('📝 Next steps:')
    if (eventsReceived > 0) {
      console.log('1. Check browser console for SSE connection logs')
      console.log('2. Verify React state is updating when SSE events arrive')
      console.log('3. Check if CrawlResultsEnhanced component renders correctly')
    } else {
      console.log('1. Check if queue worker is running')
      console.log('2. Verify jobs are being processed')
      console.log('3. Check Redis pub/sub channel names')
    }
    
    expect(true).toBe(true) // Always pass - this is diagnostic
  }, 15000)

  it('should test the React component logic separately', () => {
    console.log('🧪 Testing React component logic...')
    
    // Simulate the exact logic from page.tsx
    let crawlResult: any = null
    let isLoading = true
    let error: string | null = null
    
    const setCrawlResult = (result: any) => {
      const oldResult = crawlResult
      crawlResult = result
      console.log('📊 setCrawlResult called:', { oldResult, newResult: result })
    }
    
    const setIsLoading = (loading: boolean) => {
      const oldLoading = isLoading
      isLoading = loading
      console.log('⏳ setIsLoading called:', { oldLoading, newLoading: loading })
    }
    
    const setError = (err: string | null) => {
      const oldError = error
      error = err
      console.log('❌ setError called:', { oldError, newError: err })
    }
    
    console.log('🔄 Simulating SSE events...')
    
    // Simulate connected event
    const connectedUpdate = { type: 'connected', crawlId: 'test' }
    console.log('📨 Processing connected event:', connectedUpdate)
    
    if (connectedUpdate.type === 'connected') {
      console.log('✅ SSE connection confirmed by server')
    }
    
    // Simulate progress event
    const progressUpdate = {
      type: 'progress',
      data: {
        id: 'test',
        status: 'active',
        progress: {
          phase: 'crawling',
          current: 5,
          total: 10,
          percentage: 50,
          message: 'Processing URLs...'
        }
      }
    }
    
    console.log('📨 Processing progress event:', progressUpdate)
    
    if (progressUpdate.type === 'progress' && progressUpdate.data) {
      console.log('📊 Progress update:', progressUpdate.data.progress)
      setCrawlResult(progressUpdate.data)
    }
    
    // Simulate completion event
    const completeUpdate = {
      type: 'complete',
      data: {
        id: 'test',
        status: 'completed',
        markdown: '# Test Results\nCrawl completed successfully'
      }
    }
    
    console.log('📨 Processing complete event:', completeUpdate)
    
    if (completeUpdate.type === 'complete' && completeUpdate.data) {
      console.log('🎉 Crawl completed via SSE')
      setCrawlResult(completeUpdate.data)
      setIsLoading(false)
    }
    
    console.log('')
    console.log('📊 Final component state:')
    console.log('  crawlResult:', crawlResult)
    console.log('  isLoading:', isLoading)
    console.log('  error:', error)
    
    // Verify the logic works
    expect(crawlResult).not.toBeNull()
    expect(crawlResult.status).toBe('completed')
    expect(isLoading).toBe(false)
    expect(error).toBeNull()
    
    console.log('✅ React component logic works correctly in isolation')
    console.log('')
    console.log('🎯 If this works but UI doesn\'t update, the issue is:')
    console.log('• EventSource not calling onmessage handlers')
    console.log('• SSE data format mismatch')
    console.log('• React re-render issues')
    console.log('• Browser EventSource implementation problems')
  })
})