import { describe, it, expect } from 'vitest'
import { startCrawl, getCrawl } from '@/lib/crawler'

/**
 * FULL CRAWL INVESTIGATION
 * 
 * This test runs a full crawl of docs.lovable.dev with realistic settings
 * to understand exactly why only 6 pages are being returned instead of 48.
 */

describe('Full Crawl Investigation', () => {
  it('should crawl lovable.dev with maximum settings to see what happens', async () => {
    console.log('🔍 Starting full investigation crawl of docs.lovable.dev...')
    
    const crawlId = await startCrawl('https://docs.lovable.dev', {
      maxPages: 48, // Allow all 48 URLs we know exist
      maxDepth: 1,  // Start with depth 1 to see sitemap only
      delayMs: 1000, // Moderate delay
      qualityThreshold: 0, // NO quality filtering - accept everything
      useSitemap: true, // Use sitemap discovery
      maxLinksPerPage: 0, // No link discovery - sitemap only
      includePatterns: [],
      excludePatterns: [],
    })
    
    expect(crawlId).toBeTruthy()
    console.log(`✅ Crawl started with ID: ${crawlId}`)
    console.log(`📊 Settings: maxPages=48, maxDepth=1, qualityThreshold=0`)
    
    // Wait for crawl to complete or make substantial progress
    console.log('⏳ Waiting for crawl to process all sitemap URLs...')
    let attempts = 0
    let crawl
    let lastProcessed = 0
    
    // Poll for up to 90 seconds (48 URLs might take a while)
    while (attempts < 90) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      crawl = await getCrawl(crawlId)
      
      if (crawl?.totalProcessed && crawl.totalProcessed > lastProcessed) {
        console.log(`📊 Progress: ${crawl.totalProcessed}/${crawl.totalQueued} processed, discovered: ${crawl.totalDiscovered}, status: ${crawl.status}`)
        lastProcessed = crawl.totalProcessed
      }
      
      // Stop if completed or if we have substantial results
      if (crawl?.status === 'completed' || 
          (crawl?.totalProcessed && crawl.totalProcessed >= 40)) {
        console.log(`🎯 Stopping polling - Status: ${crawl?.status}, Processed: ${crawl?.totalProcessed}`)
        break
      }
      
      attempts++
    }
    
    // Analyze the results
    expect(crawl).toBeTruthy()
    console.log(`\n📋 FINAL CRAWL ANALYSIS:`)
    console.log(`  Status: ${crawl?.status}`)
    console.log(`  Total Discovered: ${crawl?.totalDiscovered}`)
    console.log(`  Total Queued: ${crawl?.totalQueued}`)
    console.log(`  Total Processed: ${crawl?.totalProcessed}`)
    console.log(`  Total Filtered: ${crawl?.totalFiltered}`)
    console.log(`  Total Skipped: ${crawl?.totalSkipped}`)
    console.log(`  Total Failed: ${crawl?.totalFailed}`)
    console.log(`  Results Count: ${crawl?.results?.length || 0}`)
    
    // Analyze individual results
    if (crawl?.results && crawl.results.length > 0) {
      console.log(`\n📄 INDIVIDUAL RESULTS ANALYSIS:`)
      crawl.results.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.url}`)
        console.log(`     Title: ${result.title}`)
        console.log(`     Content Length: ${result.content?.length || 0} chars`)
        console.log(`     Status Code: ${result.statusCode}`)
        if (result.error) {
          console.log(`     Error: ${result.error}`)
        }
      })
      
      // Check content quality distribution
      const contentLengths = crawl.results.map(r => r.content?.length || 0)
      const avgLength = contentLengths.reduce((a, b) => a + b, 0) / contentLengths.length
      const minLength = Math.min(...contentLengths)
      const maxLength = Math.max(...contentLengths)
      
      console.log(`\n📊 CONTENT QUALITY ANALYSIS:`)
      console.log(`  Average content length: ${Math.round(avgLength)} chars`)
      console.log(`  Min content length: ${minLength} chars`)
      console.log(`  Max content length: ${maxLength} chars`)
      console.log(`  Results with substantial content (>500 chars): ${contentLengths.filter(l => l > 500).length}`)
      console.log(`  Results with minimal content (<100 chars): ${contentLengths.filter(l => l < 100).length}`)
    }
    
    // Key assertions to understand the issue
    expect(crawl?.totalDiscovered).toBeGreaterThan(0)
    
    // If we discovered 48 URLs but only processed fewer, there's a processing issue
    if (crawl?.totalDiscovered === 48 && (crawl?.totalProcessed || 0) < 48) {
      console.log(`\n🚨 ISSUE IDENTIFIED: Discovered ${crawl.totalDiscovered} URLs but only processed ${crawl.totalProcessed}`)
      console.log(`   This suggests a queue processing or completion detection problem.`)
    }
    
    // If we processed many but only have few results, there's a storage issue
    if ((crawl?.totalProcessed || 0) > (crawl?.results?.length || 0)) {
      console.log(`\n🚨 ISSUE IDENTIFIED: Processed ${crawl.totalProcessed} URLs but only stored ${crawl.results?.length} results`)
      console.log(`   This suggests a result storage or quality filtering problem.`)
    }
    
    console.log(`\n🎯 Investigation complete. Check the logs above for the root cause.`)
    
  }, 120000) // 2 minute timeout for thorough testing

  it('should test direct API configuration vs. test configuration', async () => {
    console.log('\n🧪 Comparing API defaults vs test settings...')
    
    // Test with API-like defaults (no overrides)
    const crawlId = await startCrawl('https://docs.lovable.dev', {
      // API defaults: maxPages=50, qualityThreshold=20, maxDepth=2
    })
    
    expect(crawlId).toBeTruthy()
    console.log(`✅ Crawl started with API defaults: ${crawlId}`)
    
    // Wait for initial discovery
    let attempts = 0
    let crawl
    
    while (attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      crawl = await getCrawl(crawlId)
      
      if (crawl?.totalDiscovered > 0) {
        console.log(`📊 Discovery complete: ${crawl.totalDiscovered} URLs discovered`)
        break
      }
      
      attempts++
    }
    
    // Wait a bit more for processing
    await new Promise(resolve => setTimeout(resolve, 10000))
    crawl = await getCrawl(crawlId)
    
    console.log(`\n📋 API DEFAULTS RESULTS:`)
    console.log(`  Discovered: ${crawl?.totalDiscovered}`)
    console.log(`  Processed: ${crawl?.totalProcessed}`)
    console.log(`  Results: ${crawl?.results?.length || 0}`)
    console.log(`  Quality Threshold: 20 (API default)`)
    
    expect(crawl?.totalDiscovered).toBeGreaterThan(0)
    
  }, 60000)
})