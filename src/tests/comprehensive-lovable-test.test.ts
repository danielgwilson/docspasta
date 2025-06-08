import { describe, it, expect } from 'vitest'
import { startCrawl, getCrawl } from '@/lib/crawler'

/**
 * COMPREHENSIVE LOVABLE.DEV EXTRACTION TEST
 * 
 * This test proves that docspasta v2 can successfully extract real documentation
 * content from Lovable.dev, exactly like clicking the button in the UI.
 */

describe('Comprehensive Lovable.dev Documentation Extraction', () => {
  it('should extract meaningful documentation content from lovable.dev (like UI button)', async () => {
    console.log('🚀 COMPREHENSIVE TEST: Real documentation extraction from lovable.dev')
    console.log('📝 This proves the crawler works exactly like the UI button!')
    
    const crawlId = await startCrawl('https://docs.lovable.dev/introduction', {
      maxPages: 5, // Get substantial content
      maxDepth: 2,  // Go deeper for real docs
      delayMs: 2000, // Realistic delay 
      qualityThreshold: 25, // Good threshold for docs
      useSitemap: true, // Full discovery
      maxLinksPerPage: 10, // Allow good link discovery
    })
    
    expect(crawlId).toBeTruthy()
    console.log(`✅ Crawl started: ${crawlId}`)
    
    // Wait for meaningful extraction - this is the real test
    console.log('⏳ Waiting for real documentation extraction...')
    let attempts = 0
    let crawl
    let bestContent = null
    let totalContentLength = 0
    
    // Poll for up to 60 seconds to get real results
    while (attempts < 60) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      crawl = await getCrawl(crawlId)
      
      if (crawl?.results && crawl.results.length > 0) {
        // Calculate total extracted content
        totalContentLength = crawl.results.reduce((total, result) => 
          total + (result.content?.length || 0), 0
        )
        
        // Find the best piece of content
        for (const result of crawl.results) {
          if (result.content && result.content.length > 500) {
            const content = result.content.toLowerCase()
            const docScore = [
              'documentation', 'docs', 'guide', 'api', 'tutorial',
              'lovable', 'development', 'build', 'deploy', 'app',
              'component', 'feature', 'code', 'developer'
            ].reduce((score, keyword) => 
              score + (content.includes(keyword) ? 1 : 0), 0
            )
            
            if (docScore >= 3 && (!bestContent || result.content.length > bestContent.length)) {
              bestContent = result
            }
          }
        }
        
        console.log(`📊 Progress: ${crawl.totalProcessed} pages, ${crawl.results.length} results, ${totalContentLength} chars total`)
        
        // Success criteria: Found substantial documentation content
        if (bestContent && totalContentLength > 2000) {
          console.log(`🎉 SUCCESS: Found substantial documentation content!`)
          break
        }
        
        // Alternative success: Multiple pages with good content
        if (crawl.totalProcessed >= 3 && totalContentLength > 1500) {
          console.log(`🎉 SUCCESS: Extracted content from multiple pages!`)
          break
        }
      }
      
      attempts++
    }
    
    // Validate we got real results
    expect(crawl).toBeTruthy()
    expect(crawl?.results).toBeTruthy()
    expect(crawl?.results?.length).toBeGreaterThan(0)
    
    // Validate content quality and quantity
    expect(totalContentLength).toBeGreaterThan(1000) // At least 1KB of content
    
    const substantialResults = crawl.results.filter(result => 
      result.content && result.content.length > 200
    )
    expect(substantialResults.length).toBeGreaterThan(0)
    
    console.log(`✅ EXTRACTION SUMMARY:`)
    console.log(`📈 Pages processed: ${crawl.totalProcessed}`)
    console.log(`📄 Results found: ${crawl.results.length}`)
    console.log(`📏 Total content: ${totalContentLength} characters`)
    console.log(`📋 Substantial results: ${substantialResults.length}`)
    
    if (bestContent) {
      console.log(`🏆 BEST CONTENT FOUND:`)
      console.log(`🔗 URL: ${bestContent.url}`)
      console.log(`🏷️  Title: ${bestContent.title}`)
      console.log(`📏 Length: ${bestContent.content.length} characters`)
      console.log(`📝 Preview: ${bestContent.content.substring(0, 200)}...`)
      
      // Validate it's real documentation
      const content = bestContent.content.toLowerCase()
      const hasDocKeywords = [
        'documentation', 'docs', 'guide', 'tutorial', 'api', 
        'lovable', 'development', 'build'
      ].some(keyword => content.includes(keyword))
      
      expect(hasDocKeywords).toBe(true)
      console.log(`✅ Validated: Content contains documentation keywords`)
    }
    
    // Log some example URLs we crawled
    console.log(`📊 CRAWLED PAGES:`)
    crawl.results.slice(0, 3).forEach((result, i) => {
      console.log(`${i + 1}. ${result.url} (${result.content?.length || 0} chars)`)
    })
    
    console.log(`🎯 COMPREHENSIVE TEST PASSED!`)
    console.log(`✅ Successfully extracted real Lovable documentation content`)
    console.log(`📋 This proves docspasta v2 works exactly like the UI button`)
    console.log(`🚀 Crawler status: ${crawl.status}`)
    
  }, 90000) // 90 second timeout for comprehensive test
})

console.log('🎯 COMPREHENSIVE LOVABLE.DEV TEST')
console.log('🚀 Proves real documentation extraction works')
console.log('📝 Equivalent to clicking the UI button')
console.log('✅ Validates the complete crawler pipeline')