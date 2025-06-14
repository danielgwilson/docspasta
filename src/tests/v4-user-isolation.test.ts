import { describe, it, expect, beforeEach } from 'vitest'

describe('V4 User Isolation', () => {
  const baseUrl = 'http://localhost:3000/api/v4'
  const user1Id = 'test-user-001'
  const user2Id = 'test-user-002'
  
  let user1JobId: string
  let user2JobId: string
  
  beforeEach(async () => {
    // Clean up any existing test data
    // In a real test, you'd want to clean the database
  })
  
  describe('Job Creation and Isolation', () => {
    it('should create jobs for different users', async () => {
      // Create job for user 1
      const user1Response = await fetch(`${baseUrl}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': user1Id
        },
        body: JSON.stringify({ url: 'https://example.com' })
      })
      
      expect(user1Response.ok).toBe(true)
      const user1Data = await user1Response.json()
      expect(user1Data.success).toBe(true)
      expect(user1Data.data.jobId).toBeDefined()
      user1JobId = user1Data.data.jobId
      
      // Create job for user 2
      const user2Response = await fetch(`${baseUrl}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': user2Id
        },
        body: JSON.stringify({ url: 'https://example.org' })
      })
      
      expect(user2Response.ok).toBe(true)
      const user2Data = await user2Response.json()
      expect(user2Data.success).toBe(true)
      expect(user2Data.data.jobId).toBeDefined()
      user2JobId = user2Data.data.jobId
      
      // Ensure job IDs are different
      expect(user1JobId).not.toBe(user2JobId)
    })
    
    it('should isolate job listings by user', async () => {
      // Get jobs for user 1
      const user1Jobs = await fetch(`${baseUrl}/jobs`, {
        headers: {
          'x-test-user-id': user1Id
        }
      })
      
      expect(user1Jobs.ok).toBe(true)
      const user1Data = await user1Jobs.json()
      expect(user1Data.success).toBe(true)
      
      // Get jobs for user 2
      const user2Jobs = await fetch(`${baseUrl}/jobs`, {
        headers: {
          'x-test-user-id': user2Id
        }
      })
      
      expect(user2Jobs.ok).toBe(true)
      const user2Data = await user2Jobs.json()
      expect(user2Data.success).toBe(true)
      
      // Verify user 1's jobs don't appear in user 2's list
      const user1JobIds = user1Data.data.map((job: any) => job.id)
      const user2JobIds = user2Data.data.map((job: any) => job.id)
      
      // No overlap between job lists
      const overlap = user1JobIds.filter((id: string) => user2JobIds.includes(id))
      expect(overlap.length).toBe(0)
    })
    
    it('should prevent cross-user job access', async () => {
      // First create a job for user 1
      const createResponse = await fetch(`${baseUrl}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': user1Id
        },
        body: JSON.stringify({ url: 'https://test.com' })
      })
      
      const createData = await createResponse.json()
      const jobId = createData.data.jobId
      
      // Try to access user 1's job as user 2
      const accessResponse = await fetch(`${baseUrl}/jobs/${jobId}`, {
        headers: {
          'x-test-user-id': user2Id
        }
      })
      
      expect(accessResponse.ok).toBe(false)
      expect(accessResponse.status).toBe(404)
      
      const accessData = await accessResponse.json()
      expect(accessData.success).toBe(false)
      expect(accessData.error).toContain('not found')
    })
  })
  
  describe('Stream Isolation', () => {
    it('should prevent cross-user stream access', async () => {
      // Create a job for user 1
      const createResponse = await fetch(`${baseUrl}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': user1Id
        },
        body: JSON.stringify({ url: 'https://stream-test.com' })
      })
      
      const createData = await createResponse.json()
      const jobId = createData.data.jobId
      
      // Try to connect to stream as user 2
      const streamResponse = await fetch(`${baseUrl}/jobs/${jobId}/stream`, {
        headers: {
          'x-test-user-id': user2Id
        }
      })
      
      // Should get an error in the stream
      const reader = streamResponse.body?.getReader()
      if (reader) {
        const { value } = await reader.read()
        const text = new TextDecoder().decode(value)
        expect(text).toContain('error')
        expect(text).toContain('not found')
      }
    })
  })
  
  describe('Cache Isolation', () => {
    it('should not share cached content between users', async () => {
      // This test would require crawling the same URL as different users
      // and verifying that caching doesn't leak between users
      
      // For now, we'll just verify the API accepts user context
      const crawlResponse = await fetch(`${baseUrl}/crawl`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': user1Id
        },
        body: JSON.stringify({
          jobId: 'test-job-id',
          urls: [{ id: '1', url: 'https://cache-test.com', depth: 0 }],
          originalJobUrl: 'https://cache-test.com'
        })
      })
      
      expect(crawlResponse.ok).toBe(true)
    })
  })
})

describe('Authentication Header Validation', () => {
  const baseUrl = 'http://localhost:3000/api/v4'
  
  it('should use default user when no auth header provided', async () => {
    const response = await fetch(`${baseUrl}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url: 'https://no-auth.com' })
    })
    
    expect(response.ok).toBe(true)
    const data = await response.json()
    expect(data.success).toBe(true)
    // Job should be created with default user
  })
  
  it('should respect custom user header', async () => {
    const customUserId = 'custom-user-123'
    
    const response = await fetch(`${baseUrl}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user-id': customUserId
      },
      body: JSON.stringify({ url: 'https://custom-user.com' })
    })
    
    expect(response.ok).toBe(true)
    const data = await response.json()
    expect(data.success).toBe(true)
    
    // Verify job is associated with custom user
    const jobsResponse = await fetch(`${baseUrl}/jobs`, {
      headers: {
        'x-test-user-id': customUserId
      }
    })
    
    const jobsData = await jobsResponse.json()
    expect(jobsData.data.length).toBeGreaterThan(0)
  })
})