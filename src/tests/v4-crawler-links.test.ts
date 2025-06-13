import { describe, it, expect } from 'vitest'
import { WebCrawler } from '@/lib/serverless/web-crawler'

describe('V4 Web Crawler Link Discovery', () => {
  it('should discover links from a real page', async () => {
    const crawler = new WebCrawler()
    
    // Test with a simple HTML page
    const testHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>Test Page</title></head>
      <body>
        <a href="/introduction">Introduction</a>
        <a href="./getting-started">Getting Started</a>
        <a href="https://docs.lovable.dev/features">Features</a>
        <a href="#section">Anchor Link</a>
        <a href="mailto:test@example.com">Email</a>
        <a href="">Empty href</a>
        <a>No href</a>
      </body>
      </html>
    `
    
    // Mock fetch to return our test HTML
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => testHtml,
    } as Response)
    
    const result = await crawler.crawlPage('https://docs.lovable.dev/introduction')
    
    expect(result.success).toBe(true)
    expect(result.links).toBeDefined()
    expect(result.links!.length).toBeGreaterThan(0)
    
    console.log('Discovered links:', result.links)
    
    // Should have found the valid HTTP links
    expect(result.links).toContain('https://docs.lovable.dev/introduction')
    expect(result.links).toContain('https://docs.lovable.dev/getting-started')
    expect(result.links).toContain('https://docs.lovable.dev/features')
    
    // Should NOT include anchors, mailto, or invalid links
    expect(result.links).not.toContain('https://docs.lovable.dev/introduction#section')
    expect(result.links).not.toContain('mailto:test@example.com')
  })
  
  it('should handle complex link extraction patterns', () => {
    const html = `
      <a href="/docs/intro">Intro</a>
      <a href="../guide">Guide</a>
      <a href="./tutorial">Tutorial</a>
      <a href="https://example.com/page">External</a>
      <a href="//example.com/protocol-relative">Protocol Relative</a>
      <a href='single-quotes.html'>Single Quotes</a>
      <a  href="/spaces-before.html"  >Spaces</a>
      <a href="/page#anchor">With Anchor</a>
    `
    
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi
    const links: string[] = []
    let match
    
    while ((match = linkRegex.exec(html)) !== null) {
      links.push(match[1])
    }
    
    console.log('Regex extracted:', links)
    
    expect(links).toHaveLength(8)
    expect(links).toContain('/docs/intro')
    expect(links).toContain('../guide')
    expect(links).toContain('./tutorial')
    expect(links).toContain('https://example.com/page')
    expect(links).toContain('//example.com/protocol-relative')
    expect(links).toContain('single-quotes.html')
    expect(links).toContain('/spaces-before.html')
    expect(links).toContain('/page#anchor')
  })
})