import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as streamGET } from '@/app/api/v4/crawls/[crawlId]/stream/route'
import { GET as statusGET } from '@/app/api/v4/crawls/[crawlId]/route'
import { POST as createPOST } from '@/app/api/v4/crawls/route'
import { createRedisClient } from '@/lib/v4/redis-client'
import { getServerSession } from 'next-auth'
import { db } from '@/lib/db/db'

vi.mock('@/lib/v4/redis-client')
vi.mock('next-auth')
vi.mock('@/lib/db/db')

describe('User Isolation - Critical Security Tests', () => {
  let mockRedis: any
  let mockDb: any
  
  beforeEach(() => {
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      xread: vi.fn(),
      xadd: vi.fn(),
      exists: vi.fn(),
      quit: vi.fn(),
      disconnect: vi.fn(),
    }
    
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
    }
    
    vi.mocked(createRedisClient).mockResolvedValue(mockRedis)
    vi.mocked(db).mockReturnValue(mockDb as any)
  })
  
  afterEach(() => {
    vi.clearAllMocks()
  })
  
  describe('Stream API User Isolation', () => {
    it('should prevent user A from accessing user B stream', async () => {
      const userACrawlId = 'user-a-crawl-123'
      const userBCrawlId = 'user-b-crawl-456'
      
      // Mock user A session
      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: { id: 'user-a', email: 'a@example.com' }
      } as any)
      
      // Mock Redis data for user B's crawl
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        userId: 'user-b',
        url: 'https://example.com',
        status: 'processing'
      }))
      
      // User A tries to access User B's stream
      const request = new NextRequest(`http://localhost/api/v4/crawls/${userBCrawlId}/stream`)
      const response = await streamGET(request, { params: { crawlId: userBCrawlId } })
      
      // Should be forbidden
      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe('Forbidden')
      
      // Verify Redis was not accessed for stream data
      expect(mockRedis.xread).not.toHaveBeenCalled()
    })
    
    it('should allow user to access their own stream', async () => {
      const userCrawlId = 'user-crawl-123'
      const userId = 'user-123'
      
      // Mock user session
      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: { id: userId, email: 'user@example.com' }
      } as any)
      
      // Mock Redis data for user's own crawl
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        userId: userId,
        url: 'https://example.com',
        status: 'processing'
      }))
      
      mockRedis.xread.mockResolvedValueOnce(null)
      
      const request = new NextRequest(`http://localhost/api/v4/crawls/${userCrawlId}/stream`)
      const response = await streamGET(request, { params: { crawlId: userCrawlId } })
      
      // Should be allowed
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream')
      
      // Verify Redis was accessed
      expect(mockRedis.xread).toHaveBeenCalled()
    })
  })
  
  describe('Status API User Isolation', () => {
    it('should prevent cross-user status access', async () => {
      const otherUserCrawlId = 'other-user-crawl'
      
      // Mock current user
      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: { id: 'current-user', email: 'current@example.com' }
      } as any)
      
      // Mock crawl data from another user
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        userId: 'other-user',
        url: 'https://sensitive.com',
        status: 'completed',
        result: { content: 'sensitive data' }
      }))
      
      const request = new NextRequest(`http://localhost/api/v4/crawls/${otherUserCrawlId}`)
      const response = await statusGET(request, { params: { crawlId: otherUserCrawlId } })
      
      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe('Forbidden')
      
      // Ensure no sensitive data was leaked
      expect(data).not.toHaveProperty('result')
      expect(data).not.toHaveProperty('content')
    })
    
    it('should handle missing crawl data safely', async () => {
      const nonExistentCrawlId = 'non-existent'
      
      // Mock user session
      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: { id: 'user-123', email: 'user@example.com' }
      } as any)
      
      // Mock no crawl data
      mockRedis.get.mockResolvedValueOnce(null)
      
      const request = new NextRequest(`http://localhost/api/v4/crawls/${nonExistentCrawlId}`)
      const response = await statusGET(request, { params: { crawlId: nonExistentCrawlId } })
      
      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('Crawl not found')
    })
  })
  
  describe('Create API User Isolation', () => {
    it('should tag created crawls with user ID', async () => {
      const userId = 'creating-user'
      
      // Mock user session
      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: { id: userId, email: 'creator@example.com' }
      } as any)
      
      // Mock DB insert
      mockDb.returning.mockResolvedValueOnce([{
        id: 'new-crawl-id',
        userId: userId,
        url: 'https://example.com'
      }])
      
      const request = new NextRequest('http://localhost/api/v4/crawls', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com' })
      })
      
      const response = await createPOST(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      
      // Verify the crawl was created with correct user ID
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: userId
        })
      )
      
      // Verify Redis was updated with user ID
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('crawl:'),
        expect.stringContaining(`"userId":"${userId}"`)
      )
    })
    
    it('should require authentication to create crawls', async () => {
      // Mock no session
      vi.mocked(getServerSession).mockResolvedValueOnce(null)
      
      const request = new NextRequest('http://localhost/api/v4/crawls', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com' })
      })
      
      const response = await createPOST(request)
      
      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
      
      // Ensure no crawl was created
      expect(mockDb.insert).not.toHaveBeenCalled()
      expect(mockRedis.set).not.toHaveBeenCalled()
    })
  })
  
  describe('Multi-tenant Data Isolation', () => {
    it('should isolate Redis keys by user', async () => {
      const userACrawl = 'crawl-a'
      const userBCrawl = 'crawl-b'
      
      // Setup two different users' crawl data
      const crawlDataA = {
        userId: 'user-a',
        url: 'https://a.com',
        status: 'processing'
      }
      
      const crawlDataB = {
        userId: 'user-b',
        url: 'https://b.com',
        status: 'completed'
      }
      
      // Mock Redis to return different data based on key
      mockRedis.get.mockImplementation((key: string) => {
        if (key.includes(userACrawl)) return JSON.stringify(crawlDataA)
        if (key.includes(userBCrawl)) return JSON.stringify(crawlDataB)
        return null
      })
      
      // User A accessing their crawl
      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: { id: 'user-a', email: 'a@example.com' }
      } as any)
      
      const requestA = new NextRequest(`http://localhost/api/v4/crawls/${userACrawl}`)
      const responseA = await statusGET(requestA, { params: { crawlId: userACrawl } })
      
      expect(responseA.status).toBe(200)
      
      // User A trying to access User B's crawl
      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: { id: 'user-a', email: 'a@example.com' }
      } as any)
      
      const requestB = new NextRequest(`http://localhost/api/v4/crawls/${userBCrawl}`)
      const responseB = await statusGET(requestB, { params: { crawlId: userBCrawl } })
      
      expect(responseB.status).toBe(403)
    })
    
    it('should prevent event stream contamination between users', async () => {
      const crawlId = 'shared-crawl-id'
      
      // Mock Redis stream with events from multiple users
      mockRedis.xread.mockResolvedValueOnce([{
        name: `crawl:${crawlId}:events`,
        messages: [
          { 
            id: '1-0', 
            fieldValues: { 
              event: 'progress',
              userId: 'user-a',
              data: JSON.stringify({ processed: 1 })
            }
          },
          { 
            id: '2-0', 
            fieldValues: { 
              event: 'progress',
              userId: 'user-b',
              data: JSON.stringify({ processed: 2 })
            }
          }
        ]
      }])
      
      // User A session
      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: { id: 'user-a', email: 'a@example.com' }
      } as any)
      
      // Mock crawl ownership check
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        userId: 'user-a',
        url: 'https://example.com'
      }))
      
      const request = new NextRequest(`http://localhost/api/v4/crawls/${crawlId}/stream`)
      const response = await streamGET(request, { params: { crawlId } })
      
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      const chunks: string[] = []
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(decoder.decode(value, { stream: true }))
      }
      
      const fullResponse = chunks.join('')
      
      // User A should only see their own events
      expect(fullResponse).toContain('"processed":1')
      expect(fullResponse).not.toContain('"processed":2')
    })
  })
})