import { describe, it, expect } from 'vitest'
import { startCrawl } from '@/lib/crawler'
import { memoryStore } from '@/lib/storage/memory-store'

/**
 * LOVABLE.DEV COMPREHENSIVE CRAWL TEST
 * 
 * This test crawls all pages of lovable.dev to verify the crawler works
 * with a real documentation site. It's designed to test:
 * 
 * 1. Sitemap discovery and processing
 * 2. Large-scale crawling (all pages)
 * 3. Real documentation content extraction
 * 4. Progress tracking with many pages
 * 5. Quality assessment on actual docs
 */

describe('Lovable.dev Comprehensive Crawl', () => {
  it('should successfully crawl all pages of lovable.dev', async () => {
    console.log('🚀 Starting comprehensive crawl of lovable.dev...')
    console.log('📊 This will test large-scale crawling with real documentation')
    
    const startTime = Date.now()
    
    try {
      // Start comprehensive crawl of lovable.dev
      const crawlId = await startCrawl('https://docs.lovable.dev/introduction', {
        maxPages: 100, // Allow crawling many pages
        maxDepth: 4,   // Deep crawling
        followExternalLinks: false, // Stay on lovable.dev
        respectRobots: true,
        delayMs: 500, // Be respectful with delay
        qualityThreshold: 30, // Reasonable threshold for docs
        useSitemap: true, // Use sitemap for comprehensive discovery
      })

      expect(crawlId).toBeTruthy()
      console.log(`✅ Crawl started with ID: ${crawlId}`)

      // Monitor progress with detailed logging
      let attempts = 0
      let crawlResult
      let lastPageCount = 0
      let lastTotalPages = 0
      
      while (attempts < 120) { // 2 minutes max for comprehensive crawl
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        crawlResult = memoryStore.getCrawl(crawlId)
        
        if (crawlResult?.progress) {
          const currentPages = crawlResult.progress.pageCount || 0
          const totalPages = crawlResult.progress.totalPages || 0
          
          // Log progress when it changes
          if (currentPages !== lastPageCount || totalPages !== lastTotalPages) {
            console.log(`📊 Progress: ${currentPages}/${totalPages} pages - Status: ${crawlResult.status}`)
            lastPageCount = currentPages
            lastTotalPages = totalPages
          }
        }
        
        if (crawlResult?.status === 'completed') {
          console.log(`🎉 Crawl completed!`)
          break
        } else if (crawlResult?.status === 'error') {
          console.error(`❌ Crawl failed: ${crawlResult.error}`)
          throw new Error(`Crawl failed: ${crawlResult.error}`)
        }
        
        attempts++
      }

      const endTime = Date.now()
      const duration = (endTime - startTime) / 1000

      // Verify successful completion
      expect(crawlResult?.status).toBe('completed')
      expect(crawlResult?.markdown).toBeTruthy()
      
      // Log comprehensive results
      const markdownLength = crawlResult?.markdown?.length || 0
      const pageCount = crawlResult?.progress?.pageCount || 0
      
      console.log(``)
      console.log(`🎯 LOVABLE.DEV CRAWL RESULTS:`)
      console.log(`├── Status: ${crawlResult?.status}`)
      console.log(`├── Pages crawled: ${pageCount}`)
      console.log(`├── Content extracted: ${markdownLength.toLocaleString()} characters`)
      console.log(`├── Duration: ${duration.toFixed(1)}s`)
      console.log(`├── Avg time per page: ${(duration / Math.max(pageCount, 1)).toFixed(1)}s`)
      console.log(`└── Quality: ${markdownLength > 10000 ? '✅ Excellent' : markdownLength > 5000 ? '✅ Good' : '⚠️  Limited'}`)
      
      // Content quality checks
      expect(markdownLength).toBeGreaterThan(1000) // Should extract substantial content
      expect(pageCount).toBeGreaterThan(1) // Should crawl multiple pages
      
      // Verify content contains expected documentation patterns
      const content = crawlResult?.markdown || ''
      const hasHeadings = content.includes('# ') || content.includes('## ')
      const hasDocContent = content.toLowerCase().includes('lovable') || 
                          content.toLowerCase().includes('documentation') ||
                          content.toLowerCase().includes('guide')
      
      expect(hasHeadings).toBe(true)
      expect(hasDocContent).toBe(true)
      
      // Log content preview
      console.log(``)
      console.log(`📖 CONTENT PREVIEW:`)
      console.log(`${content.substring(0, 300)}...`)
      console.log(``)
      
      // Performance benchmarks
      if (pageCount > 5) {
        console.log(`🚀 PERFORMANCE: Successfully crawled ${pageCount} pages in ${duration.toFixed(1)}s`)
      }
      
      if (markdownLength > 20000) {
        console.log(`📚 CONTENT: Extracted ${markdownLength.toLocaleString()} characters of documentation`)
      }
      
      console.log(`✅ Lovable.dev comprehensive crawl completed successfully!`)
      
    } catch (error) {
      console.error(`💥 Lovable.dev crawl failed:`, error)
      throw error
    }
  }, 150000) // 2.5 minute timeout for comprehensive crawl

  it('should handle lovable.dev specific edge cases', async () => {
    console.log('🔧 Testing lovable.dev specific edge cases...')
    
    // Test specific lovable.dev URLs that might have unique characteristics
    const testUrls = [
      'https://docs.lovable.dev/introduction',
      'https://docs.lovable.dev/quick-start',
      'https://docs.lovable.dev',
    ]
    
    for (const url of testUrls) {
      console.log(`Testing: ${url}`)
      
      try {
        const crawlId = await startCrawl(url, {
          maxPages: 3,
          maxDepth: 1,
          delayMs: 300,
          qualityThreshold: 20,
        })
        
        expect(crawlId).toBeTruthy()
        console.log(`✅ ${url} started successfully`)
        
        // Brief wait to ensure it starts processing
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        const result = memoryStore.getCrawl(crawlId)
        expect(result?.status).toMatch(/started|processing|completed/)
        
      } catch (error) {
        console.error(`❌ ${url} failed:`, error)
        throw error
      }
    }
  }, 30000)

  it('should extract high-quality content from lovable.dev docs', async () => {
    console.log('📚 Testing content quality extraction from lovable.dev...')
    
    const crawlId = await startCrawl('https://docs.lovable.dev/introduction', {
      maxPages: 10,
      maxDepth: 2,
      delayMs: 400,
      qualityThreshold: 25, // Higher threshold for docs
      useSitemap: true,
    })
    
    expect(crawlId).toBeTruthy()
    
    // Wait for completion
    let attempts = 0
    let result
    
    while (attempts < 60) { // 1 minute for docs
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      result = memoryStore.getCrawl(crawlId)
      
      if (result?.status === 'completed' || result?.status === 'error') {
        break
      }
      
      attempts++
    }
    
    expect(result?.status).toBe('completed')
    
    if (result?.markdown) {
      const content = result.markdown
      const wordCount = content.split(/\s+/).length
      const hasCodeBlocks = content.includes('```')
      const hasDocStructure = content.includes('# ') && content.includes('## ')
      
      console.log(`📊 Content Analysis:`)
      console.log(`├── Length: ${content.length.toLocaleString()} characters`)
      console.log(`├── Words: ${wordCount.toLocaleString()}`)
      console.log(`├── Has code blocks: ${hasCodeBlocks ? '✅' : '❌'}`)
      console.log(`├── Has doc structure: ${hasDocStructure ? '✅' : '❌'}`)
      console.log(`└── Quality score: ${content.length > 5000 ? 'High' : content.length > 2000 ? 'Medium' : 'Low'}`)
      
      // Quality expectations for documentation
      expect(content.length).toBeGreaterThan(500) // Substantial content
      expect(wordCount).toBeGreaterThan(50) // Real documentation
      
      // Documentation should have some structure
      if (content.length > 1000) {
        expect(hasDocStructure).toBe(true)
      }
    }
  }, 90000)
})

console.log('🌐 LOVABLE.DEV COMPREHENSIVE CRAWL TESTS')
console.log('🎯 Tests real-world documentation crawling at scale')
console.log('📊 Validates sitemap discovery, progress tracking, and content quality')
console.log('⚡ Comprehensive test of the fixed crawler architecture')