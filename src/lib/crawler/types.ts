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
  qualityThreshold?: number
}

export interface CrawlProgress {
  current: number
  total: number
  phase: 'discovery' | 'crawling' | 'completed' | 'failed'
  message: string
  // Enhanced tracking
  discovered?: number      // Total URLs discovered (before filtering)
  queued?: number         // URLs that passed filters and were queued
  processed?: number      // URLs actually crawled
  filtered?: number       // URLs filtered out (robots, patterns, etc)
  skipped?: number        // URLs skipped (duplicates)
  failed?: number         // URLs that failed to crawl
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
  jobId?: string  // UUID for tracking job completion
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
  markdown?: string  // Combined markdown from all results
}