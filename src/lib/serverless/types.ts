/**
 * TypeScript definitions for the serverless architecture
 */

export interface CreateJobRequest {
  url: string
  maxPages?: number
  maxDepth?: number
  qualityThreshold?: number
}

export interface JobState {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  currentStep: 'init' | 'discovery' | 'processing' | 'finalizing' | 'done'
  totalUrls: number
  processedUrls: number
  failedUrls: number
  discoveredUrls: number
  createdAt: number
  updatedAt: number
  startedAt?: number
  completedAt?: number
  errorDetails?: any
  results?: any[]
  finalMarkdown?: string
}

// Make ProgressEvent a discriminated union for better type safety
export type ProgressEvent = 
  | {
      type: 'url_completed'
      jobId?: string
      url?: string
      status?: 'success' | 'failed' | 'processing'
      title?: string
      discoveredUrls?: number
      timestamp?: number
    }
  | {
      type: 'job_completed'
      jobId?: string
      timestamp?: number
    }
  | {
      type: 'discovery_started'
      jobId?: string
      timestamp?: number
    }
  | {
      type: 'error'
      jobId?: string
      error?: string
      timestamp?: number
    }
  | {
      type: 'stream_connected'
      jobId?: string
      timestamp?: number
    }
  | {
      type: 'batch_completed'
      jobId?: string
      completed?: number
      failed?: number
      discovered?: number
      fromCache?: number
      timestamp?: number
    }
  | {
      type: 'urls_discovered'
      jobId?: string
      discoveredUrls?: number
      count?: number
      depth?: number
      timestamp?: number
    }
  | {
      type: 'content_processed'
      jobId?: string
      timestamp?: number
    }
  | {
      type: 'job_timeout'
      jobId?: string
      timestamp?: number
    }
  | {
      type: 'job_failed'
      jobId?: string
      error?: string
      timestamp?: number
    }
  | {
      type: 'batch_error'
      jobId?: string
      error?: string
      timestamp?: number
    }
  | {
      type: 'stream_end'
      jobId?: string
      timestamp?: number
    }

export interface QueueItem {
  jobId: string
  urlId: string
  url: string
}

export interface ProcessingResult {
  url: string
  title?: string
  content?: string
  links?: string[]
  success: boolean
  error?: string
}