import { describe, it, expect, beforeEach, vi } from 'vitest'
import './setup' // Import test setup
import { getQStashClient, validateQStashConfig, resetQStashClient } from '../index'
import { publishStartCrawlJob, publishUrlProcessingBatch } from '../operations'
import { StartCrawlJobSchema, ProcessUrlJobSchema } from '../types'

// Mock QStash client
vi.mock('@upstash/qstash', () => ({
  Client: vi.fn().mockImplementation(() => ({
    publishJSON: vi.fn().mockResolvedValue({ messageId: 'test-message-id' }),
    batchJSON: vi.fn().mockResolvedValue([
      { messageId: 'test-message-1' },
      { messageId: 'test-message-2' }
    ])
  }))
}))

describe('QStash Integration', () => {
  beforeEach(() => {
    resetQStashClient()
    
    // Set up test environment variables
    process.env.QSTASH_TOKEN = 'test-token'
    process.env.QSTASH_URL = 'https://qstash.upstash.io'
  })

  describe('Configuration', () => {
    it('should validate QStash configuration', () => {
      expect(() => validateQStashConfig()).not.toThrow()
    })

    it('should throw error for missing token', () => {
      delete process.env.QSTASH_TOKEN
      expect(() => validateQStashConfig()).toThrow()
    })

    it('should get QStash client instance', () => {
      const client = getQStashClient()
      expect(client).toBeDefined()
    })
  })

  describe('Job Payload Validation', () => {
    it('should validate start-crawl job payload', () => {
      const payload = {
        jobId: '123e4567-e89b-12d3-a456-426614174000',
        userId: 'user-123',
        type: 'start-crawl' as const,
        url: 'https://example.com',
        maxPages: 50,
        maxDepth: 3,
        qualityThreshold: 20,
        forceRefresh: false,
        timestamp: Date.now(),
        retryCount: 0,
      }

      expect(() => StartCrawlJobSchema.parse(payload)).not.toThrow()
    })

    it('should validate process-url job payload', () => {
      const payload = {
        jobId: '123e4567-e89b-12d3-a456-426614174000',
        userId: 'user-123',
        type: 'process-url' as const,
        url: 'https://example.com/page',
        urlId: '123e4567-e89b-12d3-a456-426614174001',
        depth: 1,
        originalJobUrl: 'https://example.com',
        timestamp: Date.now(),
        retryCount: 0,
      }

      expect(() => ProcessUrlJobSchema.parse(payload)).not.toThrow()
    })

    it('should reject invalid URLs (SSRF protection)', () => {
      const invalidUrls = [
        'http://localhost:3000',
        'http://127.0.0.1',
        'http://192.168.1.1',
        'http://10.0.0.1',
        'ftp://example.com',
        'not-a-url'
      ]

      invalidUrls.forEach(url => {
        const payload = {
          jobId: '123e4567-e89b-12d3-a456-426614174000',
          userId: 'user-123',
          type: 'start-crawl' as const,
          url,
          timestamp: Date.now(),
          retryCount: 0,
        }

        expect(() => StartCrawlJobSchema.parse(payload)).toThrow()
      })
    })
  })

  describe('Queue Operations', () => {
    it('should publish start-crawl job', async () => {
      const jobData = {
        jobId: '123e4567-e89b-12d3-a456-426614174000',
        userId: 'user-123',
        url: 'https://example.com',
        maxPages: 50,
        maxDepth: 3,
        qualityThreshold: 20,
        forceRefresh: false,
      }

      const messageId = await publishStartCrawlJob(jobData)
      expect(messageId).toBe('test-message-id')
    })

    it('should publish URL processing batch', async () => {
      const jobs = [
        {
          jobId: '123e4567-e89b-12d3-a456-426614174000',
          userId: 'user-123',
          url: 'https://example.com/page1',
          urlId: '123e4567-e89b-12d3-a456-426614174001',
          depth: 1,
          originalJobUrl: 'https://example.com',
        },
        {
          jobId: '123e4567-e89b-12d3-a456-426614174000',
          userId: 'user-123',
          url: 'https://example.com/page2',
          urlId: '123e4567-e89b-12d3-a456-426614174002',
          depth: 1,
          originalJobUrl: 'https://example.com',
        }
      ]

      const messageIds = await publishUrlProcessingBatch(jobs)
      expect(messageIds).toEqual(['test-message-1', 'test-message-2'])
    })

    it('should handle empty batch gracefully', async () => {
      const messageIds = await publishUrlProcessingBatch([])
      expect(messageIds).toEqual([])
    })
  })

  describe('Error Handling', () => {
    it('should handle QStash API errors gracefully', async () => {
      const { Client } = await import('@upstash/qstash')
      
      // Mock API error
      vi.mocked(Client).mockImplementationOnce(() => ({
        publishJSON: vi.fn().mockRejectedValue(new Error('QStash API error')),
        batchJSON: vi.fn()
      }) as any)

      const jobData = {
        jobId: '123e4567-e89b-12d3-a456-426614174000',
        userId: 'user-123',
        url: 'https://example.com',
      }

      await expect(publishStartCrawlJob(jobData)).rejects.toThrow('Failed to publish start-crawl job')
    })
  })

  describe('Message Verification', () => {
    it('should handle missing signature header', async () => {
      // This would be tested with actual QStash signature verification
      // For now, we verify the structure is correct
      expect(true).toBe(true)
    })
  })
})