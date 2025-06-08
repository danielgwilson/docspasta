import { describe, it, expect } from 'vitest'
import { startCrawl, getCrawl } from '@/lib/crawler'
import { getRedisConnection } from '@/lib/crawler/queue-service'

describe('Tailwind Full Crawl Debug', () => {
  it('should debug why full Tailwind crawl only finds 1 page despite 206 links available', async () => {
    console.log('🔍 DEBUGGING FULL TAILWIND CRAWL PIPELINE')
    console.log('We know link discovery finds 206 links, so why does full crawl only find 1 page?')
    
    // Clear any cached data
    const redis = getRedisConnection()
    await redis.del('sitemap:tailwindcss.com:urls')
    
    // Start a real crawl with enhanced settings for link discovery
    const crawlId = await startCrawl('https://tailwindcss.com/docs', {
      maxPages: 20, // Reasonable limit for testing
      maxDepth: 2,  // Allow link following
      qualityThreshold: 5, // Very low threshold
      respectRobots: true,
    })
    
    expect(crawlId).toBeTruthy()
    console.log(`✅ Crawl started with ID: ${crawlId}`)
    
    // Monitor the crawl in detail
    let attempts = 0
    let lastCrawl = null
    
    while (attempts < 60) { // 60 second timeout - batch processing needs more time
      await new Promise(resolve => setTimeout(resolve, 1000))
      const crawl = await getCrawl(crawlId)
      
      if (crawl && (
        !lastCrawl || 
        crawl.totalDiscovered !== lastCrawl.totalDiscovered ||
        crawl.totalQueued !== lastCrawl.totalQueued ||
        crawl.totalProcessed !== lastCrawl.totalProcessed ||
        crawl.status !== lastCrawl.status
      )) {
        console.log(`\\n📊 Crawl Progress (attempt ${attempts}):`)
        console.log(`   Status: ${crawl.status}`)
        console.log(`   Discovered: ${crawl.totalDiscovered}`)
        console.log(`   Queued: ${crawl.totalQueued}`)
        console.log(`   Processed: ${crawl.totalProcessed}`)
        console.log(`   Results: ${crawl.results?.length || 0}`)
        console.log(`   Failed: ${crawl.totalFailed}`)
        console.log(`   Discovery Complete: ${crawl.discoveryComplete}`)
        
        if (crawl.results && crawl.results.length > 0) {
          console.log(`📄 Latest Results:`)
          crawl.results.slice(-3).forEach((result, index) => {
            const position = crawl.results!.length - 3 + index + 1
            console.log(`   ${position}. ${result.url} (${result.content?.length || 0} chars)`)
          })
        }
        
        lastCrawl = crawl
      }
      
      if (lastCrawl?.status === 'completed' || lastCrawl?.status === 'failed') {
        console.log(`\\n🏁 Crawl finished with status: ${lastCrawl.status}`)
        break
      }
      
      attempts++
    }
    
    // Analyze the results
    if (lastCrawl) {
      console.log(`\\n📋 FINAL ANALYSIS:`)
      console.log(`🔢 Expected: ~206 links discovered through crawling`)
      console.log(`🔢 Actual discovered: ${lastCrawl.totalDiscovered}`)
      console.log(`🔢 Actual queued: ${lastCrawl.totalQueued}`)
      console.log(`🔢 Actual processed: ${lastCrawl.totalProcessed}`)
      console.log(`📄 Actual results: ${lastCrawl.results?.length || 0}`)
      
      // Identify the bottleneck
      if (lastCrawl.totalDiscovered === 1) {
        console.log(`\\n🚨 BOTTLENECK: Initial URL discovery - only found starting URL`)
        console.log(`   This suggests sitemap discovery worked but link discovery during crawl failed`)
      } else if (lastCrawl.totalDiscovered > 1 && lastCrawl.totalQueued < lastCrawl.totalDiscovered) {
        console.log(`\\n🚨 BOTTLENECK: URL filtering during queuing`)
        console.log(`   Discovered ${lastCrawl.totalDiscovered} but only queued ${lastCrawl.totalQueued}`)
      } else if (lastCrawl.totalQueued > lastCrawl.totalProcessed) {
        console.log(`\\n🚨 BOTTLENECK: Job processing`)
        console.log(`   Queued ${lastCrawl.totalQueued} but only processed ${lastCrawl.totalProcessed}`)
      } else if (lastCrawl.totalProcessed > (lastCrawl.results?.length || 0)) {
        console.log(`\\n🚨 BOTTLENECK: Result storage`)
        console.log(`   Processed ${lastCrawl.totalProcessed} but only stored ${lastCrawl.results?.length || 0}`)
      }
      
      // The crawl should discover many more pages
      expect(lastCrawl.totalDiscovered).toBeGreaterThan(1)
    } else {
      console.log(`❌ Crawl timed out or failed to start`)
      expect(false).toBe(true)
    }
  }, 90000) // 90 second timeout for batch processing
})