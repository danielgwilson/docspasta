import { z } from 'zod'

/**
 * TypeScript types for QStash-based job processing
 */

// URL validation for SSRF protection (defined first to avoid circular dependency)
export const UrlValidationSchema = z.string().url().refine(
  (url) => {
    try {
      const parsed = new URL(url)
      
      // Block private IP ranges and localhost
      const hostname = parsed.hostname.toLowerCase()
      
      // Block localhost and loopback
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('127.')) {
        return false
      }
      
      // Block private IP ranges (basic check)
      if (
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
      ) {
        return false
      }
      
      // Block link-local addresses
      if (hostname.startsWith('169.254.')) {
        return false
      }
      
      // Only allow HTTP/HTTPS
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return false
      }
      
      return true
    } catch {
      return false
    }
  },
  {
    message: 'Invalid or potentially unsafe URL'
  }
)

// Base job payload validation
const BaseJobPayloadSchema = z.object({
  jobId: z.string().uuid('Invalid job ID format'),
  userId: z.string().min(1, 'User ID is required'),
  type: z.enum(['start-crawl', 'process-url', 'finalize-job']),
  timestamp: z.number().int().positive(),
  retryCount: z.number().int().min(0).default(0),
})

// Start crawl job payload
export const StartCrawlJobSchema = BaseJobPayloadSchema.extend({
  type: z.literal('start-crawl'),
  url: UrlValidationSchema,
  maxPages: z.number().int().min(1).max(1000).default(50),
  maxDepth: z.number().int().min(1).max(10).default(3),
  qualityThreshold: z.number().int().min(0).max(100).default(20),
  forceRefresh: z.boolean().default(false),
})

// Process URL job payload
export const ProcessUrlJobSchema = BaseJobPayloadSchema.extend({
  type: z.literal('process-url'),
  url: UrlValidationSchema,
  urlId: z.string().uuid('Invalid URL ID format'),
  depth: z.number().int().min(0).default(0),
  originalJobUrl: UrlValidationSchema,
  discoveredFrom: UrlValidationSchema.optional(),
})

// Finalize job payload
export const FinalizeJobSchema = BaseJobPayloadSchema.extend({
  type: z.literal('finalize-job'),
})

// Union type for all job payloads
export const JobPayloadSchema = z.discriminatedUnion('type', [
  StartCrawlJobSchema,
  ProcessUrlJobSchema,
  FinalizeJobSchema,
])

// TypeScript types
export type BaseJobPayload = z.infer<typeof BaseJobPayloadSchema>
export type StartCrawlJob = z.infer<typeof StartCrawlJobSchema>
export type ProcessUrlJob = z.infer<typeof ProcessUrlJobSchema>
export type FinalizeJob = z.infer<typeof FinalizeJobSchema>
export type JobPayload = z.infer<typeof JobPayloadSchema>

// Message verification types
export interface QStashMessageHeaders {
  'upstash-signature': string
  'upstash-message-id': string
  'upstash-timestamp': string
  'upstash-retries'?: string
  'content-type': string
}

// Queue configuration
export interface QueueConfig {
  queueName: string
  concurrency?: number
  retries?: number
  delay?: string | number // e.g., "5s", "2m", 30000 (ms)
}

// Processing result types
export interface ProcessingSuccess {
  success: true
  url: string
  title: string
  content: string
  links: string[]
  discoveredUrls: string[]
  quality: {
    score: number
    reason: string
  }
  wordCount: number
  fromCache: boolean
  depth: number
}

export interface ProcessingFailure {
  success: false
  url: string
  error: string
  retryable: boolean
}

export type ProcessingResult = ProcessingSuccess | ProcessingFailure

// Job state management
export interface JobState {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  totalUrls: number
  processedUrls: number
  failedUrls: number
  discoveredUrls: number
  createdAt: number
  updatedAt: number
  completedAt?: number
  errorDetails?: string
}

// Error handling types
export interface QStashError extends Error {
  retryable: boolean
  statusCode?: number
  messageId?: string
}

