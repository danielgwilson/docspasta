import { describe, it, expect } from 'vitest'

describe('V4 UI Integration', () => {
  it('should create a job and display progress', async () => {
    // Create a job
    const response = await fetch('http://localhost:3000/api/v4/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://docs.lovable.dev/' })
    })
    
    expect(response.ok).toBe(true)
    const { data } = await response.json()
    expect(data.jobId).toBeDefined()
    expect(data.streamUrl).toBe(`/api/v4/jobs/${data.jobId}/stream`)
    
    console.log('Created job:', data.jobId)
    
    // Connect to SSE stream
    const eventSource = new EventSource(`http://localhost:3000${data.streamUrl}`)
    
    const events: any[] = []
    let completed = false
    
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventSource.close()
        reject(new Error('Test timeout'))
      }, 20000)
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data)
        events.push(data)
        console.log('Event:', data.type)
        
        if (data.type === 'job_completed' || data.type === 'job_failed') {
          completed = true
          clearTimeout(timeout)
          eventSource.close()
          resolve()
        }
      }
      
      eventSource.onerror = (error) => {
        clearTimeout(timeout)
        eventSource.close()
        reject(error)
      }
    })
    
    // Verify we received events
    expect(events.length).toBeGreaterThan(0)
    expect(completed).toBe(true)
    
    // Check for key event types
    const eventTypes = events.map(e => e.type)
    expect(eventTypes).toContain('stream_connected')
    
    // Should have either completed or failed
    const finalEvent = events[events.length - 1]
    expect(['job_completed', 'job_failed']).toContain(finalEvent.type)
    
    // If completed, check we can get the markdown
    if (finalEvent.type === 'job_completed') {
      const contentResponse = await fetch(`http://localhost:3000/api/v4/jobs/${data.jobId}`)
      expect(contentResponse.ok).toBe(true)
      
      const content = await contentResponse.json()
      expect(content.content).toBeDefined()
      expect(content.title).toBeDefined()
      expect(content.wordCount).toBeGreaterThan(0)
      
      console.log(`Job completed: ${content.title} (${content.wordCount} words)`)
    }
  })
})