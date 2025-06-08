import { describe, it, expect } from 'vitest'
import { startCrawl, getCrawl } from '@/lib/crawler'

describe('EXACT API Replication Test', () => {
  it('should replicate exact API call using queue-based system', async () => {
    console.log('🔍 Replicating EXACT API call with queue-based system')
    
    const testUrl = 'https://httpbin.org/html'
    
    // Replicate EXACT API call with queue-based system
    console.log(`🚀 Starting crawl with EXACT API options for: ${testUrl}`)
    
    try {
      const crawlId = await startCrawl(testUrl, {
        maxPages: 10, // Reduced for testing
        maxDepth: 2,   
        followExternalLinks: false,
        respectRobots: true,
        delayMs: 300,
        qualityThreshold: 20
      })
      
      console.log(`✅ Crawl started with ID: ${crawlId}`)
      
      // Wait for completion (like the API status endpoint would)
      let attempts = 0
      let crawlResult
      
      while (attempts < 30) { // 30 seconds max
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        crawlResult = await getCrawl(crawlId)
        console.log(`📊 Attempt ${attempts + 1}: Status = ${crawlResult?.status}, Processed = ${crawlResult?.totalProcessed}/${crawlResult?.totalQueued}`)
        
        if (crawlResult?.status === 'completed') {
          console.log(`🎉 Crawl completed! Processed ${crawlResult.totalProcessed} pages`)
          break
        } else if (crawlResult?.status === 'failed') {
          console.error(`❌ Crawl failed: ${crawlResult.errorMessage}`)
          break
        }
        
        attempts++
      }
      
      // CRITICAL ASSERTIONS
      expect(crawlResult?.status).toBe('completed')
      expect(crawlResult?.totalProcessed).toBeGreaterThan(0)
      expect(crawlResult?.results).toBeTruthy()
      expect(crawlResult?.results.length).toBeGreaterThan(0)
      
    } catch (error) {
      console.error('Test failed:', error)
      throw error
    }
  }, 35000) // 35 second timeout
})

console.log('📋 EXACT API REPLICATION TEST')
console.log('✅ Tests the real crawl API flow with queue-based system')
console.log('🔄 Uses Redis-based status tracking')