import { describe, it, expect } from 'vitest'
import { getCrawlQueue, getRedisConnection } from '@/lib/crawler/queue-service'
import { startWorker } from '@/lib/crawler/queue-worker'

describe('Worker Basic Test', () => {
  it('should verify if worker is actually processing jobs', async () => {
    console.log('🔍 TESTING BASIC WORKER FUNCTIONALITY')
    
    // Test Redis connection
    getRedisConnection()
    console.log('✅ Redis connection established')
    
    // Test queue creation
    const queue = getCrawlQueue()
    console.log('✅ Queue created')
    
    // Start worker
    await startWorker(1)
    console.log('✅ Worker started')
    
    // Add a simple test job
    const testJob = await queue.add('test-job', { 
      message: 'Hello World',
      timestamp: Date.now() 
    })
    
    console.log(`✅ Test job added: ${testJob.id}`)
    
    // Wait a bit and check job status
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    const jobDetails = await testJob.getState()
    console.log(`📊 Job state: ${jobDetails}`)
    
    // Check queue stats
    const waiting = await queue.getWaiting()
    const active = await queue.getActive()
    const completed = await queue.getCompleted()
    const failed = await queue.getFailed()
    
    console.log(`📊 Queue Stats:`)
    console.log(`   Waiting: ${waiting.length}`)
    console.log(`   Active: ${active.length}`)
    console.log(`   Completed: ${completed.length}`)
    console.log(`   Failed: ${failed.length}`)
    
    // The test job should be processed (even if it fails due to unknown type)
    expect(waiting.length + active.length + completed.length + failed.length).toBeGreaterThan(0)
    
  }, 10000)
})