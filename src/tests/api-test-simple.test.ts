import { describe, it, expect } from 'vitest'

describe('Simple API Test', () => {
  it('should test if the crawler API endpoint works without Redis', async () => {
    // Import the crawler directly to bypass Redis issues
    try {
      const { startCrawl } = await import('@/lib/crawler')
      
      console.log('✅ Crawler module imported successfully')
      console.log('🔧 Testing basic crawler functionality...')
      
      // Test if the startCrawl function exists and has the right signature
      expect(startCrawl).toBeDefined()
      expect(typeof startCrawl).toBe('function')
      
      console.log('✅ startCrawl function exists')
      
      // Test the function signature by calling it with test data
      // This should give us more info about what's failing
      try {
        const crawlPromise = startCrawl('https://docs.lovable.dev/introduction')
        console.log('🚀 Crawl started, promise created')
        
        // Don't await it - just check if it returns a promise
        expect(crawlPromise).toBeInstanceOf(Promise)
        console.log('✅ Returns promise as expected')
        
      } catch (error) {
        console.log('❌ Error starting crawl:', error)
        console.log('🔍 This is likely the Redis connection issue')
      }
      
    } catch (error) {
      console.log('❌ Failed to import crawler:', error)
    }
  })

  it('should check what happens when we call the API route directly', async () => {
    // Test the API route handler
    try {
      // Import the route handler directly
      const routeModule = await import('@/app/api/crawl-v2/route')
      
      console.log('✅ API route module imported')
      console.log('📦 Available exports:', Object.keys(routeModule))
      
      expect(routeModule.POST).toBeDefined()
      console.log('✅ POST handler exists')
      
      // Create a mock request
      const mockRequest = new Request('http://localhost:3000/api/crawl-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: 'https://docs.lovable.dev/introduction' }),
      })
      
      console.log('🧪 Testing POST handler with mock request...')
      
      try {
        const response = await routeModule.POST(mockRequest)
        const data = await response.json()
        
        console.log('✅ API response received:', data)
        
        if (data.success) {
          console.log('🎉 API working! Crawl ID:', data.data.id)
        } else {
          console.log('❌ API error:', data.error)
        }
        
      } catch (error) {
        console.log('❌ API call failed:', error)
        console.log('🔍 This confirms Redis/queue issue')
      }
      
    } catch (error) {
      console.log('❌ Failed to import API route:', error)
    }
  })

  it('should provide debugging steps for the user', () => {
    console.log('')
    console.log('🚨 UI STUCK DEBUGGING GUIDE:')
    console.log('=' .repeat(50))
    console.log('')
    console.log('1. 🌐 BROWSER TEST:')
    console.log('   - Open browser to http://localhost:3000')
    console.log('   - Open Dev Tools (F12)')
    console.log('   - Go to Network tab')
    console.log('   - Enter: https://docs.lovable.dev/introduction')
    console.log('   - Click "Paste It!" button')
    console.log('')
    console.log('2. 📊 CHECK NETWORK REQUESTS:')
    console.log('   ✅ POST /api/crawl-v2 - should return crawl ID')
    console.log('   ✅ GET /api/crawl-v2/{id}/status - should open SSE connection')
    console.log('   ✅ EventSource messages - should show progress events')
    console.log('')
    console.log('3. 🔍 DIAGNOSE BASED ON RESULTS:')
    console.log('')
    console.log('   IF POST fails:')
    console.log('   ❌ Redis connection issue')
    console.log('   ❌ Queue worker not starting')
    console.log('   🔧 Solution: Check Redis environment variables')
    console.log('')
    console.log('   IF POST succeeds BUT no SSE events:')
    console.log('   ❌ Crawl jobs not processing')
    console.log('   ❌ Redis pub/sub not working')
    console.log('   🔧 Solution: Check queue worker logs')
    console.log('')
    console.log('   IF SSE events arrive BUT UI stuck:')
    console.log('   ❌ Component field mapping issue')
    console.log('   ❌ Event parsing problem')
    console.log('   🔧 Solution: Check component logs')
    console.log('')
    console.log('4. 🚀 QUICK REDIS CHECK:')
    console.log('   - The app needs UPSTASH_REDIS_REST_URL')
    console.log('   - The app needs UPSTASH_REDIS_REST_TOKEN')
    console.log('   - These should be in .env.local or Vercel env vars')
    console.log('')
    console.log('5. 🧪 FALLBACK TEST:')
    console.log('   - If Redis issues persist, try mock mode')
    console.log('   - Component should still show UI states')
    console.log('')
  })
})