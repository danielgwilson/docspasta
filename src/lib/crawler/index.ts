/**
 * Queue-Based Crawler System
 * 
 * This file provides the main interface for the modern queue-based 
 * crawling functionality using BullMQ and Redis for enterprise-grade
 * job management and real-time progress tracking.
 */

import { v4 as uuidv4 } from 'uuid';
import { addKickoffJob } from './queue-jobs';
import { startWorker } from './queue-worker';
import type { CrawlOptions as QueueCrawlOptions } from './types';

// Public crawl options interface
export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  followExternalLinks?: boolean;
  includeAnchors?: boolean;
  respectRobots?: boolean;
  delayMs?: number;
  useSitemap?: boolean;
  qualityThreshold?: number;
  includePaths?: string[];
  excludePaths?: string[];
  maxLinksPerPage?: number;
}

/**
 * Start a new crawl using the queue-based system
 * 
 * @param url - The URL to start crawling from
 * @param options - Crawl configuration options
 * @returns The unique crawl ID
 */
export async function startCrawl(url: string, options: CrawlOptions = {}): Promise<string> {
  const crawlId = uuidv4();
  
  console.log(`🚀 Starting queue-based crawl with ID: ${crawlId} for URL: ${url}`);
  
  // Ensure worker is running with higher concurrency for better performance
  try {
    await startWorker(10); // Increased for better parallelism
    console.log('✨ Queue worker is running');
  } catch (workerError) {
    console.error('Worker start error (may already be running):', workerError);
  }
  
  // Convert public options to internal queue options  
  const queueOptions: QueueCrawlOptions = {
    maxDepth: options.maxDepth || 3,
    maxPages: options.maxPages || 50,
    respectRobotsTxt: options.respectRobots ?? true,
    delay: options.delayMs || 100,
    timeout: 8000, // 8 second per-page timeout (much faster)
    concurrency: 5,
    includePatterns: options.includePaths || [],
    excludePatterns: options.excludePaths || [],
    qualityThreshold: options.qualityThreshold ?? 20,
  };

  // Add kickoff job to queue
  try {
    await addKickoffJob({
      crawlId,
      url,
      options: queueOptions,
    });
    
    console.log(`✅ Crawl started with ID: ${crawlId}`);
    
    return crawlId;
  } catch (error) {
    console.error('❌ Failed to start crawl:', error);
    throw error;
  }
}

// Re-export types and utilities from the queue-based system
export type { CrawlResult, CrawlProgress, CrawlStatus } from './types';
export { getCrawl } from './crawl-redis';
export { getCrawlJobCounts } from './queue-jobs';