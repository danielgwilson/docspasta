import { describe, it, expect } from 'vitest'
import { startCrawl, getCrawl } from '@/lib/crawler'

describe('Crawl Completion Debug', () => {
  it('should debug why lovable.dev stops at 6 pages despite finding 49 URLs', async () => {
    console.log('🔍 Testing Lovable.dev Full Crawl Process')
    
    // Start crawl with correct configuration
    const crawlId = await startCrawl('https://docs.lovable.dev/introduction', {
      maxPages: 50, // Allow all 49 discovered URLs
      maxDepth: 1,  // Sitemap only (no link discovery needed)
      qualityThreshold: 10, // Very low threshold to avoid filtering
      respectRobots: true,
      useSitemap: true,
    })
    
    expect(crawlId).toBeTruthy()
    console.log(`✅ Crawl started with ID: ${crawlId}`)
    
    // Monitor crawl progress in detail
    let attempts = 0
    let lastCrawl = null
    
    while (attempts < 30) { // 30 second timeout
      await new Promise(resolve => setTimeout(resolve, 1000))
      const crawl = await getCrawl(crawlId)
      
      if (crawl && (
        !lastCrawl || 
        crawl.totalDiscovered !== lastCrawl.totalDiscovered ||
        crawl.totalQueued !== lastCrawl.totalQueued ||
        crawl.totalProcessed !== lastCrawl.totalProcessed ||
        crawl.status !== lastCrawl.status
      )) {
        console.log(`📊 Progress Update:`)
        console.log(`   Status: ${crawl.status}`)
        console.log(`   Discovered: ${crawl.totalDiscovered}`)
        console.log(`   Queued: ${crawl.totalQueued}`) 
        console.log(`   Processed: ${crawl.totalProcessed}`)
        console.log(`   Results: ${crawl.results?.length || 0}`)
        console.log(`   Failed: ${crawl.totalFailed}`)
        console.log(`   Discovery Complete: ${crawl.discoveryComplete}`)
        
        if (crawl.results && crawl.results.length > 0) {
          console.log(`📄 Latest Results:`)
          const recentResults = crawl.results.slice(-3)
          recentResults.forEach((result, index) => {
            console.log(`   ${crawl.results!.length - recentResults.length + index + 1}. ${result.url} (${result.content?.length || 0} chars)`)
          })
        }
        
        lastCrawl = crawl
      }
      
      if (lastCrawl?.status === 'completed' || lastCrawl?.status === 'failed') {
        console.log(`🏁 Crawl finished with status: ${lastCrawl.status}`)
        break
      }
      
      attempts++
    }
    
    // Final analysis
    if (lastCrawl) {
      console.log(`\n📋 FINAL ANALYSIS:`)
      console.log(`🔢 Total URLs discovered: ${lastCrawl.totalDiscovered}`)
      console.log(`📦 Total URLs queued: ${lastCrawl.totalQueued}`)
      console.log(`✅ Total URLs processed: ${lastCrawl.totalProcessed}`)
      console.log(`📄 Total results stored: ${lastCrawl.results?.length || 0}`)
      console.log(`❌ Total failed: ${lastCrawl.totalFailed}`)
      console.log(`📊 Final status: ${lastCrawl.status}`)
      
      // Identify the bottleneck
      if (lastCrawl.totalDiscovered > lastCrawl.totalQueued) {
        console.log(`🚨 ISSUE: URLs filtered during queuing! ${lastCrawl.totalDiscovered - lastCrawl.totalQueued} URLs lost`)
      }
      
      if (lastCrawl.totalQueued > lastCrawl.totalProcessed) {
        console.log(`🚨 ISSUE: Jobs not completing! ${lastCrawl.totalQueued - lastCrawl.totalProcessed} jobs pending`)
      }
      
      if (lastCrawl.totalProcessed > (lastCrawl.results?.length || 0)) {
        console.log(`🚨 ISSUE: Results not being stored! ${lastCrawl.totalProcessed - (lastCrawl.results?.length || 0)} processed but not saved`)
      }
      
      // Expect substantial results for lovable.dev
      expect(lastCrawl.totalDiscovered).toBeGreaterThanOrEqual(40)
      expect(lastCrawl.results?.length).toBeGreaterThan(6)
    } else {
      console.log(`❌ Crawl timed out or failed to start`)
      expect(false).toBe(true)
    }
  }, 45000)

  it('should debug tailwind.css with link discovery enabled', async () => {
    console.log('🔍 Testing Tailwind CSS with Link Discovery')
    
    // Start crawl with link discovery since no sitemap exists
    const crawlId = await startCrawl('https://tailwindcss.com/docs', {
      maxPages: 20, // Reasonable limit
      maxDepth: 2,  // Enable link following
      qualityThreshold: 10, // Low threshold
      respectRobots: true,
      useSitemap: false, // Force link discovery
    })
    
    expect(crawlId).toBeTruthy()
    console.log(`✅ Crawl started with ID: ${crawlId}`)
    
    // Monitor for 20 seconds to see if link discovery works
    let attempts = 0
    let lastCrawl = null
    
    while (attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      const crawl = await getCrawl(crawlId)
      
      if (crawl && (
        !lastCrawl ||
        crawl.totalProcessed !== lastCrawl.totalProcessed ||
        crawl.status !== lastCrawl.status
      )) {
        console.log(`📊 Tailwind Progress: ${crawl.totalProcessed} processed, ${crawl.results?.length || 0} results, status: ${crawl.status}`)
        lastCrawl = crawl
      }
      
      if (lastCrawl?.status === 'completed' || lastCrawl?.status === 'failed') {
        break
      }
      
      attempts++
    }
    
    if (lastCrawl) {
      console.log(`📋 Tailwind Final: ${lastCrawl.results?.length || 0} pages crawled`)
      // Should find more than 1 page with link discovery
      expect(lastCrawl.results?.length).toBeGreaterThan(1)
    }
  }, 30000)
})