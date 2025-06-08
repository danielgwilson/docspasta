import { describe, it, expect } from 'vitest'
import { crawlSitemaps } from '@/lib/crawler/sitemap'
import { getRedisConnection } from '@/lib/crawler/queue-service'

describe('Lovable Fresh Sitemap Debug', () => {
  it('should clear cache and get fresh sitemap data for docs.lovable.dev', async () => {
    console.log('🔍 FRESH SITEMAP DEBUG: Clearing cache and fetching fresh data')
    
    // Clear the sitemap cache for docs.lovable.dev
    const redis = getRedisConnection()
    const cacheKey = 'sitemap:docs.lovable.dev:urls'
    
    console.log(`🗑️  Clearing cache key: ${cacheKey}`)
    await redis.del(cacheKey)
    
    // Now fetch fresh sitemap data
    console.log(`🌐 Fetching fresh sitemap data...`)
    const sitemapResult = await crawlSitemaps('https://docs.lovable.dev', 3, 100)
    
    console.log(`📊 FRESH SITEMAP RESULT:`)
    console.log(`   URLs found: ${sitemapResult.urls.length}`)
    console.log(`   Source: ${sitemapResult.source}`)
    console.log(`   Discovered sitemaps: ${sitemapResult.discoveredSitemaps?.length || 0}`)
    
    if (sitemapResult.discoveredSitemaps) {
      console.log(`🗺️  Discovered sitemap files:`)
      sitemapResult.discoveredSitemaps.forEach((sitemap, index) => {
        console.log(`   ${index + 1}. ${sitemap}`)
      })
    }
    
    console.log(`📋 ALL URLs from fresh sitemap (first 20):`)
    sitemapResult.urls.slice(0, 20).forEach((url, index) => {
      console.log(`   ${index + 1}. ${url}`)
    })
    
    if (sitemapResult.urls.length > 20) {
      console.log(`   ... and ${sitemapResult.urls.length - 20} more URLs`)
    }
    
    // The fresh result should be much larger than the cached 5
    expect(sitemapResult.urls.length).toBeGreaterThan(10)
    expect(sitemapResult.source).not.toBe('cache')
  }, 30000)
})