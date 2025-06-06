/**
 * Modern Crawler Integration Point
 * 
 * This file provides the main interface for crawling functionality.
 * The new ModernCrawler implements a pure queue-based architecture
 * with real-time progress tracking and individual page timeouts.
 */

import { ModernCrawler, type CrawlOptions as ModernCrawlOptions } from './modern-crawler';
import { memoryStore, type CrawlResult } from '../storage/memory-store';

// Export the modern crawler and its types
export { ModernCrawler };
export type { ModernCrawlOptions };

// Legacy interfaces for backwards compatibility
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

export interface CrawlProgress {
  currentUrl: string;
  pageCount: number;
  totalPages: number;
  status: string;
}

/**
 * Legacy DocspastaCrawler - forwards to ModernCrawler
 * @deprecated Use ModernCrawler directly for new implementations
 */
export class DocspastaCrawler {
  private modernCrawler: ModernCrawler;

  constructor(options: CrawlOptions = {}) {
    console.log('⚠️  Using legacy DocspastaCrawler - consider upgrading to ModernCrawler directly');
    
    // Convert legacy options to modern options
    const modernOptions: ModernCrawlOptions = {
      maxPages: options.maxPages,
      maxDepth: options.maxDepth,
      concurrency: 3,
      pageTimeout: 5000,
      delayMs: options.delayMs,
      followExternalLinks: options.followExternalLinks,
      respectRobots: options.respectRobots,
      useSitemap: options.useSitemap,
      qualityThreshold: options.qualityThreshold,
      includePaths: options.includePaths,
      excludePaths: options.excludePaths,
      maxLinksPerPage: options.maxLinksPerPage,
    };

    this.modernCrawler = new ModernCrawler(modernOptions);
  }

  /**
   * Legacy crawl method - forwards to ModernCrawler
   * @deprecated Use ModernCrawler.crawl() directly
   */
  async crawl(startUrl: string, crawlId: string): Promise<void> {
    return this.modernCrawler.crawl(startUrl, crawlId);
  }

  /**
   * Get crawler statistics
   */
  getStats() {
    return this.modernCrawler.getStats();
  }
}

/**
 * Start a new crawl using the modern crawler
 */
export async function startCrawl(url: string, options: CrawlOptions = {}): Promise<string> {
  const crawlId = `crawl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`🚀 Creating modern crawl with ID: ${crawlId} for URL: ${url}`);
  
  // Store initial crawl state
  const crawlResult: CrawlResult = {
    id: crawlId,
    url,
    status: 'started',
    progress: {
      currentUrl: url,
      pageCount: 0,
      totalPages: 1,
      status: 'Initializing modern crawler'
    },
    createdAt: new Date().toISOString()
  };
  
  memoryStore.setCrawl(crawlId, crawlResult);
  
  // Verify storage
  const stored = memoryStore.getCrawl(crawlId);
  console.log(`Stored crawl verification:`, stored ? 'SUCCESS' : 'FAILED');

  // Convert legacy options to modern options
  const modernOptions: ModernCrawlOptions = {
    maxPages: options.maxPages,
    maxDepth: options.maxDepth,
    concurrency: 3,
    pageTimeout: 5000,
    delayMs: options.delayMs,
    followExternalLinks: options.followExternalLinks,
    respectRobots: options.respectRobots,
    useSitemap: options.useSitemap,
    qualityThreshold: options.qualityThreshold,
    includePaths: options.includePaths,
    excludePaths: options.excludePaths,
    maxLinksPerPage: options.maxLinksPerPage,
  };

  // Start crawling with ModernCrawler in background
  const crawler = new ModernCrawler(modernOptions);
  
  crawler.crawl(url, crawlId).catch(error => {
    console.error('💥 Modern crawler error:', error);
    memoryStore.updateCrawl(crawlId, {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      completedAt: new Date().toISOString()
    });
  });

  return crawlId;
}

/**
 * Get crawl status and result
 */
export function getCrawlResult(crawlId: string): CrawlResult | null {
  return memoryStore.getCrawl(crawlId);
}