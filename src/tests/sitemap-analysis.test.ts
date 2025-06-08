import { describe, it, expect } from 'vitest'
import { crawlSitemaps, discoverSitemapUrls, fetchSitemap } from '@/lib/crawler/sitemap'

/**
 * LOVABLE.DEV SITEMAP ANALYSIS TEST
 * 
 * This test analyzes the sitemap discovery for lovable.dev to understand
 * why we're only finding 6 pages instead of 50+.
 */

describe('Lovable.dev Sitemap Analysis', () => {
  it('should discover all potential sitemap URLs for docs.lovable.dev', async () => {
    console.log('🔍 Analyzing sitemap discovery for docs.lovable.dev...')
    
    const baseUrl = 'https://docs.lovable.dev'
    const sitemapUrls = await discoverSitemapUrls(baseUrl)
    
    console.log(`📋 Discovered ${sitemapUrls.length} potential sitemap URLs:`)
    sitemapUrls.forEach((url, index) => {
      console.log(`  ${index + 1}. ${url}`)
    })
    
    expect(sitemapUrls.length).toBeGreaterThan(0)
    
    // Test each sitemap URL individually
    for (const sitemapUrl of sitemapUrls) {
      console.log(`\n🌐 Testing sitemap URL: ${sitemapUrl}`)
      
      try {
        const result = await fetchSitemap(sitemapUrl)
        console.log(`  ✅ Found ${result.urls.length} URLs and ${result.childSitemaps.length} child sitemaps`)
        
        if (result.urls.length > 0) {
          console.log(`  📄 Sample URLs from this sitemap:`)
          result.urls.slice(0, 5).forEach((url, index) => {
            console.log(`    ${index + 1}. ${url}`)
          })
          if (result.urls.length > 5) {
            console.log(`    ... and ${result.urls.length - 5} more`)
          }
        }
        
        if (result.childSitemaps.length > 0) {
          console.log(`  🗂️  Child sitemaps:`)
          result.childSitemaps.forEach((url, index) => {
            console.log(`    ${index + 1}. ${url}`)
          })
        }
      } catch (error) {
        console.log(`  ❌ Failed to fetch: ${error}`)
      }
    }
  }, 30000)

  it('should analyze full sitemap crawl results for docs.lovable.dev', async () => {
    console.log('\n🎯 Running full sitemap crawl analysis...')
    
    const baseUrl = 'https://docs.lovable.dev'
    const sitemapResult = await crawlSitemaps(baseUrl, 3, 1000) // Max depth 3, max URLs 1000
    
    console.log(`\n📊 FULL SITEMAP CRAWL RESULTS:`)
    console.log(`  Source: ${sitemapResult.source}`)
    console.log(`  Total URLs found: ${sitemapResult.urls.length}`)
    console.log(`  Sitemaps discovered: ${sitemapResult.discoveredSitemaps.length}`)
    
    console.log(`\n🗺️  Discovered sitemaps:`)
    sitemapResult.discoveredSitemaps.forEach((url, index) => {
      console.log(`  ${index + 1}. ${url}`)
    })
    
    console.log(`\n📄 All URLs found in sitemap:`)
    sitemapResult.urls.forEach((url, index) => {
      console.log(`  ${index + 1}. ${url}`)
    })
    
    // Analyze URL patterns
    const urlPatterns = new Map<string, number>()
    sitemapResult.urls.forEach(url => {
      try {
        const urlObj = new URL(url)
        const pathSegments = urlObj.pathname.split('/').filter(Boolean)
        const firstSegment = pathSegments[0] || 'root'
        urlPatterns.set(firstSegment, (urlPatterns.get(firstSegment) || 0) + 1)
      } catch {
        // Skip invalid URLs
      }
    })
    
    console.log(`\n📈 URL pattern analysis:`)
    Array.from(urlPatterns.entries()).sort((a, b) => b[1] - a[1]).forEach(([pattern, count]) => {
      console.log(`  /${pattern}/: ${count} URLs`)
    })
    
    expect(sitemapResult.urls.length).toBeGreaterThan(0)
    
    // Check if we're missing expected documentation URLs
    const expectedPaths = [
      '/introduction',
      '/getting-started',
      '/components',
      '/api',
      '/deployment',
      '/troubleshooting',
      '/examples',
      '/tutorial',
      '/guide'
    ]
    
    console.log(`\n🔍 Checking for expected documentation paths:`)
    const foundPaths = new Set()
    sitemapResult.urls.forEach(url => {
      expectedPaths.forEach(path => {
        if (url.includes(path)) {
          foundPaths.add(path)
        }
      })
    })
    
    expectedPaths.forEach(path => {
      const found = foundPaths.has(path)
      console.log(`  ${found ? '✅' : '❌'} ${path}: ${found ? 'Found' : 'Missing'}`)
    })
    
  }, 45000)

  it('should check robots.txt for sitemap references', async () => {
    console.log('\n🤖 Checking robots.txt for sitemap references...')
    
    const robotsUrl = 'https://docs.lovable.dev/robots.txt'
    
    try {
      const response = await fetch(robotsUrl)
      if (response.ok) {
        const robotsContent = await response.text()
        console.log(`📋 robots.txt content:`)
        console.log(robotsContent)
        
        // Extract sitemap URLs from robots.txt
        const sitemapLines = robotsContent.split('\n').filter(line => 
          line.toLowerCase().startsWith('sitemap:')
        )
        
        console.log(`\n🗺️  Sitemaps declared in robots.txt: ${sitemapLines.length}`)
        sitemapLines.forEach((line, index) => {
          const url = line.substring(line.indexOf(':') + 1).trim()
          console.log(`  ${index + 1}. ${url}`)
        })
      } else {
        console.log(`❌ robots.txt not accessible: ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      console.log(`❌ Failed to fetch robots.txt: ${error}`)
    }
  }, 15000)
})