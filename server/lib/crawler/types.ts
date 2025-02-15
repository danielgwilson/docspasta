/**
 * Core types for the documentation crawler system.
 * @module CrawlerTypes
 */

import { z } from 'zod';

/**
 * Represents the result of processing a single page
 */
export interface PageResult {
  /** Unique URL of the page */
  url: string;
  /** Page title extracted from content */
  title: string;
  /** Processed markdown content */
  content: string;
  /** Estimated token count for AI processing */
  tokenCount?: number;
  /** Processing timestamp */
  timestamp: number;
  /** Processing status */
  status: 'complete' | 'error';
  /** Error message if status is error */
  error?: string;
  /** Depth in crawl tree */
  depth: number;
  /** Parent URL that led to this page */
  parent?: string;
  /** Page hierarchy based on headings */
  hierarchy?: string[];
}

/**
 * Configuration options for the crawler
 */
export const crawlerOptionsSchema = z.object({
  /** Maximum number of pages to crawl */
  maxPages: z.number().int().positive().default(100),
  /** Maximum depth to traverse */
  maxDepth: z.number().int().nonnegative().default(3),
  /** Whether to process anchor links */
  includeAnchors: z.boolean().default(false),
  /** Maximum concurrent requests */
  maxConcurrentRequests: z.number().int().positive().default(3),
  /** Request timeout in milliseconds */
  timeout: z.number().int().positive().default(30000),
  /** Allowed domains to crawl */
  allowedDomains: z.array(z.string()).default([]),
  /** Patterns to exclude from crawling */
  excludePatterns: z.array(z.instanceof(RegExp)).default([]),
  /** Rate limit between requests in milliseconds */
  rateLimit: z.number().int().nonnegative().default(1000),
  /** Whether to exclude navigation elements */
  excludeNavigation: z.boolean().default(true),
});

export type CrawlerOptions = z.input<typeof crawlerOptionsSchema>;
export type ValidatedCrawlerOptions = z.output<typeof crawlerOptionsSchema>;

/**
 * Progress metrics for the crawler
 */
export interface CrawlerProgress {
  /** Number of visited pages */
  visited: number;
  /** Number of errors encountered */
  errors: number;
  /** Number of pages in queue */
  queued: number;
  /** Number of successfully processed results */
  results: number;
  /** Time elapsed in milliseconds */
  timeElapsed: number;
}

/**
 * Internal representation of a page in the crawl tree
 */
export interface PageNode {
  /** URL to crawl */
  url: string;
  /** Depth in crawl tree */
  depth: number;
  /** Parent URL that led to this page */
  parent?: string;
}