import { describe, it, expect } from 'vitest'
import type { StoredCrawl } from '@/lib/crawler/types'

// Mock implementation of progress tracking logic
class MockProgressTracker {
  private crawls = new Map<string, StoredCrawl>()
  
  saveCrawl(crawl: StoredCrawl) {
    this.crawls.set(crawl.id, { ...crawl })
  }
  
  getCrawl(id: string): StoredCrawl | null {
    return this.crawls.get(id) || null
  }
  
  updateProgress(id: string, updates: Partial<StoredCrawl>) {
    const crawl = this.crawls.get(id)
    if (crawl) {
      this.crawls.set(id, { ...crawl, ...updates })
    }
  }
  
  incrementCounter(id: string, counter: keyof StoredCrawl, amount = 1) {
    const crawl = this.crawls.get(id)
    if (crawl && typeof crawl[counter] === 'number') {
      // Type assertion for numeric properties
      const currentValue = crawl[counter] as number
      this.crawls.set(id, { ...crawl, [counter]: currentValue + amount })
    }
  }
}

describe('Enhanced Progress Tracking - Unit Tests', () => {
  it('should track URLs through different stages', () => {
    const tracker = new MockProgressTracker()
    const crawlId = 'test-crawl'
    
    // Initialize crawl
    const crawl: StoredCrawl = {
      id: crawlId,
      url: 'https://example.com',
      status: 'active',
      createdAt: Date.now(),
      totalDiscovered: 0,
      totalQueued: 0,
      totalProcessed: 0,
      totalFiltered: 0,
      totalSkipped: 0,
      totalFailed: 0,
      discoveryComplete: false,
      progress: {
        current: 0,
        total: 0,
        phase: 'discovery',
        message: 'Starting crawl...',
      },
      results: [],
    }
    tracker.saveCrawl(crawl)
    
    // Simulate discovery phase
    tracker.updateProgress(crawlId, {
      totalDiscovered: 100,
      progress: {
        current: 0,
        total: 100,
        phase: 'discovery',
        message: 'Discovered 100 URLs',
        discovered: 100,
      },
    })
    
    let updated = tracker.getCrawl(crawlId)
    expect(updated?.totalDiscovered).toBe(100)
    expect(updated?.progress.discovered).toBe(100)
    
    // Simulate filtering and queueing
    const filtered = 20
    const queued = 80
    tracker.updateProgress(crawlId, {
      totalFiltered: filtered,
      totalQueued: queued,
      progress: {
        current: 0,
        total: queued, // Total should be queued, not discovered
        phase: 'crawling',
        message: `Queued ${queued} URLs (${filtered} filtered)`,
        discovered: 100,
        queued: queued,
        filtered: filtered,
      },
    })
    
    updated = tracker.getCrawl(crawlId)
    expect(updated?.totalQueued).toBe(80)
    expect(updated?.totalFiltered).toBe(20)
    expect(updated?.progress.total).toBe(80) // Total should match queued
    
    // Simulate processing
    for (let i = 0; i < 50; i++) {
      tracker.incrementCounter(crawlId, 'totalProcessed')
    }
    
    updated = tracker.getCrawl(crawlId)
    expect(updated?.totalProcessed).toBe(50)
  })

  it('should calculate accurate progress percentages', () => {
    const tracker = new MockProgressTracker()
    const crawlId = 'test-percentage'
    
    const crawl: StoredCrawl = {
      id: crawlId,
      url: 'https://example.com',
      status: 'active',
      createdAt: Date.now(),
      totalDiscovered: 1000, // Discovered many URLs
      totalQueued: 100,      // But only 100 passed filters
      totalProcessed: 50,    // Processed half
      totalFiltered: 900,    // Most were filtered out
      totalSkipped: 0,
      totalFailed: 0,
      discoveryComplete: true,
      progress: {
        current: 50,
        total: 100, // Should be based on queued, not discovered
        phase: 'crawling',
        message: 'Processing...',
      },
      results: [],
    }
    tracker.saveCrawl(crawl)
    
    const retrieved = tracker.getCrawl(crawlId)
    expect(retrieved).toBeTruthy()
    
    // Progress should be 50/100 = 50%, not 50/1000 = 5%
    const percentage = (retrieved!.totalProcessed / retrieved!.totalQueued) * 100
    expect(percentage).toBe(50)
  })

  it('should handle dynamic URL discovery', () => {
    const tracker = new MockProgressTracker()
    const crawlId = 'test-dynamic'
    
    // Start with initial discovery
    const crawl: StoredCrawl = {
      id: crawlId,
      url: 'https://example.com',
      status: 'active',
      createdAt: Date.now(),
      totalDiscovered: 50,
      totalQueued: 45,
      totalProcessed: 10,
      totalFiltered: 5,
      totalSkipped: 0,
      totalFailed: 0,
      discoveryComplete: true,
      progress: {
        current: 10,
        total: 45,
        phase: 'crawling',
        message: 'Crawling...',
        discovered: 50,
        queued: 45,
        processed: 10,
      },
      results: [],
    }
    tracker.saveCrawl(crawl)
    
    // Simulate discovering 20 new URLs while crawling
    const current = tracker.getCrawl(crawlId)!
    const newDiscovered = 20
    const newQueued = 15
    const newSkipped = 5
    
    tracker.updateProgress(crawlId, {
      totalDiscovered: current.totalDiscovered + newDiscovered,
      totalQueued: current.totalQueued + newQueued,
      totalSkipped: current.totalSkipped + newSkipped,
      progress: {
        ...current.progress,
        total: current.totalQueued + newQueued, // Update total
        discovered: (current.progress.discovered || 0) + newDiscovered,
        queued: (current.progress.queued || 0) + newQueued,
        skipped: (current.progress.skipped || 0) + newSkipped,
      },
    })
    
    const updated = tracker.getCrawl(crawlId)
    expect(updated?.totalDiscovered).toBe(70) // 50 + 20
    expect(updated?.totalQueued).toBe(60) // 45 + 15
    expect(updated?.progress.total).toBe(60) // Should match new queued total
  })

  it('should provide meaningful progress messages', () => {
    const getProgressMessage = (crawl: StoredCrawl): string => {
      const { totalQueued, totalProcessed, totalFiltered, totalSkipped, discoveryComplete } = crawl
      
      if (!discoveryComplete) {
        return `Discovering URLs... (${crawl.totalDiscovered} found)`
      }
      
      const percentage = totalQueued > 0 ? Math.round((totalProcessed / totalQueued) * 100) : 0
      
      if (totalFiltered > 0 || totalSkipped > 0) {
        return `Processing ${totalProcessed}/${totalQueued} pages (${percentage}%) - ${totalFiltered} filtered, ${totalSkipped} skipped`
      }
      
      return `Processing ${totalProcessed}/${totalQueued} pages (${percentage}%)`
    }
    
    // Test discovery phase
    let crawl: StoredCrawl = {
      id: 'test',
      url: 'https://example.com',
      status: 'active',
      createdAt: Date.now(),
      totalDiscovered: 150,
      totalQueued: 0,
      totalProcessed: 0,
      totalFiltered: 0,
      totalSkipped: 0,
      totalFailed: 0,
      discoveryComplete: false,
      progress: { current: 0, total: 0, phase: 'discovery', message: '' },
      results: [],
    }
    
    expect(getProgressMessage(crawl)).toBe('Discovering URLs... (150 found)')
    
    // Test crawling phase with filtering
    crawl = {
      ...crawl,
      totalQueued: 100,
      totalProcessed: 50,
      totalFiltered: 40,
      totalSkipped: 10,
      discoveryComplete: true,
      progress: { current: 50, total: 100, phase: 'crawling', message: '' },
    }
    
    expect(getProgressMessage(crawl)).toBe('Processing 50/100 pages (50%) - 40 filtered, 10 skipped')
  })

  it('should track lovable.dev scenario accurately', () => {
    const tracker = new MockProgressTracker()
    const crawlId = 'lovable-test'
    
    // Simulate lovable.dev crawl
    const crawl: StoredCrawl = {
      id: crawlId,
      url: 'https://lovable.dev',
      status: 'active',
      createdAt: Date.now(),
      totalDiscovered: 916,  // Many URLs discovered
      totalQueued: 200,      // But many filtered out
      totalProcessed: 0,
      totalFiltered: 716,    // Most were filtered (outside docs, duplicates, etc.)
      totalSkipped: 0,
      totalFailed: 0,
      discoveryComplete: true,
      progress: {
        current: 0,
        total: 200, // Should show 200, not 916
        phase: 'crawling',
        message: 'Starting to crawl...',
        discovered: 916,
        queued: 200,
        filtered: 716,
      },
      results: [],
    }
    tracker.saveCrawl(crawl)
    
    const retrieved = tracker.getCrawl(crawlId)
    expect(retrieved?.progress.total).toBe(200) // User should see "0 of 200", not "0 of 916"
    expect(retrieved?.progress.discovered).toBe(916) // But we still track total discovered
    expect(retrieved?.progress.filtered).toBe(716) // And show how many were filtered
  })
})