import { describe, it, expect } from 'vitest'

describe('Debug SSE Events', () => {
  it('should monitor real SSE events from lovable.dev crawl', async () => {
    console.log('🔍 Starting SSE event debugging...')
    
    // Start a real crawl
    const { startCrawl } = await import('@/lib/crawler')
    const crawlId = await startCrawl({
      url: 'https://lovable.dev',
      maxPages: 5,
      maxDepth: 1,
      qualityThreshold: 20
    })
    
    console.log(`🚀 Started crawl: ${crawlId}`)
    
    // Monitor Redis events directly
    const { getRedisConnection } = await import('@/lib/crawler/queue-service')
    const redis = getRedisConnection()
    const subscriber = redis.duplicate()
    
    await subscriber.subscribe(`crawl:${crawlId}:progress`)
    
    const events: any[] = []
    let completionReceived = false;
    
    subscriber.on('message', (channel: string, message: string) => {
      try {
        const event = JSON.parse(message)
        events.push(event)
        
        console.log(`\n📨 Event #${events.length}:`)
        console.log(`  Type: ${event.type}`)
        console.log(`  Timestamp: ${new Date(event.timestamp).toISOString()}`)
        
        if (event.type === 'completion') {
          completionReceived = true
          console.log('  Status:', event.status)
          console.log('  Total Processed:', event.totalProcessed)
          console.log('  Has finalResults:', !!event.finalResults)
          if (event.finalResults) {
            console.log('  URLs count:', event.finalResults.urls?.length)
            console.log('  Content length:', event.finalResults.content?.length)
          }
        } else if (event.type === 'progress' || !event.type) {
          console.log('  Phase:', event.phase)
          console.log('  Progress:', `${event.processed}/${event.total}`)
          console.log('  Percentage:', event.percentage)
          console.log('  Discovered URLs:', event.discoveredUrls)
          if (event.currentActivity) {
            console.log('  Activity:', event.currentActivity)
          }
        } else if (event.type === 'batch-progress') {
          console.log('  Batch:', `${event.batchNumber}/${event.totalBatches}`)
          console.log('  Overall:', event.overallProgress)
        } else if (event.type === 'url-discovery') {
          console.log('  New URLs:', event.newUrls)
          console.log('  Total Discovered:', event.totalDiscovered)
          console.log('  Source:', event.source)
        }
        
      } catch (e) {
        console.error('Failed to parse event:', e)
      }
    })
    
    // Wait for completion or timeout
    const startTime = Date.now()
    const timeout = 30000
    
    while (!completionReceived && Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    // Cleanup
    await subscriber.unsubscribe()
    await subscriber.quit()
    
    // Analyze the events
    console.log('\n📊 Event Analysis:')
    console.log(`Total events received: ${events.length}`)
    
    // Group by type
    const eventTypes = events.reduce((acc, event) => {
      const type = event.type || 'progress'
      acc[type] = (acc[type] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    console.log('Event types:', eventTypes)
    
    // Look for the 0/1 issue
    const zeroOneEvents = events.filter(e => 
      (e.processed === 0 && e.total === 1) || 
      (e.overallProgress?.processed === 0 && e.overallProgress?.total === 1)
    )
    
    console.log(`\n⚠️  Found ${zeroOneEvents.length} events with 0/1 progress`)
    if (zeroOneEvents.length > 0) {
      console.log('First 0/1 event:', zeroOneEvents[0])
    }
    
    // Check what the SSE endpoint would transform these to
    console.log('\n🔄 SSE Transformation Preview:')
    events.slice(0, 5).forEach((event, i) => {
      console.log(`\nEvent ${i + 1} would become:`)
      if (event.type === 'completion') {
        console.log('  type: "complete"')
        console.log('  data.status:', event.status)
        console.log('  data.markdown: [would be fetched from getCrawl]')
      } else if (event.type === 'batch-progress') {
        console.log('  type: "progress"')
        console.log('  data.progress.current:', event.overallProgress?.processed)
        console.log('  data.progress.total:', event.overallProgress?.total)
      } else {
        console.log('  type: "progress"')
        console.log('  data.progress.current:', event.processed)
        console.log('  data.progress.total:', event.total)
      }
    })
    
    expect(events.length).toBeGreaterThan(0)
    expect(completionReceived).toBe(true)
  }, 60000)
})