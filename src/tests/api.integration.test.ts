import { describe, it, expect, beforeEach } from 'vitest'
import { POST } from '@/app/api/crawl/route'
import { GET } from '@/app/api/crawl/[id]/route'
import { NextRequest } from 'next/server'
import { memoryStore } from '@/lib/storage/memory-store'

// Mock NextRequest
function createMockRequest(url: string, options: { method?: string; body?: any } = {}) {
  const { method = 'GET', body } = options
  
  return new NextRequest(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('API Integration Tests', () => {
  beforeEach(() => {
    // Clean memory store before each test
    memoryStore.getAllCrawls().forEach(crawl => {
      memoryStore.clearOldCrawls(0) // Clear all crawls
    })
  })

  describe('POST /api/crawl', () => {
    it('should create a new crawl for valid URL', async () => {
      const request = createMockRequest('http://localhost:3000/api/crawl', {
        method: 'POST',
        body: { url: 'https://docs.lovable.dev/introduction' }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data?.id).toMatch(/^crawl_\d+_[a-z0-9]+$/)
      expect(data.data?.url).toBe('https://docs.lovable.dev/introduction')
      expect(data.data?.status).toBe('started')
    })

    it('should reject invalid URLs', async () => {
      const request = createMockRequest('http://localhost:3000/api/crawl', {
        method: 'POST',
        body: { url: 'not-a-valid-url' }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toContain('Invalid URL format')
    })

    it('should require URL parameter', async () => {
      const request = createMockRequest('http://localhost:3000/api/crawl', {
        method: 'POST',
        body: {}
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toContain('URL is required')
    })

    it('should handle docspasta.com easter egg', async () => {
      const request = createMockRequest('http://localhost:3000/api/crawl', {
        method: 'POST',
        body: { url: 'https://docspasta.com' }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data?.id).toMatch(/^farewell_\d+_v1$/)
      expect(data.data?.status).toBe('started')
    })
  })

  describe('GET /api/crawl/[id]', () => {
    it('should return crawl status for valid ID', async () => {
      // First create a crawl
      const createRequest = createMockRequest('http://localhost:3000/api/crawl', {
        method: 'POST',
        body: { url: 'https://example.com' }
      })

      const createResponse = await POST(createRequest)
      const createData = await createResponse.json()
      const crawlId = createData.data?.id

      expect(crawlId).toBeDefined()

      // Then check its status
      const statusRequest = createMockRequest(`http://localhost:3000/api/crawl/${crawlId}`)
      
      const response = await GET(statusRequest, { 
        params: Promise.resolve({ id: crawlId }) 
      })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data?.id).toBe(crawlId)
      expect(data.data?.status).toBeDefined()
    })

    it('should return 404 for non-existent crawl ID', async () => {
      const request = createMockRequest('http://localhost:3000/api/crawl/invalid-id')
      
      const response = await GET(request, { 
        params: Promise.resolve({ id: 'invalid-id' }) 
      })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.success).toBe(false)
      expect(data.error).toContain('Crawl not found')
    })

    it('should handle farewell easter egg', async () => {
      const farewellId = 'farewell_123_v1'
      const request = createMockRequest(`http://localhost:3000/api/crawl/${farewellId}`)
      
      const response = await GET(request, { 
        params: Promise.resolve({ id: farewellId }) 
      })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data?.status).toBe('completed')
      expect(data.data?.markdown).toContain('FAREWELL TO DOCSPASTA V1')
      expect(data.data?.title).toBe('Farewell to Docspasta V1')
    })

    it('should return 400 for missing ID', async () => {
      const request = createMockRequest('http://localhost:3000/api/crawl/')
      
      const response = await GET(request, { 
        params: Promise.resolve({ id: '' }) 
      })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toContain('Crawl ID is required')
    })
  })

  describe('End-to-end crawl flow', () => {
    it('should complete full crawl cycle for simple URL', async () => {
      // Start crawl
      const createRequest = createMockRequest('http://localhost:3000/api/crawl', {
        method: 'POST',
        body: { url: 'https://httpbin.org/html' }
      })

      const createResponse = await POST(createRequest)
      const createData = await createResponse.json()
      const crawlId = createData.data?.id

      expect(crawlId).toBeDefined()

      // Poll for completion (Phase 1 enhanced crawler with better status tracking)
      let finalStatus;
      let finalData;
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500))
        
        const statusRequest = createMockRequest(`http://localhost:3000/api/crawl/${crawlId}`)
        const statusResponse = await GET(statusRequest, { 
          params: Promise.resolve({ id: crawlId }) 
        })
        const statusData = await statusResponse.json()
        
        expect(statusResponse.status).toBe(200)
        expect(statusData.success).toBe(true)
        
        finalStatus = statusData.data?.status;
        finalData = statusData.data;
        
        // Break if we reach a final state
        if (finalStatus === 'completed' || finalStatus === 'error') {
          break;
        }
        
        attempts++;
      }

      // Should eventually reach a final state
      expect(['completed', 'error']).toContain(finalStatus)
      
      if (finalStatus === 'completed') {
        expect(finalData.markdown).toBeDefined()
        expect(finalData.markdown.length).toBeGreaterThan(0)
        expect(finalData.metadata?.totalTokens).toBeGreaterThan(0)
      }
    })
  })
})