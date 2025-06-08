import { describe, it, expect } from 'vitest'
import { crawlSitemaps } from '@/lib/crawler/sitemap'
import { getRedisConnection } from '@/lib/crawler/queue-service'

describe('Final E2E Verification', () => {
  it('should verify both Lovable.dev and Tailwind CSS work correctly after cache clear', async () => {
    console.log('🔍 FINAL E2E VERIFICATION: Testing both sites after cache fixes')
    
    const redis = getRedisConnection()
    
    // Clear all sitemap caches to ensure fresh data
    console.log('🗑️  Clearing all sitemap caches...')
    await redis.del('sitemap:docs.lovable.dev:urls')
    await redis.del('sitemap:tailwindcss.com:urls')
    
    // Test 1: Lovable.dev (should find many URLs from sitemap)
    console.log('\\n📋 TEST 1: Lovable.dev fresh sitemap discovery')
    const lovableResult = await crawlSitemaps('https://docs.lovable.dev', 3, 50)
    
    console.log(`✅ Lovable.dev Results:`)
    console.log(`   URLs found: ${lovableResult.urls.length}`)
    console.log(`   Source: ${lovableResult.source}`)
    console.log(`   Should be: 50 (limited by maxUrls parameter)`)
    
    // Test 2: Tailwind CSS (should find 0 URLs from sitemap, rely on link discovery)
    console.log('\\n📋 TEST 2: Tailwind CSS sitemap discovery (should be 0)')
    const tailwindResult = await crawlSitemaps('https://tailwindcss.com', 3, 50)
    
    console.log(`✅ Tailwind CSS Results:`)
    console.log(`   URLs found: ${tailwindResult.urls.length}`)
    console.log(`   Source: ${tailwindResult.source}`)
    console.log(`   Should be: 0 (no sitemap exists)`)
    
    // Verify results
    expect(lovableResult.urls.length).toBeGreaterThanOrEqual(40) // Should find substantial URLs
    expect(lovableResult.source).not.toBe('cache') // Should be fresh
    
    expect(tailwindResult.urls.length).toBeLessThanOrEqual(1) // Should find no or minimal URLs from sitemap
    
    console.log('\\n🎉 FINAL VERIFICATION:')
    console.log(`✅ Lovable.dev: ${lovableResult.urls.length} URLs discovered from sitemap`)
    console.log(`✅ Tailwind CSS: ${tailwindResult.urls.length} URLs (will use link discovery during crawl)`)
    console.log(`✅ Redis cache cleared - fresh data retrieved`)
    console.log(`✅ Both sites ready for proper full crawls`)
    
  }, 30000)
})