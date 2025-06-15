import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from '@neondatabase/serverless'

describe('V4 Integration Test', () => {
  let testJobId: string
  
  beforeAll(async () => {
    // Clean up any test data
    await sql`DELETE FROM jobs WHERE url LIKE '%test-integration%'`
  })
  
  afterAll(async () => {
    // Clean up after test
    if (testJobId) {
      await sql`DELETE FROM jobs WHERE id = ${testJobId}`
    }
  })
  
  it('should create a job and verify SSE endpoint is accessible', async () => {
    // Create a test job
    const response = await fetch('http://localhost:3000/api/v4/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        url: 'https://example.com/test-integration',
        force: false 
      })
    })
    
    expect(response.ok).toBe(true)
    const result = await response.json()
    
    expect(result.success).toBe(true)
    expect(result.data.jobId).toBeDefined()
    expect(result.data.url).toBe('https://example.com/test-integration')
    
    testJobId = result.data.jobId
    console.log('✅ Created test job:', testJobId)
    
    // Test that the SSE endpoint is accessible
    const streamUrl = `http://localhost:3000/api/v4/jobs/${testJobId}/stream`
    console.log('🔗 Testing SSE endpoint:', streamUrl)
    
    // We can't easily test EventSource in Node, but we can check if the endpoint exists
    const streamResponse = await fetch(streamUrl, {
      headers: { 'Accept': 'text/event-stream' }
    })
    
    expect(streamResponse.ok).toBe(true)
    expect(streamResponse.headers.get('content-type')).toBe('text/event-stream')
    console.log('✅ SSE endpoint is accessible')
    
    // Close the connection
    await streamResponse.body?.cancel()
  })
  
  it('should verify the crawler endpoint works', async () => {
    // Test the crawler endpoint directly
    const crawlResponse = await fetch('http://localhost:3000/api/v4/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: 'test-crawler-check',
        urls: [{ url: 'https://example.com', depth: 0 }],
        originalJobUrl: 'https://example.com',
        forceRefresh: false
      })
    })
    
    expect(crawlResponse.ok).toBe(true)
    const crawlResult = await crawlResponse.json()
    
    console.log('📊 Crawler response:', crawlResult)
    expect(crawlResult).toBeDefined()
    expect(crawlResult.completed || crawlResult.failed).toBeDefined()
  })
})