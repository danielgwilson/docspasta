import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as createCrawl } from '@/app/api/v4/crawls/route'
import { GET as getCrawlStatus } from '@/app/api/v4/crawls/[crawlId]/route'
import { GET as streamProgress } from '@/app/api/v4/crawls/[crawlId]/stream/route'
import { V4QueueWorker } from '@/lib/v4/queue-worker'
import { createRedisClient } from '@/lib/v4/redis-client'
import { getServerSession } from 'next-auth'
import { db } from '@/lib/db/db'
import { setTimeout } from 'timers/promises'

vi.mock('@/lib/v4/redis-client')
vi.mock('next-auth')
vi.mock('@/lib/db/db')
vi.mock('@/lib/v4/web-crawler')

describe('Full Integration Tests - All Critical Fixes', () => {
  let mockRedis: any
  let mockDb: any
  let worker: V4QueueWorker
  
  beforeEach(() => {
    // Setup comprehensive mocks
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      setex: vi.fn(),
      exists: vi.fn(),
      xadd: vi.fn(),
      xread: vi.fn(),
      xlen: vi.fn(),
      hset: vi.fn(),
      hget: vi.fn(),
      hincrby: vi.fn(),
      lpush: vi.fn(),
      rpush: vi.fn(),
      brpop: vi.fn(),
      llen: vi.fn(),
      quit: vi.fn().mockResolvedValue('OK'),
      disconnect: vi.fn(),
      multi: vi.fn().mockReturnThis(),
      exec: vi.fn(),
      ping: vi.fn().mockResolvedValue('PONG'),
    }
    
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      and: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      desc: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    }
    
    vi.mocked(createRedisClient).mockResolvedValue(mockRedis)
    vi.mocked(db).mockReturnValue(mockDb as any)
    
    worker = new V4QueueWorker()
  })
  
  afterEach(async () => {
    await worker.stop()
    vi.clearAllMocks()
  })
  
  describe('Complete User Flow with All Fixes', () => {
    it('should handle multi-user concurrent crawls with proper isolation', async () => {
      // Setup two different users
      const userA = { id: 'user-a', email: 'a@example.com' }
      const userB = { id: 'user-b', email: 'b@example.com' }
      
      // User A creates a crawl
      vi.mocked(getServerSession).mockResolvedValueOnce({ user: userA } as any)
      mockDb.returning.mockResolvedValueOnce([{
        id: 'crawl-a',
        userId: userA.id,
        url: 'https://docs-a.com',
        status: 'pending'
      }])
      
      const requestA = new NextRequest('http://localhost/api/v4/crawls', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://docs-a.com' })
      })
      
      const responseA = await createCrawl(requestA)
      expect(responseA.status).toBe(200)
      const crawlA = await responseA.json()
      
      // User B creates a crawl
      vi.mocked(getServerSession).mockResolvedValueOnce({ user: userB } as any)
      mockDb.returning.mockResolvedValueOnce([{
        id: 'crawl-b',
        userId: userB.id,
        url: 'https://docs-b.com',
        status: 'pending'
      }])
      
      const requestB = new NextRequest('http://localhost/api/v4/crawls', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://docs-b.com' })
      })
      
      const responseB = await createCrawl(requestB)
      expect(responseB.status).toBe(200)
      const crawlB = await responseB.json()
      
      // Verify both crawls were queued
      expect(mockRedis.lpush).toHaveBeenCalledWith(
        'v4:queue:kickoff',
        expect.stringContaining('crawl-a')
      )
      expect(mockRedis.lpush).toHaveBeenCalledWith(
        'v4:queue:kickoff',
        expect.stringContaining('crawl-b')
      )
      
      // User A tries to access User B's crawl
      vi.mocked(getServerSession).mockResolvedValueOnce({ user: userA } as any)
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        userId: userB.id,
        url: 'https://docs-b.com'
      }))
      
      const crossAccessRequest = new NextRequest(
        `http://localhost/api/v4/crawls/${crawlB.crawlId}`
      )
      const crossAccessResponse = await getCrawlStatus(
        crossAccessRequest, 
        { params: { crawlId: crawlB.crawlId } }
      )
      
      expect(crossAccessResponse.status).toBe(403)
    })
    
    it('should process crawls with resumable SSE streams', async () => {
      const userId = 'test-user'
      const crawlId = 'test-crawl-sse'
      
      // Setup user session
      vi.mocked(getServerSession).mockResolvedValue({ user: { id: userId } } as any)
      
      // Mock crawl data
      const crawlData = {
        userId,
        url: 'https://example.com',
        status: 'processing'
      }
      mockRedis.get.mockResolvedValue(JSON.stringify(crawlData))
      
      // Mock SSE stream data with progression
      let eventCounter = 0
      mockRedis.xread.mockImplementation(async () => {
        eventCounter++
        if (eventCounter === 1) {
          return [{
            name: `crawl:${crawlId}:events`,
            messages: [
              { id: '1-0', fieldValues: { event: 'discovered', data: JSON.stringify({ urls: 10 }) } },
              { id: '2-0', fieldValues: { event: 'progress', data: JSON.stringify({ processed: 1, total: 10 }) } }
            ]
          }]
        } else if (eventCounter === 2) {
          return [{
            name: `crawl:${crawlId}:events`,
            messages: [
              { id: '3-0', fieldValues: { event: 'progress', data: JSON.stringify({ processed: 5, total: 10 }) } }
            ]
          }]
        } else if (eventCounter === 3) {
          return [{
            name: `crawl:${crawlId}:events`,
            messages: [
              { id: '4-0', fieldValues: { event: 'completed', data: JSON.stringify({ success: true, pages: 10 }) } }
            ]
          }]
        }
        return null
      })
      
      // Start SSE stream
      const streamRequest = new NextRequest(
        `http://localhost/api/v4/crawls/${crawlId}/stream`
      )
      const streamResponse = await streamProgress(
        streamRequest,
        { params: { crawlId } }
      )
      
      expect(streamResponse.status).toBe(200)
      expect(streamResponse.headers.get('Content-Type')).toBe('text/event-stream')
      
      // Read entire stream
      const reader = streamResponse.body!.getReader()
      const decoder = new TextDecoder()
      const events: string[] = []
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        events.push(decoder.decode(value))
      }
      
      const fullStream = events.join('')
      
      // Verify proper SSE format with IDs
      expect(fullStream).toContain('id: 1-0')
      expect(fullStream).toContain('event: discovered')
      expect(fullStream).toContain('id: 4-0')
      expect(fullStream).toContain('event: completed')
      
      // Verify Redis cleanup
      expect(mockRedis.quit).toHaveBeenCalled()
    })
    
    it('should handle worker processing with proper event emission', async () => {
      const crawlId = 'worker-test'
      const userId = 'test-user'
      
      // Setup job in queue
      const kickoffJob = {
        id: 'kickoff-1',
        type: 'kickoff' as const,
        crawlId,
        url: 'https://example.com'
      }
      
      mockRedis.brpop
        .mockResolvedValueOnce(['v4:queue:kickoff', JSON.stringify(kickoffJob)])
        .mockResolvedValue(null) // Stop after one job
      
      // Mock crawl metadata
      mockRedis.get.mockResolvedValue(JSON.stringify({
        userId,
        url: 'https://example.com',
        maxPages: 5,
        maxDepth: 2
      }))
      
      // Mock URL discovery
      const { V4WebCrawler } = await import('@/lib/v4/web-crawler')
      const mockCrawler = {
        discoverUrls: vi.fn().mockResolvedValue({
          urls: [
            'https://example.com/doc1',
            'https://example.com/doc2',
            'https://example.com/doc3'
          ],
          sitemapUrls: ['https://example.com/sitemap.xml'],
          error: null
        }),
        crawlUrl: vi.fn().mockResolvedValue({
          url: 'mocked',
          content: '# Test',
          links: [],
          error: null
        })
      }
      vi.mocked(V4WebCrawler).mockImplementation(() => mockCrawler as any)
      
      // Start worker
      await worker.start()
      
      // Let it process
      await setTimeout(200)
      
      // Verify discovered event was emitted
      expect(mockRedis.xadd).toHaveBeenCalledWith(
        `crawl:${crawlId}:events`,
        '*',
        'event', 'discovered',
        'data', expect.stringContaining('"total":3')
      )
      
      // Verify batch job was created
      expect(mockRedis.lpush).toHaveBeenCalledWith(
        'v4:queue:batch',
        expect.stringContaining('"urls":[')
      )
      
      await worker.stop()
    })
    
    it('should handle disconnection and resumption correctly', async () => {
      const crawlId = 'resume-test'
      const userId = 'test-user'
      
      vi.mocked(getServerSession).mockResolvedValue({ user: { id: userId } } as any)
      mockRedis.get.mockResolvedValue(JSON.stringify({ userId }))
      
      // First connection gets events 1-3
      mockRedis.xread.mockResolvedValueOnce([{
        name: `crawl:${crawlId}:events`,
        messages: [
          { id: '1-0', fieldValues: { event: 'progress', data: JSON.stringify({ processed: 1 }) } },
          { id: '2-0', fieldValues: { event: 'progress', data: JSON.stringify({ processed: 2 }) } },
          { id: '3-0', fieldValues: { event: 'progress', data: JSON.stringify({ processed: 3 }) } }
        ]
      }]).mockResolvedValueOnce(null)
      
      // First stream
      const request1 = new NextRequest(`http://localhost/api/v4/crawls/${crawlId}/stream`)
      const response1 = await streamProgress(request1, { params: { crawlId } })
      
      const reader1 = response1.body!.getReader()
      await reader1.read()
      await reader1.cancel()
      
      // Second connection with Last-Event-ID
      mockRedis.xread.mockResolvedValueOnce([{
        name: `crawl:${crawlId}:events`,
        messages: [
          { id: '4-0', fieldValues: { event: 'progress', data: JSON.stringify({ processed: 4 }) } },
          { id: '5-0', fieldValues: { event: 'completed', data: JSON.stringify({ success: true }) } }
        ]
      }]).mockResolvedValueOnce(null)
      
      const request2 = new NextRequest(
        `http://localhost/api/v4/crawls/${crawlId}/stream`,
        { headers: { 'Last-Event-ID': '3-0' } }
      )
      const response2 = await streamProgress(request2, { params: { crawlId } })
      
      // Verify xread was called with correct position
      expect(mockRedis.xread).toHaveBeenLastCalledWith(
        'STREAMS',
        `crawl:${crawlId}:events`,
        '3-0'
      )
      
      const reader2 = response2.body!.getReader()
      const decoder = new TextDecoder()
      const chunks: string[] = []
      
      while (true) {
        const { done, value } = await reader2.read()
        if (done) break
        chunks.push(decoder.decode(value))
      }
      
      const resumedStream = chunks.join('')
      
      // Should only have events after 3-0
      expect(resumedStream).not.toContain('id: 3-0')
      expect(resumedStream).toContain('id: 4-0')
      expect(resumedStream).toContain('id: 5-0')
    })
  })
  
  describe('Stress Tests', () => {
    it('should handle rapid connection/disconnection cycles', async () => {
      const crawlId = 'stress-test'
      const userId = 'test-user'
      
      vi.mocked(getServerSession).mockResolvedValue({ user: { id: userId } } as any)
      mockRedis.get.mockResolvedValue(JSON.stringify({ userId }))
      mockRedis.xread.mockResolvedValue(null) // No events
      
      const connections = []
      
      // Create and immediately close 20 connections
      for (let i = 0; i < 20; i++) {
        const request = new NextRequest(`http://localhost/api/v4/crawls/${crawlId}/stream`)
        const response = await streamProgress(request, { params: { crawlId } })
        
        const reader = response.body!.getReader()
        connections.push({ reader, response })
        
        // Immediately cancel
        await reader.cancel()
      }
      
      // All Redis connections should be cleaned up
      expect(mockRedis.quit).toHaveBeenCalledTimes(20)
    })
    
    it('should handle multiple users creating crawls simultaneously', async () => {
      const users = Array.from({ length: 10 }, (_, i) => ({
        id: `user-${i}`,
        email: `user${i}@example.com`
      }))
      
      const crawlPromises = users.map(async (user, i) => {
        vi.mocked(getServerSession).mockResolvedValueOnce({ user } as any)
        mockDb.returning.mockResolvedValueOnce([{
          id: `crawl-${i}`,
          userId: user.id,
          url: `https://site${i}.com`,
          status: 'pending'
        }])
        
        const request = new NextRequest('http://localhost/api/v4/crawls', {
          method: 'POST',
          body: JSON.stringify({ url: `https://site${i}.com` })
        })
        
        return createCrawl(request)
      })
      
      const responses = await Promise.all(crawlPromises)
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200)
      })
      
      // Verify all were queued
      expect(mockRedis.lpush).toHaveBeenCalledTimes(10)
    })
  })
  
  describe('Error Recovery', () => {
    it('should recover from Redis failures gracefully', async () => {
      const crawlId = 'recovery-test'
      const userId = 'test-user'
      
      vi.mocked(getServerSession).mockResolvedValue({ user: { id: userId } } as any)
      
      // Simulate Redis failure then recovery
      mockRedis.get
        .mockRejectedValueOnce(new Error('Redis connection lost'))
        .mockResolvedValueOnce(JSON.stringify({ userId }))
      
      // First attempt fails
      const request1 = new NextRequest(`http://localhost/api/v4/crawls/${crawlId}`)
      const response1 = await getCrawlStatus(request1, { params: { crawlId } })
      
      expect(response1.status).toBe(500)
      
      // Second attempt succeeds
      const request2 = new NextRequest(`http://localhost/api/v4/crawls/${crawlId}`)
      const response2 = await getCrawlStatus(request2, { params: { crawlId } })
      
      expect(response2.status).toBe(200)
    })
    
    it('should complete crawls atomically even with concurrent updates', async () => {
      const crawlId = 'atomic-test'
      
      // Setup multiple workers trying to complete the same crawl
      const completionAttempts = Array.from({ length: 5 }, async () => {
        const job = {
          id: 'final-job',
          type: 'crawl' as const,
          crawlId,
          url: 'https://example.com/final',
          depth: 0
        }
        
        mockRedis.brpop.mockResolvedValueOnce(['v4:queue:crawl', JSON.stringify(job)])
        mockRedis.get.mockResolvedValue(JSON.stringify({
          url: 'https://example.com',
          maxPages: 10
        }))
        mockRedis.hget.mockResolvedValueOnce('9') // One away from completion
        
        // Only one should succeed with atomic increment
        mockRedis.exec.mockResolvedValueOnce([10, 'OK', 1])
        
        const worker = new V4QueueWorker()
        await worker.start()
        await setTimeout(100)
        await worker.stop()
      })
      
      await Promise.all(completionAttempts)
      
      // Only one completion event should be emitted
      const completionCalls = mockRedis.xadd.mock.calls.filter(
        call => call[3] === 'completed'
      )
      expect(completionCalls.length).toBe(1)
    })
  })
})