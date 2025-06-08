import { describe, it, expect } from 'vitest'
import { fetchSitemap } from '@/lib/crawler/sitemap'
import { isValidDocumentationUrl } from '@/lib/crawler/url-utils'

/**
 * DIRECT SITEMAP TEST
 * 
 * This test directly fetches the lovable.dev sitemap to see exactly
 * what URLs are available and how many are being filtered.
 */

describe('Direct Sitemap Analysis', () => {
  it('should fetch and analyze docs.lovable.dev sitemap directly', async () => {
    console.log('🔍 Fetching docs.lovable.dev sitemap directly...')
    
    const sitemapUrl = 'https://docs.lovable.dev/sitemap.xml'
    const result = await fetchSitemap(sitemapUrl)
    
    console.log(`📊 Sitemap results:`)
    console.log(`  Total URLs: ${result.urls.length}`)
    console.log(`  Child sitemaps: ${result.childSitemaps.length}`)
    
    expect(result.urls.length).toBeGreaterThan(0)
    
    console.log(`\n📄 All URLs from sitemap:`)
    result.urls.forEach((url, index) => {
      console.log(`  ${index + 1}. ${url}`)
    })
    
    // Analyze URL patterns
    const urlPatterns = new Map<string, string[]>()
    result.urls.forEach(url => {
      try {
        const urlObj = new URL(url)
        const pathSegments = urlObj.pathname.split('/').filter(Boolean)
        const firstSegment = pathSegments[0] || 'root'
        
        if (!urlPatterns.has(firstSegment)) {
          urlPatterns.set(firstSegment, [])
        }
        urlPatterns.get(firstSegment)!.push(url)
      } catch {
        // Skip invalid URLs
      }
    })
    
    console.log(`\n📈 URL patterns by first path segment:`)
    Array.from(urlPatterns.entries()).forEach(([pattern, urls]) => {
      console.log(`  /${pattern}/: ${urls.length} URLs`)
      urls.slice(0, 3).forEach(url => {
        console.log(`    - ${url}`)
      })
      if (urls.length > 3) {
        console.log(`    ... and ${urls.length - 3} more`)
      }
    })
    
    // Test URL filtering
    console.log(`\n🔍 Testing URL filtering:`)
    let validCount = 0
    let invalidCount = 0
    const invalidReasons: { [key: string]: number } = {}
    
    result.urls.forEach(url => {
      const isValid = isValidDocumentationUrl(url)
      if (isValid) {
        validCount++
      } else {
        invalidCount++
        
        // Try to determine why it was filtered
        const urlLower = url.toLowerCase()
        if (urlLower.includes('/assets/') || urlLower.includes('/images/') || 
            urlLower.includes('/img/') || urlLower.includes('/css/') || 
            urlLower.includes('/js/') || urlLower.includes('/static/')) {
          invalidReasons['asset_path'] = (invalidReasons['asset_path'] || 0) + 1
        } else if (urlLower.endsWith('.jpg') || urlLower.endsWith('.png') || 
                   urlLower.endsWith('.css') || urlLower.endsWith('.js') || 
                   urlLower.endsWith('.pdf')) {
          invalidReasons['file_extension'] = (invalidReasons['file_extension'] || 0) + 1
        } else {
          invalidReasons['other'] = (invalidReasons['other'] || 0) + 1
          console.log(`    ? Unknown filter reason for: ${url}`)
        }
      }
    })
    
    console.log(`  ✅ Valid documentation URLs: ${validCount}`)
    console.log(`  ❌ Filtered out: ${invalidCount}`)
    
    if (Object.keys(invalidReasons).length > 0) {
      console.log(`  📊 Filter reasons:`)
      Object.entries(invalidReasons).forEach(([reason, count]) => {
        console.log(`    - ${reason}: ${count} URLs`)
      })
    }
    
    // Check for expected doc URLs
    const expectedKeywords = [
      'introduction', 'getting-started', 'tutorial', 'guide', 'api', 
      'components', 'features', 'deploy', 'build', 'install'
    ]
    
    console.log(`\n🎯 Checking for expected documentation keywords:`)
    expectedKeywords.forEach(keyword => {
      const found = result.urls.filter(url => 
        url.toLowerCase().includes(keyword)
      )
      console.log(`  ${found.length > 0 ? '✅' : '❌'} ${keyword}: ${found.length} URLs`)
      if (found.length > 0) {
        found.slice(0, 2).forEach(url => {
          console.log(`    - ${url}`)
        })
      }
    })
    
  }, 30000)
  
  it('should test URL normalization and filtering logic', async () => {
    console.log('\n🧪 Testing URL filtering edge cases...')
    
    const testUrls = [
      'https://docs.lovable.dev/',
      'https://docs.lovable.dev/introduction',
      'https://docs.lovable.dev/features/deploy',
      'https://docs.lovable.dev/assets/image.png',
      'https://docs.lovable.dev/docs.css',
      'https://docs.lovable.dev/script.js',
      'https://docs.lovable.dev/favicon.ico',
      'https://docs.lovable.dev/api/reference',
      'https://docs.lovable.dev/api',
      'https://docs.lovable.dev/changelog'
    ]
    
    console.log('📋 Testing URL filtering:')
    testUrls.forEach(url => {
      const isValid = isValidDocumentationUrl(url)
      console.log(`  ${isValid ? '✅' : '❌'} ${url}`)
    })
  })
})