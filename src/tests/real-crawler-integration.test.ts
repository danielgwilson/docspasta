import { describe, it, expect, beforeAll, afterAll } from 'vitest'

describe('Real Queue-Based Crawler Integration', () => {
  beforeAll(async () => {
    console.log('🚀 Starting real integration test for queue-based crawler')
  })

  afterAll(async () => {
    console.log('🏁 Integration test completed')
  })

  it('should test crawl API v2 endpoint', async () => {
    const testUrl = 'https://httpbin.org/html'
    
    console.log(`📡 Testing crawl API v2 with: ${testUrl}`)

    // Test the API endpoint directly
    const response = await fetch('http://localhost:3000/api/crawl-v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: testUrl,
        options: {
          maxPages: 5,
          maxDepth: 2,
          timeout: 10000,
        },
      }),
    })

    const data = await response.json()
    
    console.log('📊 API Response:', data)
    
    expect(response.ok).toBe(true)
    expect(data.success).toBe(true)
    expect(data.data?.id).toBeTruthy()
    expect(data.data?.status).toBe('started')

    if (data.success && data.data?.id) {
      console.log(`✅ Crawl started successfully with ID: ${data.data.id}`)
      
      // Wait a moment then check status
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const statusResponse = await fetch(`http://localhost:3000/api/crawl-v2/${data.data.id}`)
      const statusData = await statusResponse.json()
      
      console.log('📈 Status Response:', statusData)
      
      expect(statusResponse.ok).toBe(true)
      expect(statusData.success).toBe(true)
      expect(statusData.data?.id).toBe(data.data.id)
    }
  }, 30000) // 30 second timeout

  it('should handle Easter egg for docspasta.com', async () => {
    const testUrl = 'https://docspasta.com'
    
    console.log(`🥚 Testing Easter egg with: ${testUrl}`)

    const response = await fetch('http://localhost:3000/api/crawl-v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: testUrl,
      }),
    })

    const data = await response.json()
    
    console.log('🎉 Easter egg response:', data)
    
    expect(response.ok).toBe(true)
    expect(data.success).toBe(true)
    expect(data.data?.id).toMatch(/farewell_.+_v2/)
    expect(data.data?.status).toBe('started')

    if (data.success && data.data?.id) {
      // Check status - should show completed farewell message
      const statusResponse = await fetch(`http://localhost:3000/api/crawl-v2/${data.data.id}`)
      const statusData = await statusResponse.json()
      
      console.log('🫡 Farewell status:', statusData)
      
      expect(statusResponse.ok).toBe(true)
      expect(statusData.success).toBe(true)
      expect(statusData.data?.status).toBe('completed')
      expect(statusData.data?.results?.[0]?.title).toContain('Farewell')
    }
  })

  it('should validate URL input', async () => {
    const invalidUrl = 'not-a-url'
    
    console.log(`❌ Testing invalid URL: ${invalidUrl}`)

    const response = await fetch('http://localhost:3000/api/crawl-v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: invalidUrl,
      }),
    })

    const data = await response.json()
    
    console.log('🚫 Validation response:', data)
    
    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toContain('Invalid URL format')
  })
})

console.log('🧪 Real integration tests for queue-based crawler')
console.log('📡 Tests actual HTTP endpoints with real crawler implementation')
console.log('⚠️  Requires dev server to be running on localhost:3000')