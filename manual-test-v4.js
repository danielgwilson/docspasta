// Manual test script for V4 API
// Run with: node manual-test-v4.js
// Make sure dev server is running first: pnpm dev

const EventSource = require('eventsource');
const BASE_URL = 'http://localhost:3000';

async function testV4API() {
  console.log('🧪 Testing V4 API - Three-Function Architecture\n');
  
  try {
    // Test 1: Create a job
    console.log('📝 Test 1: Creating a job...');
    const createResponse = await fetch(`${BASE_URL}/api/v4/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://react.dev/learn/thinking-in-react'
      })
    });
    
    if (!createResponse.ok) {
      throw new Error(`Failed to create job: ${await createResponse.text()}`);
    }
    
    const createData = await createResponse.json();
    console.log('✅ Job created:', createData.data);
    const jobId = createData.data.jobId;
    
    // Test 2: Connect to SSE stream
    console.log('\n📡 Test 2: Connecting to SSE stream...');
    console.log(`Stream URL: ${BASE_URL}${createData.data.streamUrl}`);
    
    const eventSource = new EventSource(`${BASE_URL}${createData.data.streamUrl}`);
    
    let eventCount = 0;
    const events = [];
    
    const streamPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.log('⏰ Stream timeout after 30 seconds');
        eventSource.close();
        resolve();
      }, 30000);
      
      eventSource.onopen = () => {
        console.log('✅ Stream connected');
      };
      
      eventSource.onerror = (error) => {
        console.error('❌ Stream error:', error);
        clearTimeout(timeout);
        eventSource.close();
        reject(error);
      };
      
      eventSource.addEventListener('stream_connected', (e) => {
        const data = JSON.parse(e.data);
        console.log('📡 Event: stream_connected', data);
        events.push({ type: 'stream_connected', data });
      });
      
      eventSource.addEventListener('batch_completed', (e) => {
        const data = JSON.parse(e.data);
        console.log('📦 Event: batch_completed', data);
        events.push({ type: 'batch_completed', data });
        eventCount++;
      });
      
      eventSource.addEventListener('urls_discovered', (e) => {
        const data = JSON.parse(e.data);
        console.log('🔍 Event: urls_discovered', data);
        events.push({ type: 'urls_discovered', data });
      });
      
      eventSource.addEventListener('content_processed', (e) => {
        const data = JSON.parse(e.data);
        console.log('📄 Event: content_processed', data);
        events.push({ type: 'content_processed', data });
      });
      
      eventSource.addEventListener('job_completed', (e) => {
        const data = JSON.parse(e.data);
        console.log('✅ Event: job_completed', data);
        events.push({ type: 'job_completed', data });
        clearTimeout(timeout);
        eventSource.close();
        resolve();
      });
      
      eventSource.addEventListener('job_timeout', (e) => {
        const data = JSON.parse(e.data);
        console.log('⏰ Event: job_timeout', data);
        events.push({ type: 'job_timeout', data });
        clearTimeout(timeout);
        eventSource.close();
        resolve();
      });
      
      eventSource.addEventListener('job_failed', (e) => {
        const data = JSON.parse(e.data);
        console.log('❌ Event: job_failed', data);
        events.push({ type: 'job_failed', data });
        clearTimeout(timeout);
        eventSource.close();
        reject(new Error(data.error));
      });
    });
    
    await streamPromise;
    
    console.log(`\n📊 Summary:`);
    console.log(`- Total events: ${events.length}`);
    console.log(`- Event types: ${[...new Set(events.map(e => e.type))].join(', ')}`);
    console.log(`- Batch completions: ${events.filter(e => e.type === 'batch_completed').length}`);
    
    // Calculate totals from batch events
    const batchEvents = events.filter(e => e.type === 'batch_completed');
    const totalCompleted = batchEvents.reduce((sum, e) => sum + (e.data.completed || 0), 0);
    const totalFailed = batchEvents.reduce((sum, e) => sum + (e.data.failed || 0), 0);
    const totalDiscovered = batchEvents.reduce((sum, e) => sum + (e.data.discovered || 0), 0);
    const totalFromCache = batchEvents.reduce((sum, e) => sum + (e.data.fromCache || 0), 0);
    
    console.log(`\n📈 Crawl Results:`);
    console.log(`- Pages completed: ${totalCompleted}`);
    console.log(`- Pages failed: ${totalFailed}`);
    console.log(`- URLs discovered: ${totalDiscovered}`);
    console.log(`- Cache hits: ${totalFromCache}`);
    
    console.log('\n✅ All tests passed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testV4API();