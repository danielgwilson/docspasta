import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'
import { getUserId } from '@/lib/serverless/auth'

// Mock dependencies
vi.mock('@/lib/serverless/auth')
vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn(() => {
    const sqlMock = vi.fn()
    sqlMock.mockImplementation((strings: TemplateStringsArray, ...values: any[]) => {
      const query = strings[0]
      
      // Mock response for job queries
      if (query.includes('FROM jobs')) {
        return Promise.resolve([
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            status: 'processing',
            totalProcessed: 45,
            totalDiscovered: 100,
            error_message: null
          },
          {
            id: '550e8400-e29b-41d4-a716-446655440002',
            status: 'completed',
            totalProcessed: 100,
            totalDiscovered: 100,
            error_message: null
          }
        ])
      }
      
      // Mock response for SSE events
      if (query.includes('FROM sse_events')) {
        return Promise.resolve([
          // Events for job1
          {
            job_id: '550e8400-e29b-41d4-a716-446655440001',
            event_id: 'event3',
            event_type: 'url_crawled',
            event_data: { url: 'https://example.com/page3' },
            created_at: new Date('2024-01-01T12:00:02Z')
          },
          {
            job_id: '550e8400-e29b-41d4-a716-446655440001',
            event_id: 'event2',
            event_type: 'batch_progress',
            event_data: { urls: ['https://example.com/page1', 'https://example.com/page2'] },
            created_at: new Date('2024-01-01T12:00:01Z')
          },
          {
            job_id: '550e8400-e29b-41d4-a716-446655440001',
            event_id: 'event1',
            event_type: 'discovery',
            event_data: { discoveredUrls: 100 },
            created_at: new Date('2024-01-01T12:00:00Z')
          },
          // Events for job2
          {
            job_id: '550e8400-e29b-41d4-a716-446655440002',
            event_id: 'event6',
            event_type: 'progress',
            event_data: { processed: 100, total: 100 },
            created_at: new Date('2024-01-01T12:00:05Z')
          },
          {
            job_id: '550e8400-e29b-41d4-a716-446655440002',
            event_id: 'event5',
            event_type: 'url_crawled',
            event_data: { url: 'https://example.com/final' },
            created_at: new Date('2024-01-01T12:00:04Z')
          }
        ])
      }
      
      return Promise.resolve([])
    })
    return sqlMock
  })
}))

describe('POST /api/v4/jobs/batch-state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getUserId).mockResolvedValue('test-user-123')
  })
  
  it('should return states for multiple jobs', async () => {
    const request = new NextRequest('http://localhost:3000/api/v4/jobs/batch-state', {
      method: 'POST',
      body: JSON.stringify({
        jobIds: [
          '550e8400-e29b-41d4-a716-446655440001',
          '550e8400-e29b-41d4-a716-446655440002',
          '550e8400-e29b-41d4-a716-446655440003'
        ]
      })
    })
    
    const response = await POST(request)
    const data = await response.json()
    
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.states).toHaveProperty('550e8400-e29b-41d4-a716-446655440001')
    expect(data.states).toHaveProperty('550e8400-e29b-41d4-a716-446655440002')
    expect(data.notFound).toEqual(['550e8400-e29b-41d4-a716-446655440003'])
    
    // Check job1 state
    expect(data.states['550e8400-e29b-41d4-a716-446655440001']).toEqual({
      status: 'processing',
      totalProcessed: 45,
      totalDiscovered: 100,
      recentActivity: expect.arrayContaining([
        expect.objectContaining({ type: 'discovery', count: 100 }),
        expect.objectContaining({ type: 'url_crawled', url: 'https://example.com/page1' }),
        expect.objectContaining({ type: 'url_crawled', url: 'https://example.com/page2' }),
        expect.objectContaining({ type: 'url_crawled', url: 'https://example.com/page3' })
      ]),
      lastEventId: 'event3',
      error: null
    })
    
    // Check job2 state
    expect(data.states['550e8400-e29b-41d4-a716-446655440002']).toEqual({
      status: 'completed',
      totalProcessed: 100,
      totalDiscovered: 100,
      recentActivity: expect.arrayContaining([
        expect.objectContaining({ type: 'url_crawled', url: 'https://example.com/final' }),
        expect.objectContaining({ type: 'progress', processed: 100, total: 100 })
      ]),
      lastEventId: 'event6',
      error: null
    })
  })
  
  it('should handle empty job list', async () => {
    const request = new NextRequest('http://localhost:3000/api/v4/jobs/batch-state', {
      method: 'POST',
      body: JSON.stringify({
        jobIds: []
      })
    })
    
    const response = await POST(request)
    const data = await response.json()
    
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.states).toEqual({})
    expect(data.notFound).toEqual([])
  })
  
  it('should reject more than 20 jobs', async () => {
    const jobIds = Array.from({ length: 21 }, (_, i) => `job${i}`)
    const request = new NextRequest('http://localhost:3000/api/v4/jobs/batch-state', {
      method: 'POST',
      body: JSON.stringify({ jobIds })
    })
    
    const response = await POST(request)
    const data = await response.json()
    
    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Maximum 20 jobs per request')
  })
  
  it('should validate job ID format', async () => {
    const request = new NextRequest('http://localhost:3000/api/v4/jobs/batch-state', {
      method: 'POST',
      body: JSON.stringify({
        jobIds: ['invalid-id', 'not-a-uuid']
      })
    })
    
    const response = await POST(request)
    const data = await response.json()
    
    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toContain('Invalid job IDs')
  })
  
  it('should handle missing jobIds field', async () => {
    const request = new NextRequest('http://localhost:3000/api/v4/jobs/batch-state', {
      method: 'POST',
      body: JSON.stringify({})
    })
    
    const response = await POST(request)
    const data = await response.json()
    
    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toBe('jobIds must be an array')
  })
})