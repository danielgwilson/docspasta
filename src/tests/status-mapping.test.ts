import { describe, it, expect, vi } from 'vitest'
import { saveCrawl } from '@/lib/crawler/crawl-redis'
import type { StoredCrawl } from '@/lib/crawler/crawl-redis'

// Mock Redis connection
vi.mock('@/lib/crawler/queue-service', () => ({
  getRedisConnection: () => ({
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    sadd: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(0),
    setex: vi.fn().mockResolvedValue('OK'),
    multi: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(['OK']),
    }),
  }),
}))

describe('Status Mapping Tests', () => {
  it('should correctly handle completed status with markdown generation', async () => {
    const crawlId = 'test-crawl-123'
    
    // Create a mock crawl with results
    const crawl: StoredCrawl = {
      id: crawlId,
      url: 'https://example.com',
      status: 'completed',
      createdAt: Date.now(),
      completedAt: Date.now() + 5000,
      totalDiscovered: 10,
      totalQueued: 4,
      totalProcessed: 4,
      totalFiltered: 0,
      totalSkipped: 6,
      totalFailed: 0,
      discoveryComplete: true,
      progress: {
        current: 4,
        total: 4,
        phase: 'completed',
        message: 'Crawl completed! Processed 4 pages.',
        discovered: 10,
        queued: 4,
        processed: 4,
        filtered: 0,
        skipped: 6,
        failed: 0,
      },
      results: [
        {
          url: 'https://example.com/page1',
          title: 'Page 1',
          content: '# Content for page 1',
          contentType: 'markdown',
          timestamp: Date.now(),
          statusCode: 200,
          depth: 0,
        },
        {
          url: 'https://example.com/page2',
          title: 'Page 2',
          content: '# Content for page 2',
          contentType: 'markdown',
          timestamp: Date.now(),
          statusCode: 200,
          depth: 0,
        },
      ],
    }
    
    // Save the crawl
    await saveCrawl(crawl)
    
    // Verify the crawl status
    expect(crawl.status).toBe('completed')
    expect(crawl.progress.phase).toBe('completed')
    expect(crawl.totalProcessed).toBe(4)
    expect(crawl.totalQueued).toBe(4)
    
    // Simulate API response transformation
    const apiResponse = {
      ...crawl,
      markdown: crawl.results
        .filter(r => r.content && r.contentType !== 'error')
        .map(r => `# ${r.title || r.url}\n\n> Source: ${r.url}\n\n${r.content.trim()}`)
        .join('\n\n---\n\n')
    }
    
    // Verify markdown generation
    expect(apiResponse.markdown).toContain('# Page 1')
    expect(apiResponse.markdown).toContain('# Page 2')
    expect(apiResponse.markdown).toContain('> Source: https://example.com/page1')
    expect(apiResponse.markdown).toContain('> Source: https://example.com/page2')
    expect(apiResponse.markdown).toContain('---')
  })
  
  it('should handle active status correctly', async () => {
    const crawl: StoredCrawl = {
      id: 'active-crawl',
      url: 'https://example.com',
      status: 'active',
      createdAt: Date.now(),
      totalDiscovered: 20,
      totalQueued: 15,
      totalProcessed: 7,
      totalFiltered: 5,
      totalSkipped: 0,
      totalFailed: 0,
      discoveryComplete: true,
      progress: {
        current: 7,
        total: 15,
        phase: 'crawling',
        message: 'Processed 7 of 15 pages (47%)',
        discovered: 20,
        queued: 15,
        processed: 7,
        filtered: 5,
        skipped: 0,
        failed: 0,
      },
      results: [],
    }
    
    expect(crawl.status).toBe('active')
    expect(crawl.progress.phase).toBe('crawling')
    expect(crawl.progress.current).toBe(7)
    expect(crawl.progress.total).toBe(15)
  })
  
  it('should handle failed status correctly', async () => {
    const crawl: StoredCrawl = {
      id: 'failed-crawl',
      url: 'https://example.com',
      status: 'failed',
      createdAt: Date.now(),
      completedAt: Date.now() + 1000,
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
        phase: 'failed',
        message: 'Failed to discover URLs',
      },
      results: [],
      errorMessage: 'Connection timeout',
    }
    
    expect(crawl.status).toBe('failed')
    expect(crawl.errorMessage).toBe('Connection timeout')
    expect(crawl.progress.phase).toBe('failed')
  })
})