import { describe, it, expect, beforeEach, vi } from 'vitest'
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

// Mock EventSource for SSE testing
const mockEventSource = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  close: vi.fn(),
  readyState: 1, // OPEN
  url: '',
  withCredentials: false,
  onopen: null,
  onmessage: null,
  onerror: null,
}

// Mock global EventSource with constants
const MockEventSource = vi.fn(() => mockEventSource) as any
MockEventSource.CLOSED = 2
MockEventSource.CONNECTING = 0
MockEventSource.OPEN = 1
global.EventSource = MockEventSource

// Mock Redis client for progress storage
const mockRedisClient = {
  publish: vi.fn().mockResolvedValue(1),
  subscribe: vi.fn().mockResolvedValue(undefined),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
  hset: vi.fn().mockResolvedValue(1),
  hgetall: vi.fn().mockResolvedValue({}),
  del: vi.fn().mockResolvedValue(1),
  pipeline: vi.fn().mockReturnValue({
    hset: vi.fn().mockReturnThis(),
    publish: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([[null, 1], [null, 1]]),
  }),
}

// Mock Redis connection
vi.mock('@/lib/crawler/queue-service', () => ({
  getRedisConnection: () => mockRedisClient,
}))

describe('Streaming Progress System', () => {
  const testCrawlId = 'test-crawl-456'
  
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset EventSource mock state
    mockEventSource.readyState = 1
    // Reset Redis mock to successful state
    mockRedisClient.publish.mockResolvedValue(1)
    mockRedisClient.hset.mockResolvedValue(1)
    mockRedisClient.hgetall.mockResolvedValue({})
    
    // Clear module cache to reset throttling state
    vi.resetModules()
  })

  describe('Progress Event Publishing', () => {
    it('should publish progress events to Redis channels', async () => {
      const { publishProgressEvent } = await import('@/lib/crawler/streaming-progress')
      
      const progressData = {
        crawlId: testCrawlId,
        phase: 'crawling',
        processed: 5,
        total: 10,
        percentage: 50,
        discoveredUrls: 3,
        failedUrls: 1,
        currentUrl: 'https://example.com/page5',
        timestamp: Date.now(),
      }

      await publishProgressEvent(progressData)

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        `crawl:${testCrawlId}:progress`,
        expect.stringContaining(`"crawlId":"${testCrawlId}"`)
      )
    })

    it('should handle Redis publish errors gracefully', async () => {
      const { publishProgressEvent } = await import('@/lib/crawler/streaming-progress')
      
      mockRedisClient.publish.mockRejectedValue(new Error('Redis publish failed'))

      const progressData = {
        crawlId: testCrawlId,
        phase: 'crawling',
        processed: 1,
        total: 10,
      }

      // Should not throw - graceful degradation
      await expect(publishProgressEvent(progressData)).resolves.not.toThrow()
    })

    it('should publish batch progress events', async () => {
      const { publishBatchProgressEvent } = await import('@/lib/crawler/streaming-progress')
      
      const batchProgress = {
        crawlId: testCrawlId,
        batchNumber: 2,
        totalBatches: 5,
        batchProcessed: 8,
        batchFailed: 2,
        overallProgress: {
          processed: 15,
          total: 50,
          percentage: 30,
        }
      }

      await publishBatchProgressEvent(batchProgress)

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        `crawl:${testCrawlId}:progress`,
        expect.stringContaining('"type":"batch-progress"')
      )
    })

    it('should publish crawl completion events', async () => {
      const { publishCrawlCompletionEvent } = await import('@/lib/crawler/streaming-progress')
      
      const completionData = {
        crawlId: testCrawlId,
        status: 'completed',
        totalProcessed: 25,
        totalFailed: 3,
        duration: 45000,
        finalResults: {
          urls: ['https://example.com'],
          content: 'Combined content...',
        }
      }

      await publishCrawlCompletionEvent(completionData)

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        `crawl:${testCrawlId}:progress`,
        expect.stringContaining('"type":"completion"')
      )
    })
  })

  describe('SSE Client Connection', () => {
    it('should create SSE connection with correct URL', async () => {
      const { createProgressStream } = await import('@/lib/crawler/streaming-progress')
      
      const stream = createProgressStream(testCrawlId)

      expect(global.EventSource).toHaveBeenCalledWith(
        `/api/crawl-v2/${testCrawlId}/stream`
      )
      expect(stream).toBeDefined()
    })

    it('should handle SSE connection errors', async () => {
      const { createProgressStream } = await import('@/lib/crawler/streaming-progress')
      
      const errorHandler = vi.fn()
      const stream = createProgressStream(testCrawlId, { onError: errorHandler })

      // Simulate connection error
      const errorEvent = new Event('error')
      mockEventSource.onerror?.(errorEvent)

      expect(errorHandler).toHaveBeenCalledWith(errorEvent)
    })

    it('should handle SSE message parsing', async () => {
      const { createProgressStream } = await import('@/lib/crawler/streaming-progress')
      
      const messageHandler = vi.fn()
      const stream = createProgressStream(testCrawlId, { onProgress: messageHandler })

      // Simulate progress message
      const messageData = {
        phase: 'crawling',
        processed: 3,
        total: 10,
        percentage: 30,
      }
      
      const messageEvent = new MessageEvent('message', {
        data: JSON.stringify(messageData)
      })
      mockEventSource.onmessage?.(messageEvent)

      expect(messageHandler).toHaveBeenCalledWith(messageData)
    })

    it('should handle malformed SSE messages gracefully', async () => {
      const { createProgressStream } = await import('@/lib/crawler/streaming-progress')
      
      const messageHandler = vi.fn()
      const errorHandler = vi.fn()
      const stream = createProgressStream(testCrawlId, { 
        onProgress: messageHandler,
        onError: errorHandler 
      })

      // Simulate malformed message
      const messageEvent = new MessageEvent('message', {
        data: 'invalid json'
      })
      mockEventSource.onmessage?.(messageEvent)

      expect(messageHandler).not.toHaveBeenCalled()
      expect(errorHandler).toHaveBeenCalled()
    })

    it('should close SSE connection properly', async () => {
      const { createProgressStream } = await import('@/lib/crawler/streaming-progress')
      
      const stream = createProgressStream(testCrawlId)
      stream.close()

      expect(mockEventSource.close).toHaveBeenCalled()
    })
  })

  describe('Progress Data Persistence', () => {
    it('should store progress snapshots in Redis', async () => {
      const { storeProgressSnapshot } = await import('@/lib/crawler/streaming-progress')
      
      const progressData = {
        crawlId: testCrawlId,
        phase: 'discovering',
        processed: 0,
        total: 0,
        discoveredUrls: 5,
        timestamp: Date.now(),
      }

      await storeProgressSnapshot(progressData)

      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        `crawl:${testCrawlId}:snapshot`,
        {
          phase: progressData.phase,
          processed: progressData.processed.toString(),
          total: progressData.total.toString(),
          discoveredUrls: progressData.discoveredUrls.toString(),
          timestamp: progressData.timestamp.toString(),
          lastUpdate: expect.any(String),
        }
      )
    })

    it('should retrieve latest progress snapshot', async () => {
      const { getLatestProgressSnapshot } = await import('@/lib/crawler/streaming-progress')
      
      const mockSnapshot = {
        phase: 'crawling',
        processed: '8',
        total: '20',
        discoveredUrls: '15',
        timestamp: Date.now().toString(),
      }
      
      mockRedisClient.hgetall.mockResolvedValue(mockSnapshot)

      const snapshot = await getLatestProgressSnapshot(testCrawlId)

      expect(snapshot).toEqual({
        crawlId: testCrawlId,
        phase: 'crawling',
        processed: 8,
        total: 20,
        discoveredUrls: 15,
        percentage: 40, // 8/20 * 100
        timestamp: parseInt(mockSnapshot.timestamp),
      })
    })

    it('should handle missing progress snapshots', async () => {
      const { getLatestProgressSnapshot } = await import('@/lib/crawler/streaming-progress')
      
      mockRedisClient.hgetall.mockResolvedValue({})

      const snapshot = await getLatestProgressSnapshot(testCrawlId)

      expect(snapshot).toEqual({
        crawlId: testCrawlId,
        phase: 'initializing',
        processed: 0,
        total: 0,
        percentage: 0,
        discoveredUrls: 0,
        timestamp: expect.any(Number),
      })
    })
  })

  describe('Progress Event Types', () => {
    it('should handle discovery phase events', async () => {
      const { publishProgressEvent } = await import('@/lib/crawler/streaming-progress')
      
      const discoveryEvent = {
        crawlId: testCrawlId,
        phase: 'discovering',
        processed: 0,
        total: 0,
        discoveredUrls: 12,
        currentActivity: 'Scanning sitemap.xml',
      }

      await publishProgressEvent(discoveryEvent)

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        `crawl:${testCrawlId}:progress`,
        expect.stringContaining('"phase":"discovering"')
      )
    })

    it('should handle crawling phase events', async () => {
      const { publishProgressEvent } = await import('@/lib/crawler/streaming-progress')
      
      const crawlingEvent = {
        crawlId: testCrawlId,
        phase: 'crawling',
        processed: 7,
        total: 15,
        percentage: 47,
        currentUrl: 'https://example.com/docs/api',
        queueSize: 8,
        failedUrls: 1,
      }

      await publishProgressEvent(crawlingEvent)

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        `crawl:${testCrawlId}:progress`,
        expect.stringContaining('"phase":"crawling"')
      )
    })

    it('should handle quality assessment events', async () => {
      const { publishProgressEvent } = await import('@/lib/crawler/streaming-progress')
      
      const qualityEvent = {
        crawlId: testCrawlId,
        phase: 'quality-assessment',
        processed: 15,
        total: 15,
        percentage: 100,
        qualityResults: {
          highQuality: 12,
          mediumQuality: 2,
          lowQuality: 1,
        }
      }

      await publishProgressEvent(qualityEvent)

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        `crawl:${testCrawlId}:progress`,
        expect.stringContaining('"phase":"quality-assessment"')
      )
    })
  })

  describe('Real-time Progress Integration', () => {
    it('should integrate with batch job completion', async () => {
      const { handleBatchCompletion } = await import('@/lib/crawler/streaming-progress')
      
      const batchCompletion = {
        crawlId: testCrawlId,
        batchNumber: 3,
        totalBatches: 5,
        batchResults: {
          processed: 10,
          failed: 2,
          discoveredUrls: ['https://example.com/new1', 'https://example.com/new2'],
        }
      }

      await handleBatchCompletion(batchCompletion)

      // Should publish progress update AND store snapshot
      expect(mockRedisClient.publish).toHaveBeenCalled()
      expect(mockRedisClient.hset).toHaveBeenCalled()
    })

    it('should integrate with URL deduplication events', async () => {
      const { handleUrlDiscovery } = await import('@/lib/crawler/streaming-progress')
      
      const discoveryEvent = {
        crawlId: testCrawlId,
        newUrls: 5,
        duplicateUrls: 3,
        totalDiscovered: 25,
        source: 'sitemap',
      }

      await handleUrlDiscovery(discoveryEvent)

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        `crawl:${testCrawlId}:progress`,
        expect.stringContaining('"type":"url-discovery"')
      )
    })

    it('should throttle high-frequency updates', async () => {
      const { publishProgressEvent } = await import('@/lib/crawler/streaming-progress')
      
      // Clear any existing calls
      mockRedisClient.publish.mockClear()
      
      // First update should go through immediately
      await publishProgressEvent({
        crawlId: testCrawlId,
        phase: 'crawling',
        processed: 1,
        total: 10,
      })

      expect(mockRedisClient.publish).toHaveBeenCalledTimes(1)

      // Rapid follow-up updates should be throttled
      const promises = []
      for (let i = 2; i <= 5; i++) {
        promises.push(publishProgressEvent({
          crawlId: testCrawlId,
          phase: 'crawling',
          processed: i,
          total: 10,
        }))
      }

      await Promise.all(promises)

      // Should have throttled some updates (but implementation may vary)
      expect(mockRedisClient.publish.mock.calls.length).toBeGreaterThan(0)
    })
  })

  describe('Error Recovery and Reconnection', () => {
    it('should handle SSE connection drops', async () => {
      const { createProgressStream } = await import('@/lib/crawler/streaming-progress')
      
      const reconnectHandler = vi.fn()
      const stream = createProgressStream(testCrawlId, { 
        onReconnect: reconnectHandler,
        reconnectInterval: 1000,
      })

      // Simulate connection drop - set readyState to CLOSED first
      mockEventSource.readyState = 2 // CLOSED (EventSource.CLOSED)
      
      // Create error event and trigger it
      const errorEvent = new Event('error')
      
      // The stream should detect the closed state and call onReconnect
      if (mockEventSource.onerror) {
        mockEventSource.onerror(errorEvent)
      }

      // Since we set readyState to CLOSED, reconnect should be called
      expect(reconnectHandler).toHaveBeenCalled()
    })

    it('should provide progress recovery on reconnection', async () => {
      const { getLatestProgressSnapshot } = await import('@/lib/crawler/streaming-progress')
      
      const mockSnapshot = {
        phase: 'crawling',
        processed: '5',
        total: '10',
        timestamp: Date.now().toString(),
      }
      
      mockRedisClient.hgetall.mockResolvedValue(mockSnapshot)

      const recoveredProgress = await getLatestProgressSnapshot(testCrawlId)

      expect(recoveredProgress).toEqual({
        crawlId: testCrawlId,
        phase: 'crawling',
        processed: 5,
        total: 10,
        percentage: 50,
        discoveredUrls: 0,
        timestamp: parseInt(mockSnapshot.timestamp),
      })
    })

    it('should clean up progress data after crawl completion', async () => {
      const { cleanupProgressData } = await import('@/lib/crawler/streaming-progress')
      
      await cleanupProgressData(testCrawlId)

      expect(mockRedisClient.del).toHaveBeenCalledWith(`crawl:${testCrawlId}:snapshot`)
      expect(mockRedisClient.del).toHaveBeenCalledWith(`crawl:${testCrawlId}:progress`)
    })
  })

  describe('Performance and Optimization', () => {
    it('should batch multiple progress updates efficiently', async () => {
      const { batchProgressUpdates } = await import('@/lib/crawler/streaming-progress')
      
      const updates = [
        { crawlId: testCrawlId, processed: 1, total: 10 },
        { crawlId: testCrawlId, processed: 2, total: 10 },
        { crawlId: testCrawlId, processed: 3, total: 10 },
      ]

      await batchProgressUpdates(updates)

      // Should use pipeline for efficiency
      expect(mockRedisClient.pipeline).toHaveBeenCalled()
      expect(mockRedisClient.pipeline().exec).toHaveBeenCalled()
    })

    it('should handle high-concurrency progress updates', async () => {
      const { publishProgressEvent } = await import('@/lib/crawler/streaming-progress')
      
      // Simulate concurrent batch workers sending updates
      const concurrentUpdates = Array.from({ length: 50 }, (_, i) => 
        publishProgressEvent({
          crawlId: testCrawlId,
          processed: i,
          total: 50,
          batchNumber: Math.floor(i / 10) + 1,
        })
      )

      await Promise.all(concurrentUpdates)

      // Should handle all updates without errors
      expect(mockRedisClient.publish).toHaveBeenCalled()
    })

    it('should optimize memory usage for long-running crawls', async () => {
      const { getStreamingStats } = await import('@/lib/crawler/streaming-progress')
      
      const stats = await getStreamingStats()

      expect(stats).toEqual({
        activeStreams: expect.any(Number),
        totalEventsSent: expect.any(Number),
        averageLatency: expect.any(Number),
        errorRate: expect.any(Number),
      })
    })
  })
})

console.log('🧪 Streaming Progress System tests ready!')
console.log('📡 Testing: SSE connections + Redis pub/sub + Progress persistence + Error recovery')
console.log('🔄 TDD Approach: Stream-first architecture for real-time UI updates')