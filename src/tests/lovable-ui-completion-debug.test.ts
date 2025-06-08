import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Lovable UI Completion Debug', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should debug why UI shows nothing on completion', async () => {
    console.log('🔍 Starting lovable.dev UI completion debug...')
    
    // Import the required modules
    const { startCrawl } = await import('@/lib/crawler')
    
    // Start a real crawl
    const crawlId = await startCrawl({
      url: 'https://lovable.dev',
      maxPages: 5,
      maxDepth: 1,
      qualityThreshold: 20
    })
    
    console.log(`🚀 Started crawl: ${crawlId}`)
    
    // Monitor the crawl progress
    const startTime = Date.now()
    const timeout = 30000 // 30 seconds
    
    // Import Redis functions to monitor progress
    const { getCrawl } = await import('@/lib/crawler/crawl-redis')
    const { getLatestProgressSnapshot } = await import('@/lib/crawler/streaming-progress')
    
    let lastStatus = ''
    let finalCrawl: any = null
    
    while (Date.now() - startTime < timeout) {
      const crawl = await getCrawl(crawlId)
      const snapshot = await getLatestProgressSnapshot(crawlId)
      
      if (crawl?.status !== lastStatus) {
        console.log(`📊 Status change: ${lastStatus} → ${crawl?.status}`)
        lastStatus = crawl?.status || ''
      }
      
      if (crawl?.status === 'completed' || crawl?.status === 'failed') {
        finalCrawl = crawl
        console.log('🏁 Crawl finished!')
        console.log(`📈 Final stats:`)
        console.log(`  - Status: ${crawl.status}`)
        console.log(`  - Total processed: ${crawl.totalProcessed}`)
        console.log(`  - Total failed: ${crawl.totalFailed}`)
        console.log(`  - Results count: ${crawl.results?.length || 0}`)
        console.log(`  - Progress phase: ${snapshot.phase}`)
        
        // Check what's in the results
        if (crawl.results && crawl.results.length > 0) {
          console.log('✅ Results found:')
          crawl.results.forEach((result: any, index: number) => {
            console.log(`  ${index + 1}. ${result.url}`)
            console.log(`     - Content length: ${result.content?.length || 0} chars`)
            console.log(`     - Content preview: ${result.content?.substring(0, 100)}...`)
          })
        } else {
          console.log('❌ No results found in crawl.results!')
        }
        
        // Check if there's combined content
        const combinedContent = crawl.results?.map((r: any) => r.content).join('\n\n---\n\n')
        console.log(`📄 Combined content length: ${combinedContent?.length || 0} chars`)
        
        break
      }
      
      // Log progress every 2 seconds
      if ((Date.now() - startTime) % 2000 < 100) {
        console.log(`⏳ Progress: ${snapshot.processed}/${snapshot.total} (${snapshot.phase})`)
      }
      
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    if (!finalCrawl) {
      throw new Error('Crawl did not complete within timeout')
    }
    
    // Now let's check what the UI would receive
    console.log('\n🖥️  Simulating UI completion event...')
    
    // Check if the completion event has the right data
    expect(finalCrawl.status).toBe('completed')
    expect(finalCrawl.results).toBeDefined()
    expect(finalCrawl.results.length).toBeGreaterThan(0)
    
    // Check what the SSE completion event would look like
    const completionEvent = {
      type: 'completion',
      crawlId: finalCrawl.id,
      status: 'completed',
      totalProcessed: finalCrawl.totalProcessed,
      totalFailed: finalCrawl.totalFailed,
      duration: Date.now() - finalCrawl.createdAt,
      finalResults: {
        urls: finalCrawl.results.map((r: any) => r.url),
        content: finalCrawl.results.map((r: any) => r.content).join('\n\n---\n\n'),
      }
    }
    
    console.log('📨 Completion event structure:')
    console.log(`  - Type: ${completionEvent.type}`)
    console.log(`  - Status: ${completionEvent.status}`)
    console.log(`  - URLs count: ${completionEvent.finalResults.urls.length}`)
    console.log(`  - Content length: ${completionEvent.finalResults.content.length}`)
    
    // Verify the content is not empty
    expect(completionEvent.finalResults.content.length).toBeGreaterThan(0)
    expect(completionEvent.finalResults.urls.length).toBeGreaterThan(0)
    
    console.log('✅ Completion event has valid data!')
    
    // Now let's check what the UI component expects
    console.log('\n🔍 Checking UI component expectations...')
    
    // The UI expects the completion event to have:
    // 1. event.data.type === 'complete'
    // 2. event.data.results (array of results)
    // 3. event.data.content (combined content)
    
    // But our completion event has:
    // 1. type: 'completion' (not 'complete')
    // 2. finalResults.urls and finalResults.content (not results/content)
    
    console.log('❌ FOUND THE ISSUE!')
    console.log('The SSE completion event structure doesn\'t match what the UI expects:')
    console.log('  - Event type: "completion" vs expected "complete"')
    console.log('  - Data structure: finalResults.{urls,content} vs expected results/content')
    
    return {
      issue: 'Mismatch between SSE completion event structure and UI expectations',
      sent: {
        type: 'completion',
        structure: 'finalResults.{urls,content}'
      },
      expected: {
        type: 'complete',
        structure: 'results/content'
      }
    }
  }, 60000) // 60 second timeout for the test
})