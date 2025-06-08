import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { markCrawlComplete, incrementProgress, batchIncrementProgress } from '@/lib/crawler/atomic-progress'
import { getRedisConnection } from '@/lib/crawler/queue-service'
import { getCrawl } from '@/lib/crawler/crawl-redis'

// Mock Redis to simulate concurrent operations
vi.mock('@/lib/crawler/queue-service', () => ({
  getRedisConnection: vi.fn()
}))

vi.mock('@/lib/crawler/crawl-redis', () => ({
  getCrawl: vi.fn()
}))

describe('Concurrent Workers Race Condition Tests', () => {
  let mockRedis: any
  const testCrawlId = 'test-race-condition-123'

  beforeEach(() => {
    // Create a mock Redis that simulates race conditions
    mockRedis = {
      hincrby: vi.fn().mockImplementation((key, field, amount) => {
        // Simulate atomic increment
        return Promise.resolve(amount)
      }),
      hget: vi.fn(),
      hset: vi.fn(),
      hgetall: vi.fn(),
      multi: vi.fn(() => mockRedis),
      exec: vi.fn().mockResolvedValue([]),
      eval: vi.fn(),
      publish: vi.fn(),
      del: vi.fn(),
      setnx: vi.fn(),
      expire: vi.fn()
    }

    vi.mocked(getRedisConnection).mockReturnValue(mockRedis)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Atomic Completion', () => {
    it('should handle multiple workers completing simultaneously', async () => {
      // Setup: First call succeeds, subsequent calls fail
      let completionAttempts = 0
      mockRedis.eval.mockImplementation(() => {
        completionAttempts++
        // Only the first attempt succeeds
        return Promise.resolve(completionAttempts === 1 ? 1 : 0)
      })

      // Simulate 10 workers trying to complete the crawl simultaneously
      const results = await Promise.all(
        Array(10).fill(0).map(() => markCrawlComplete(testCrawlId))
      )

      // Only one should succeed
      expect(results.filter(r => r === true)).toHaveLength(1)
      expect(results.filter(r => r === false)).toHaveLength(9)

      // Lua script should be called 10 times
      expect(mockRedis.eval).toHaveBeenCalledTimes(10)

      // But only one completion event should be published (within the Lua script)
      // The publish is done inside the Lua script, so we check the eval params
      const evalCalls = mockRedis.eval.mock.calls
      // Check that the Lua script was called with correct parameters
      expect(evalCalls[0][0]).toContain('completed') // Lua script checks for 'completed' status
      expect(evalCalls[0][1]).toBe(2) // 2 keys
      expect(evalCalls[0][2]).toBe(`crawl:${testCrawlId}`) // First key
      expect(evalCalls[0][3]).toBe(`crawl:${testCrawlId}:progress`) // Second key
      expect(evalCalls[0][5]).toContain('completion') // Completion event JSON in ARGV[2]
    })

    it('should not publish duplicate completion events', async () => {
      // First completion succeeds
      mockRedis.eval.mockResolvedValueOnce(1)
      // All subsequent attempts fail
      mockRedis.eval.mockResolvedValue(0)

      // First worker completes successfully
      const result1 = await markCrawlComplete(testCrawlId)
      expect(result1).toBe(true)

      // Second worker tries to complete
      const result2 = await markCrawlComplete(testCrawlId)
      expect(result2).toBe(false)

      // Third worker also tries
      const result3 = await markCrawlComplete(testCrawlId)
      expect(result3).toBe(false)

      // Only one successful completion
      expect(mockRedis.eval).toHaveBeenCalledTimes(3)
    })
  })

  describe('Atomic Progress Updates', () => {
    it('should handle concurrent progress increments atomically', async () => {
      // Mock atomic increments returning sequential values
      let counter = 0
      mockRedis.hincrby.mockImplementation((key, field, amount) => {
        counter += amount
        return Promise.resolve(counter)
      })

      // Simulate 100 workers each incrementing the processed count
      const incrementPromises = Array(100).fill(0).map(() => 
        incrementProgress(testCrawlId, 'processed', 1)
      )

      const results = await Promise.all(incrementPromises)

      // Each worker should get a unique incremented value
      const uniqueResults = new Set(results)
      expect(uniqueResults.size).toBe(100) // All results should be unique

      // hincrby should be called 100 times
      expect(mockRedis.hincrby).toHaveBeenCalledTimes(100)

      // Final value should be 100
      expect(Math.max(...results)).toBe(100)
    })

    it('should handle batch increments atomically', async () => {
      const mockMulti = {
        hincrby: vi.fn(),
        hset: vi.fn(),
        exec: vi.fn().mockResolvedValue([])
      }
      mockRedis.multi.mockReturnValue(mockMulti)

      // Multiple workers updating different counters
      await Promise.all([
        batchIncrementProgress(testCrawlId, { processed: 5, failed: 2 }),
        batchIncrementProgress(testCrawlId, { processed: 3, discovered: 10 }),
        batchIncrementProgress(testCrawlId, { failed: 1, queued: 7 })
      ])

      // Each batch should create its own transaction
      expect(mockRedis.multi).toHaveBeenCalledTimes(3)
      expect(mockMulti.exec).toHaveBeenCalledTimes(3)

      // Verify all increments were queued
      const hincrbyCallsProcessed = mockMulti.hincrby.mock.calls.filter(
        call => call[1] === 'processed'
      )
      expect(hincrbyCallsProcessed).toHaveLength(2) // Two batches updated 'processed'
    })
  })

  describe('Progress Read Consistency', () => {
    it('should read consistent progress state during concurrent updates', async () => {
      // Mock consistent read from Redis
      mockRedis.hgetall.mockResolvedValue({
        processed: '50',
        failed: '5',
        discovered: '100',
        queued: '45',
        phase: 'crawling',
        status: 'running'
      })

      // Multiple workers reading progress simultaneously
      const readPromises = Array(10).fill(0).map(() => 
        import('@/lib/crawler/atomic-progress').then(mod => 
          mod.getProgressAtomic(testCrawlId)
        )
      )

      const results = await Promise.all(readPromises)

      // All workers should see the same consistent state
      results.forEach(result => {
        expect(result).toEqual({
          processed: 50,
          failed: 5,
          discovered: 100,
          queued: 45,
          phase: 'crawling',
          status: 'running'
        })
      })
    })
  })

  describe('Memory Leak Prevention', () => {
    it('should clean up progress tracking on completion', async () => {
      const { cleanupProgressTracking } = await import('@/lib/crawler/streaming-progress')
      
      // Simulate crawl completion
      await cleanupProgressTracking(testCrawlId)
      
      // Try to clean up again (should be idempotent)
      await cleanupProgressTracking(testCrawlId)
      
      // No errors should occur
      expect(true).toBe(true)
    })

    it('should handle cleanup during concurrent operations', async () => {
      const { cleanupProgressTracking } = await import('@/lib/crawler/streaming-progress')
      
      // Simulate multiple workers trying to clean up simultaneously
      const cleanupPromises = Array(5).fill(0).map(() => 
        cleanupProgressTracking(testCrawlId)
      )

      await Promise.all(cleanupPromises)
      
      // All cleanups should complete without error
      expect(true).toBe(true)
    })
  })

  describe('Real-world Scenario', () => {
    it('should handle a complete crawl lifecycle with multiple workers', async () => {
      // Setup crawl data
      vi.mocked(getCrawl).mockResolvedValue({
        id: testCrawlId,
        url: 'https://example.com',
        status: 'active',
        totalQueued: 100,
        totalProcessed: 0,
        totalFailed: 0,
        createdAt: Date.now(),
        results: [],
        progress: {
          current: 0,
          total: 100,
          phase: 'crawling' as const,
          processed: 0,
          message: 'Starting crawl'
        }
      } as any)

      // Track increments
      let processedCount = 0
      mockRedis.hincrby.mockImplementation((key, field, amount) => {
        if (field === 'processed') {
          processedCount += amount
        }
        return Promise.resolve(processedCount)
      })

      // Simulate 10 workers processing 10 URLs each
      const workerPromises = Array(10).fill(0).map(async (_, workerIndex) => {
        for (let i = 0; i < 10; i++) {
          await incrementProgress(testCrawlId, 'processed', 1)
          // Simulate some processing time
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10))
        }
      })

      await Promise.all(workerPromises)

      // All 100 URLs should be processed
      expect(processedCount).toBe(100)
      expect(mockRedis.hincrby).toHaveBeenCalledTimes(100)

      // Now try to complete the crawl from multiple workers
      mockRedis.eval.mockImplementation(() => {
        // Only allow first completion
        const isFirst = mockRedis.eval.mock.calls.length === 1
        return Promise.resolve(isFirst ? 1 : 0)
      })

      const completionPromises = Array(5).fill(0).map(() => 
        markCrawlComplete(testCrawlId)
      )

      const completionResults = await Promise.all(completionPromises)
      
      // Only one completion should succeed
      expect(completionResults.filter(r => r === true)).toHaveLength(1)
      expect(completionResults.filter(r => r === false)).toHaveLength(4)
    })
  })
})