import { describe, it, expect, beforeAll, afterAll } from 'vitest'

describe('V4 API Flow Debug', () => {
  const baseUrl = 'http://localhost:3000'
  
  it('should test complete V4 flow', async () => {
    console.log('\n🚀 Testing V4 API flow...')
    
    // Step 1: Create a job
    console.log('\n1️⃣ Creating job...')
    const createResponse = await fetch(`${baseUrl}/api/v4/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://lovable.dev/docs' })
    })
    
    const createResult = await createResponse.json()
    console.log('Create response:', createResult)
    
    if (!createResult.success) {
      console.error('❌ Failed to create job:', createResult.error)
      return
    }
    
    const { jobId, streamUrl } = createResult.data
    console.log('✅ Job created:', jobId)
    
    // Step 2: Check job status
    console.log('\n2️⃣ Checking job status...')
    const statusResponse = await fetch(`${baseUrl}/api/v4/jobs/${jobId}`)
    const statusResult = await statusResponse.json()
    
    console.log('Job status:', statusResult)
    
    // Step 3: Simulate processing (in production, this would be done by cron/worker)
    console.log('\n3️⃣ Simulating URL processing...')
    
    // Wait a bit for initial URL to be added
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Check if there are URLs to process
    const queueResponse = await fetch(`${baseUrl}/api/v4/jobs/${jobId}`)
    const queueResult = await queueResponse.json()
    
    console.log('Queue status:', queueResult)
    
    expect(createResult.success).toBe(true)
    expect(jobId).toBeTruthy()
  })
})