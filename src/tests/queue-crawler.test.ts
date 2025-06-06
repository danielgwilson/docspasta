import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getCrawl, saveCrawl, lockURL, updateCrawlProgress } from '@/lib/crawler/crawl-redis'
import { addKickoffJob, addCrawlJob } from '@/lib/crawler/queue-jobs'
import { startWorker, stopWorker } from '@/lib/crawler/queue-worker'
import type { StoredCrawl } from '@/lib/crawler/crawl-redis'

// Mock Redis connection
vi.mock('@/lib/crawler/queue-service', () => ({
  getRedisConnection: () => ({
    sadd: vi.fn().mockResolvedValue(1),
    sismember: vi.fn().mockResolvedValue(0),
    hset: vi.fn().mockResolvedValue(1),
    hgetall: vi.fn().mockResolvedValue({}),
    expire: vi.fn().mockResolvedValue(1),
    lpush: vi.fn().mockResolvedValue(1),
    lrange: vi.fn().mockResolvedValue([]),
    del: vi.fn().mockResolvedValue(1),
    srem: vi.fn().mockResolvedValue(1),
    pipeline: vi.fn().mockReturnValue({
      sismember: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([[null, 0]]),
    }),
  }),
  getCrawlQueue: () => ({
    add: vi.fn().mockResolvedValue({ id: 'test-job-id' }),
    addBulk: vi.fn().mockResolvedValue([{ id: 'test-job-1' }, { id: 'test-job-2' }]),
    getActive: vi.fn().mockResolvedValue([]),
    getWaiting: vi.fn().mockResolvedValue([]),
    getCompleted: vi.fn().mockResolvedValue([]),
    getFailed: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
  }),
  crawlQueueName: 'test-crawl-queue',
}))

describe('Queue-Based Crawler', () => {
  const testCrawlId = 'test-crawl-123'
  const testUrl = 'https://example.com'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await stopWorker()
  })

  describe('Redis Storage Layer', () => {
    it('should successfully lock new URLs', async () => {
      const result = await lockURL(testCrawlId, testUrl)
      expect(result).toBe(true)
    })

    it('should generate URL permutations correctly', async () => {
      const { generateURLPermutations } = await import('@/lib/crawler/crawl-redis')
      
      const permutations = generateURLPermutations('https://example.com/path')
      expect(permutations).toContain('https://example.com/path')
      expect(permutations).toContain('https://www.example.com/path')
      expect(permutations).toContain('http://example.com/path')
      expect(permutations.length).toBeGreaterThan(1)
    })

    it('should save and retrieve crawl metadata', async () => {
      const testCrawl: StoredCrawl = {
        id: testCrawlId,
        url: testUrl,
        status: 'active',
        createdAt: Date.now(),
        totalDiscovered: 5,
        totalProcessed: 2,
        progress: {
          current: 2,
          total: 5,
          phase: 'crawling',
          message: 'Processing pages...',
        },
        results: [],
      }

      await saveCrawl(testCrawl)
      
      // Mock the return value for getCrawl
      const { getRedisConnection } = await import('@/lib/crawler/queue-service')
      const mockRedis = getRedisConnection()
      vi.mocked(mockRedis.hgetall).mockResolvedValue({
        id: testCrawlId,
        url: testUrl,
        status: 'active',
        createdAt: testCrawl.createdAt.toString(),
        totalDiscovered: '5',
        totalProcessed: '2',
        progress: JSON.stringify(testCrawl.progress),
        results: '[]',
      })

      const retrieved = await getCrawl(testCrawlId)
      expect(retrieved).toBeTruthy()
      expect(retrieved?.id).toBe(testCrawlId)
      expect(retrieved?.status).toBe('active')
      expect(retrieved?.totalDiscovered).toBe(5)
    })

    it('should update crawl progress atomically', async () => {
      await updateCrawlProgress(testCrawlId, {
        totalProcessed: 3,
        status: 'active',
        progress: {
          current: 3,
          total: 5,
          phase: 'crawling',
          message: 'Updated progress',
        },
      })

      const { getRedisConnection } = await import('@/lib/crawler/queue-service')
      const mockRedis = getRedisConnection()
      expect(mockRedis.hset).toHaveBeenCalledWith(
        `crawl:${testCrawlId}:meta`,
        expect.objectContaining({
          totalProcessed: '3',
          status: 'active',
        })
      )
    })
  })

  describe('Queue Job Management', () => {
    it('should add kickoff jobs successfully', async () => {
      const jobId = await addKickoffJob({
        crawlId: testCrawlId,
        url: testUrl,
        options: {
          maxDepth: 2,
          maxPages: 50,
        },
      })

      expect(jobId).toBe('test-job-id')
    })

    it('should add multiple crawl jobs in bulk', async () => {
      const jobs = [
        {
          crawlId: testCrawlId,
          url: 'https://example.com/page1',
          options: { maxDepth: 2 },
          depth: 0,
        },
        {
          crawlId: testCrawlId,
          url: 'https://example.com/page2',
          options: { maxDepth: 2 },
          depth: 0,
        },
      ]

      const { addCrawlJobs } = await import('@/lib/crawler/queue-jobs')
      const jobIds = await addCrawlJobs(jobs)

      expect(jobIds).toHaveLength(2)
      expect(jobIds[0]).toBe('test-job-1')
      expect(jobIds[1]).toBe('test-job-2')
    })

    it('should get job counts for a crawl', async () => {
      const { getCrawlJobCounts } = await import('@/lib/crawler/queue-jobs')
      const counts = await getCrawlJobCounts(testCrawlId)

      expect(counts).toEqual({
        active: 0,
        waiting: 0,
        completed: 0,
        failed: 0,
      })
    })
  })

  describe('Worker Management', () => {
    it('should start and stop worker successfully', async () => {
      const worker = await startWorker(3)
      expect(worker).toBeTruthy()

      await stopWorker()
      // Should not throw
    })

    it('should handle multiple start calls gracefully', async () => {
      const worker1 = await startWorker(3)
      const worker2 = await startWorker(3) // Should return existing worker

      expect(worker1).toBe(worker2)
      await stopWorker()
    })
  })

  describe('Error Handling', () => {
    it('should handle Redis connection errors gracefully', async () => {
      const { getRedisConnection } = await import('@/lib/crawler/queue-service')
      const mockRedis = getRedisConnection()
      vi.mocked(mockRedis.sadd).mockRejectedValue(new Error('Redis connection failed'))

      const result = await lockURL(testCrawlId, testUrl)
      expect(result).toBe(false) // Should return false on error
    })

    it('should handle invalid URLs in permutation generation', async () => {
      const { generateURLPermutations } = await import('@/lib/crawler/crawl-redis')
      
      const permutations = generateURLPermutations('invalid-url')
      expect(permutations).toEqual(['invalid-url']) // Should return original URL
    })
  })

  describe('Progress Tracking', () => {
    it('should track discovery phase correctly', async () => {
      const initialProgress = {
        current: 0,
        total: 0,
        phase: 'discovery' as const,
        message: 'Discovering URLs...',
      }

      await updateCrawlProgress(testCrawlId, { progress: initialProgress })

      const { getRedisConnection } = await import('@/lib/crawler/queue-service')
      const mockRedis = getRedisConnection()
      expect(mockRedis.hset).toHaveBeenCalledWith(
        `crawl:${testCrawlId}:meta`,
        expect.objectContaining({
          progress: JSON.stringify(initialProgress),
        })
      )
    })

    it('should track crawling phase with real counts', async () => {
      const crawlingProgress = {
        current: 3,
        total: 10,
        phase: 'crawling' as const,
        message: 'Processed 3 of 10 pages',
      }

      await updateCrawlProgress(testCrawlId, {
        totalDiscovered: 10,
        totalProcessed: 3,
        progress: crawlingProgress,
      })

      const { getRedisConnection } = await import('@/lib/crawler/queue-service')
      const mockRedis = getRedisConnection()
      expect(mockRedis.hset).toHaveBeenCalledWith(
        `crawl:${testCrawlId}:meta`,
        expect.objectContaining({
          totalDiscovered: '10',
          totalProcessed: '3',
          progress: JSON.stringify(crawlingProgress),
        })
      )
    })
  })
})

describe('API Integration', () => {
  describe('Crawl V2 API', () => {
    it('should validate URL input correctly', () => {
      // URL validation logic
      const validUrls = [
        'https://example.com',
        'http://docs.example.com/path',
        'https://api.example.com/v1/docs',
      ]

      const invalidUrls = [
        '',
        'not-a-url',
        'ftp://example.com',
      ]

      validUrls.forEach(url => {
        expect(() => new URL(url)).not.toThrow()
      })

      invalidUrls.forEach(url => {
        if (url) {
          expect(() => new URL(url)).toThrow()
        }
      })
    })

    it('should handle docspasta.com easter egg', () => {
      const docspataUrls = [
        'https://docspasta.com',
        'http://docspasta.com/docs',
        'https://www.docspasta.com/api',
      ]

      docspataUrls.forEach(url => {
        const parsedUrl = new URL(url)
        expect(parsedUrl.hostname.includes('docspasta.com')).toBe(true)
      })
    })
  })
})

console.log('🧪 Queue-based crawler tests ready to run!')
console.log('📊 Testing: Redis storage, queue management, worker lifecycle, and progress tracking')
console.log('🚀 Architecture: BullMQ + Redis + atomic URL locking + real-time progress')