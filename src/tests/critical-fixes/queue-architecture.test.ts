import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { V4QueueWorker } from '@/lib/v4/queue-worker'
import { createRedisClient } from '@/lib/v4/redis-client'
import { V4WebCrawler } from '@/lib/v4/web-crawler'
import { createHash } from 'crypto'

vi.mock('@/lib/v4/redis-client')
vi.mock('@/lib/v4/web-crawler')

describe('Queue-Based Worker Architecture - Critical Fix Tests', () => {
  let worker: V4QueueWorker
  let mockRedis: any
  let mockCrawler: any
  
  beforeEach(() => {
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      xadd: vi.fn(),
      hset: vi.fn(),
      hget: vi.fn(),
      hincrby: vi.fn(),
      lpush: vi.fn(),
      brpop: vi.fn(),
      quit: vi.fn(),
      disconnect: vi.fn(),
      multi: vi.fn().mockReturnThis(),
      exec: vi.fn(),
    }
    
    mockCrawler = {
      crawlUrl: vi.fn(),
      discoverUrls: vi.fn(),
    }
    
    vi.mocked(createRedisClient).mockResolvedValue(mockRedis)
    vi.mocked(V4WebCrawler).mockImplementation(() => mockCrawler)
    
    worker = new V4QueueWorker()
  })
  
  afterEach(async () => {
    await worker.stop()
    vi.clearAllMocks()
  })
  
  describe('Event-Driven Architecture', () => {
    it('should process jobs in event-driven manner without polling', async () => {
      const crawlId = 'test-crawl-123'
      const job = {
        id: 'job-1',
        type: 'crawl' as const,
        crawlId,
        url: 'https://example.com/page1',
        depth: 0
      }
      
      // Mock job queue response
      mockRedis.brpop.mockResolvedValueOnce([
        'v4:queue:crawl',
        JSON.stringify(job)
      ])
      
      // Mock crawl data
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        url: 'https://example.com',
        maxPages: 10,
        maxDepth: 2
      }))
      
      // Mock crawler response
      mockCrawler.crawlUrl.mockResolvedValueOnce({
        url: 'https://example.com/page1',
        content: '# Test Content',
        links: ['https://example.com/page2'],
        error: null
      })
      
      // Start worker and let it process one job
      await worker.start()
      
      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Verify brpop was called (blocking pop)
      expect(mockRedis.brpop).toHaveBeenCalledWith(
        'v4:queue:kickoff',
        'v4:queue:crawl',
        'v4:queue:batch',
        0 // Blocking timeout
      )
      
      // Verify job was processed
      expect(mockCrawler.crawlUrl).toHaveBeenCalledWith('https://example.com/page1')
      
      // Verify progress event was emitted
      expect(mockRedis.xadd).toHaveBeenCalledWith(
        `crawl:${crawlId}:events`,
        '*',
        'event', 'progress',
        'data', expect.stringContaining('processed')
      )
    })
    
    it('should handle multiple job types with proper routing', async () => {
      const crawlId = 'test-crawl-456'
      
      // Mock different job types
      const kickoffJob = {
        id: 'kickoff-1',
        type: 'kickoff' as const,
        crawlId,
        url: 'https://example.com'
      }
      
      const crawlJob = {
        id: 'crawl-1',
        type: 'crawl' as const,
        crawlId,
        url: 'https://example.com/doc1',
        depth: 1
      }
      
      const batchJob = {
        id: 'batch-1',
        type: 'batch' as const,
        crawlId,
        urls: [
          { url: 'https://example.com/doc2', depth: 1 },
          { url: 'https://example.com/doc3', depth: 1 }
        ]
      }
      
      // Mock job queue responses in sequence
      mockRedis.brpop
        .mockResolvedValueOnce(['v4:queue:kickoff', JSON.stringify(kickoffJob)])
        .mockResolvedValueOnce(['v4:queue:crawl', JSON.stringify(crawlJob)])
        .mockResolvedValueOnce(['v4:queue:batch', JSON.stringify(batchJob)])
        .mockResolvedValue(null)
      
      // Mock crawl data
      mockRedis.get.mockResolvedValue(JSON.stringify({
        url: 'https://example.com',
        maxPages: 50,
        maxDepth: 2
      }))
      
      // Mock crawler responses
      mockCrawler.discoverUrls.mockResolvedValueOnce({
        urls: ['https://example.com/doc1', 'https://example.com/doc2', 'https://example.com/doc3'],
        sitemapUrls: [],
        error: null
      })
      
      mockCrawler.crawlUrl.mockResolvedValue({
        url: 'mocked',
        content: '# Mocked content',
        links: [],
        error: null
      })
      
      await worker.start()
      
      // Process all jobs
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // Verify each job type was processed
      expect(mockCrawler.discoverUrls).toHaveBeenCalledWith('https://example.com')
      expect(mockCrawler.crawlUrl).toHaveBeenCalledTimes(3) // 1 crawl + 2 batch
      
      // Verify proper event emissions
      expect(mockRedis.xadd).toHaveBeenCalledWith(
        expect.stringContaining('events'),
        '*',
        'event', 'discovered',
        'data', expect.any(String)
      )
    })
  })
  
  describe('Queue Reliability', () => {
    it('should handle job failures with proper error events', async () => {
      const crawlId = 'test-crawl-error'
      const job = {
        id: 'job-error',
        type: 'crawl' as const,
        crawlId,
        url: 'https://example.com/error',
        depth: 0
      }
      
      mockRedis.brpop.mockResolvedValueOnce(['v4:queue:crawl', JSON.stringify(job)])
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({ url: 'https://example.com' }))
      
      // Mock crawler error
      mockCrawler.crawlUrl.mockRejectedValueOnce(new Error('Network timeout'))
      
      await worker.start()
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Verify error event was emitted
      expect(mockRedis.xadd).toHaveBeenCalledWith(
        `crawl:${crawlId}:events`,
        '*',
        'event', 'error',
        'data', expect.stringContaining('Network timeout')
      )
      
      // Verify job wasn't requeued infinitely
      expect(mockRedis.lpush).not.toHaveBeenCalled()
    })
    
    it('should complete crawls atomically', async () => {
      const crawlId = 'test-crawl-complete'
      const job = {
        id: 'job-complete',
        type: 'crawl' as const,
        crawlId,
        url: 'https://example.com/final',
        depth: 0
      }
      
      // Setup initial state
      mockRedis.hget.mockResolvedValueOnce('9') // 9 pages processed
      mockRedis.get.mockResolvedValue(JSON.stringify({
        url: 'https://example.com',
        maxPages: 10,
        status: 'processing'
      }))
      
      mockRedis.brpop.mockResolvedValueOnce(['v4:queue:crawl', JSON.stringify(job)])
      
      mockCrawler.crawlUrl.mockResolvedValueOnce({
        url: 'https://example.com/final',
        content: '# Final page',
        links: [],
        error: null
      })
      
      // Mock transaction for atomic completion
      mockRedis.exec.mockResolvedValueOnce([
        10, // hincrby result
        'OK', // set result
        1 // xadd result
      ])
      
      await worker.start()
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Verify atomic transaction was used
      expect(mockRedis.multi).toHaveBeenCalled()
      expect(mockRedis.exec).toHaveBeenCalled()
      
      // Verify completed event
      expect(mockRedis.xadd).toHaveBeenCalledWith(
        `crawl:${crawlId}:events`,
        '*',
        'event', 'completed',
        'data', expect.any(String)
      )
    })
  })
  
  describe('Memory Management', () => {
    it('should not accumulate memory over multiple jobs', async () => {
      const crawlId = 'test-memory'
      const jobs = Array.from({ length: 100 }, (_, i) => ({
        id: `job-${i}`,
        type: 'crawl' as const,
        crawlId,
        url: `https://example.com/page${i}`,
        depth: 0
      }))
      
      // Mock continuous job processing
      let jobIndex = 0
      mockRedis.brpop.mockImplementation(async () => {
        if (jobIndex < jobs.length) {
          const job = jobs[jobIndex++]
          return ['v4:queue:crawl', JSON.stringify(job)]
        }
        // Block indefinitely after all jobs
        return new Promise(() => {})
      })
      
      mockRedis.get.mockResolvedValue(JSON.stringify({
        url: 'https://example.com',
        maxPages: 1000
      }))
      
      mockCrawler.crawlUrl.mockResolvedValue({
        url: 'mocked',
        content: '# Content',
        links: [],
        error: null
      })
      
      // Track memory usage
      const initialMemory = process.memoryUsage().heapUsed
      
      await worker.start()
      
      // Process all jobs
      await new Promise(resolve => setTimeout(resolve, 500))
      
      await worker.stop()
      
      const finalMemory = process.memoryUsage().heapUsed
      const memoryGrowth = finalMemory - initialMemory
      
      // Memory growth should be minimal (less than 10MB for 100 jobs)
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024)
      
      // Verify all jobs were processed
      expect(mockCrawler.crawlUrl).toHaveBeenCalledTimes(100)
    })
  })
  
  describe('Graceful Shutdown', () => {
    it('should stop processing cleanly on shutdown', async () => {
      const crawlId = 'test-shutdown'
      let jobCount = 0
      
      // Mock continuous jobs
      mockRedis.brpop.mockImplementation(async () => {
        jobCount++
        return [
          'v4:queue:crawl',
          JSON.stringify({
            id: `job-${jobCount}`,
            type: 'crawl',
            crawlId,
            url: `https://example.com/page${jobCount}`,
            depth: 0
          })
        ]
      })
      
      mockRedis.get.mockResolvedValue(JSON.stringify({ url: 'https://example.com' }))
      mockCrawler.crawlUrl.mockResolvedValue({ url: 'mocked', content: 'content', links: [], error: null })
      
      await worker.start()
      
      // Let it process a few jobs
      await new Promise(resolve => setTimeout(resolve, 200))
      
      const jobsBeforeStop = jobCount
      
      // Stop the worker
      await worker.stop()
      
      // Wait a bit more
      await new Promise(resolve => setTimeout(resolve, 200))
      
      // No more jobs should be processed after stop
      expect(jobCount).toBe(jobsBeforeStop)
      
      // Redis should be cleaned up
      expect(mockRedis.quit).toHaveBeenCalled()
    })
    
    it('should complete current job before shutting down', async () => {
      const crawlId = 'test-graceful'
      let processingComplete = false
      
      const job = {
        id: 'long-job',
        type: 'crawl' as const,
        crawlId,
        url: 'https://example.com/slow',
        depth: 0
      }
      
      mockRedis.brpop.mockResolvedValueOnce(['v4:queue:crawl', JSON.stringify(job)])
      mockRedis.get.mockResolvedValue(JSON.stringify({ url: 'https://example.com' }))
      
      // Simulate slow crawl
      mockCrawler.crawlUrl.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 300))
        processingComplete = true
        return { url: job.url, content: 'content', links: [], error: null }
      })
      
      await worker.start()
      
      // Start shutdown while job is processing
      setTimeout(() => worker.stop(), 100)
      
      // Wait for shutdown to complete
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Job should have completed
      expect(processingComplete).toBe(true)
      expect(mockRedis.xadd).toHaveBeenCalledWith(
        expect.stringContaining('events'),
        '*',
        'event', 'progress',
        'data', expect.any(String)
      )
    })
  })
})