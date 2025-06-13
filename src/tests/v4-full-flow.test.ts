import { describe, it, expect } from 'vitest'

describe('V4 Full Flow Test', () => {
  const baseUrl = 'http://localhost:3000'
  
  it('should complete a full crawl flow', async () => {
    console.log('\n🚀 Starting V4 full flow test...')
    
    // Step 1: Initialize dev processor
    console.log('\n1️⃣ Initializing dev processor...')
    const initResponse = await fetch(`${baseUrl}/api/init`)
    const initResult = await initResponse.json()
    console.log('Init result:', initResult)
    
    // Step 2: Create a job
    console.log('\n2️⃣ Creating job for lovable.dev/docs...')
    const createResponse = await fetch(`${baseUrl}/api/v4/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://lovable.dev/docs' })
    })
    
    const createResult = await createResponse.json()
    console.log('Create response:', createResult)
    
    if (!createResult.success) {
      throw new Error(`Failed to create job: ${createResult.error}`)
    }
    
    const { jobId } = createResult.data
    console.log('✅ Job created:', jobId)
    
    // Step 3: Wait for dev processor to pick up the job
    console.log('\n3️⃣ Waiting for dev processor to start processing...')
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Step 4: Manually trigger processing to speed up test
    console.log('\n4️⃣ Manually triggering URL processing...')
    const processResponse = await fetch(`${baseUrl}/api/v4/process/manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchSize: 5 })
    })
    
    const processResult = await processResponse.json()
    console.log('Manual process result:', processResult)
    
    // Step 5: Check job status
    console.log('\n5️⃣ Checking job status...')
    const statusResponse = await fetch(`${baseUrl}/api/v4/jobs/${jobId}`)
    const statusResult = await statusResponse.json()
    
    console.log('Job status:', JSON.stringify(statusResult, null, 2))
    
    // Step 6: Monitor progress with SSE
    console.log('\n6️⃣ Connecting to SSE stream...')
    const eventSource = new EventSource(`${baseUrl}/api/v4/jobs/${jobId}/stream`)
    
    const events: any[] = []
    const eventPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventSource.close()
        reject(new Error('SSE timeout after 10 seconds'))
      }, 10000)
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data)
        events.push(data)
        console.log('📨 SSE Event:', data.type, data)
        
        if (data.type === 'job_completed' || data.type === 'error') {
          clearTimeout(timeout)
          eventSource.close()
          resolve(data)
        }
      }
      
      eventSource.onerror = (error) => {
        clearTimeout(timeout)
        eventSource.close()
        reject(error)
      }
    })
    
    // Continue processing while monitoring
    for (let i = 0; i < 5; i++) {
      console.log(`\n🔄 Processing batch ${i + 1}...`)
      await fetch(`${baseUrl}/api/v4/process/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 5 })
      })
      
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Check if job is complete
      const checkResponse = await fetch(`${baseUrl}/api/v4/jobs/${jobId}`)
      const checkResult = await checkResponse.json()
      
      if (checkResult.data?.status === 'completed') {
        console.log('✅ Job completed!')
        break
      }
    }
    
    // Wait for completion event
    try {
      await eventPromise
    } catch (error) {
      console.log('⚠️ SSE connection ended:', error)
    }
    
    // Final status check
    console.log('\n7️⃣ Final job status check...')
    const finalResponse = await fetch(`${baseUrl}/api/v4/jobs/${jobId}`)
    const finalResult = await finalResponse.json()
    
    console.log('\n📊 Final Results:')
    console.log('- Status:', finalResult.data?.status)
    console.log('- Pages found:', finalResult.data?.pages_found)
    console.log('- Pages processed:', finalResult.data?.pages_processed)
    console.log('- Total words:', finalResult.data?.total_words)
    console.log('- Has markdown:', !!finalResult.data?.final_markdown)
    console.log('\n📨 Events received:', events.length)
    events.forEach(e => console.log(`  - ${e.type}`))
    
    // Assertions
    expect(createResult.success).toBe(true)
    expect(finalResult.data?.pages_processed).toBeGreaterThan(0)
  }, 30000) // 30 second timeout
})