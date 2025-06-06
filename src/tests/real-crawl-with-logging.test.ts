import { describe, it, expect, vi, beforeAll } from 'vitest'
import { ModernCrawler } from '../lib/crawler/modern-crawler'
import { memoryStore } from '../lib/storage/memory-store'
import * as redis from '../lib/redis'

describe('Real Crawl With Detailed Logging', () => {
  beforeAll(() => {
    // Mock Redis
    vi.spyOn(redis, 'isUrlDiscovered').mockResolvedValue(false)
    vi.spyOn(redis, 'addDiscoveredUrl').mockResolvedValue(true)
    vi.spyOn(redis, 'getCachedRobotsTxt').mockResolvedValue(null)
    vi.spyOn(redis, 'cacheRobotsTxt').mockResolvedValue()
  })

  it('should crawl Lovable docs with very low quality threshold', async () => {
    const crawlId = 'real_crawl_debug'
    
    // Initialize crawl
    memoryStore.setCrawl(crawlId, {
      id: crawlId,
      url: 'https://docs.lovable.dev',
      status: 'started',
      progress: {
        currentUrl: 'https://docs.lovable.dev',
        pageCount: 0,
        totalPages: 1,
        status: 'Initializing'
      },
      createdAt: new Date().toISOString()
    })

    const crawler = new ModernCrawler({
      maxPages: 3,
      maxDepth: 1,
      concurrency: 1,
      pageTimeout: 15000,
      qualityThreshold: 0, // Accept ANY content with score > 0
      useSitemap: false,
      respectRobots: false
    })

    // Track all events
    const events: any[] = []
    
    crawler.on('progress', (progress) => {
      events.push({ type: 'progress', ...progress })
    })
    
    crawler.on('completed', (pages) => {
      events.push({ type: 'completed', pageCount: pages.length })
    })
    
    crawler.on('error', (error) => {
      events.push({ type: 'error', message: error.message })
    })

    try {
      await crawler.crawl('https://docs.lovable.dev', crawlId)
      
      const pages = crawler.getPages()
      const result = memoryStore.getCrawl(crawlId)
      const stats = crawler.getStats()
      
      console.log('\n=== Real Crawl Results ===')
      console.log(`Pages crawled: ${pages.length}`)
      console.log(`Status: ${result?.status}`)
      console.log(`Stats:`, stats)
      console.log(`Events recorded: ${events.length}`)
      
      if (pages.length > 0) {
        pages.forEach((page, i) => {
          console.log(`\nPage ${i + 1}:`)
          console.log(`- URL: ${page.url}`)
          console.log(`- Title: ${page.title}`)
          console.log(`- Quality: ${page.qualityScore}`)
          console.log(`- Content length: ${page.content.length}`)
          console.log(`- Content preview: ${page.content.slice(0, 200)}...`)
        })
      } else {
        console.log('\nNo pages crawled!')
        console.log('Last few events:', events.slice(-5))
      }
      
      // Should have at least one page with quality threshold of 0
      expect(pages.length).toBeGreaterThan(0)
      expect(result?.status).toBe('completed')
      
    } catch (error) {
      console.error('\nCrawl error:', error)
      console.log('Events:', events)
      const stats = crawler.getStats()
      console.log('Final stats:', stats)
      throw error
    }
  }, 30000)
})