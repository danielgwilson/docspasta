import { describe, it, expect } from 'vitest'
import { WebCrawler } from '@/lib/crawler/web-crawler'
import { crawlSitemaps } from '@/lib/crawler/sitemap'
import { isValidDocumentationUrl } from '@/lib/crawler/url-utils'

describe('URL Discovery Debug', () => {
  it('should debug lovable.dev URL discovery', async () => {
    console.log('🔍 Testing Lovable.dev URL Discovery')
    
    const crawler = new WebCrawler()
    const baseUrl = 'https://docs.lovable.dev'
    const options = {
      maxPages: 50,
      maxDepth: 2,
      respectRobotsTxt: true,
      qualityThreshold: 20,
    }
    
    // Test sitemap discovery directly
    console.log('📋 Step 1: Testing sitemap discovery...')
    try {
      const sitemapResult = await crawlSitemaps(baseUrl, 3, options.maxPages)
      console.log(`🗺️  Sitemap URLs found: ${sitemapResult.urls.length}`)
      console.log(`📊 First 10 URLs from sitemap:`)
      sitemapResult.urls.slice(0, 10).forEach((url, index) => {
        console.log(`   ${index + 1}. ${url}`)
      })
      
      // Test URL validation
      console.log('🔍 Step 2: Testing URL validation...')
      let validCount = 0
      let filteredCount = 0
      
      for (const url of sitemapResult.urls.slice(0, 20)) {
        const isValid = isValidDocumentationUrl(url)
        if (isValid) {
          validCount++
        } else {
          filteredCount++
          console.log(`❌ Filtered: ${url}`)
        }
      }
      
      console.log(`✅ Valid URLs: ${validCount}`)
      console.log(`❌ Filtered URLs: ${filteredCount}`)
      
      // Test full discovery process
      console.log('🚀 Step 3: Testing full URL discovery...')
      const discoveredUrls = await crawler.discoverURLs(baseUrl, options)
      console.log(`🎯 Final discovered URLs: ${discoveredUrls.length}`)
      console.log(`📋 All discovered URLs:`)
      discoveredUrls.forEach((url, index) => {
        console.log(`   ${index + 1}. ${url}`)
      })
      
      expect(discoveredUrls.length).toBeGreaterThan(5)
      
    } catch (error) {
      console.error('❌ Sitemap discovery failed:', error)
      expect(false).toBe(true) // Fail the test
    }
  }, 30000)

  it('should debug tailwind.css URL discovery with link following', async () => {
    console.log('🔍 Testing Tailwind CSS URL Discovery with Enhanced Configuration')
    
    const crawler = new WebCrawler()
    const baseUrl = 'https://tailwindcss.com/docs' // Start from docs page
    const options = {
      maxPages: 20, // Reasonable limit for testing
      maxDepth: 3,  // Increased depth for link discovery
      respectRobotsTxt: true,
      qualityThreshold: 15, // Lower threshold for CSS docs
    }
    
    // Test sitemap discovery directly
    console.log('📋 Step 1: Testing sitemap discovery...')
    try {
      const sitemapResult = await crawlSitemaps('https://tailwindcss.com', 3, options.maxPages)
      console.log(`🗺️  Sitemap URLs found: ${sitemapResult.urls.length}`)
      
      if (sitemapResult.urls.length === 0) {
        console.log('✅ Confirmed: Tailwind CSS has no sitemap - link discovery will be essential')
      }
      
      // Test full discovery process with enhanced settings
      console.log('🚀 Step 2: Testing full URL discovery with link-discovery focus...')
      const discoveredUrls = await crawler.discoverURLs(baseUrl, options)
      console.log(`🎯 Final discovered URLs: ${discoveredUrls.length}`)
      console.log(`📋 All discovered URLs:`)
      discoveredUrls.forEach((url, index) => {
        console.log(`   ${index + 1}. ${url}`)
      })
      
      // Should find at least the starting URL
      expect(discoveredUrls.length).toBeGreaterThanOrEqual(1)
      expect(discoveredUrls[0]).toBe(baseUrl)
      
      if (discoveredUrls.length === 1) {
        console.log('⚠️  Only starting URL found - this is expected for sitemap-less sites')
        console.log('💡 Link discovery during crawling will find additional pages')
      }
      
    } catch (error) {
      console.error('❌ Discovery failed:', error)
      expect(false).toBe(true) // Fail the test
    }
  }, 30000)

  it('should test URL validation edge cases', async () => {
    console.log('🧪 Testing URL validation edge cases')
    
    const testUrls = [
      'https://docs.lovable.dev/introduction',
      'https://docs.lovable.dev/features/ai-features',
      'https://docs.lovable.dev/css/style.css',
      'https://docs.lovable.dev/images/logo.png',
      'https://tailwindcss.com/docs/installation',
      'https://tailwindcss.com/docs/utility-first',
      'https://tailwindcss.com/assets/main.js',
      'https://tailwindcss.com/favicon.ico',
    ]
    
    for (const url of testUrls) {
      const isValid = isValidDocumentationUrl(url)
      console.log(`${isValid ? '✅' : '❌'} ${url} - ${isValid ? 'VALID' : 'FILTERED'}`)
    }
    
    // These should be valid
    expect(isValidDocumentationUrl('https://docs.lovable.dev/introduction')).toBe(true)
    expect(isValidDocumentationUrl('https://tailwindcss.com/docs/installation')).toBe(true)
    
    // These should be filtered
    expect(isValidDocumentationUrl('https://docs.lovable.dev/css/style.css')).toBe(false)
    expect(isValidDocumentationUrl('https://docs.lovable.dev/images/logo.png')).toBe(false)
  })
})