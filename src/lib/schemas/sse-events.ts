import { z } from 'zod'

// Base event schema with common fields
const baseEventSchema = z.object({
  timestamp: z.string().datetime(),
})

// Individual event schemas

export const streamConnectedSchema = baseEventSchema.extend({
  type: z.literal('stream_connected'),
  jobId: z.string(),
  url: z.string().url(),
})

export const urlStartedSchema = baseEventSchema.extend({
  type: z.literal('url_started'),
  url: z.string().url(),
  depth: z.number().int().min(0),
})

export const urlCrawledSchema = baseEventSchema.extend({
  type: z.literal('url_crawled'),
  url: z.string().url(),
  success: z.boolean(),
  content_length: z.number().int().min(0),
  title: z.string().optional(),
  quality: z.object({
    score: z.number().min(0).max(100),
    reason: z.string(),
  }).optional(),
})

export const urlsDiscoveredSchema = baseEventSchema.extend({
  type: z.literal('urls_discovered'),
  source_url: z.string().url(),
  discovered_urls: z.array(z.string().url()),
  count: z.number().int().min(0),
  total_discovered: z.number().int().min(0),
})

export const urlFailedSchema = baseEventSchema.extend({
  type: z.literal('url_failed'),
  url: z.string().url(),
  error: z.string(),
})

export const sentToProcessingSchema = baseEventSchema.extend({
  type: z.literal('sent_to_processing'),
  url: z.string().url(),
  word_count: z.number().int().min(0),
})

export const progressSchema = baseEventSchema.extend({
  type: z.literal('progress'),
  processed: z.number().int().min(0),
  discovered: z.number().int().min(0),
  queued: z.number().int().min(0),
  pending: z.number().int().min(0),
})

export const timeUpdateSchema = baseEventSchema.extend({
  type: z.literal('time_update'),
  elapsed: z.number().int().min(0), // seconds
  formatted: z.string(), // "M:SS" format
  totalProcessed: z.number().int().min(0),
  totalDiscovered: z.number().int().min(0),
  queueSize: z.number().int().min(0),
  pendingCount: z.number().int().min(0),
})

export const jobCompletedSchema = baseEventSchema.extend({
  type: z.literal('job_completed'),
  jobId: z.string(),
  totalProcessed: z.number().int().min(0),
  totalDiscovered: z.number().int().min(0),
})

export const jobFailedSchema = baseEventSchema.extend({
  type: z.literal('job_failed'),
  jobId: z.string(),
  error: z.string(),
  totalProcessed: z.number().int().min(0).optional(),
  totalDiscovered: z.number().int().min(0).optional(),
})

export const jobTimeoutSchema = baseEventSchema.extend({
  type: z.literal('job_timeout'),
  jobId: z.string(),
  totalProcessed: z.number().int().min(0),
  totalDiscovered: z.number().int().min(0),
  message: z.string(),
})

// Discriminated union for all SSE event types
export const sseEventSchema = z.discriminatedUnion('type', [
  streamConnectedSchema,
  urlStartedSchema,
  urlCrawledSchema,
  urlsDiscoveredSchema,
  urlFailedSchema,
  sentToProcessingSchema,
  progressSchema,
  timeUpdateSchema,
  jobCompletedSchema,
  jobFailedSchema,
  jobTimeoutSchema,
])

// Type exports
export type SSEEvent = z.infer<typeof sseEventSchema>
export type StreamConnectedEvent = z.infer<typeof streamConnectedSchema>
export type UrlStartedEvent = z.infer<typeof urlStartedSchema>
export type UrlCrawledEvent = z.infer<typeof urlCrawledSchema>
export type UrlsDiscoveredEvent = z.infer<typeof urlsDiscoveredSchema>
export type UrlFailedEvent = z.infer<typeof urlFailedSchema>
export type SentToProcessingEvent = z.infer<typeof sentToProcessingSchema>
export type ProgressEvent = z.infer<typeof progressSchema>
export type TimeUpdateEvent = z.infer<typeof timeUpdateSchema>
export type JobCompletedEvent = z.infer<typeof jobCompletedSchema>
export type JobFailedEvent = z.infer<typeof jobFailedSchema>
export type JobTimeoutEvent = z.infer<typeof jobTimeoutSchema>

// Helper function to parse SSE event data
export function parseSSEEvent(data: string): SSEEvent | null {
  try {
    const parsed = JSON.parse(data)
    return sseEventSchema.parse(parsed)
  } catch (error) {
    console.error('Failed to parse SSE event:', {
      rawData: data,
      error: error instanceof Error ? error.message : error,
      zodIssues: error instanceof z.ZodError ? error.issues : undefined
    })
    return null
  }
}

// Helper function to validate event type
export function isValidSSEEventType(type: string): type is SSEEvent['type'] {
  const validTypes = [
    'stream_connected',
    'url_started',
    'url_crawled',
    'urls_discovered',
    'url_failed',
    'sent_to_processing',
    'progress',
    'time_update',
    'job_completed',
    'job_failed',
    'job_timeout',
  ] as const
  
  return validTypes.includes(type as any)
}

// Helper function to create type-safe event data
export const createSSEEvent = {
  streamConnected: (data: Omit<StreamConnectedEvent, 'type' | 'timestamp'>): StreamConnectedEvent => ({
    type: 'stream_connected',
    timestamp: new Date().toISOString(),
    ...data,
  }),
  
  urlStarted: (data: Omit<UrlStartedEvent, 'type' | 'timestamp'>): UrlStartedEvent => ({
    type: 'url_started',
    timestamp: new Date().toISOString(),
    ...data,
  }),
  
  urlCrawled: (data: Omit<UrlCrawledEvent, 'type' | 'timestamp'>): UrlCrawledEvent => ({
    type: 'url_crawled',
    timestamp: new Date().toISOString(),
    ...data,
  }),
  
  urlsDiscovered: (data: Omit<UrlsDiscoveredEvent, 'type' | 'timestamp'>): UrlsDiscoveredEvent => ({
    type: 'urls_discovered',
    timestamp: new Date().toISOString(),
    ...data,
  }),
  
  urlFailed: (data: Omit<UrlFailedEvent, 'type' | 'timestamp'>): UrlFailedEvent => ({
    type: 'url_failed',
    timestamp: new Date().toISOString(),
    ...data,
  }),
  
  sentToProcessing: (data: Omit<SentToProcessingEvent, 'type' | 'timestamp'>): SentToProcessingEvent => ({
    type: 'sent_to_processing',
    timestamp: new Date().toISOString(),
    ...data,
  }),
  
  progress: (data: Omit<ProgressEvent, 'type' | 'timestamp'>): ProgressEvent => ({
    type: 'progress',
    timestamp: new Date().toISOString(),
    ...data,
  }),
  
  timeUpdate: (data: Omit<TimeUpdateEvent, 'type' | 'timestamp'>): TimeUpdateEvent => ({
    type: 'time_update',
    timestamp: new Date().toISOString(),
    ...data,
  }),
  
  jobCompleted: (data: Omit<JobCompletedEvent, 'type' | 'timestamp'>): JobCompletedEvent => ({
    type: 'job_completed',
    timestamp: new Date().toISOString(),
    ...data,
  }),
  
  jobFailed: (data: Omit<JobFailedEvent, 'type' | 'timestamp'>): JobFailedEvent => ({
    type: 'job_failed',
    timestamp: new Date().toISOString(),
    ...data,
  }),
  
  jobTimeout: (data: Omit<JobTimeoutEvent, 'type' | 'timestamp'>): JobTimeoutEvent => ({
    type: 'job_timeout',
    timestamp: new Date().toISOString(),
    ...data,
  }),
}