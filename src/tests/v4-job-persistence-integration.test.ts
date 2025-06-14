import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createJob, getActiveJobs, getRecentJobs, updateJobStatus } from '@/lib/serverless/db-operations'

describe('V4 Job Persistence Integration', () => {
  let testJobIds: string[] = []

  afterEach(async () => {
    // Clean up test jobs
    for (const jobId of testJobIds) {
      try {
        await updateJobStatus(jobId, 'cancelled')
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    testJobIds = []
  })

  it('should create a job and retrieve it from active jobs', async () => {
    // Create a test job
    const jobId = await createJob('https://test-persistence.com')
    testJobIds.push(jobId)
    
    expect(jobId).toBeTruthy()
    expect(typeof jobId).toBe('string')
    
    // Retrieve active jobs
    const activeJobs = await getActiveJobs()
    
    // Find our test job
    const testJob = activeJobs.find(job => job.id === jobId)
    expect(testJob).toBeTruthy()
    expect(testJob?.url).toBe('https://test-persistence.com')
    expect(testJob?.status).toBe('running')
  })

  it('should retrieve recent jobs including completed ones', async () => {
    // Create and complete a test job
    const jobId = await createJob('https://test-recent.com')
    testJobIds.push(jobId)
    
    // Mark it as completed
    await updateJobStatus(jobId, 'completed')
    
    // Retrieve recent jobs
    const recentJobs = await getRecentJobs(5)
    
    // Find our test job
    const testJob = recentJobs.find(job => job.id === jobId)
    expect(testJob).toBeTruthy()
    expect(testJob?.url).toBe('https://test-recent.com')
    expect(testJob?.status).toBe('completed')
  })

  it('should not include completed jobs in active jobs', async () => {
    // Create a test job
    const jobId = await createJob('https://test-completed.com')
    testJobIds.push(jobId)
    
    // Mark it as completed
    await updateJobStatus(jobId, 'completed')
    
    // Retrieve active jobs
    const activeJobs = await getActiveJobs()
    
    // Should not find our completed job
    const testJob = activeJobs.find(job => job.id === jobId)
    expect(testJob).toBeUndefined()
  })
})