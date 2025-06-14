import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock redis before imports
vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    xadd: vi.fn(),
    xread: vi.fn(),
    quit: vi.fn(),
  }))
}))

// Mock database operations
vi.mock('@/lib/serverless/db-operations', () => ({
  createJob: vi.fn(),
  getJob: vi.fn(),
  getSSEEvents: vi.fn(),
  updateJobStatus: vi.fn(),
  updateJobProgress: vi.fn(),
  addSSEEvent: vi.fn(),
  addDiscoveredUrl: vi.fn(),
  isUrlDiscovered: vi.fn(),
}))

// Mock auth
vi.mock('@/lib/serverless/auth', () => ({
  getUserId: vi.fn(),
  getUserJobKey: vi.fn((userId: string, jobId: string, suffix?: string) => 
    suffix ? `user:${userId}:job:${jobId}:${suffix}` : `user:${userId}:job:${jobId}`
  ),
}))

// Mock Vercel functions
vi.mock('@vercel/functions', () => ({
  waitUntil: vi.fn((promise: Promise<any>) => promise)
}))

import { GET as streamGET } from '@/app/api/v4/jobs/[id]/stream/route'
import { POST as createJob } from '@/app/api/v4/jobs/route'
import { POST as processJob } from '@/app/api/v4/process/route'
import { createClient } from 'redis'
import { 
  createJob as dbCreateJob, 
  getJob as dbGetJob, 
  getSSEEvents,
  updateJobStatus,
  addSSEEvent,
} from '@/lib/serverless/db-operations'
import { getUserId } from '@/lib/serverless/auth'

describe('V4 Critical Fixes Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  
  afterEach(() => {
    vi.clearAllMocks()
  })
  
  describe('SSE Stream with Resumable-Stream', () => {
    it('should use resumable-stream correctly for SSE', async () => {
      const jobId = 'test-job-123'
      const userId = 'test-user-001'
      
      // Mock auth
      vi.mocked(getUserId).mockResolvedValue(userId)
      
      // Mock job exists
      vi.mocked(dbGetJob).mockResolvedValue({
        id: jobId,
        url: 'https://example.com',
        status: 'running',
        user_id: userId
      })
      
      // Mock SSE events
      vi.mocked(getSSEEvents)
        .mockResolvedValueOnce([
          { event_id: '1', event_type: 'progress', event_data: { processed: 1, total: 10 } },
          { event_id: '2', event_type: 'progress', event_data: { processed: 2, total: 10 } }
        ])
        .mockResolvedValueOnce([
          { event_id: '3', event_type: 'job_completed', event_data: { pages: 10 } }
        ])
        .mockResolvedValueOnce([])
      
      const request = new NextRequest(`http://localhost/api/v4/jobs/${jobId}/stream`)
      const response = await streamGET(request, { params: Promise.resolve({ id: jobId }) })
      
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream')
      expect(response.headers.get('Cache-Control')).toBe('no-cache')
      
      // Verify Redis clients were created for resumable-stream
      expect(createClient).toHaveBeenCalledTimes(2) // Publisher and subscriber
    })
    
    it('should handle Last-Event-ID for stream resumption', async () => {
      const jobId = 'test-job-456'
      const userId = 'test-user-001'
      const lastEventId = '5'
      
      vi.mocked(getUserId).mockResolvedValue(userId)
      vi.mocked(dbGetJob).mockResolvedValue({
        id: jobId,
        url: 'https://example.com',
        status: 'running',
        user_id: userId
      })
      
      // Mock events after the last ID
      vi.mocked(getSSEEvents).mockResolvedValueOnce([
        { event_id: '6', event_type: 'progress', event_data: { processed: 6, total: 10 } },
        { event_id: '7', event_type: 'job_completed', event_data: { pages: 10 } }
      ])
      
      const request = new NextRequest(
        `http://localhost/api/v4/jobs/${jobId}/stream?resumeAt=${lastEventId}`
      )
      
      const response = await streamGET(request, { params: Promise.resolve({ id: jobId }) })
      
      expect(response.status).toBe(200)
      
      // Verify getSSEEvents was called with the correct starting position
      expect(getSSEEvents).toHaveBeenCalledWith(userId, jobId, undefined)
    })
  })
  
  describe('User Isolation', () => {
    it('should prevent users from accessing each other\'s jobs', async () => {
      const jobId = 'other-user-job'
      const currentUserId = 'user-a'
      const otherUserId = 'user-b'
      
      // Mock current user
      vi.mocked(getUserId).mockResolvedValue(currentUserId)
      
      // Mock job belongs to another user
      vi.mocked(dbGetJob).mockResolvedValue(null) // No job found for this user
      
      const request = new NextRequest(`http://localhost/api/v4/jobs/${jobId}/stream`)
      const response = await streamGET(request, { params: Promise.resolve({ id: jobId }) })
      
      // Should still return 200 but with error event
      expect(response.status).toBe(200)
      
      // Read the stream to verify error event
      const reader = response.body!.getReader()
      const { value } = await reader.read()
      const text = new TextDecoder().decode(value)
      
      expect(text).toContain('event: error')
      expect(text).toContain('Job not found')
    })
    
    it('should create jobs with proper user isolation', async () => {
      const userId = 'creating-user'
      const url = 'https://example.com'
      const jobId = 'new-job-id'
      
      vi.mocked(getUserId).mockResolvedValue(userId)
      vi.mocked(dbCreateJob).mockResolvedValue(jobId)
      
      const request = new NextRequest('http://localhost/api/v4/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })
      
      const response = await createJob(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      
      expect(data.jobId).toBe(jobId)
      expect(dbCreateJob).toHaveBeenCalledWith(userId, url)
    })
  })
  
  describe('Queue-Based Processing', () => {
    it('should process jobs without polling', async () => {
      const jobId = 'process-job-123'
      const userId = 'test-user'
      
      vi.mocked(getUserId).mockResolvedValue(userId)
      
      const request = new NextRequest('http://localhost/api/v4/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
      })
      
      // Mock the imports we need
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('<html><body><h1>Test Page</h1></body></html>')
      })
      global.fetch = mockFetch
      
      vi.mocked(dbGetJob).mockResolvedValue({
        id: jobId,
        url: 'https://example.com',
        status: 'running',
        user_id: userId
      })
      
      vi.mocked(updateJobStatus).mockResolvedValue(undefined)
      vi.mocked(addSSEEvent).mockResolvedValue(undefined)
      
      const response = await processJob(request)
      
      expect(response.status).toBe(200)
      
      // Verify job processing events were emitted
      expect(addSSEEvent).toHaveBeenCalledWith(
        userId,
        jobId,
        expect.any(String), // event ID
        'job_started',
        expect.any(Object)
      )
    })
  })
  
  describe('Redis Connection Management', () => {
    it('should clean up Redis connections on stream end', async () => {
      const jobId = 'cleanup-test'
      const userId = 'test-user'
      
      vi.mocked(getUserId).mockResolvedValue(userId)
      vi.mocked(dbGetJob).mockResolvedValue({
        id: jobId,
        url: 'https://example.com',
        status: 'completed',
        user_id: userId
      })
      
      vi.mocked(getSSEEvents).mockResolvedValue([
        { event_id: '1', event_type: 'job_completed', event_data: { pages: 5 } }
      ])
      
      const mockRedisClient = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        on: vi.fn(),
        xadd: vi.fn(),
        xread: vi.fn(),
        quit: vi.fn(),
      }
      
      vi.mocked(createClient).mockReturnValue(mockRedisClient as any)
      
      const request = new NextRequest(`http://localhost/api/v4/jobs/${jobId}/stream`)
      const response = await streamGET(request, { params: Promise.resolve({ id: jobId }) })
      
      // Read the stream to completion
      const reader = response.body!.getReader()
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }
      
      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Verify Redis was cleaned up
      expect(mockRedisClient.disconnect).toHaveBeenCalledTimes(2) // Publisher and subscriber
    })
  })
  
  describe('Full Integration Flow', () => {
    it('should handle complete job lifecycle with proper isolation', async () => {
      const userId = 'integration-user'
      const url = 'https://docs.example.com'
      const jobId = 'integration-job'
      
      // Step 1: Create job
      vi.mocked(getUserId).mockResolvedValue(userId)
      vi.mocked(dbCreateJob).mockResolvedValue(jobId)
      
      const createRequest = new NextRequest('http://localhost/api/v4/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })
      
      const createResponse = await createJob(createRequest)
      expect(createResponse.status).toBe(200)
      
      const { jobId: createdJobId } = await createResponse.json()
      expect(createdJobId).toBe(jobId)
      
      // Step 2: Stream progress
      vi.mocked(dbGetJob).mockResolvedValue({
        id: jobId,
        url,
        status: 'running',
        user_id: userId
      })
      
      vi.mocked(getSSEEvents)
        .mockResolvedValueOnce([
          { event_id: '1', event_type: 'progress', event_data: { processed: 1, total: 3 } }
        ])
        .mockResolvedValueOnce([
          { event_id: '2', event_type: 'job_completed', event_data: { pages: 3 } }
        ])
      
      const streamRequest = new NextRequest(`http://localhost/api/v4/jobs/${jobId}/stream`)
      const streamResponse = await streamGET(streamRequest, { params: Promise.resolve({ id: jobId }) })
      
      expect(streamResponse.status).toBe(200)
      
      // Verify user isolation throughout
      expect(dbGetJob).toHaveBeenCalledWith(userId, jobId)
      expect(getSSEEvents).toHaveBeenCalledWith(userId, jobId, undefined)
    })
  })
})