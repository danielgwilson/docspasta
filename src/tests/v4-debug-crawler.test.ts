import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { URLProcessor } from '@/lib/serverless/processor'
import { QueueManager } from '@/lib/serverless/queue'
import { JobManager } from '@/lib/serverless/jobs'

// Mock modules
vi.mock('@/lib/serverless/streaming', () => ({
  publishProgress: vi.fn()
}))

vi.mock('@vercel/kv', () => ({
  kv: {
    sadd: vi.fn(),
    srem: vi.fn(),
    smembers: vi.fn().mockResolvedValue(['test-job-id'])
  }
}))

describe('V4 Crawler Debugging', () => {
  let processor: URLProcessor
  let queueManager: QueueManager
  let jobManager: JobManager

  beforeEach(() => {
    processor = new URLProcessor()
    queueManager = new QueueManager()
    jobManager = new JobManager()
  })

  it('should discover and process URLs from initial page', async () => {
    const testJobId = 'test-job-123'
    const testUrl = 'https://lovable.dev/docs'
    
    // Mock database responses
    const mockSql = vi.fn()
    
    // Mock adding initial URL
    mockSql.mockImplementationOnce(() => Promise.resolve()) // INSERT for initial URL
    
    // Mock getNextBatch - return the initial URL
    mockSql.mockImplementationOnce(() => Promise.resolve([
      { id: 'url-1', url: testUrl }
    ]))
    
    // Mock job configuration
    mockSql.mockImplementationOnce(() => Promise.resolve([{
      url: testUrl,
      max_pages: 50,
      max_depth: 2,
      quality_threshold: 20
    }]))
    
    // Mock marking URL as processing
    mockSql.mockImplementationOnce(() => Promise.resolve())
    
    // Override the sql function
    ;(queueManager as any).sql = mockSql
    ;(jobManager as any).sql = mockSql
    
    // Mock fetch response with links
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `
        <html>
          <head><title>Test Page</title></head>
          <body>
            <h1>Documentation</h1>
            <a href="/docs/getting-started">Getting Started</a>
            <a href="/docs/api-reference">API Reference</a>
            <a href="/blog/news">Blog</a>
            <a href="https://external.com">External</a>
          </body>
        </html>
      `
    })
    
    // Add initial URL to queue
    await queueManager.addUrlsToQueue(testJobId, [testUrl])
    
    // Process the batch
    await processor.processBatch()
    
    // Check that URLs were discovered
    const calls = mockSql.mock.calls
    console.log('SQL calls:', calls.map((call, i) => ({
      index: i,
      query: call[0]?.toString?.() || call[0]
    })))
    
    // Verify initial URL was added
    expect(calls[0][0].toString()).toContain('INSERT INTO job_urls_v3')
    
    // Verify we fetched the page
    expect(global.fetch).toHaveBeenCalledWith(testUrl, expect.any(Object))
  })

  it('should check URL filtering logic', () => {
    const { extractValidLinks } = require('@/lib/serverless/url-utils')
    
    const baseUrl = 'https://lovable.dev/docs'
    const links = [
      'https://lovable.dev/docs/getting-started',
      'https://lovable.dev/docs/api/overview', 
      'https://lovable.dev/blog/news',
      'https://external.com/page',
      '/docs/guides/tutorial',
      '../api/reference',
      'mailto:test@example.com'
    ]
    
    const validLinks = extractValidLinks(links, baseUrl, baseUrl)
    
    console.log('Input links:', links)
    console.log('Valid links:', validLinks)
    console.log('Filtered out:', links.filter(l => !validLinks.includes(l)))
    
    // Should only include docs links
    expect(validLinks).toContain('https://lovable.dev/docs/getting-started')
    expect(validLinks).toContain('https://lovable.dev/docs/api/overview')
    expect(validLinks).toContain('https://lovable.dev/docs/guides/tutorial')
    
    // Should not include non-docs or external
    expect(validLinks).not.toContain('https://lovable.dev/blog/news')
    expect(validLinks).not.toContain('https://external.com/page')
    expect(validLinks).not.toContain('mailto:test@example.com')
  })
})