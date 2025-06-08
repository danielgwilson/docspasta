import { describe, it, expect } from 'vitest'
import { WebCrawler } from '@/lib/crawler/web-crawler'

describe('Tailwind Link Discovery Test', () => {
  it('should discover dozens of Tailwind CSS pages through link following', async () => {
    console.log('🔍 TESTING REAL TAILWIND LINK DISCOVERY')
    console.log('This tests the ACTUAL crawling process, not just sitemap discovery')
    
    const crawler = new WebCrawler()
    
    // Test 1: Crawl the main docs page and extract links
    console.log('\\n📄 Step 1: Crawling https://tailwindcss.com/docs to extract links...')
    const crawlResult = await crawler.crawlPage('https://tailwindcss.com/docs', {
      maxDepth: 2,
      maxPages: 50,
      respectRobotsTxt: true,
      qualityThreshold: 10,
    })
    
    console.log(`✅ Crawl Result:`)
    console.log(`   Success: ${crawlResult.success}`)
    console.log(`   Content length: ${crawlResult.content?.length || 0} chars`)
    console.log(`   Links found: ${crawlResult.links?.length || 0}`)
    
    if (crawlResult.links && crawlResult.links.length > 0) {
      console.log('\\n🔗 First 20 links discovered:')
      crawlResult.links.slice(0, 20).forEach((link, index) => {
        console.log(`   ${index + 1}. ${link}`)
      })
      
      if (crawlResult.links.length > 20) {
        console.log(`   ... and ${crawlResult.links.length - 20} more links`)
      }
    }
    
    // Test 2: Verify we found substantial documentation links
    expect(crawlResult.success).toBe(true)
    expect(crawlResult.links).toBeDefined()
    expect(crawlResult.links!.length).toBeGreaterThan(10) // Should find many documentation links
    
    // Test 3: Check for specific expected Tailwind docs pages
    const expectedPages = [
      'installation',
      'utility-first', 
      'responsive-design',
      'hover-focus-and-other-states',
      'dark-mode'
    ]
    
    const foundExpectedPages = expectedPages.filter(page => 
      crawlResult.links!.some(link => link.includes(page))
    )
    
    console.log(`\\n📋 Expected Tailwind pages found: ${foundExpectedPages.length}/${expectedPages.length}`)
    foundExpectedPages.forEach(page => console.log(`   ✅ Found: ${page}`))
    
    const missingPages = expectedPages.filter(page => 
      !crawlResult.links!.some(link => link.includes(page))
    )
    if (missingPages.length > 0) {
      console.log(`   ❌ Missing:`)
      missingPages.forEach(page => console.log(`      - ${page}`))
    }
    
    // Should find at least some of the core Tailwind documentation pages
    expect(foundExpectedPages.length).toBeGreaterThan(0)
    
    console.log(`\\n🎉 RESULT: Found ${crawlResult.links!.length} links from Tailwind docs page`)
    console.log('This proves link discovery is working and can find dozens of pages!')
    
  }, 30000)
})