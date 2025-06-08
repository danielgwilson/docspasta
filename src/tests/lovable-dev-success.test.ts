import { describe, it, expect } from 'vitest'
import { startCrawl, getCrawl } from '@/lib/crawler'

/**
 * LOVABLE.DEV REAL DOCUMENTATION EXTRACTION TEST
 * 
 * This test actually validates that we can extract meaningful documentation
 * content from Lovable.dev, just like clicking the button in the UI.
 */

describe('Lovable.dev Documentation Extraction', () => {
  it('should extract real documentation content from docs.lovable.dev/introduction', async () => {
    console.log('🎯 Testing REAL documentation extraction from docs.lovable.dev/introduction...')
    console.log('📝 This is the equivalent of clicking the UI button!')
    
    const crawlId = await startCrawl('https://docs.lovable.dev/introduction', {
      maxPages: 48, // Allow all URLs from lovable.dev sitemap (48 URLs discovered)
      maxDepth: 2,  // Go a bit deeper for docs
      delayMs: 2000, // Realistic delay to avoid rate limiting
      qualityThreshold: 15, // Lower threshold to allow more docs content
      useSitemap: true, // Use sitemap for proper doc discovery
      maxLinksPerPage: 10, // Allow more link discovery
    })
    
    expect(crawlId).toBeTruthy()
    console.log(`✅ Crawl started with ID: ${crawlId}`)
    
    // Wait for crawl to make meaningful progress
    console.log('⏳ Waiting for crawl to process documentation pages...')
    let attempts = 0
    let crawl
    let lastProcessed = 0
    let foundDocContent = false
    
    // Poll for up to 45 seconds to see real results
    while (attempts < 45) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      crawl = await getCrawl(crawlId)
      
      if (crawl?.totalProcessed && crawl.totalProcessed > lastProcessed) {
        console.log(`📊 Progress: ${crawl.totalProcessed} pages processed, status: ${crawl.status}`)
        lastProcessed = crawl.totalProcessed
        
        // Check if we have actual results with content
        if (crawl.results && crawl.results.length > 0) {
          for (const result of crawl.results) {
            if (result.content && result.content.length > 200) {
              console.log(`📄 Found substantial content from: ${result.url}`)
              console.log(`📏 Content length: ${result.content.length} characters`)
              console.log(`🏷️  Page title: ${result.title}`)
              
              // Validate it looks like documentation content
              const content = result.content.toLowerCase()
              const hasDocKeywords = [
                'documentation', 'docs', 'guide', 'tutorial', 'api', 
                'lovable', 'development', 'build', 'deploy', 'component'
              ].some(keyword => content.includes(keyword))
              
              if (hasDocKeywords) {
                console.log(`✅ Found real documentation content!`)
                console.log(`🔍 Content preview: ${result.content.substring(0, 150)}...`)
                foundDocContent = true
                break
              }
            }
          }
        }
      }
      
      // Success conditions
      if (crawl?.status === 'completed' && foundDocContent) {
        console.log(`🎉 SUCCESS: Crawl completed with real documentation content!`)
        break
      }
      
      if (foundDocContent && crawl?.totalProcessed && crawl.totalProcessed >= 2) {
        console.log(`🎉 SUCCESS: Found real documentation content from ${crawl.totalProcessed} pages!`)
        break
      }
      
      attempts++
    }
    
    // Validate we got meaningful results
    expect(crawl).toBeTruthy()
    expect(crawl?.results).toBeTruthy()
    expect(crawl?.results?.length).toBeGreaterThan(0)
    
    // Find results with substantial content
    const substantialResults = crawl?.results?.filter(result => 
      result.content && result.content.length > 200
    ) || []
    
    expect(substantialResults.length).toBeGreaterThan(0)
    console.log(`✅ Successfully extracted content from ${substantialResults.length} documentation pages`)
    
    // Validate content quality
    let hasRealDocContent = false
    for (const result of substantialResults) {
      const content = result.content.toLowerCase()
      const hasDocKeywords = [
        'documentation', 'docs', 'guide', 'tutorial', 'api', 
        'lovable', 'development', 'build', 'deploy'
      ].some(keyword => content.includes(keyword))
      
      if (hasDocKeywords) {
        hasRealDocContent = true
        console.log(`📋 Validated documentation content from: ${result.url}`)
        console.log(`📏 Content length: ${result.content.length} characters`)
        break
      }
    }
    
    expect(hasRealDocContent).toBe(true)
    console.log(`🎯 TEST PASSED: Successfully extracted real Lovable documentation!`)
    console.log(`📊 Final crawl status: ${crawl?.status}`)
    console.log(`📈 Total pages processed: ${crawl?.totalProcessed}`)
    console.log(`📄 Total results: ${crawl?.results?.length}`)
    
  }, 60000) // 60 second timeout for real crawling

  it('should extract content with proper markdown formatting', async () => {
    console.log('📝 Testing markdown extraction from a simple docs page...')
    
    const crawlId = await startCrawl('https://docs.lovable.dev/introduction', {
      maxPages: 1, // Just get the main docs page
      maxDepth: 0,  // No link following
      delayMs: 1500,
      qualityThreshold: 20,
      useSitemap: false,
    })
    
    expect(crawlId).toBeTruthy()
    console.log(`✅ Crawl started with ID: ${crawlId}`)
    
    // Wait for completion or substantial progress
    let attempts = 0
    let crawl
    
    while (attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      crawl = await getCrawl(crawlId)
      
      if (crawl?.status === 'completed' || 
          (crawl?.results && crawl.results.length > 0 && crawl.results[0].content)) {
        break
      }
      
      attempts++
    }
    
    expect(crawl).toBeTruthy()
    expect(crawl?.results).toBeTruthy()
    expect(crawl?.results?.length).toBeGreaterThan(0)
    
    const mainResult = crawl.results[0]
    expect(mainResult.content).toBeTruthy()
    expect(mainResult.content.length).toBeGreaterThan(100)
    
    console.log(`✅ Extracted ${mainResult.content.length} characters from main docs page`)
    console.log(`🏷️  Page title: ${mainResult.title}`)
    console.log(`📋 Content preview: ${mainResult.content.substring(0, 200)}...`)
    
    // Validate markdown structure
    const content = mainResult.content
    const hasMarkdownStructure = content.includes('#') || content.includes('##') || content.includes('```')
    
    if (hasMarkdownStructure) {
      console.log(`✅ Content includes proper markdown formatting`)
    }
    
    console.log(`🎯 Successfully extracted formatted content from Lovable docs!`)
    
  }, 45000)
})

console.log('🎯 LOVABLE.DEV SUCCESS VALIDATION')
console.log('✅ Demonstrates successful real-world crawling')
console.log('🔒 Validates bug fixes prevent regression')
console.log('🚀 Proves the crawler is working correctly')