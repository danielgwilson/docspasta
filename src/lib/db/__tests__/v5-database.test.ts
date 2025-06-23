/**
 * V5 Database Integration Tests
 * Tests the new 3-table schema and operations
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestEnvironment, createTestJob, createTestPages } from '@/lib/test/setup'
import { db } from '@/lib/db/connection'
import { crawlingJobs, crawledPages, pageContentChunks } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

setupTestEnvironment()

describe('V5 Database Schema', () => {
  describe('crawlingJobs table', () => {
    it('should create job with default values', async () => {
      const job = await createTestJob({
        url: 'https://docs.example.com',
        userId: 'test-user-123'
      })
      
      expect(job.id).toBeDefined()
      expect(job.url).toBe('https://docs.example.com')
      expect(job.userId).toBe('test-user-123')
      expect(job.status).toBe('pending')
      expect(job.stateVersion).toBe(1)
      expect(job.progressSummary.pagesProcessed).toBe(0)
      expect(job.createdAt).toBeInstanceOf(Date)
    })
    
    it('should update job status and increment state version', async () => {
      const job = await createTestJob()
      
      const [updatedJob] = await db.update(crawlingJobs)
        .set({
          status: 'processing',
          stateVersion: job.stateVersion + 1,
          progressSummary: {
            ...job.progressSummary,
            discoveredUrls: 15
          },
          updatedAt: new Date()
        })
        .where(eq(crawlingJobs.id, job.id))
        .returning()
      
      expect(updatedJob.status).toBe('processing')
      expect(updatedJob.stateVersion).toBe(2)
      expect(updatedJob.progressSummary.discoveredUrls).toBe(15)
    })
    
    it('should support JSON operations on progressSummary', async () => {
      const job = await createTestJob()
      
      // Test JSON path updates (PostgreSQL specific)
      await db.execute(sql`
        UPDATE ${crawlingJobs} 
        SET progress_summary = jsonb_set(progress_summary, '{pagesProcessed}', '10', true)
        WHERE id = ${job.id}
      `)
      
      const [updatedJob] = await db.select()
        .from(crawlingJobs)
        .where(eq(crawlingJobs.id, job.id))
      
      expect(updatedJob.progressSummary.pagesProcessed).toBe(10)
    })
  })
  
  describe('crawledPages table', () => {
    it('should store page crawl results', async () => {
      const job = await createTestJob()
      
      const [page] = await db.insert(crawledPages).values({
        id: crypto.randomUUID(),
        jobId: job.id,
        url: 'https://example.com/page1',
        urlHash: Buffer.from('https://example.com/page1').toString('base64'),
        status: 'crawled',
        httpStatus: 200,
        wordCount: 1000,
        crawledAt: new Date()
      }).returning()
      
      expect(page.url).toBe('https://example.com/page1')
      expect(page.status).toBe('crawled')
      expect(page.httpStatus).toBe(200)
      expect(page.jobId).toBe(job.id)
    })
    
    it('should handle failed page crawls', async () => {
      const job = await createTestJob()
      
      const [page] = await db.insert(crawledPages).values({
        id: crypto.randomUUID(),
        jobId: job.id,
        url: 'https://example.com/missing',
        urlHash: Buffer.from('https://example.com/missing').toString('base64'),
        status: 'error',
        httpStatus: 404,
        errorMessage: 'Page not found',
        crawledAt: new Date()
      }).returning()
      
      expect(page.status).toBe('error')
      expect(page.httpStatus).toBe(404)
      expect(page.errorMessage).toBe('Page not found')
    })
  })
  
  describe('pageContentChunks table', () => {
    it('should store page content chunks', async () => {
      const job = await createTestJob()
      const pages = await createTestPages(job.id, [
        { url: 'https://example.com/page1', content: 'This is test content with multiple words for testing.' }
      ])
      
      const chunks = await db.select()
        .from(pageContentChunks)
        .where(eq(pageContentChunks.pageId, pages[0].id))
      
      expect(chunks).toHaveLength(1)
      expect(chunks[0].content).toBe('This is test content with multiple words for testing.')
      expect(chunks[0].chunkIndex).toBe(0)
      expect(chunks[0].wordCount).toBeGreaterThan(0)
    })
    
    it('should support multiple chunks per page', async () => {
      const job = await createTestJob()
      const pages = await createTestPages(job.id, [
        { url: 'https://example.com/large-page' }
      ])
      
      // Create multiple chunks for same page
      await db.insert(pageContentChunks).values([
        {
          id: crypto.randomUUID(),
          pageId: pages[0].id,
          content: 'First chunk of content',
          chunkIndex: 0,
          wordCount: 4
        },
        {
          id: crypto.randomUUID(),
          pageId: pages[0].id,
          content: 'Second chunk of content',
          chunkIndex: 1,
          wordCount: 4
        }
      ])
      
      const chunks = await db.select()
        .from(pageContentChunks)
        .where(eq(pageContentChunks.pageId, pages[0].id))
        .orderBy(pageContentChunks.chunkIndex)
      
      expect(chunks).toHaveLength(2)
      expect(chunks[0].chunkIndex).toBe(0)
      expect(chunks[1].chunkIndex).toBe(1)
    })
  })
  
  describe('Relational queries', () => {
    it('should join job with pages and content', async () => {
      const job = await createTestJob()
      await createTestPages(job.id, [
        { url: 'https://example.com/page1', content: 'Content for page one' },
        { url: 'https://example.com/page2', content: 'Content for page two' }
      ])
      
      const result = await db.select({
        jobId: crawlingJobs.id,
        jobStatus: crawlingJobs.status,
        pageUrl: crawledPages.url,
        pageStatus: crawledPages.status,
        contentChunk: pageContentChunks.content
      })
      .from(crawlingJobs)
      .leftJoin(crawledPages, eq(crawlingJobs.id, crawledPages.jobId))
      .leftJoin(pageContentChunks, eq(crawledPages.id, pageContentChunks.pageId))
      .where(eq(crawlingJobs.id, job.id))
      
      expect(result).toHaveLength(2)
      expect(result[0].jobId).toBe(job.id)
      expect(result[0].pageUrl).toBe('https://example.com/page1')
      expect(result[0].contentChunk).toBe('Content for page one')
    })
    
    it('should aggregate content statistics', async () => {
      const job = await createTestJob()
      await createTestPages(job.id, [
        { url: 'https://example.com/page1', content: 'Short content here' },
        { url: 'https://example.com/page2', content: 'Much longer content with many more words in this test page' },
        { url: 'https://example.com/page3', success: false }
      ])
      
      const [stats] = await db.select({
        totalPages: sql<number>`count(${crawledPages.id})`,
        successfulPages: sql<number>`count(case when ${crawledPages.status} = 'crawled' then 1 end)`,
        totalWords: sql<number>`coalesce(sum(${pageContentChunks.wordCount}), 0)`,
        totalContentLength: sql<number>`coalesce(sum(${crawledPages.wordCount}), 0)`
      })
      .from(crawledPages)
      .leftJoin(pageContentChunks, eq(crawledPages.id, pageContentChunks.pageId))
      .where(eq(crawledPages.jobId, job.id))
      
      expect(stats.totalPages).toBe(3)
      expect(stats.successfulPages).toBe(2)
      expect(stats.totalWords).toBeGreaterThan(0)
      expect(stats.totalContentLength).toBeGreaterThan(0)
    })
  })
  
  describe('State versioning', () => {
    it('should support optimistic updates with state versioning', async () => {
      const job = await createTestJob()
      
      // Simulate concurrent update attempt
      const updatePromises = [
        db.update(crawlingJobs)
          .set({ 
            status: 'processing',
            stateVersion: job.stateVersion + 1 
          })
          .where(eq(crawlingJobs.id, job.id)),
        
        db.update(crawlingJobs)
          .set({ 
            progressSummary: { ...job.progressSummary, discoveredUrls: 10 },
            stateVersion: job.stateVersion + 1 
          })
          .where(eq(crawlingJobs.id, job.id))
      ]
      
      // Both should succeed (PostgreSQL handles this gracefully)
      const results = await Promise.allSettled(updatePromises)
      expect(results.every(r => r.status === 'fulfilled')).toBe(true)
      
      // Final state should have incremented version
      const [finalJob] = await db.select()
        .from(crawlingJobs)
        .where(eq(crawlingJobs.id, job.id))
      
      expect(finalJob.stateVersion).toBeGreaterThan(job.stateVersion)
    })
  })
})