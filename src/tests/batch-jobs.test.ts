import { describe, it, expect, beforeEach, vi } from 'vitest'
/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock queue and Redis with proper batch job support
const mockQueue = {
  add: vi.fn().mockResolvedValue({ id: 'test-job-id' }),
  addBulk: vi.fn().mockResolvedValue([
    { id: 'batch-job-1' }, 
    { id: 'batch-job-2' }, 
    { id: 'batch-job-3' }
  ]),
  getActive: vi.fn().mockResolvedValue([]),
  getWaiting: vi.fn().mockResolvedValue([]),
  getCompleted: vi.fn().mockResolvedValue([]),
  getFailed: vi.fn().mockResolvedValue([]),
  close: vi.fn().mockResolvedValue(undefined),
}

const mockRedisClient = {
  hset: vi.fn().mockResolvedValue(1),
  hgetall: vi.fn().mockResolvedValue({}),
  hincrby: vi.fn().mockResolvedValue(1),
  sadd: vi.fn().mockReturnValue({
    catch: vi.fn().mockReturnThis()
  }),
  scard: vi.fn().mockResolvedValue(0),
  del: vi.fn().mockResolvedValue(1),
  pipeline: vi.fn().mockReturnValue({
    hset: vi.fn().mockReturnThis(),
    hincrby: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([[null, 1], [null, 1]]),
  }),
}

// Mock imports
vi.mock('@/lib/crawler/queue-service', () => ({
  getCrawlQueue: () => mockQueue,
  getRedisConnection: () => mockRedisClient,
  crawlQueueName: 'test-crawl-queue',
}))

describe('Batch Job System', () => {
  const testCrawlId = 'test-crawl-123'
  const testUrls = [
    'https://example.com/page1',
    'https://example.com/page2', 
    'https://example.com/page3',
    'https://example.com/page4',
    'https://example.com/page5',
    'https://example.com/page6',
    'https://example.com/page7',
    'https://example.com/page8',
    'https://example.com/page9',
    'https://example.com/page10',
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset to default successful behavior
    mockQueue.addBulk.mockResolvedValue([
      { id: 'batch-job-1' }, 
      { id: 'batch-job-2' }, 
      { id: 'batch-job-3' }
    ])
    mockRedisClient.hgetall.mockResolvedValue({})
  })

  describe('Batch Job Creation', () => {
    it('should create batch jobs from URL arrays', async () => {
      const { addBatchCrawlJobs } = await import('@/lib/crawler/batch-jobs')
      
      const jobIds = await addBatchCrawlJobs(testCrawlId, testUrls, { batchSize: 4 })

      // Should create 3 batches: [4, 4, 2]
      expect(jobIds).toHaveLength(3)
      expect(mockQueue.addBulk).toHaveBeenCalledWith([
        {
          name: 'batch-crawl',
          data: {
            crawlId: testCrawlId,
            urls: testUrls.slice(0, 4),
            batchNumber: 1,
            totalBatches: 3,
            jobId: expect.any(String),
          },
          opts: expect.objectContaining({
            priority: 5,
            attempts: 3,
            jobId: expect.any(String),
          })
        },
        {
          name: 'batch-crawl',
          data: {
            crawlId: testCrawlId,
            urls: testUrls.slice(4, 8),
            batchNumber: 2,
            totalBatches: 3,
            jobId: expect.any(String),
          },
          opts: expect.objectContaining({
            priority: 5,
            attempts: 3,
            jobId: expect.any(String),
          })
        },
        {
          name: 'batch-crawl',
          data: {
            crawlId: testCrawlId,
            urls: testUrls.slice(8, 10),
            batchNumber: 3,
            totalBatches: 3,
            jobId: expect.any(String),
          },
          opts: expect.objectContaining({
            priority: 5,
            attempts: 3,
            jobId: expect.any(String),
          })
        }
      ])
    })

    it('should handle default batch size', async () => {
      const { addBatchCrawlJobs } = await import('@/lib/crawler/batch-jobs')
      
      await addBatchCrawlJobs(testCrawlId, testUrls)

      // Default batch size should be 20, so all URLs in one batch
      expect(mockQueue.addBulk).toHaveBeenCalledWith([
        expect.objectContaining({
          data: expect.objectContaining({
            urls: testUrls,
            batchNumber: 1,
            totalBatches: 1,
          })
        })
      ])
    })

    it('should handle empty URL arrays', async () => {
      const { addBatchCrawlJobs } = await import('@/lib/crawler/batch-jobs')
      
      const jobIds = await addBatchCrawlJobs(testCrawlId, [])

      expect(jobIds).toHaveLength(0)
      expect(mockQueue.addBulk).not.toHaveBeenCalled()
    })

    it('should create unique job IDs for each batch', async () => {
      const { addBatchCrawlJobs } = await import('@/lib/crawler/batch-jobs')
      
      await addBatchCrawlJobs(testCrawlId, testUrls, { batchSize: 3 })

      const call = mockQueue.addBulk.mock.calls[0][0]
      const jobIds = call.map((batch: any) => batch.data.jobId)
      
      // All job IDs should be unique
      expect(new Set(jobIds).size).toBe(jobIds.length)
      
      // All job IDs should be UUIDs
      jobIds.forEach((id: string) => {
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      })
    })

    it('should handle single URL', async () => {
      const { addBatchCrawlJobs } = await import('@/lib/crawler/batch-jobs')
      
      const singleUrl = ['https://example.com']
      await addBatchCrawlJobs(testCrawlId, singleUrl, { batchSize: 5 })

      expect(mockQueue.addBulk).toHaveBeenCalledWith([
        expect.objectContaining({
          data: expect.objectContaining({
            urls: singleUrl,
            batchNumber: 1,
            totalBatches: 1,
          })
        })
      ])
    })

    it('should handle exact batch size divisibility', async () => {
      const { addBatchCrawlJobs } = await import('@/lib/crawler/batch-jobs')
      
      const exactUrls = testUrls.slice(0, 8) // 8 URLs
      await addBatchCrawlJobs(testCrawlId, exactUrls, { batchSize: 4 })

      // Should create exactly 2 batches of 4 each
      expect(mockQueue.addBulk).toHaveBeenCalledWith([
        expect.objectContaining({
          data: expect.objectContaining({
            urls: exactUrls.slice(0, 4),
            batchNumber: 1,
            totalBatches: 2,
          })
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            urls: exactUrls.slice(4, 8),
            batchNumber: 2,
            totalBatches: 2,
          })
        })
      ])
    })
  })

  describe('Batch Job Data Structure', () => {
    it('should include all required fields in batch job data', async () => {
      const { addBatchCrawlJobs } = await import('@/lib/crawler/batch-jobs')
      
      await addBatchCrawlJobs(testCrawlId, testUrls.slice(0, 3), { batchSize: 2 })

      const batches = mockQueue.addBulk.mock.calls[0][0]
      
      batches.forEach((batch: any) => {
        expect(batch).toEqual({
          name: 'batch-crawl',
          data: {
            crawlId: expect.any(String),
            urls: expect.any(Array),
            batchNumber: expect.any(Number),
            totalBatches: expect.any(Number),
            jobId: expect.any(String),
          },
          opts: {
            priority: 5,
            delay: 0,
            jobId: expect.any(String),
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          }
        })
      })
    })

    it('should preserve URL order within batches', async () => {
      const { addBatchCrawlJobs } = await import('@/lib/crawler/batch-jobs')
      
      const orderedUrls = [
        'https://example.com/first',
        'https://example.com/second',
        'https://example.com/third',
        'https://example.com/fourth',
        'https://example.com/fifth',
      ]
      
      await addBatchCrawlJobs(testCrawlId, orderedUrls, { batchSize: 2 })

      const batches = mockQueue.addBulk.mock.calls[0][0]
      
      expect(batches[0].data.urls).toEqual(['https://example.com/first', 'https://example.com/second'])
      expect(batches[1].data.urls).toEqual(['https://example.com/third', 'https://example.com/fourth'])
      expect(batches[2].data.urls).toEqual(['https://example.com/fifth'])
    })
  })

  describe('Batch Job Options', () => {
    it('should support custom delays', async () => {
      const { addBatchCrawlJobs } = await import('@/lib/crawler/batch-jobs')
      
      await addBatchCrawlJobs(testCrawlId, testUrls.slice(0, 2), { 
        batchSize: 1,
        delay: 5000 
      })

      const batches = mockQueue.addBulk.mock.calls[0][0]
      batches.forEach((batch: any) => {
        expect(batch.opts.delay).toBe(5000)
      })
    })

    it('should support custom priority', async () => {
      const { addBatchCrawlJobs } = await import('@/lib/crawler/batch-jobs')
      
      await addBatchCrawlJobs(testCrawlId, testUrls.slice(0, 2), { 
        batchSize: 1,
        priority: 10 
      })

      const batches = mockQueue.addBulk.mock.calls[0][0]
      batches.forEach((batch: any) => {
        expect(batch.opts.priority).toBe(10)
      })
    })

    it('should support custom retry attempts', async () => {
      const { addBatchCrawlJobs } = await import('@/lib/crawler/batch-jobs')
      
      await addBatchCrawlJobs(testCrawlId, testUrls.slice(0, 2), { 
        batchSize: 1,
        attempts: 5 
      })

      const batches = mockQueue.addBulk.mock.calls[0][0]
      batches.forEach((batch: any) => {
        expect(batch.opts.attempts).toBe(5)
      })
    })
  })

  describe('Batch Progress Tracking', () => {
    it('should track batch completion correctly', async () => {
      const { markBatchComplete, getBatchProgress } = await import('@/lib/crawler/batch-jobs')
      
      // Mock Redis pipeline correctly
      const mockPipeline = {
        hset: vi.fn().mockReturnThis(),
        hincrby: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([[null, 1], [null, 1]]),
      }
      mockRedisClient.pipeline.mockReturnValue(mockPipeline)
      
      // Mock Redis responses for progress tracking
      mockRedisClient.hgetall.mockResolvedValue({
        totalBatches: '3',
        completedBatches: '1',
        failedBatches: '0',
      })

      await markBatchComplete(testCrawlId, 1, { processed: 5, failed: 0 })
      
      // Check that pipeline was used correctly
      expect(mockPipeline.hset).toHaveBeenCalledWith(
        `batch:${testCrawlId}:progress`,
        expect.objectContaining({
          [`batch_${1}_complete`]: '1',
          [`batch_${1}_processed`]: '5',
          [`batch_${1}_failed`]: '0',
        })
      )
      expect(mockPipeline.exec).toHaveBeenCalled()

      const progress = await getBatchProgress(testCrawlId)
      expect(progress).toEqual({
        totalBatches: 3,
        completedBatches: 1,
        failedBatches: 0,
        completionPercentage: 33, // 1/3 * 100 rounded
      })
    })

    it('should calculate overall progress percentage', async () => {
      const { getBatchProgress } = await import('@/lib/crawler/batch-jobs')
      
      mockRedisClient.hgetall.mockResolvedValue({
        totalBatches: '5',
        completedBatches: '3',
        failedBatches: '1',
      })

      const progress = await getBatchProgress(testCrawlId)
      expect(progress.completionPercentage).toBe(60) // 3/5 * 100
    })

    it('should handle missing progress data gracefully', async () => {
      const { getBatchProgress } = await import('@/lib/crawler/batch-jobs')
      
      mockRedisClient.hgetall.mockResolvedValue({})

      const progress = await getBatchProgress(testCrawlId)
      expect(progress).toEqual({
        totalBatches: 0,
        completedBatches: 0,
        failedBatches: 0,
        completionPercentage: 0,
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle queue errors gracefully', async () => {
      const { addBatchCrawlJobs } = await import('@/lib/crawler/batch-jobs')
      
      mockQueue.addBulk.mockRejectedValue(new Error('Queue connection failed'))

      await expect(addBatchCrawlJobs(testCrawlId, testUrls)).rejects.toThrow('Queue connection failed')
    })

    it('should handle Redis errors in progress tracking', async () => {
      const { markBatchComplete } = await import('@/lib/crawler/batch-jobs')
      
      mockRedisClient.hset.mockRejectedValue(new Error('Redis write failed'))

      // Should not throw - error handling should be graceful
      await expect(markBatchComplete(testCrawlId, 1, { processed: 5, failed: 0 })).resolves.not.toThrow()
    })

    it('should validate input parameters', async () => {
      const { addBatchCrawlJobs } = await import('@/lib/crawler/batch-jobs')
      
      // Test invalid batch size - should validate before calling queue
      await expect(addBatchCrawlJobs(testCrawlId, testUrls, { batchSize: 0 })).rejects.toThrow('Batch size must be greater than 0')
      
      // Test negative batch size - should validate before calling queue
      await expect(addBatchCrawlJobs(testCrawlId, testUrls, { batchSize: -1 })).rejects.toThrow('Batch size must be greater than 0')
      
      // Test empty crawl ID - should validate before calling queue
      await expect(addBatchCrawlJobs('', testUrls)).rejects.toThrow('Crawl ID is required')
      
      // None of these should have called the queue since validation failed
      expect(mockQueue.addBulk).not.toHaveBeenCalled()
    })
  })

  describe('Performance Considerations', () => {
    it('should handle large URL arrays efficiently', async () => {
      const { addBatchCrawlJobs } = await import('@/lib/crawler/batch-jobs')
      
      const largeUrlArray = Array.from({ length: 1000 }, (_, i) => `https://example.com/page${i}`)
      
      const startTime = Date.now()
      await addBatchCrawlJobs(testCrawlId, largeUrlArray, { batchSize: 50 })
      const endTime = Date.now()
      
      // Should complete quickly (under 100ms for 1000 URLs)
      expect(endTime - startTime).toBeLessThan(100)
      
      // Should create 20 batches (1000/50)
      const batches = mockQueue.addBulk.mock.calls[0][0]
      expect(batches).toHaveLength(20)
    })

    it('should optimize for small batch sizes', async () => {
      const { addBatchCrawlJobs } = await import('@/lib/crawler/batch-jobs')
      
      // Test with very small batches
      await addBatchCrawlJobs(testCrawlId, testUrls, { batchSize: 1 })
      
      const batches = mockQueue.addBulk.mock.calls[0][0]
      expect(batches).toHaveLength(testUrls.length)
      
      // Each batch should have exactly 1 URL
      batches.forEach((batch: any) => {
        expect(batch.data.urls).toHaveLength(1)
      })
    })
  })

  describe('Integration with Existing System', () => {
    it('should be compatible with existing job tracking', async () => {
      const { addBatchCrawlJobs } = await import('@/lib/crawler/batch-jobs')
      
      await addBatchCrawlJobs(testCrawlId, testUrls.slice(0, 3), { batchSize: 2 })
      
      // Should use the same queue as existing system
      expect(mockQueue.addBulk).toHaveBeenCalled()
      
      const batches = mockQueue.addBulk.mock.calls[0][0]
      batches.forEach((batch: any) => {
        // Should include jobId for tracking compatibility
        expect(batch.opts.jobId).toBeDefined()
        expect(batch.data.jobId).toBeDefined()
        expect(batch.opts.jobId).toBe(batch.data.jobId)
      })
    })

    it('should maintain job metadata format', async () => {
      const { addBatchCrawlJobs } = await import('@/lib/crawler/batch-jobs')
      
      await addBatchCrawlJobs(testCrawlId, testUrls.slice(0, 2))
      
      const batches = mockQueue.addBulk.mock.calls[0][0]
      batches.forEach((batch: any) => {
        // Should match expected metadata structure
        expect(batch.data).toEqual({
          crawlId: testCrawlId,
          urls: expect.any(Array),
          batchNumber: expect.any(Number),
          totalBatches: expect.any(Number),
          jobId: expect.any(String),
        })
      })
    })
  })
})

console.log('🧪 Batch Job System tests ready!')
console.log('📦 Testing: Batch creation + Progress tracking + Error handling + Performance')
console.log('🔄 TDD Approach: Write failing tests first, then implement')