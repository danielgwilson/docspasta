import { describe, it, expect } from 'vitest'
import { startCrawl } from '@/lib/crawler'
import { memoryStore } from '@/lib/storage/memory-store'

/**
 * END-TO-END VALIDATION TESTS
 * 
 * These tests validate the complete crawl pipeline to catch integration issues
 * that unit tests might miss. Specifically designed to catch the type of bugs
 * we just fixed where individual components work but the integration fails.
 */

describe('END-TO-END Crawler Validation', () => {
  describe('Complete Crawl Pipeline', () => {
    it('should successfully complete a real crawl without errors', async () => {
      console.log('🚀 Testing complete crawl pipeline...')
      
      const testUrl = 'https://httpbin.org/html'
      
      // This replicates the exact API call that was failing
      const crawlId = await startCrawl(testUrl, {
        maxPages: 5,
        maxDepth: 2,
        followExternalLinks: false,
        respectRobots: true,
        delayMs: 100, // Faster for tests
        qualityThreshold: 20, // Lower threshold
        includePaths: [], // The exact scenario that was broken
        excludePaths: [], // The exact scenario that was broken
      })

      expect(crawlId).toBeTruthy()
      console.log(`✅ Crawl started with ID: ${crawlId}`)

      // Wait for completion with timeout
      let attempts = 0
      let crawlResult
      let completed = false

      while (attempts < 30 && !completed) { // 30 seconds max
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        crawlResult = memoryStore.getCrawl(crawlId)
        console.log(`📊 Attempt ${attempts + 1}: Status = ${crawlResult?.status}`)
        
        if (crawlResult?.status === 'completed') {
          completed = true
          break
        } else if (crawlResult?.status === 'error') {
          console.error(`❌ Crawl failed: ${crawlResult.error}`)
          throw new Error(`Crawl failed: ${crawlResult.error}`)
        }
        
        attempts++
      }

      // Verify successful completion
      expect(completed).toBe(true)
      expect(crawlResult?.status).toBe('completed')
      expect(crawlResult?.markdown).toBeTruthy()
      expect(crawlResult?.markdown?.length).toBeGreaterThan(100)

      console.log(`✅ E2E crawl completed successfully`)
      console.log(`📊 Extracted ${crawlResult?.markdown?.length} characters`)
      console.log(`📄 Content preview: ${crawlResult?.markdown?.substring(0, 100)}...`)
      
    }, 35000) // 35 second timeout

    it('should handle multiple concurrent crawls without interference', async () => {
      console.log('🔄 Testing concurrent crawl handling...')
      
      const testUrls = [
        'https://httpbin.org/html',
        'https://httpbin.org/json',
      ]
      
      // Start multiple crawls concurrently
      const crawlPromises = testUrls.map(url => 
        startCrawl(url, {
          maxPages: 3,
          maxDepth: 1,
          delayMs: 100,
          qualityThreshold: 20,
        })
      )
      
      const crawlIds = await Promise.all(crawlPromises)
      
      crawlIds.forEach((crawlId, index) => {
        expect(crawlId).toBeTruthy()
        console.log(`✅ Concurrent crawl ${index + 1} started: ${crawlId}`)
      })
      
      // Wait for all to complete
      const completionPromises = crawlIds.map(async (crawlId) => {
        let attempts = 0
        while (attempts < 20) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          const result = memoryStore.getCrawl(crawlId)
          if (result?.status === 'completed' || result?.status === 'error') {
            return result
          }
          attempts++
        }
        throw new Error(`Crawl ${crawlId} did not complete in time`)
      })
      
      const results = await Promise.all(completionPromises)
      
      results.forEach((result, index) => {
        expect(result.status).toBe('completed')
        expect(result.markdown).toBeTruthy()
        console.log(`✅ Concurrent crawl ${index + 1} completed successfully`)
      })
      
    }, 25000) // 25 second timeout
  })

  describe('Error Scenario Prevention', () => {
    it('should NOT return "No content could be extracted" for valid URLs', async () => {
      console.log('🔍 Testing error scenario prevention...')
      
      // Test URLs that should always work
      const reliableUrls = [
        'https://httpbin.org/html',
      ]
      
      for (const url of reliableUrls) {
        console.log(`Testing reliable URL: ${url}`)
        
        const crawlId = await startCrawl(url, {
          maxPages: 2,
          maxDepth: 1,
          qualityThreshold: 10, // Very low threshold
          delayMs: 100,
        })
        
        // Wait for completion
        let attempts = 0
        let result
        
        while (attempts < 20) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          result = memoryStore.getCrawl(crawlId)
          
          if (result?.status === 'completed' || result?.status === 'error') {
            break
          }
          attempts++
        }
        
        // The bug we fixed would cause status: 'error' with message "No content could be extracted"
        expect(result?.status).toBe('completed')
        expect(result?.error).not.toContain('No content could be extracted')
        
        console.log(`✅ URL ${url} completed without "No content" error`)
      }
    }, 25000)

    it('should handle edge case URL formats gracefully', async () => {
      console.log('🔧 Testing edge case URL handling...')
      
      // URLs that could trigger edge cases in validation
      const edgeCaseUrls = [
        'https://httpbin.org/html/', // Trailing slash
        'https://httpbin.org/html?param=1', // Query params
        'https://httpbin.org/html#section', // Fragment
      ]
      
      for (const url of edgeCaseUrls) {
        try {
          const crawlId = await startCrawl(url, {
            maxPages: 1,
            maxDepth: 1,
            qualityThreshold: 10,
            delayMs: 100,
          })
          
          expect(crawlId).toBeTruthy()
          console.log(`✅ Edge case URL handled: ${url}`)
          
          // Don't wait for completion, just verify it starts without throwing
          
        } catch (error) {
          console.error(`❌ Edge case URL failed: ${url}`, error)
          throw error
        }
      }
    })
  })

  describe('Configuration Validation', () => {
    it('should handle various option combinations without breaking', async () => {
      console.log('⚙️  Testing option combination handling...')
      
      const optionCombinations = [
        // Minimal options
        {},
        
        // Include/exclude paths (the bug scenario)
        { 
          includePaths: [],
          excludePaths: [],
        },
        
        // Specific include paths
        {
          includePaths: ['/html'],
          maxPages: 1,
        },
        
        // Mixed options
        {
          maxPages: 2,
          maxDepth: 1,
          qualityThreshold: 15,
          delayMs: 50,
        }
      ]
      
      const testUrl = 'https://httpbin.org/html'
      
      for (const [index, options] of optionCombinations.entries()) {
        console.log(`Testing option combination ${index + 1}:`, options)
        
        try {
          const crawlId = await startCrawl(testUrl, options)
          expect(crawlId).toBeTruthy()
          
          console.log(`✅ Option combination ${index + 1} started successfully`)
          
        } catch (error) {
          console.error(`❌ Option combination ${index + 1} failed:`, error)
          throw error
        }
      }
    })
  })
})

console.log('🔄 END-TO-END VALIDATION TESTS')
console.log('🎯 Complete pipeline testing to catch integration failures')
console.log('🔒 Prevents regressions in the full crawl workflow')
console.log('⚡ Tests real HTTP requests with actual content extraction')