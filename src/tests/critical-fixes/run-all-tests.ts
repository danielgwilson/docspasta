#!/usr/bin/env tsx

import { spawn } from 'child_process'
import { join } from 'path'

/**
 * Run all critical fix tests and provide a summary
 */

const testFiles = [
  'sse-resumable-stream.test.ts',
  'user-isolation.test.ts',
  'queue-architecture.test.ts',
  'redis-connection-management.test.ts',
  'full-integration.test.ts'
]

const testDescriptions = {
  'sse-resumable-stream.test.ts': 'SSE Resumable Stream Implementation',
  'user-isolation.test.ts': 'User Data Isolation & Security',
  'queue-architecture.test.ts': 'Queue-Based Worker Architecture',
  'redis-connection-management.test.ts': 'Redis Connection Management',
  'full-integration.test.ts': 'Full System Integration'
}

console.log('🧪 Running Critical Fix Test Suite\n')
console.log('This test suite verifies all critical fixes implemented:')
console.log('1. ✅ SSE using resumable-stream (no custom ReadableStream)')
console.log('2. ✅ User isolation (preventing cross-user data access)')
console.log('3. ✅ Queue-based event-driven workers (no polling)')
console.log('4. ✅ Proper Redis connection management (no leaks)')
console.log('5. ✅ Complete system integration\n')

async function runTest(testFile: string): Promise<{ file: string; passed: boolean; output: string }> {
  return new Promise((resolve) => {
    const testPath = join(__dirname, testFile)
    const child = spawn('pnpm', ['test:run', testPath], {
      cwd: join(__dirname, '../../..'),
      stdio: 'pipe'
    })
    
    let output = ''
    
    child.stdout.on('data', (data) => {
      output += data.toString()
    })
    
    child.stderr.on('data', (data) => {
      output += data.toString()
    })
    
    child.on('close', (code) => {
      resolve({
        file: testFile,
        passed: code === 0,
        output
      })
    })
  })
}

async function main() {
  const results = []
  
  for (const testFile of testFiles) {
    console.log(`\n📋 Running ${testDescriptions[testFile as keyof typeof testDescriptions]}...`)
    const result = await runTest(testFile)
    results.push(result)
    
    if (result.passed) {
      console.log(`✅ ${testFile} - PASSED`)
    } else {
      console.log(`❌ ${testFile} - FAILED`)
      console.log('\nTest Output:')
      console.log(result.output)
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('📊 Test Summary\n')
  
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  
  console.log(`Total Tests: ${results.length}`)
  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  
  if (failed === 0) {
    console.log('\n🎉 All critical fixes have been verified!')
    console.log('The system is now:')
    console.log('- Using resumable-stream for SSE (no reinventing the wheel)')
    console.log('- Properly isolating user data (secure multi-tenancy)')
    console.log('- Running event-driven workers (efficient queue processing)')
    console.log('- Managing Redis connections properly (no resource leaks)')
    console.log('- Fully integrated and tested')
  } else {
    console.log('\n⚠️  Some tests failed. Please review the output above.')
    process.exit(1)
  }
}

main().catch(console.error)