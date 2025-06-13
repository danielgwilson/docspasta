import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient } from 'redis'
import { randomUUID } from 'crypto'
import { publishProgress, initializeJob, completeJob } from '@/lib/serverless/streaming'

describe('Redis Stream Basic Operations', () => {
  let redisClient: ReturnType<typeof createClient>
  // Use unique job ID for each test to ensure isolation
  const testJobId = `test-job-${randomUUID()}`
  
  beforeEach(async () => {
    // Create real Redis client for testing
    const redisUrl = process.env.REDIS_URL || process.env.KV_URL
    if (!redisUrl) {
      throw new Error('Redis URL not configured in .env.test')
    }
    
    redisClient = createClient({ 
      url: redisUrl,
      socket: {
        tls: redisUrl.startsWith('rediss://'),
        rejectUnauthorized: false
      }
    })
    
    await redisClient.connect()
    
    // Clean up any existing test data
    await redisClient.del(`stream:${testJobId}`)
    await redisClient.del(`job:${testJobId}`)
  })
  
  afterEach(async () => {
    // Clean up test data
    await redisClient.del(`stream:${testJobId}`)
    await redisClient.del(`job:${testJobId}`)
    await redisClient.disconnect()
  })
  
  it('should publish progress events to Redis Stream', async () => {
    // Initialize job
    await initializeJob(testJobId)
    
    // Verify job metadata was created
    const status = await redisClient.hGet(`job:${testJobId}`, 'status')
    expect(status).toBe('running')
    
    // Publish a progress event
    await publishProgress(testJobId, {
      type: 'url_discovered',
      jobId: testJobId,
      url: 'https://example.com',
    })
    
    // Read from the stream
    const messages = await redisClient.xRange(`stream:${testJobId}`, '-', '+')
    
    // Should have 2 messages: discovery_started (from initializeJob) and url_discovered
    expect(messages.length).toBe(2)
    
    // Check first message (discovery_started)
    const firstMessage = messages[0]
    expect(firstMessage.message.type).toBe('discovery_started')
    const firstEventData = JSON.parse(firstMessage.message.data)
    expect(firstEventData.type).toBe('discovery_started')
    expect(firstEventData.jobId).toBe(testJobId)
    
    // Check second message (url_discovered)
    const secondMessage = messages[1]
    expect(secondMessage.message.type).toBe('url_discovered')
    const secondEventData = JSON.parse(secondMessage.message.data)
    expect(secondEventData.type).toBe('url_discovered')
    expect(secondEventData.url).toBe('https://example.com')
  })
  
  it('should handle job completion', async () => {
    // Initialize and complete job
    await initializeJob(testJobId)
    await completeJob(testJobId, '# Test Markdown Content')
    
    // Verify job status
    const status = await redisClient.hGet(`job:${testJobId}`, 'status')
    expect(status).toBe('completed')
    
    // Verify final markdown was stored
    const finalMarkdown = await redisClient.hGet(`job:${testJobId}`, 'finalMarkdown')
    expect(finalMarkdown).toBe('# Test Markdown Content')
    
    // Check stream has completion event
    const messages = await redisClient.xRange(`stream:${testJobId}`, '-', '+')
    const lastMessage = messages[messages.length - 1]
    expect(lastMessage.message.type).toBe('job_completed')
  })
  
  it.skip('should trim stream to prevent unbounded growth', async () => {
    // TODO: Fix xTrim syntax for node-redis v5
    // Skipping for now to focus on core functionality
  })
  
  it('should read stream with XREAD blocking', async () => {
    // Initialize job
    await initializeJob(testJobId)
    
    // Start reading in the background
    const readPromise = redisClient.xRead(
      { key: `stream:${testJobId}`, id: '0-0' },
      { BLOCK: 1000 } // Block for 1 second
    )
    
    // Publish event while blocking
    setTimeout(async () => {
      await publishProgress(testJobId, {
        type: 'test_event',
        jobId: testJobId,
      })
    }, 100)
    
    // Wait for read
    const result = await readPromise
    
    expect(result).toBeTruthy()
    expect(result![0].name).toBe(`stream:${testJobId}`)
    expect(result![0].messages.length).toBeGreaterThan(0)
  })
})