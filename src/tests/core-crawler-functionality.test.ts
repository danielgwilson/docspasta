import { describe, it, expect } from 'vitest'

describe('Core Crawler Functionality - MUST EXTRACT CONTENT', () => {
  it('should actually extract content from a simple HTML page', async () => {
    // This test MUST pass for the crawler to be working
    // Testing the actual content extraction pipeline
    
    const testUrl = 'https://httpbin.org/html'
    
    console.log(`🧪 Testing REAL content extraction from: ${testUrl}`)
    
    // Test the current API endpoint (not v2)
    const response = await fetch('http://localhost:3001/api/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: testUrl })
    })
    
    expect(response.ok).toBe(true)
    const startData = await response.json()
    expect(startData.success).toBe(true)
    
    const crawlId = startData.data.id
    console.log(`📡 Started crawl: ${crawlId}`)
    
    // Wait for completion and check MULTIPLE times
    let attempts = 0
    let statusData
    let hasContent = false
    
    while (attempts < 30 && !hasContent) { // 30 seconds max
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const statusResponse = await fetch(`http://localhost:3001/api/crawl/${crawlId}`)
      expect(statusResponse.ok).toBe(true)
      
      statusData = await statusResponse.json()
      console.log(`📊 Attempt ${attempts + 1}: Status = ${statusData.data?.status}, Content length = ${statusData.data?.markdown?.length || 0}`)
      
      if (statusData.data?.status === 'completed' && statusData.data?.markdown) {
        hasContent = true
        break
      } else if (statusData.data?.status === 'error') {
        console.error('❌ Crawl failed:', statusData.data?.error)
        break
      }
      
      attempts++
    }
    
    // CRITICAL ASSERTIONS - These MUST pass
    expect(statusData.data?.status).toBe('completed')
    expect(statusData.data?.markdown).toBeTruthy()
    expect(statusData.data?.markdown?.length).toBeGreaterThan(100)
    expect(statusData.data?.markdown).toContain('html') // httpbin.org/html should contain "html"
    
    console.log(`✅ SUCCESS: Extracted ${statusData.data?.markdown?.length} characters of content`)
    console.log(`📄 Content preview: ${statusData.data?.markdown?.substring(0, 200)}...`)
  }, 45000) // 45 second timeout

  it('should extract content from multiple real documentation sites', async () => {
    const testUrls = [
      'https://httpbin.org/html',
      'https://jsonplaceholder.typicode.com/', 
    ]
    
    for (const url of testUrls) {
      console.log(`🔍 Testing content extraction from: ${url}`)
      
      const response = await fetch('http://localhost:3001/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })
      
      expect(response.ok).toBe(true)
      const startData = await response.json()
      expect(startData.success).toBe(true)
      
      // Wait for completion
      let attempts = 0
      let completed = false
      
      while (attempts < 20 && !completed) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        const statusResponse = await fetch(`http://localhost:3001/api/crawl/${startData.data.id}`)
        const statusData = await statusResponse.json()
        
        if (statusData.data?.status === 'completed') {
          expect(statusData.data?.markdown).toBeTruthy()
          expect(statusData.data?.markdown?.length).toBeGreaterThan(50)
          console.log(`✅ ${url}: Extracted ${statusData.data?.markdown?.length} characters`)
          completed = true
        } else if (statusData.data?.status === 'error') {
          console.error(`❌ ${url}: Failed with error:`, statusData.data?.error)
          throw new Error(`Content extraction failed for ${url}: ${statusData.data?.error}`)
        }
        
        attempts++
      }
      
      expect(completed).toBe(true)
    }
  }, 60000)
})

console.log('🧪 Core Crawler Functionality Tests')
console.log('🎯 These tests MUST pass for the crawler to be working')
console.log('📊 Testing ACTUAL content extraction, not just API responses')
console.log('⚠️  Requires dev server running on localhost:3001')