import { describe, it, expect } from 'vitest'
import { crawlSitemaps } from '@/lib/crawler/sitemap'

describe('Lovable Sitemap Specific Debug', () => {
  it('should debug exact sitemap response for docs.lovable.dev', async () => {
    console.log('🔍 SPECIFIC DEBUG: Lovable.dev sitemap crawling')
    
    // Test with very high limit to see what's really happening
    const sitemapResult = await crawlSitemaps('https://docs.lovable.dev', 3, 1000)
    
    console.log(`📊 RAW SITEMAP RESULT:`)
    console.log(`   URLs found: ${sitemapResult.urls.length}`)
    console.log(`   Source: ${sitemapResult.source}`)
    console.log(`   Discovered sitemaps: ${sitemapResult.discoveredSitemaps?.length || 0}`)
    
    if (sitemapResult.discoveredSitemaps) {
      console.log(`🗺️  Discovered sitemap files:`)
      sitemapResult.discoveredSitemaps.forEach((sitemap, index) => {
        console.log(`   ${index + 1}. ${sitemap}`)
      })
    }
    
    console.log(`📋 ALL URLs from sitemap:`)
    sitemapResult.urls.forEach((url, index) => {
      console.log(`   ${index + 1}. ${url}`)
    })
    
    // Test again with explicit limit of 50
    console.log(`\\n🔄 TESTING WITH EXPLICIT LIMIT OF 50:`)
    const limitedResult = await crawlSitemaps('https://docs.lovable.dev', 3, 50)
    console.log(`   URLs with limit 50: ${limitedResult.urls.length}`)
    
    // Test with limit of 10 
    console.log(`\\n🔄 TESTING WITH EXPLICIT LIMIT OF 10:`)
    const veryLimitedResult = await crawlSitemaps('https://docs.lovable.dev', 3, 10)
    console.log(`   URLs with limit 10: ${veryLimitedResult.urls.length}`)
    
    expect(sitemapResult.urls.length).toBeGreaterThan(0)
  }, 30000)
})