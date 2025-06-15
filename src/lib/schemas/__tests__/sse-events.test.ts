import { describe, it, expect } from 'vitest'
import {
  sseEventSchema,
  parseSSEEvent,
  isValidSSEEventType,
  createSSEEvent,
  type SSEEvent,
} from '../sse-events'

describe('SSE Event Schemas', () => {
  describe('parseSSEEvent', () => {
    it('should parse a valid stream_connected event', () => {
      const eventData = JSON.stringify({
        type: 'stream_connected',
        jobId: 'job123',
        url: 'https://example.com',
        timestamp: '2025-06-14T22:30:00Z',
      })
      
      const parsed = parseSSEEvent(eventData)
      expect(parsed).not.toBeNull()
      expect(parsed?.type).toBe('stream_connected')
    })
    
    it('should parse a valid progress event', () => {
      const eventData = JSON.stringify({
        type: 'progress',
        processed: 5,
        discovered: 12,
        queued: 7,
        pending: 3,
        timestamp: '2025-06-14T22:30:05Z',
      })
      
      const parsed = parseSSEEvent(eventData)
      expect(parsed).not.toBeNull()
      expect(parsed?.type).toBe('progress')
      if (parsed?.type === 'progress') {
        expect(parsed.processed).toBe(5)
        expect(parsed.discovered).toBe(12)
        expect(parsed.queued).toBe(7)
        expect(parsed.pending).toBe(3)
      }
    })
    
    it('should return null for invalid event data', () => {
      const invalidData = JSON.stringify({
        type: 'invalid_type',
        data: 'test',
      })
      
      const parsed = parseSSEEvent(invalidData)
      expect(parsed).toBeNull()
    })
  })
  
  describe('isValidSSEEventType', () => {
    it('should return true for valid event types', () => {
      expect(isValidSSEEventType('stream_connected')).toBe(true)
      expect(isValidSSEEventType('url_started')).toBe(true)
      expect(isValidSSEEventType('progress')).toBe(true)
      expect(isValidSSEEventType('job_completed')).toBe(true)
    })
    
    it('should return false for invalid event types', () => {
      expect(isValidSSEEventType('invalid_type')).toBe(false)
      expect(isValidSSEEventType('')).toBe(false)
    })
  })
  
  describe('createSSEEvent helpers', () => {
    it('should create a stream_connected event with timestamp', () => {
      const event = createSSEEvent.streamConnected({
        jobId: 'job123',
        url: 'https://example.com',
      })
      
      expect(event.type).toBe('stream_connected')
      expect(event.jobId).toBe('job123')
      expect(event.url).toBe('https://example.com')
      expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })
    
    it('should create a url_crawled event with all fields', () => {
      const event = createSSEEvent.urlCrawled({
        url: 'https://example.com/page',
        success: true,
        content_length: 1024,
        title: 'Example Page',
        quality: { score: 85, reason: 'good' },
      })
      
      expect(event.type).toBe('url_crawled')
      expect(event.success).toBe(true)
      expect(event.content_length).toBe(1024)
      expect(event.title).toBe('Example Page')
      expect(event.quality?.score).toBe(85)
    })
    
    it('should create a time_update event with formatted time', () => {
      const event = createSSEEvent.timeUpdate({
        elapsed: 125,
        formatted: '2:05',
        totalProcessed: 10,
        totalDiscovered: 25,
        queueSize: 15,
        pendingCount: 3,
      })
      
      expect(event.type).toBe('time_update')
      expect(event.elapsed).toBe(125)
      expect(event.formatted).toBe('2:05')
    })
  })
  
  describe('discriminated union validation', () => {
    it('should validate all event types through the union', () => {
      const events: SSEEvent[] = [
        createSSEEvent.streamConnected({ jobId: 'job1', url: 'https://example.com' }),
        createSSEEvent.urlStarted({ url: 'https://example.com', depth: 0 }),
        createSSEEvent.urlCrawled({ url: 'https://example.com', success: true, content_length: 100 }),
        createSSEEvent.urlsDiscovered({
          source_url: 'https://example.com',
          discovered_urls: ['https://example.com/page1'],
          count: 1,
          total_discovered: 1,
        }),
        createSSEEvent.urlFailed({ url: 'https://example.com', error: 'Network error' }),
        createSSEEvent.sentToProcessing({ url: 'https://example.com', word_count: 500 }),
        createSSEEvent.progress({ processed: 1, discovered: 1, queued: 0, pending: 0 }),
        createSSEEvent.timeUpdate({
          elapsed: 10,
          formatted: '0:10',
          totalProcessed: 1,
          totalDiscovered: 1,
          queueSize: 0,
          pendingCount: 0,
        }),
        createSSEEvent.jobCompleted({ jobId: 'job1', totalProcessed: 1, totalDiscovered: 1 }),
        createSSEEvent.jobFailed({ jobId: 'job1', error: 'Job failed' }),
        createSSEEvent.jobTimeout({
          jobId: 'job1',
          totalProcessed: 0,
          totalDiscovered: 0,
          message: 'Job exceeded 5-minute limit',
        }),
      ]
      
      events.forEach(event => {
        const result = sseEventSchema.safeParse(event)
        expect(result.success).toBe(true)
      })
    })
  })
})