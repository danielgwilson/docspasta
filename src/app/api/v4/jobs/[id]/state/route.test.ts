import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'

// Mock the neon client
vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn()
}))

// Mock getUserId
vi.mock('@/lib/serverless/auth', () => ({
  getUserId: vi.fn()
}))

import { neon } from '@neondatabase/serverless'
import { getUserId } from '@/lib/serverless/auth'

describe('GET /api/v4/jobs/[id]/state', () => {
  let mockSql: any
  
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock environment variable
    process.env.DATABASE_URL_UNPOOLED = 'postgres://test'
    
    // Create a tagged template function mock
    mockSql = vi.fn((strings: TemplateStringsArray, ...values: any[]) => {
      // Return a promise that resolves to mock data
      return Promise.resolve([])
    })
    vi.mocked(neon).mockReturnValue(mockSql)
    vi.mocked(getUserId).mockResolvedValue('test-user-123')
  })
  
  it('should return job state with recent activity', async () => {
    const jobId = 'job-123'
    const mockJob = {
      id: jobId,
      status: 'processing',
      totalProcessed: 45,
      totalDiscovered: 89,
      error_message: null
    }
    
    // Mock events simulating what would be returned from DB
    // After reverse(), evt-123457 becomes the lastEventId
    const mockEvents = [
      {
        event_id: 'evt-123456',
        event_type: 'url_crawled',
        event_data: { url: 'https://example.com/page1' },
        created_at: new Date('2024-01-01T12:00:00Z')
      },
      {
        event_id: 'evt-123457',
        event_type: 'batch_progress',
        event_data: { urls: ['https://example.com/page2', 'https://example.com/page3'] },
        created_at: new Date('2024-01-01T12:01:00Z')
      }
    ]
    
    // Mock SQL queries with different return values
    let callCount = 0
    mockSql.mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve([mockJob])
      if (callCount === 2) {
        // Return events - they should already be in DESC order by created_at
        return Promise.resolve(mockEvents)
      }
      return Promise.resolve([])
    })
    
    const request = new NextRequest('http://localhost:3000/api/v4/jobs/job-123/state')
    const response = await GET(request, { params: Promise.resolve({ id: jobId }) })
    
    const data = await response.json()
    
    expect(response.status).toBe(200)
    expect(data).toEqual({
      success: true,
      status: 'processing',
      totalProcessed: 45,
      totalDiscovered: 89,
      recentActivity: [
        {
          type: 'url_crawled',
          url: 'https://example.com/page2',
          timestamp: '2024-01-01T12:01:00.000Z'
        },
        {
          type: 'url_crawled',
          url: 'https://example.com/page3',
          timestamp: '2024-01-01T12:01:00.000Z'
        },
        {
          type: 'url_crawled',
          url: 'https://example.com/page1',
          timestamp: '2024-01-01T12:00:00.000Z'
        }
      ],
      lastEventId: 'evt-123457',
      error: null
    })
  })
  
  it('should return 404 if job not found', async () => {
    // Always return empty array (no job found)
    mockSql.mockImplementation(() => Promise.resolve([]))
    
    const request = new NextRequest('http://localhost:3000/api/v4/jobs/nonexistent/state')
    const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) })
    
    const data = await response.json()
    
    expect(response.status).toBe(404)
    expect(data).toEqual({
      success: false,
      error: 'Job not found'
    })
  })
  
  it('should handle jobs with no events', async () => {
    const mockJob = {
      id: 'job-123',
      status: 'running',
      totalProcessed: 0,
      totalDiscovered: 0,
      error_message: null
    }
    
    let callCount = 0
    mockSql.mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve([mockJob])
      return Promise.resolve([]) // Empty events
    })
    
    const request = new NextRequest('http://localhost:3000/api/v4/jobs/job-123/state')
    const response = await GET(request, { params: Promise.resolve({ id: 'job-123' }) })
    
    const data = await response.json()
    
    expect(response.status).toBe(200)
    expect(data).toEqual({
      success: true,
      status: 'running',
      totalProcessed: 0,
      totalDiscovered: 0,
      recentActivity: [],
      lastEventId: null,
      error: null
    })
  })
  
  it('should include error message for failed jobs', async () => {
    const mockJob = {
      id: 'job-123',
      status: 'failed',
      totalProcessed: 10,
      totalDiscovered: 50,
      error_message: 'Network timeout'
    }
    
    let callCount = 0
    mockSql.mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve([mockJob])
      return Promise.resolve([]) // Empty events
    })
    
    const request = new NextRequest('http://localhost:3000/api/v4/jobs/job-123/state')
    const response = await GET(request, { params: Promise.resolve({ id: 'job-123' }) })
    
    const data = await response.json()
    
    expect(response.status).toBe(200)
    expect(data.error).toBe('Network timeout')
  })
  
  it('should handle database errors gracefully', async () => {
    // Mock SQL to throw an error
    mockSql.mockImplementation(() => Promise.reject(new Error('Database connection failed')))
    
    const request = new NextRequest('http://localhost:3000/api/v4/jobs/job-123/state')
    const response = await GET(request, { params: Promise.resolve({ id: 'job-123' }) })
    
    const data = await response.json()
    
    expect(response.status).toBe(500)
    expect(data).toEqual({
      success: false,
      error: 'Database connection failed'
    })
  })
})