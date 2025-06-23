/**
 * V5 QStash Integration Tests
 * Tests the QStash job publishing and processing workflow
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestEnvironment, mockQStash } from '@/lib/test/setup'
import { publishStartCrawlJob, publishProcessUrlJob, publishFinalizeJob } from '@/lib/queue/operations'

setupTestEnvironment()

describe('V5 QStash Integration', () => {
  let unmockQStash: () => void
  
  beforeEach(() => {
    unmockQStash = mockQStash()
  })
  
  afterEach(() => {
    unmockQStash?.()
  })
  
  describe('publishStartCrawlJob', () => {
    it('should publish start-crawl job successfully', async () => {
      const messageId = await publishStartCrawlJob({
        jobId: 'test-job-123',
        userId: 'test-user-123',
        url: 'https://docs.example.com',
        maxPages: 50,
        maxDepth: 2,
        qualityThreshold: 20,
        forceRefresh: false
      })
      
      expect(messageId).toBe('mock-message-id')
    })
    
    it('should handle missing environment variables', async () => {
      // Temporarily remove QStash config
      const originalUrl = process.env.QSTASH_URL
      const originalToken = process.env.QSTASH_TOKEN
      
      delete process.env.QSTASH_URL
      delete process.env.QSTASH_TOKEN
      
      try {
        await expect(publishStartCrawlJob({
          jobId: 'test-job-123',
          userId: 'test-user-123',
          url: 'https://docs.example.com',
          maxPages: 50,
          maxDepth: 2,
          qualityThreshold: 20,
          forceRefresh: false
        })).rejects.toThrow('QStash configuration missing')
      } finally {
        if (originalUrl) process.env.QSTASH_URL = originalUrl
        if (originalToken) process.env.QSTASH_TOKEN = originalToken
      }
    })
  })
  
  describe('publishProcessUrlJob', () => {
    it('should publish process-url job successfully', async () => {
      const messageId = await publishProcessUrlJob({
        jobId: 'test-job-123',
        url: 'https://docs.example.com/page1',
        maxRetries: 3
      })
      
      expect(messageId).toBe('mock-message-id')
    })
    
    it('should include delay parameter', async () => {
      const messageId = await publishProcessUrlJob({
        jobId: 'test-job-123',
        url: 'https://docs.example.com/page1',
        maxRetries: 3,
        delaySeconds: 5
      })
      
      expect(messageId).toBe('mock-message-id')
    })
  })
  
  describe('publishFinalizeJob', () => {
    it('should publish finalize-job successfully', async () => {
      const messageId = await publishFinalizeJob({
        jobId: 'test-job-123'
      })
      
      expect(messageId).toBe('mock-message-id')
    })
  })
  
  describe('Error Handling', () => {
    it('should handle QStash API errors', async () => {
      // Override mock to return error
      globalThis.fetch = async () => new Response('QStash Error', { status: 500 })
      
      await expect(publishStartCrawlJob({
        jobId: 'test-job-123',
        userId: 'test-user-123',
        url: 'https://docs.example.com',
        maxPages: 50,
        maxDepth: 2,
        qualityThreshold: 20,
        forceRefresh: false
      })).rejects.toThrow()
    })
    
    it('should handle network timeouts', async () => {
      // Override mock to timeout
      globalThis.fetch = async () => new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Network timeout')), 100)
        })
      
      await expect(publishStartCrawlJob({
        jobId: 'test-job-123',
        userId: 'test-user-123',
        url: 'https://docs.example.com',
        maxPages: 50,
        maxDepth: 2,
        qualityThreshold: 20,
        forceRefresh: false
      })).rejects.toThrow('Network timeout')
    })
  })
  
  describe('Job Payload Validation', () => {
    it('should include all required fields in start-crawl payload', async () => {
      let capturedPayload: any
      
      globalThis.fetch = async (url: string | URL, init?: RequestInit) => {
        if (url.toString().includes('upstash.io')) {
          capturedPayload = JSON.parse(init?.body as string)
          return new Response(JSON.stringify({ messageId: 'mock-message-id' }), { status: 200 })
        }
        return new Response('', { status: 404 })
      }
      
      await publishStartCrawlJob({
        jobId: 'test-job-123',
        userId: 'test-user-123',
        url: 'https://docs.example.com',
        maxPages: 50,
        maxDepth: 2,
        qualityThreshold: 20,
        forceRefresh: false
      })
      
      expect(capturedPayload).toBeDefined()
      expect(capturedPayload.type).toBe('start-crawl')
      expect(capturedPayload.jobId).toBe('test-job-123')
      expect(capturedPayload.userId).toBe('test-user-123')
      expect(capturedPayload.url).toBe('https://docs.example.com')
      expect(capturedPayload.maxPages).toBe(50)
    })
  })
})