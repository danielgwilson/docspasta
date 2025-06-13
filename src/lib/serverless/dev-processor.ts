import { URLProcessor } from './processor'

// Development-only background processor
let processorInterval: NodeJS.Timeout | null = null

export function startDevProcessor() {
  if (process.env.NODE_ENV !== 'development') {
    console.log('⚠️  Dev processor only runs in development mode')
    return
  }
  
  if (processorInterval) {
    console.log('🔄 Dev processor already running')
    return
  }
  
  console.log('🚀 Starting development background processor...')
  
  const processor = new URLProcessor()
  
  // Process immediately
  processor.processBatch(10).catch(console.error)
  
  // Then process every 5 seconds
  processorInterval = setInterval(async () => {
    try {
      await processor.processBatch(10)
    } catch (error) {
      console.error('Dev processor error:', error)
    }
  }, 5000)
  
  // Cleanup on exit
  process.on('SIGINT', () => {
    if (processorInterval) {
      clearInterval(processorInterval)
      console.log('\n🛑 Stopped development processor')
    }
    process.exit()
  })
}

export function stopDevProcessor() {
  if (processorInterval) {
    clearInterval(processorInterval)
    processorInterval = null
    console.log('🛑 Stopped development processor')
  }
}