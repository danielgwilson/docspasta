// Manual test to demonstrate V4 crawling behavior
// Run with: node manual-test-v4-lovable.js

async function testCrawl(url) {
  console.log(`\n🧪 Testing crawl of: ${url}`)
  console.log('='*60)
  
  try {
    // 1. Create job
    const createResponse = await fetch('http://localhost:3000/api/v4/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    })
    
    if (!createResponse.ok) {
      console.error('Failed to create job:', await createResponse.text())
      return
    }
    
    const { data } = await createResponse.json()
    console.log(`✅ Created job: ${data.jobId}`)
    
    // 2. Connect to SSE stream
    const eventSource = new EventSource(`http://localhost:3000${data.streamUrl}`)
    
    let discoveredTotal = 0
    let processedTotal = 0
    let fromCacheTotal = 0
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)
      
      switch(data.type) {
        case 'stream_connected':
          console.log('📡 Connected to stream')
          break
          
        case 'batch_completed':
          processedTotal += data.completed || 0
          fromCacheTotal += data.fromCache || 0
          console.log(`📦 Batch: +${data.completed} pages (${data.fromCache} from cache)`)
          break
          
        case 'urls_discovered':
          discoveredTotal += data.count || data.discoveredUrls || 0
          console.log(`🔍 Discovered: +${data.count || data.discoveredUrls} URLs at depth ${data.depth}`)
          break
          
        case 'job_completed':
          console.log(`\n✅ Job completed!`)
          console.log(`📊 Final stats:`)
          console.log(`   - Pages processed: ${processedTotal}`)
          console.log(`   - From cache: ${fromCacheTotal}`)
          console.log(`   - URLs discovered: ${discoveredTotal}`)
          eventSource.close()
          break
          
        case 'job_failed':
          console.error(`❌ Job failed:`, data.error)
          eventSource.close()
          break
      }
    }
    
    eventSource.onerror = (error) => {
      console.error('SSE Error:', error)
      eventSource.close()
    }
    
    // Wait for completion (max 30 seconds)
    await new Promise(resolve => {
      setTimeout(() => {
        eventSource.close()
        resolve()
      }, 30000)
      
      eventSource.addEventListener('job_completed', resolve)
      eventSource.addEventListener('job_failed', resolve)
    })
    
  } catch (error) {
    console.error('Test error:', error)
  }
}

// Test different starting points
async function runTests() {
  console.log('🚀 V4 Lovable Crawl Behavior Demo\n')
  
  // Test 1: Specific page (should only find pages in /introduction)
  await testCrawl('https://docs.lovable.dev/introduction')
  
  // Wait a bit between tests
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Test 2: Root docs (should find many more pages)
  await testCrawl('https://docs.lovable.dev/')
}

// For browser compatibility
if (typeof EventSource === 'undefined') {
  console.error('This script requires EventSource support. Run in a browser or use a polyfill.')
} else {
  runTests()
}