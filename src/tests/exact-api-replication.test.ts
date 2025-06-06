import { describe, it, expect } from 'vitest'
import { startCrawl } from '@/lib/crawler'
import { memoryStore } from '@/lib/storage/memory-store'

describe('EXACT API Replication Test', () => {
  it('should replicate exact API call and find the real issue', async () => {
    console.log('🔍 Replicating EXACT API call to find the real issue')
    
    const testUrl = 'https://httpbin.org/html'
    
    // Replicate EXACT API call from route.ts line 60-67
    console.log(`🚀 Starting crawl with EXACT API options for: ${testUrl}`)
    
    try {
      const crawlId = await startCrawl(testUrl, {
        maxPages: 200, // COMPREHENSIVE coverage - get ALL the docs for LLM context
        maxDepth: 4,   // Deep crawling for complete documentation trees
        followExternalLinks: false,
        respectRobots: true,
        delayMs: 300, // Fast but respectful
        qualityThreshold: 20 // Lower threshold to capture more content
      })
      
      console.log(`✅ Crawl started with ID: ${crawlId}`)
      
      // Wait for completion (like the API status endpoint would)
      let attempts = 0
      let crawlResult
      
      while (attempts < 30) { // 30 seconds max
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        crawlResult = memoryStore.getCrawl(crawlId)
        console.log(`📊 Attempt ${attempts + 1}: Status = ${crawlResult?.status}, Pages = ${(crawlResult as any)?.crawledPages?.length || 0}`)
        
        if (crawlResult?.status === 'completed') {
          console.log(`🎉 Crawl completed! Markdown length: ${crawlResult.markdown?.length}`)
          break
        } else if (crawlResult?.status === 'error') {
          console.error(`❌ Crawl failed: ${crawlResult.error}`)
          break
        }
        
        attempts++
      }
      
      // CRITICAL ASSERTIONS
      expect(crawlResult?.status).toBe('completed')
      expect(crawlResult?.markdown).toBeTruthy()
      expect(crawlResult?.markdown?.length).toBeGreaterThan(100)
      
      console.log(`✅ SUCCESS: ${crawlResult?.markdown?.length} characters extracted`)
      
    } catch (error) {
      console.error(`💥 EXACT API replication failed:`, error)
      throw error
    }
  }, 45000) // 45 second timeout

  it('should debug ModernCrawler options directly', async () => {
    console.log('🔧 Testing ModernCrawler with API options directly')
    
    const { ModernCrawler } = await import('@/lib/crawler/modern-crawler')
    
    // Same options as API
    const crawler = new ModernCrawler({
      maxPages: 200,
      maxDepth: 4,
      concurrency: 3,
      pageTimeout: 5000,
      delayMs: 300,
      followExternalLinks: false,
      respectRobots: true,
      useSitemap: true,
      qualityThreshold: 20, // This should allow score of 30
      includePaths: undefined,
      excludePaths: undefined,
    })
    
    const testUrl = 'https://httpbin.org/html'
    const crawlId = `test_${Date.now()}`
    
    console.log(`🚀 Direct ModernCrawler test with threshold 20`)
    
    try {
      await crawler.crawl(testUrl, crawlId)
      
      // Check results
      const results = (crawler as any).getCrawledPages()
      console.log(`📊 Direct crawler results: ${results.length} pages`)
      
      if (results.length === 0) {
        console.error(`❌ FOUND THE ISSUE: Direct ModernCrawler also produces 0 pages`)
        
        // Debug the quality assessment
        const response = await fetch(testUrl)
        const html = await response.text()
        
        const { JSDOM } = await import('jsdom')
        const dom = new JSDOM(html, { url: testUrl })
        const document = dom.window.document
        
        const { extractContent } = await import('@/lib/crawler/content-extractor')
        const content = extractContent(document)
        
        const qualityScore = (crawler as any).assessContentQuality(content)
        console.log(`🔍 Debug: Content length = ${content.length}, Quality score = ${qualityScore}, Threshold = 20`)
        
        if (qualityScore < 20) {
          console.error(`❌ Quality score ${qualityScore} < threshold 20 - THIS IS THE ISSUE`)
        }
      } else {
        console.log(`✅ Direct crawler worked: ${results.length} pages extracted`)
      }
      
      expect(results.length).toBeGreaterThan(0)
      
    } catch (error) {
      console.error(`💥 Direct ModernCrawler failed:`, error)
      throw error
    }
  }, 30000)
})

console.log('🎯 EXACT API Replication - Finding the real issue')
console.log('🔍 This test exactly replicates what the /api/crawl endpoint does')
console.log('📊 Will show if issue is in startCrawl, ModernCrawler, or quality threshold')