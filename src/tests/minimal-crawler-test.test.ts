import { describe, it, expect, vi, beforeAll } from 'vitest'
import { ModernCrawler } from '../lib/crawler/modern-crawler'
import { memoryStore } from '../lib/storage/memory-store'
import * as redis from '../lib/redis'

describe('Minimal Crawler Test', () => {
  beforeAll(() => {
    // Mock Redis
    vi.spyOn(redis, 'isUrlDiscovered').mockResolvedValue(false)
    vi.spyOn(redis, 'addDiscoveredUrl').mockResolvedValue(true)
    vi.spyOn(redis, 'getCachedRobotsTxt').mockResolvedValue(null)
    vi.spyOn(redis, 'cacheRobotsTxt').mockResolvedValue()
  })

  it('should crawl a simple HTML page', async () => {
    const crawlId = 'minimal_test'
    
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

    // Mock fetch to return simple HTML
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Test Page</title>
          </head>
          <body>
            <main>
              <h1>Welcome to Test</h1>
              <p>This is a test page with some content.</p>
              <h2>Features</h2>
              <p>Here are some features:</p>
              <ul>
                <li>Feature 1</li>
                <li>Feature 2</li>
              </ul>
              <pre><code>const test = "code";</code></pre>
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
      qualityThreshold: 0, // Accept ANY content
      useSitemap: false,
      respectRobots: false
    })

    try {
      await crawler.crawl('https://example.com', crawlId)
      
      const pages = crawler.getPages()
      const result = memoryStore.getCrawl(crawlId)
      
      console.log('\n=== Minimal Test Results ===')
      console.log(`Pages crawled: ${pages.length}`)
      console.log(`Status: ${result?.status}`)
      
      if (pages.length > 0) {
        console.log('\nFirst page details:')
        console.log(`- URL: ${pages[0].url}`)
        console.log(`- Title: ${pages[0].title}`)
        console.log(`- Quality: ${pages[0].qualityScore}`)
        console.log(`- Content preview:`)
        console.log(pages[0].content.slice(0, 300))
      }
      
      expect(pages.length).toBe(1)
      expect(pages[0].title).toBe('Test Page')
      expect(pages[0].content).toContain('Welcome to Test')
      expect(pages[0].content).toContain('Features')
      
    } catch (error) {
      console.error('Minimal test failed:', error)
      throw error
    }
  })
})