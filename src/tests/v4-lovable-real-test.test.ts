import { describe, it, expect } from 'vitest'
import { WebCrawler } from '@/lib/serverless/web-crawler'

describe('V4 Lovable Real Page Test', () => {
  it('should fetch and analyze real lovable docs page', async () => {
    const crawler = new WebCrawler()
    
    const result = await crawler.crawlPage('https://docs.lovable.dev/introduction')
    
    console.log('Crawl result:')
    console.log('- Success:', result.success)
    console.log('- Title:', result.title)
    console.log('- Content length:', result.content?.length)
    console.log('- Links found:', result.links?.length)
    
    if (result.links && result.links.length > 0) {
      console.log('\nFirst 10 links:')
      result.links.slice(0, 10).forEach(link => console.log('  -', link))
      
      // Check for lovable docs links
      const lovableLinks = result.links.filter(link => 
        link.includes('docs.lovable.dev') && 
        !link.includes('#')
      )
      console.log('\nLovable docs links:', lovableLinks.length)
      lovableLinks.forEach(link => console.log('  -', link))
    }
    
    if (result.content) {
      // Check if content contains navigation elements
      const hasNav = result.content.includes('Getting Started') || 
                     result.content.includes('Features') ||
                     result.content.includes('Documentation')
      
      console.log('\nContent analysis:')
      console.log('- Has navigation elements:', hasNav)
      console.log('- First 500 chars:', result.content.substring(0, 500))
    }
    
    expect(result.success).toBe(true)
  }, 30000) // 30 second timeout for real network request
})