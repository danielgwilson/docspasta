/**
 * Integration test specifically for Lovable docs
 * Tests the ModernCrawler with a real documentation site
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { ModernCrawler } from '../lib/crawler/modern-crawler'
import { memoryStore } from '../lib/storage/memory-store'
import * as redis from '../lib/redis'

describe('Lovable Docs Integration Test', () => {
  const TEST_URL = 'https://docs.lovable.dev'
  const EXPECTED_MIN_PAGES = 20 // Conservative estimate
  const CRAWL_ID = `test_lovable_${Date.now()}`

  beforeAll(async () => {
    // Clear any existing test data
    memoryStore.clearOldCrawls(0) // Clear all crawls
    
    // Mock Redis to avoid external dependencies in tests
    vi.spyOn(redis, 'isUrlDiscovered').mockResolvedValue(false)
    vi.spyOn(redis, 'addDiscoveredUrl').mockResolvedValue(true)
    vi.spyOn(redis, 'getCachedRobotsTxt').mockResolvedValue(null)
    vi.spyOn(redis, 'cacheRobotsTxt').mockResolvedValue()
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('should crawl Lovable docs and discover all pages dynamically', async () => {
    // Initialize crawl in memory store (like startCrawl does)
    memoryStore.setCrawl(CRAWL_ID, {
      id: CRAWL_ID,
      url: TEST_URL,
      status: 'started',
      progress: {
        currentUrl: TEST_URL,
        pageCount: 0,
        totalPages: 1,
        status: 'Initializing'
      },
      createdAt: new Date().toISOString()
    })

    const crawler = new ModernCrawler({
      maxPages: 100,
      maxDepth: 3,
      concurrency: 5,
      pageTimeout: 10000,
      qualityThreshold: 30,
      useSitemap: true,
      respectRobots: true
    })

    const progressUpdates: Array<{ pageCount: number; totalDiscovered: number; status: string }> = []
    let finalProgress: { pageCount: number; totalDiscovered: number; status: string } | null = null

    // Track progress updates
    crawler.on('progress', (progress) => {
      progressUpdates.push({
        pageCount: progress.pageCount,
        totalDiscovered: progress.totalDiscovered,
        status: progress.status
      })
      finalProgress = progress
    })

    // Track completion
    let completedPages: Array<{ url: string; title: string; content: string; depth: number; qualityScore: number }> = []
    crawler.on('completed', (pages) => {
      completedPages = pages
    })

    // Start crawl
    console.log(`🧪 Starting Lovable docs integration test...`)
    const startTime = Date.now()
    
    await crawler.crawl(TEST_URL, CRAWL_ID)
    
    const duration = Date.now() - startTime
    console.log(`✅ Crawl completed in ${duration}ms`)

    // Verify results
    const crawlResult = memoryStore.getCrawl(CRAWL_ID)
    expect(crawlResult).toBeTruthy()
    expect(crawlResult?.status).toBe('completed')
    
    // Check that we discovered more than initial sitemap URLs
    expect(finalProgress?.totalDiscovered).toBeGreaterThanOrEqual(EXPECTED_MIN_PAGES)
    
    // Check that we actually crawled pages
    expect(completedPages.length).toBeGreaterThan(0)
    expect(completedPages.length).toBeLessThanOrEqual(100) // Respect maxPages
    
    // Verify quality filtering worked
    const qualityScores = completedPages.map(p => p.qualityScore)
    expect(Math.min(...qualityScores)).toBeGreaterThanOrEqual(30)
    
    // Check progress updates were frequent
    expect(progressUpdates.length).toBeGreaterThan(10) // Should have many updates
    
    // Verify progress tracking improved over time
    const firstUpdate = progressUpdates[0]
    const lastUpdate = progressUpdates[progressUpdates.length - 1]
    expect(lastUpdate.totalDiscovered).toBeGreaterThan(firstUpdate.totalDiscovered)
    
    // Log summary
    console.log(`📊 Test Results:`)
    console.log(`  - Total URLs discovered: ${finalProgress?.totalDiscovered}`)
    console.log(`  - Pages successfully crawled: ${completedPages.length}`)
    console.log(`  - Average quality score: ${Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length)}`)
    console.log(`  - Progress updates: ${progressUpdates.length}`)
  }, 60000) // 60 second timeout for real crawl

  it('should handle progress tracking correctly', async () => {
    const testCrawlId = `${CRAWL_ID}_progress`
    
    // Initialize crawl in memory store
    memoryStore.setCrawl(testCrawlId, {
      id: testCrawlId,
      url: TEST_URL,
      status: 'started',
      progress: {
        currentUrl: TEST_URL,
        pageCount: 0,
        totalPages: 1,
        status: 'Initializing'
      },
      createdAt: new Date().toISOString()
    })

    const crawler = new ModernCrawler({
      maxPages: 10,
      maxDepth: 2,
      concurrency: 3,
      qualityThreshold: 40
    })

    const progressSnapshots: Array<{ pageCount: number; totalDiscovered: number; queueSize: number; inProgress: number }> = []
    
    crawler.on('progress', (progress) => {
      // Only record significant changes
      const last = progressSnapshots[progressSnapshots.length - 1]
      if (!last || 
          last.pageCount !== progress.pageCount || 
          last.totalDiscovered !== progress.totalDiscovered) {
        progressSnapshots.push({
          pageCount: progress.pageCount,
          totalDiscovered: progress.totalDiscovered,
          queueSize: progress.queueSize,
          inProgress: progress.inProgress
        })
      }
    })

    await crawler.crawl(TEST_URL, testCrawlId)

    // Verify progress tracking behavior
    expect(progressSnapshots.length).toBeGreaterThan(2)
    
    // First snapshot should show initial state
    expect(progressSnapshots[0].pageCount).toBe(0)
    expect(progressSnapshots[0].totalDiscovered).toBeGreaterThan(0)
    
    // Progress should increase monotonically
    for (let i = 1; i < progressSnapshots.length; i++) {
      const prev = progressSnapshots[i - 1]
      const curr = progressSnapshots[i]
      
      // Total discovered should only increase or stay same
      expect(curr.totalDiscovered).toBeGreaterThanOrEqual(prev.totalDiscovered)
      
      // Page count should only increase or stay same
      expect(curr.pageCount).toBeGreaterThanOrEqual(prev.pageCount)
    }
  }, 30000)
})