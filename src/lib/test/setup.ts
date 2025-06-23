/**
 * Test Setup Utilities
 * Provides clean database and environment setup for V5 testing
 */

import { beforeEach, afterEach } from 'vitest'
import { db } from '@/lib/db/connection'
import { crawlingJobs, crawledPages, pageContentChunks } from '@/lib/db/schema'

/**
 * Clean database state before each test
 */
export async function cleanTestDatabase() {
  try {
    // Delete in correct order to respect foreign key constraints
    await db.delete(pageContentChunks)
    await db.delete(crawledPages) 
    await db.delete(crawlingJobs)
  } catch (error) {
    // Ignore errors if tables are already clean or don't exist
    console.log('Database cleanup completed (some tables may have been empty)')
  }
}



/**
 * Create a test crawling job with default values
 */
export async function createTestJob(overrides: Partial<{
  id: string
  userId: string
  url: string
  status: string
  config: Record<string, any>
}> = {}) {
  const jobId = overrides.id || crypto.randomUUID()
  
  const [job] = await db.insert(crawlingJobs).values({
    id: jobId,
    userId: overrides.userId || 'test-user-123', // Schema field name
    url: overrides.url || 'https://example.com',
    status: overrides.status as any || 'pending',
    config: overrides.config || {
      maxPages: 50,
      maxDepth: 2,
      qualityThreshold: 20
    },
    stateVersion: 1,
    progressSummary: {
      pagesProcessed: 0,
      pagesFound: 0,
      totalWords: 0,
      discoveredUrls: 0,
      failedUrls: 0
    },
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning()
  
  return job
}


/**
 * Create test crawled pages
 */
export async function createTestPages(jobId: string, pages: Array<{
  url: string
  content?: string
  success?: boolean
}>) {
  const results = []
  
  for (const page of pages) {
    const urlHash = Buffer.from(page.url).toString('base64')
    
    const [crawledPage] = await db.insert(crawledPages).values({
      id: crypto.randomUUID(),
      jobId,
      url: page.url,
      urlHash, // Required field for deduplication
      title: `Title for ${page.url}`,
      status: page.success !== false ? 'crawled' : 'error',
      httpStatus: page.success !== false ? 200 : 404,
      errorMessage: page.success === false ? 'Page not found' : null,
      depth: 0,
      qualityScore: page.content ? 50 : 0,
      wordCount: page.content?.split(/\s+/).length || 0,
      crawledAt: new Date(),
      createdAt: new Date()
    }).returning()
    
    if (page.content && page.success !== false) {
      await db.insert(pageContentChunks).values({
        id: crypto.randomUUID(),
        pageId: crawledPage.id,
        content: page.content,
        contentType: 'markdown',
        chunkIndex: 0,
        startPosition: 0,
        endPosition: page.content.length,
        metadata: {
          chunkIndex: 0,
          startPosition: 0,
          endPosition: page.content.length,
          extractionMethod: 'test',
          qualityScore: 50
        },
        createdAt: new Date()
      })
    }
    
    results.push(crawledPage)
  }
  
  return results
}


/**
 * Mock QStash for testing
 */
export function mockQStash() {
  const originalFetch = globalThis.fetch
  
  globalThis.fetch = async (url: string | URL, init?: RequestInit) => {
    const urlStr = url.toString()
    
    // Mock QStash publish endpoint
    if (urlStr.includes('upstash.io/v2/publish')) {
      return new Response(JSON.stringify({ messageId: 'mock-message-id' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Fall back to original fetch for other requests
    return originalFetch(url, init)
  }
  
  // Return cleanup function
  return () => {
    globalThis.fetch = originalFetch
  }
}


/**
 * Mock window.matchMedia for tests
 */
export function mockMatchMedia() {
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  }
}

/**
 * Test environment setup
 */
export function setupTestEnvironment() {
  mockMatchMedia()
  
  beforeEach(async () => {
    await cleanTestDatabase()
  })
  
  afterEach(async () => {
    await cleanTestDatabase()
  })
}