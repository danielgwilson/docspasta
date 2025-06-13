import { describe, it, expect } from 'vitest'
import './setup-integration'

describe('V4 API Integration', () => {
  const BASE_URL = 'http://localhost:3000'
  
  it('should create a job and stream progress events', async () => {
    // Create a job
    const createResponse = await fetch(`${BASE_URL}/api/v4/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://react.dev/learn/thinking-in-react'
      })
    })
    
    expect(createResponse.ok).toBe(true)
    const createData = await createResponse.json()
    
    expect(createData.success).toBe(true)
    expect(createData.data.jobId).toBeDefined()
    expect(createData.data.streamUrl).toBeDefined()
    
    const jobId = createData.data.jobId
    console.log('✅ Created job:', jobId)
    
    // Connect to SSE stream and collect events
    const events: any[] = []
    
    await new Promise<void>((resolve, reject) => {
      const eventSource = new EventSource(`${BASE_URL}${createData.data.streamUrl}`)
      
      const timeout = setTimeout(() => {
        console.log('⏰ Test timeout after 30 seconds')
        eventSource.close()
        resolve()
      }, 30000)
      
      eventSource.onopen = () => {
        console.log('✅ SSE connection opened')
      }
      
      eventSource.onerror = (error) => {
        console.error('❌ SSE error:', error)
        clearTimeout(timeout)
        eventSource.close()
        reject(new Error('SSE connection failed'))
      }
      
      // Listen for V4 events
      const eventTypes = [
        'stream_connected',
        'batch_completed',
        'urls_discovered',
        'content_processed',
        'job_completed',
        'job_timeout',
        'job_failed'
      ]
      
      eventTypes.forEach(eventType => {
        eventSource.addEventListener(eventType, (e: MessageEvent) => {
          const data = JSON.parse(e.data)
          console.log(`📡 ${eventType}:`, data)
          events.push({ type: eventType, data })
          
          // End test on terminal events
          if (eventType === 'job_completed' || eventType === 'job_failed' || eventType === 'job_timeout') {
            clearTimeout(timeout)
            eventSource.close()
            resolve()
          }
        })
      })
    })
    
    // Verify we got events
    console.log(`\n📊 Total events received: ${events.length}`)
    expect(events.length).toBeGreaterThan(0)
    
    // Should have stream_connected event
    const connectedEvent = events.find(e => e.type === 'stream_connected')
    expect(connectedEvent).toBeDefined()
    
    // Should have at least one batch_completed event
    const batchEvents = events.filter(e => e.type === 'batch_completed')
    expect(batchEvents.length).toBeGreaterThan(0)
    
    // Calculate totals
    const totalCompleted = batchEvents.reduce((sum, e) => sum + (e.data.completed || 0), 0)
    const totalFailed = batchEvents.reduce((sum, e) => sum + (e.data.failed || 0), 0)
    const totalDiscovered = batchEvents.reduce((sum, e) => sum + (e.data.discovered || 0), 0)
    
    console.log(`\n📈 Results:`)
    console.log(`- Pages completed: ${totalCompleted}`)
    console.log(`- Pages failed: ${totalFailed}`)
    console.log(`- URLs discovered: ${totalDiscovered}`)
    
    // Should have processed at least the initial URL
    expect(totalCompleted + totalFailed).toBeGreaterThan(0)
  }, 60000) // 60 second timeout for the test
})