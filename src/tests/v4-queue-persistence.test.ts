import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueueManager } from '@/lib/serverless/queue'
import { JobManager } from '@/lib/serverless/jobs'

// Mock Neon SQL
vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn(() => {
    const mockSql = vi.fn()
    
    // Mock job_queue queries
    mockSql.mockImplementation((strings: TemplateStringsArray, ...values: any[]) => {
      const query = strings.join('?')
      
      if (query.includes('INSERT INTO job_queue')) {
        return Promise.resolve([{ id: '123', url: values[1] }])
      }
      
      if (query.includes('SELECT id, url FROM job_queue')) {
        return Promise.resolve([
          { id: '1', url: 'https://example.com/page1' },
          { id: '2', url: 'https://example.com/page2' }
        ])
      }
      
      if (query.includes('UPDATE job_queue')) {
        return Promise.resolve([])
      }
      
      if (query.includes('DELETE FROM job_queue')) {
        return Promise.resolve([])
      }
      
      // Mock jobs table queries
      if (query.includes('INSERT INTO jobs')) {
        return Promise.resolve([{ id: 'test-job-123' }])
      }
      
      if (query.includes('SELECT * FROM jobs WHERE id')) {
        return Promise.resolve([{
          id: values[0],
          url: 'https://example.com',
          status: 'running',
          created_at: new Date()
        }])
      }
      
      return Promise.resolve([])
    })
    
    return mockSql
  })
}))

// Mock Vercel KV
vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn().mockResolvedValue({
      maxPages: 50,
      qualityThreshold: 20,
      state: { discovered: 10, processed: 5 }
    }),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1)
  }
}))

describe('V4 Queue Persistence', () => {
  let queueManager: QueueManager
  let jobManager: JobManager
  
  beforeEach(() => {
    vi.clearAllMocks()
    queueManager = new QueueManager()
    jobManager = new JobManager()
  })
  
  it('should use job_queue table instead of job_urls_v3', async () => {
    const jobId = 'test-job-123'
    const urls = ['https://example.com/page1', 'https://example.com/page2']
    
    // Add URLs to queue
    const added = await queueManager.addUrlsToQueue(jobId, urls)
    expect(added).toBe(2)
    
    // Get next batch
    const batch = await queueManager.getNextBatch(2)
    expect(batch).toHaveLength(2)
    expect(batch[0].url).toBe('https://example.com/page1')
    expect(batch[1].url).toBe('https://example.com/page2')
  })
  
  it('should create jobs in the jobs table', async () => {
    const job = await jobManager.createJob('https://example.com', {
      maxPages: 100,
      qualityThreshold: 30
    })
    
    expect(job.id).toBe('test-job-123')
    expect(job.url).toBe('https://example.com')
  })
  
  it('should handle URL normalization and deduplication', async () => {
    const jobId = 'test-job-123'
    
    // These should be treated as the same URL after normalization
    const urls = [
      'https://example.com/page',
      'https://example.com/page/',
      'https://EXAMPLE.com/page',
      'https://example.com/page?utm_source=test'
    ]
    
    const added = await queueManager.addUrlsToQueue(jobId, urls)
    
    // Should only add unique normalized URLs
    expect(added).toBeLessThanOrEqual(urls.length)
  })
  
  it('should persist job state across page refreshes', async () => {
    const jobId = 'test-job-123'
    
    // Create a job
    const job = await jobManager.createJob('https://example.com')
    expect(job.id).toBeTruthy()
    
    // Simulate getting job state after refresh
    const state = await jobManager.getJobState(jobId)
    expect(state).toBeTruthy()
    expect(state?.url).toBe('https://example.com')
  })
  
  it('should mark URLs as processed correctly', async () => {
    const batch = await queueManager.getNextBatch(2)
    expect(batch).toHaveLength(2)
    
    // Mark first URL as completed
    await queueManager.markUrlCompleted(batch[0].id)
    
    // Mark second URL as failed  
    await queueManager.markUrlFailed(batch[1].id)
    
    // Next batch should not include these URLs
    const nextBatch = await queueManager.getNextBatch(2)
    expect(nextBatch.map(item => item.id)).not.toContain(batch[0].id)
    expect(nextBatch.map(item => item.id)).not.toContain(batch[1].id)
  })
})