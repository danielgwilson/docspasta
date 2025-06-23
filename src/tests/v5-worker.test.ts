/**
 * V5 Worker Function Tests
 * Unit tests for the core crawler worker functions
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestEnvironment, createTestJob, createTestPages } from '@/lib/test/setup'
import { startCrawlJob, processUrlJob, finalizeJob } from '@/lib/v5-worker'
import { db } from '@/lib/db/connection'
import { crawlingJobs, crawledPages } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

setupTestEnvironment()

describe('V5 Worker Functions', () => {
  describe('startCrawlJob', () => {
    it('should initialize crawl and discover URLs', async () => {
      const job = await createTestJob({
        url: 'https://example.com',
        status: 'pending'
      })
      
      // Mock fetch for sitemap discovery
      const originalFetch = globalThis.fetch
      globalThis.fetch = async (url: string) => {
        if (url.includes('robots.txt')) {
          return new Response('Sitemap: https://example.com/sitemap.xml\n', { status: 200 })
        }
        if (url.includes('sitemap.xml')) {
          return new Response(`<?xml version="1.0" encoding="UTF-8"?>
            <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <url><loc>https://example.com/page1</loc></url>
              <url><loc>https://example.com/page2</loc></url>
            </urlset>`, { status: 200 })
        }
        return new Response('Not found', { status: 404 })
      }
      
      try {
        await startCrawlJob({
          jobId: job.id,
          userId: job.userId,
          url: job.url,
          maxPages: 50,
          maxDepth: 2,
          qualityThreshold: 20,
          forceRefresh: false
        })
        
        // Check that job status was updated
        const [updatedJob] = await db.select()
          .from(crawlingJobs)
          .where(eq(crawlingJobs.id, job.id))
        
        expect(updatedJob.status).toBe('processing')
        expect(updatedJob.stateVersion).toBeGreaterThan(1)
        expect(updatedJob.progressSummary.discoveredUrls).toBeGreaterThan(0)
        
      } finally {
        globalThis.fetch = originalFetch
      }
    })
    
    it('should handle robots.txt fetch failure gracefully', async () => {
      const job = await createTestJob({
        url: 'https://example.com',
        status: 'pending'
      })
      
      // Mock fetch to fail robots.txt
      const originalFetch = globalThis.fetch
      globalThis.fetch = async () => new Response('Server Error', { status: 500 })
      
      try {
        await startCrawlJob({
          jobId: job.id,
          userId: job.userId,
          url: job.url,
          maxPages: 50,
          maxDepth: 2,
          qualityThreshold: 20,
          forceRefresh: false
        })
        
        // Should still process (fallback to just the root URL)
        const [updatedJob] = await db.select()
          .from(crawlingJobs)
          .where(eq(crawlingJobs.id, job.id))
        
        expect(updatedJob.status).toBe('processing')
        
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })
  
  describe('processUrlJob', () => {
    it('should crawl URL and store content', async () => {
      const job = await createTestJob({
        status: 'running'
      })
      
      // Mock fetch for URL content
      const originalFetch = globalThis.fetch
      globalThis.fetch = async (url: string) => {
        if (url === 'https://example.com/test-page') {
          return new Response(`
            <html>
              <head><title>Test Page</title></head>
              <body>
                <h1>Test Content</h1>
                <p>This is a test page with good quality content for documentation crawling.</p>
              </body>
            </html>
          `, { 
            status: 200,
            headers: { 'Content-Type': 'text/html' }
          })
        }
        return new Response('Not found', { status: 404 })
      }
      
      try {
        await processUrlJob({
          jobId: job.id,
          url: 'https://example.com/test-page',
          maxRetries: 3
        })
        
        // Check that page was crawled and stored
        const crawledPagesList = await db.select()
          .from(crawledPages)
          .where(eq(crawledPages.jobId, job.id))
        
        expect(crawledPagesList).toHaveLength(1)
        expect(crawledPagesList[0].url).toBe('https://example.com/test-page')
        expect(crawledPagesList[0].success).toBe(true)
        expect(crawledPagesList[0].statusCode).toBe(200)
        
      } finally {
        globalThis.fetch = originalFetch
      }
    })
    
    it('should handle URL fetch failure', async () => {
      const job = await createTestJob({
        status: 'running'
      })
      
      // Mock fetch to fail
      const originalFetch = globalThis.fetch
      globalThis.fetch = async () => new Response('Not found', { status: 404 })
      
      try {
        await processUrlJob({
          jobId: job.id,
          url: 'https://example.com/missing-page',
          maxRetries: 1
        })
        
        // Check that failure was recorded
        const crawledPagesList = await db.select()
          .from(crawledPages)
          .where(eq(crawledPages.jobId, job.id))
        
        expect(crawledPagesList).toHaveLength(1)
        expect(crawledPagesList[0].success).toBe(false)
        expect(crawledPagesList[0].statusCode).toBe(404)
        
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })
  
  describe('finalizeJob', () => {
    it('should complete job with final statistics', async () => {
      const job = await createTestJob({
        status: 'running'
      })
      
      // Create some test pages
      await createTestPages(job.id, [
        { url: 'https://example.com/page1', content: 'This is page one content with many words here.' },
        { url: 'https://example.com/page2', content: 'This is page two with different content and more words.' },
        { url: 'https://example.com/page3', success: false }
      ])
      
      await finalizeJob({
        jobId: job.id
      })
      
      // Check final job state
      const [finalJob] = await db.select()
        .from(crawlingJobs)
        .where(eq(crawlingJobs.id, job.id))
      
      expect(finalJob.status).toBe('completed')
      expect(finalJob.progressSummary.pagesProcessed).toBe(2) // 2 successful
      expect(finalJob.progressSummary.failedUrls).toBe(1) // 1 failed
      expect(finalJob.progressSummary.totalWords).toBeGreaterThan(0)
      expect(finalJob.completedAt).toBeDefined()
    })
    
    it('should handle job with no pages', async () => {
      const job = await createTestJob({
        status: 'running'
      })
      
      await finalizeJob({
        jobId: job.id
      })
      
      const [finalJob] = await db.select()
        .from(crawlingJobs)
        .where(eq(crawlingJobs.id, job.id))
      
      expect(finalJob.status).toBe('completed')
      expect(finalJob.progressSummary.pagesProcessed).toBe(0)
      expect(finalJob.progressSummary.totalWords).toBe(0)
    })
  })
})