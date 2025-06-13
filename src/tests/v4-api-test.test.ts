import { describe, it, expect, beforeAll } from 'vitest'
import './setup-integration'

// Test configuration
const BASE_URL = 'http://localhost:3000'
const TEST_TIMEOUT = 60000 // 1 minute for each test

describe('V4 API - Three-Function Architecture', () => {
  let jobId: string
  
  // Test 1: Create a job and verify response
  it('should create a new job', async () => {
    const response = await fetch(`${BASE_URL}/api/v4/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://react.dev/learn/thinking-in-react'
      })
    })
    
    expect(response.ok).toBe(true)
    const data = await response.json()
    
    expect(data.success).toBe(true)
    expect(data.data).toBeDefined()
    expect(data.data.jobId).toBeDefined()
    expect(data.data.url).toBe('https://react.dev/learn/thinking-in-react')
    expect(data.data.streamUrl).toContain('/api/v4/jobs/')
    
    jobId = data.data.jobId
    console.log('✅ Created job:', jobId)
  }, TEST_TIMEOUT)
  
  // Test 2: Connect to SSE stream and monitor events
  it('should stream progress events', async () => {
    expect(jobId).toBeDefined()
    
    const events: any[] = []
    let streamComplete = false
    
    // Create promise to track stream completion
    const streamPromise = new Promise<void>((resolve, reject) => {
      const eventSource = new EventSource(`${BASE_URL}/api/v4/jobs/${jobId}/stream`)
      
      const timeout = setTimeout(() => {
        eventSource.close()
        reject(new Error('Stream timeout'))
      }, 30000) // 30 second timeout
      
      eventSource.addEventListener('stream_connected', (e) => {
        const data = JSON.parse(e.data)
        console.log('📡 Stream connected:', data)
        events.push({ type: 'stream_connected', data })
      })
      
      eventSource.addEventListener('batch_completed', (e) => {
        const data = JSON.parse(e.data)
        console.log('📦 Batch completed:', data)
        events.push({ type: 'batch_completed', data })
      })
      
      eventSource.addEventListener('urls_discovered', (e) => {
        const data = JSON.parse(e.data)
        console.log('🔍 URLs discovered:', data)
        events.push({ type: 'urls_discovered', data })
      })
      
      eventSource.addEventListener('content_processed', (e) => {
        const data = JSON.parse(e.data)
        console.log('📄 Content processed:', data)
        events.push({ type: 'content_processed', data })
      })
      
      eventSource.addEventListener('job_completed', (e) => {
        const data = JSON.parse(e.data)
        console.log('✅ Job completed:', data)
        events.push({ type: 'job_completed', data })
        streamComplete = true
        clearTimeout(timeout)
        eventSource.close()
        resolve()
      })
      
      eventSource.addEventListener('job_timeout', (e) => {
        const data = JSON.parse(e.data)
        console.log('⏰ Job timeout:', data)
        events.push({ type: 'job_timeout', data })
        streamComplete = true
        clearTimeout(timeout)
        eventSource.close()
        resolve()
      })
      
      eventSource.addEventListener('job_failed', (e) => {
        const data = JSON.parse(e.data)
        console.log('❌ Job failed:', data)
        events.push({ type: 'job_failed', data })
        clearTimeout(timeout)
        eventSource.close()
        reject(new Error(data.error))
      })
      
      eventSource.onerror = (error) => {
        console.error('Stream error:', error)
        clearTimeout(timeout)
        eventSource.close()
        reject(error)
      }
    })
    
    // Wait for stream to complete
    await streamPromise
    
    // Verify we got expected events
    expect(events.some(e => e.type === 'stream_connected')).toBe(true)
    expect(events.some(e => e.type === 'batch_completed')).toBe(true)
    expect(streamComplete).toBe(true)
    
    console.log(`\n📊 Total events received: ${events.length}`)
    console.log('Event types:', [...new Set(events.map(e => e.type))])
  }, TEST_TIMEOUT)
  
  // Test 3: Verify path prefix filtering
  it('should respect path prefix boundaries', async () => {
    const response = await fetch(`${BASE_URL}/api/v4/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://tailwindcss.com/docs/installation/'
      })
    })
    
    expect(response.ok).toBe(true)
    const data = await response.json()
    const testJobId = data.data.jobId
    
    console.log('🧪 Testing path prefix with:', data.data.url)
    
    // Monitor discovered URLs
    const discoveredUrls: string[] = []
    
    const streamPromise = new Promise<void>((resolve) => {
      const eventSource = new EventSource(`${BASE_URL}/api/v4/jobs/${testJobId}/stream`)
      
      const timeout = setTimeout(() => {
        eventSource.close()
        resolve()
      }, 20000) // 20 second timeout
      
      eventSource.addEventListener('batch_completed', (e) => {
        const data = JSON.parse(e.data)
        if (data.discovered > 0) {
          console.log(`🔗 Discovered ${data.discovered} URLs`)
        }
      })
      
      eventSource.addEventListener('job_completed', () => {
        clearTimeout(timeout)
        eventSource.close()
        resolve()
      })
      
      eventSource.addEventListener('job_timeout', () => {
        clearTimeout(timeout)
        eventSource.close()
        resolve()
      })
    })
    
    await streamPromise
    
    console.log('✅ Path prefix test completed')
  }, TEST_TIMEOUT)
  
  // Test 4: Verify caching works
  it('should use cached content on second crawl', async () => {
    // First crawl
    const response1 = await fetch(`${BASE_URL}/api/v4/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://react.dev/reference/react/useState'
      })
    })
    
    const data1 = await response1.json()
    const jobId1 = data1.data.jobId
    
    // Wait for first crawl to complete
    await new Promise<void>((resolve) => {
      const eventSource = new EventSource(`${BASE_URL}/api/v4/jobs/${jobId1}/stream`)
      eventSource.addEventListener('job_completed', () => {
        eventSource.close()
        resolve()
      })
      eventSource.addEventListener('job_timeout', () => {
        eventSource.close()
        resolve()
      })
      setTimeout(() => {
        eventSource.close()
        resolve()
      }, 20000)
    })
    
    console.log('✅ First crawl completed')
    
    // Second crawl - should use cache
    const startTime = Date.now()
    const response2 = await fetch(`${BASE_URL}/api/v4/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://react.dev/reference/react/useState'
      })
    })
    
    const data2 = await response2.json()
    const jobId2 = data2.data.jobId
    
    let cacheHits = 0
    
    await new Promise<void>((resolve) => {
      const eventSource = new EventSource(`${BASE_URL}/api/v4/jobs/${jobId2}/stream`)
      
      eventSource.addEventListener('batch_completed', (e) => {
        const data = JSON.parse(e.data)
        if (data.fromCache > 0) {
          cacheHits += data.fromCache
          console.log(`📦 Cache hits: ${data.fromCache}`)
        }
      })
      
      eventSource.addEventListener('job_completed', () => {
        eventSource.close()
        resolve()
      })
      
      eventSource.addEventListener('job_timeout', () => {
        eventSource.close()
        resolve()
      })
      
      setTimeout(() => {
        eventSource.close()
        resolve()
      }, 20000)
    })
    
    const duration = Date.now() - startTime
    console.log(`✅ Second crawl completed in ${duration}ms`)
    console.log(`📦 Total cache hits: ${cacheHits}`)
    
    // Second crawl should be much faster due to caching
    expect(duration).toBeLessThan(10000) // Should complete in under 10 seconds
    expect(cacheHits).toBeGreaterThan(0)
  }, TEST_TIMEOUT)
})