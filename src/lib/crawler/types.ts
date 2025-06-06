/**
 * Type definitions for the queue-based crawler system
 */

export interface CrawlOptions {
  maxDepth?: number
  maxPages?: number
  respectRobotsTxt?: boolean
  delay?: number
  timeout?: number
  concurrency?: number
  includePatterns?: string[]
  excludePatterns?: string[]
}

export interface CrawlProgress {
  current: number
  total: number
  phase: 'discovery' | 'crawling' | 'completed' | 'failed'
  message: string
}

export interface CrawlResult {
  url: string
  title: string
  content: string
  contentType: 'markdown' | 'html' | 'error'
  timestamp: number
  statusCode: number
  parentUrl?: string
  depth: number
  error?: string
}

export interface KickoffJobData {
  crawlId: string
  url: string
  options: CrawlOptions
}

export interface CrawlJobData {
  crawlId: string
  url: string
  options: CrawlOptions
  depth: number
  parentUrl?: string
  delay?: number
}

export interface CrawlStatus {
  id: string
  url: string
  status: 'active' | 'completed' | 'failed' | 'cancelled'
  progress: CrawlProgress
  results: CrawlResult[]
  createdAt: number
  completedAt?: number
  errorMessage?: string
}