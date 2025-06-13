import { describe, it, expect, vi } from 'vitest'

describe('V4 Lovable Root Crawl Test', () => {
  it('should crawl from docs root', async () => {
    const baseUrl = 'https://docs.lovable.dev'
    
    // Test creating a job from the root
    const createResponse = await fetch('http://localhost:3000/api/v4/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: baseUrl })
    })
    
    expect(createResponse.ok).toBe(true)
    const { jobId } = await createResponse.json()
    console.log('Created job:', jobId, 'for', baseUrl)
    
    // Connect to SSE stream
    const controller = new AbortController()
    const response = await fetch(
      `http://localhost:3000/api/v4/jobs/${jobId}/stream`,
      { signal: controller.signal }
    )
    
    expect(response.ok).toBe(true)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    
    // Read events
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    const events: any[] = []
    let completed = false
    
    const timeout = setTimeout(() => {
      controller.abort()
    }, 30000) // 30 second timeout
    
    try {
      while (!completed) {
        const { done, value } = await reader.read()
        if (done) break
        
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        
        for (const line of lines) {
          if (line.startsWith('event:')) {
            const eventType = line.substring(6).trim()
            console.log('Event:', eventType)
          } else if (line.startsWith('data:')) {
            const data = JSON.parse(line.substring(5).trim())
            events.push(data)
            
            if (data.type === 'job_completed' || data.type === 'job_failed') {
              completed = true
            }
          }
        }
      }
    } finally {
      clearTimeout(timeout)
      controller.abort()
    }
    
    // Analyze results
    const batchEvents = events.filter(e => e.type === 'batch_completed')
    const urlsDiscovered = events.filter(e => e.type === 'urls_discovered')
    
    console.log('Total batch events:', batchEvents.length)
    console.log('Total URLs discovered events:', urlsDiscovered.length)
    console.log('URLs discovered:', urlsDiscovered.map(e => e.discoveredUrls || e.count))
    
    // Should have discovered multiple pages
    expect(batchEvents.length).toBeGreaterThan(0)
    
    // Calculate total pages processed
    const totalProcessed = batchEvents.reduce((sum, event) => 
      sum + (event.completed || 0), 0
    )
    
    console.log('Total pages processed:', totalProcessed)
    
    // Should process more than just the root page
    expect(totalProcessed).toBeGreaterThan(1)
  })
})