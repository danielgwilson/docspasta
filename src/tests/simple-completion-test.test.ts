import { describe, it, expect } from 'vitest'
import { startCrawl } from '@/lib/crawler'
import { getCrawl } from '@/lib/crawler/crawl-redis'

describe('Simple Completion Test', () => {
  it('should mark crawl as completed', async () => {
    // Start a simple crawl  
    const crawlId = await startCrawl('https://httpbin.org/html', {
      maxPages: 1,
      maxDepth: 0,
      delayMs: 100,
      qualityThreshold: 0,
      useSitemap: false,
    })
    
    console.log(`Started crawl: ${crawlId}`)
    
    // Wait and check status every second
    for (let i = 0; i < 20; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const crawl = await getCrawl(crawlId)
      console.log(`Check ${i + 1}: status=${crawl?.status}, phase=${crawl?.progress?.phase}, processed=${crawl?.totalProcessed}`)
      
      if (crawl?.status === 'completed') {
        console.log('✅ Crawl completed!')
        expect(crawl.status).toBe('completed')
        expect(crawl.completedAt).toBeTruthy()
        return
      }
      
      if (crawl?.status === 'failed') {
        throw new Error(`Crawl failed: ${crawl.errorMessage}`)
      }
    }
    
    throw new Error('Crawl did not complete within 20 seconds')
  }, 25000)
})