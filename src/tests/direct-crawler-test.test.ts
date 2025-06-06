import { describe, it, expect, vi, beforeAll } from 'vitest'
import { ModernCrawler } from '../lib/crawler/modern-crawler'
import { memoryStore } from '../lib/storage/memory-store'
import * as redis from '../lib/redis'

describe('Direct Crawler Test', () => {
  beforeAll(() => {
    // Mock Redis
    vi.spyOn(redis, 'isUrlDiscovered').mockResolvedValue(false)
    vi.spyOn(redis, 'addDiscoveredUrl').mockResolvedValue(true)
    vi.spyOn(redis, 'getCachedRobotsTxt').mockResolvedValue(null)
    vi.spyOn(redis, 'cacheRobotsTxt').mockResolvedValue()
  })

  it('should crawl with quality threshold directly', async () => {
    const crawlId = 'direct_test'
    
    // Initialize crawl
    memoryStore.setCrawl(crawlId, {
      id: crawlId,
      url: 'https://example.com',
      status: 'started',
      progress: {
        currentUrl: 'https://example.com',
        pageCount: 0,
        totalPages: 1,
        status: 'Initializing'
      },
      createdAt: new Date().toISOString()
    })

    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Test Doc</title>
          </head>
          <body>
            <main>
              <h1>Documentation</h1>
              <p>This is documentation content.</p>
              <h2>API Reference</h2>
              <p>Here is the API documentation with some content to ensure quality score.</p>
              <pre><code>const api = require('api');</code></pre>
            </main>
          </body>
        </html>
      `)
    })

    const crawler = new ModernCrawler({
      maxPages: 1,
      maxDepth: 0,
      concurrency: 1,
      pageTimeout: 5000,
      qualityThreshold: 20,
      useSitemap: false,
      respectRobots: false
    })

    // Track events
    let progressCount = 0
    crawler.on('progress', () => progressCount++)

    try {
      // Await the crawl directly
      await crawler.crawl('https://example.com', crawlId)
      
      const pages = crawler.getPages()
      const result = memoryStore.getCrawl(crawlId)
      
      console.log('Direct crawl results:')
      console.log(`- Pages: ${pages.length}`)
      console.log(`- Status: ${result?.status}`)
      console.log(`- Progress events: ${progressCount}`)
      
      expect(pages.length).toBe(1)
      expect(result?.status).toBe('completed')
      expect(result?.markdown).toContain('Documentation')
      
    } catch (error) {
      console.error('Direct crawl error:', error)
      throw error
    }
  })
})