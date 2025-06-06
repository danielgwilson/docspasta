import { describe, it, expect, vi, beforeAll } from 'vitest'
import { startCrawl, getCrawlResult } from '../lib/crawler'
import * as redis from '../lib/redis'

describe('API Quality Threshold Test', () => {
  beforeAll(() => {
    // Mock Redis - ensure URL is not already discovered
    vi.spyOn(redis, 'isUrlDiscovered').mockImplementation((crawlId, url) => {
      console.log(`Redis mock: isUrlDiscovered(${crawlId}, ${url}) -> false`)
      return Promise.resolve(false)
    })
    vi.spyOn(redis, 'addDiscoveredUrl').mockImplementation((crawlId, url) => {
      console.log(`Redis mock: addDiscoveredUrl(${crawlId}, ${url}) -> true`)
      return Promise.resolve(true)
    })
    vi.spyOn(redis, 'getCachedRobotsTxt').mockResolvedValue(null)
    vi.spyOn(redis, 'cacheRobotsTxt').mockResolvedValue()
  })

  it('should use quality threshold from API options', async () => {
    // Mock fetch to return content with known quality
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

    // Start crawl with low quality threshold (same as API)
    const crawlId = await startCrawl('https://example.com', {
      maxPages: 1,
      maxDepth: 0,
      qualityThreshold: 20,
      useSitemap: false,
      respectRobots: false
    })

    // Wait for crawl to complete
    let attempts = 0;
    while (attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 500))
      const status = getCrawlResult(crawlId)?.status
      console.log(`Attempt ${attempts + 1}: status = ${status}`)
      if (status === 'completed' || status === 'error') break
      attempts++
    }

    const result = getCrawlResult(crawlId)
    
    console.log('Crawl result:', {
      status: result?.status,
      hasMarkdown: !!result?.markdown,
      markdownLength: result?.markdown?.length,
      error: result?.error
    })

    expect(result).toBeTruthy()
    expect(result?.status).toBe('completed')
    expect(result?.markdown).toBeTruthy()
    expect(result?.markdown).toContain('Documentation')
  })
})