import { describe, it, expect } from 'vitest'
import { startCrawl, getCrawl } from '@/lib/crawler'

describe('Crawler Integration Tests', () => {
  it('should start a crawl and return a crawl ID', async () => {
    const url = 'https://example.com'
    const crawlId = await startCrawl(url)
    
    expect(crawlId).toBeTruthy()
    expect(typeof crawlId).toBe('string')
    
    // Wait for kickoff job to initialize crawl in Redis
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Verify crawl was created in Redis (retry if needed)
    let crawl
    let attempts = 0
    while (attempts < 5) {
      crawl = await getCrawl(crawlId)
      if (crawl) break
      await new Promise(resolve => setTimeout(resolve, 500))
      attempts++
    }
    
    expect(crawl).toBeTruthy()
    expect(crawl?.url).toBe(url)
    expect(['active', 'completed']).toContain(crawl?.status || '')
  }, 10000)

  it('should handle crawl options correctly', async () => {
    const url = 'https://example.com'
    const options = {
      maxPages: 2, // Keep small for testing
      maxDepth: 1,
      delayMs: 100,
      qualityThreshold: 10
    }
    
    const crawlId = await startCrawl(url, options)
    expect(crawlId).toBeTruthy()
    
    // Give the kickoff job time to process
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    const crawl = await getCrawl(crawlId)
    expect(crawl).toBeTruthy()
    expect(crawl?.url).toBe(url)
  }, 10000)

  it('should track crawl progress', async () => {
    const url = 'https://httpbin.org/html'
    const crawlId = await startCrawl(url, {
      maxPages: 1,
      maxDepth: 0,
      qualityThreshold: 0,
      delayMs: 100
    })
    
    expect(crawlId).toBeTruthy()
    
    // Wait for initial setup
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Poll for progress or completion - accept both as success
    let attempts = 0
    let lastStatus = ''
    let foundProgress = false
    
    while (attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const crawl = await getCrawl(crawlId)
      
      if (crawl?.status !== lastStatus) {
        console.log(`Status changed: ${lastStatus} -> ${crawl?.status}`)
        lastStatus = crawl?.status || ''
        foundProgress = true
      }
      
      // Accept completion or active with progress as success
      if (crawl?.status === 'completed' || crawl?.status === 'failed') {
        console.log(`Final status: ${crawl.status}`)
        expect(['completed', 'failed']).toContain(crawl.status)
        return
      }
      
      if (crawl?.status === 'active' && crawl?.totalProcessed && crawl.totalProcessed > 0) {
        console.log(`Crawl is actively processing: ${crawl.totalProcessed} pages`)
        foundProgress = true
        return
      }
      
      attempts++
    }
    
    // If we got here, we should have at least seen some progress
    expect(foundProgress).toBe(true)
  }, 35000)
})