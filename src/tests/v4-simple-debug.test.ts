import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('V4 Crawler URL Discovery Debug', () => {
  it('should test URL filtering logic directly', async () => {
    const { extractValidLinks, isWithinPathPrefix } = await import('@/lib/serverless/url-utils')
    
    const baseUrl = 'https://lovable.dev/docs'
    const originalJobUrl = 'https://lovable.dev/docs'
    
    // Test isWithinPathPrefix
    console.log('\n🔍 Testing isWithinPathPrefix:')
    const testUrls = [
      'https://lovable.dev/docs/getting-started',
      'https://lovable.dev/docs/api/overview',
      'https://lovable.dev/blog/news',
      'https://external.com/docs',
      'https://lovable.dev/docsomething', // Edge case - starts with "docs" but not under /docs/
    ]
    
    for (const url of testUrls) {
      const isWithin = isWithinPathPrefix(url, originalJobUrl)
      console.log(`  ${url} => ${isWithin ? '✅' : '❌'}`)
    }
    
    // Test extractValidLinks
    console.log('\n🔗 Testing extractValidLinks:')
    const links = [
      'https://lovable.dev/docs/getting-started',
      'https://lovable.dev/docs/api/overview', 
      'https://lovable.dev/blog/news',
      'https://external.com/page',
      '/docs/guides/tutorial',
      '../api/reference',
      'mailto:test@example.com',
      '#section',
      'javascript:void(0)'
    ]
    
    const validLinks = extractValidLinks(links, baseUrl, originalJobUrl)
    
    console.log('Input links:', links.length)
    console.log('Valid links:', validLinks.length)
    console.log('Valid:', validLinks)
    
    // Expectations
    expect(validLinks).toContain('https://lovable.dev/docs/getting-started')
    expect(validLinks).toContain('https://lovable.dev/docs/api/overview')
    expect(validLinks).toContain('https://lovable.dev/docs/guides/tutorial')
    expect(validLinks).not.toContain('https://lovable.dev/blog/news')
  })

  it('should simulate crawler page discovery', async () => {
    const { WebCrawler } = await import('@/lib/serverless/web-crawler')
    const { extractValidLinks } = await import('@/lib/serverless/url-utils')
    
    // Mock a simple HTML page
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `
        <html>
          <head><title>Docs Home</title></head>
          <body>
            <h1>Documentation</h1>
            <a href="/docs/getting-started">Getting Started</a>
            <a href="/docs/api">API Reference</a>
            <a href="/blog">Blog</a>
            <a href="https://github.com/lovable">GitHub</a>
          </body>
        </html>
      `
    })
    
    const crawler = new WebCrawler()
    const baseUrl = 'https://lovable.dev/docs'
    
    console.log('\n🕷️ Crawling:', baseUrl)
    const result = await crawler.crawlPage(baseUrl)
    
    if (result.success) {
      console.log('✅ Crawl successful')
      console.log('Title:', result.title)
      console.log('Links found:', result.links?.length || 0)
      
      if (result.links) {
        const validLinks = extractValidLinks(result.links, baseUrl, baseUrl)
        console.log('\n📊 Link filtering:')
        console.log('  Raw links:', result.links.length)
        console.log('  Valid links:', validLinks.length)
        console.log('  Valid URLs:', validLinks)
        
        expect(validLinks.length).toBeGreaterThan(0)
        expect(validLinks).toContain('https://lovable.dev/docs/getting-started')
        expect(validLinks).toContain('https://lovable.dev/docs/api')
        expect(validLinks).not.toContain('https://lovable.dev/blog')
      }
    } else {
      console.log('❌ Crawl failed:', result.error)
    }
  })
})