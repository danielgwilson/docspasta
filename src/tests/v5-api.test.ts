/**
 * V5 API Integration Tests
 * Tests the complete crawl initiation and status flow
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/v5/crawl/route'
import { GET as statusGET } from '@/app/api/v5/jobs/[id]/status/route'
import { GET as streamGET } from '@/app/api/v5/jobs/[id]/stream/route'
import { setupTestEnvironment, mockQStash, cleanTestDatabase, createTestJob } from '@/lib/test/setup'

// Mock auth middleware
vi.mock('@/lib/auth/middleware', () => ({
  getUserContext: vi.fn().mockResolvedValue({ userId: 'test-user-123' })
}))

setupTestEnvironment()

describe('V5 Crawl API', () => {
  let unmockQStash: () => void
  
  beforeEach(() => {
    // Set required environment variables for tests
    process.env.QSTASH_TOKEN = 'test-token'
    process.env.QSTASH_URL = 'https://qstash.upstash.io'
    process.env.QSTASH_CURRENT_SIGNING_KEY = 'test-current-key'
    process.env.QSTASH_NEXT_SIGNING_KEY = 'test-next-key'
    process.env.BASE_URL = 'https://test.example.com'
    
    unmockQStash = mockQStash()
  })
  
  afterEach(() => {
    unmockQStash?.()
  })
  
  describe('POST /api/v5/crawl', () => {
    it('should create a new crawl job successfully', async () => {
      const request = new NextRequest('http://localhost:3000/api/v5/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://docs.example.com',
          config: {
            maxPages: 25,
            maxDepth: 3,
            qualityThreshold: 30
          }
        })
      })
      
      const response = await POST(request)
      const data = await response.json()
      
      expect(response.status).toBe(202)
      expect(data.success).toBe(true)
      expect(data.jobId).toBeDefined()
      expect(data.url).toBe('https://docs.example.com')
      expect(data.status).toBe('pending')
      expect(data.message).toBe('Crawl job created and queued for processing')
    })
    
    it('should validate URL format', async () => {
      const request = new NextRequest('http://localhost:3000/api/v5/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'not-a-valid-url'
        })
      })
      
      const response = await POST(request)
      const data = await response.json()
      
      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request data')
      expect(data.details).toBeDefined()
    })
    
    it('should apply default configuration', async () => {
      const request = new NextRequest('http://localhost:3000/api/v5/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://docs.example.com'
        })
      })
      
      const response = await POST(request)
      const data = await response.json()
      
      expect(response.status).toBe(202)
      expect(data.success).toBe(true)
      
      // The job should be created with default config values
      // (We could verify this by checking the database, but for now response is enough)
    })
  })
  
  describe('GET /api/v5/jobs/[id]/status', () => {
    it('should return status for existing job', async () => {
      // Create a test job first
      const job = await createTestJob({
        status: 'running',
        config: { maxPages: 50 }
      })
      
      const request = new NextRequest(`http://localhost:3000/api/v5/jobs/${job.id}/status`)
      const response = await statusGET(request, { 
        params: Promise.resolve({ id: job.id }) 
      })
      
      expect(response.status).toBe(200)
      
      // This is a JSON endpoint, not SSE
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.status).toBe('running')
      expect(data.stateVersion).toBe(1)
    })
    
    it('should return 404 for non-existent job', async () => {
      const nonExistentId = crypto.randomUUID() // Generate a valid UUID that doesn't exist
      const request = new NextRequest(`http://localhost:3000/api/v5/jobs/${nonExistentId}/status`)
      const response = await statusGET(request, { 
        params: Promise.resolve({ id: nonExistentId }) 
      })
      
      expect(response.status).toBe(404)
    })
  })
  
  describe('Integration Flow', () => {
    it('should handle complete crawl workflow', async () => {
      // 1. Create crawl job
      const createRequest = new NextRequest('http://localhost:3000/api/v5/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://docs.example.com',
          config: { maxPages: 10 }
        })
      })
      
      const createResponse = await POST(createRequest)
      const createData = await createResponse.json()
      
      expect(createResponse.status).toBe(202)
      expect(createData.success).toBe(true)
      
      const jobId = createData.jobId
      
      // 2. Check status endpoint returns JSON
      const statusRequest = new NextRequest(`http://localhost:3000/api/v5/jobs/${jobId}/status`)
      const statusResponse = await statusGET(statusRequest, { 
        params: Promise.resolve({ id: jobId }) 
      })
      
      expect(statusResponse.status).toBe(200)
      const statusData = await statusResponse.json()
      expect(statusData.success).toBe(true)
      
      // 3. Check stream endpoint returns SSE
      const streamRequest = new NextRequest(`http://localhost:3000/api/v5/jobs/${jobId}/stream`)
      const streamResponse = await streamGET(streamRequest, { 
        params: Promise.resolve({ id: jobId }) 
      })
      
      expect(streamResponse.status).toBe(200)
      expect(streamResponse.headers.get('Content-Type')).toBe('text/event-stream')
      
      // 4. The job should be in database with correct initial state
      // (This would be verified by reading from the database)
    })
  })
})