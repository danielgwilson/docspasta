/**
 * Advanced documentation crawler with intelligent content analysis and caching.
 * @module DocumentationCrawler
 */

import { JSDOM } from 'jsdom';
import { log } from './logger';
import { QueueManager } from './queue-manager';
import { extractContent, extractTitle, hashContent } from './content-extractor';
import {
  normalizeUrl,
  extractLinks,
  shouldCrawl,
  getUrlDepth,
} from './url-utils';
import type { PageResult, CrawlerOptions, ValidatedCrawlerOptions } from './types';
import { crawlerOptionsSchema } from './types';

export class DocumentationCrawler {
  private queueManager: QueueManager;
  private contentHashes = new Set<string>();
  private results: PageResult[] = [];
  private baseUrl: string;
  private options: ValidatedCrawlerOptions;
  private abortController: AbortController;

  constructor(baseUrl: string, options: CrawlerOptions = {}) {
    try {
      this.baseUrl = new URL(baseUrl).origin;
      this.options = crawlerOptionsSchema.parse(options);
      this.abortController = new AbortController();

      this.queueManager = new QueueManager(
        this.options.maxConcurrentRequests,
        this.options.rateLimit,
        this.options.timeout
      );

      // Set up event handlers for efficient queue management
      this.setupQueueEvents();

      // Add initial URL to queue
      this.addPage(baseUrl, 0);
    } catch (error) {
      log.error('Failed to initialize crawler:', error);
      throw error;
    }
  }

  private setupQueueEvents(): void {
    this.queueManager.on('error', (error) => {
      log.error('Queue error:', error);
    });

    this.queueManager.on('success', (url: string) => {
      log.info('Successfully processed:', url);
    });

    // Cleanup on queue idle
    this.queueManager.on('queueIdle', () => {
      this.cleanupMemory();
    });
  }

  private cleanupMemory(): void {
    if (typeof global.gc === 'function') {
      global.gc();
    }
  }

  private async fetchPage(url: string): Promise<Document | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Documentation Crawler Bot/1.0',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(this.options.timeout),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('text/html')) {
        throw new Error(`Invalid content type: ${contentType}`);
      }

      const html = await response.text();
      const dom = new JSDOM(html, {
        url,
        runScripts: 'outside-only',
        resources: 'usable',
      });

      return dom.window.document;
    } catch (error) {
      log.error(`Failed to fetch ${url}:`, error);
      throw error;
    }
  }

  private addPage(url: string, depth: number, parent?: string): void {
    // Early return for efficiency
    if (this.results.length >= this.options.maxPages) {
      return;
    }

    const normalizedUrl = normalizeUrl(url, this.options.includeAnchors);

    if (
      this.queueManager.isVisited(normalizedUrl) ||
      this.queueManager.isQueued(normalizedUrl)
    ) {
      return;
    }

    if (
      !shouldCrawl(
        normalizedUrl,
        this.options.allowedDomains,
        this.options.excludePatterns,
        this.options.maxDepth,
        depth
      )
    ) {
      return;
    }

    this.queueManager.markQueued(normalizedUrl);

    this.queueManager.add(
      async () => {
        const doc = await this.fetchPage(normalizedUrl);
        if (!doc) return;

        this.queueManager.markVisited(normalizedUrl);

        // Memory-efficient content extraction
        const content = extractContent(doc);
        const hash = hashContent(content);

        // Skip duplicates
        if (this.contentHashes.has(hash)) {
          return;
        }
        this.contentHashes.add(hash);

        // Create result with all required fields
        const result: PageResult = {
          url: normalizedUrl,
          title: extractTitle(doc),
          content,
          timestamp: Date.now(),
          status: 'complete',
          depth,
          parent,
        };

        this.results.push(result);
        this.queueManager.incrementResults();

        // Extract and queue new links efficiently
        if (this.results.length < this.options.maxPages) {
          const links = extractLinks(doc, normalizedUrl);
          for (const link of links) {
            this.addPage(link, depth + 1, normalizedUrl);
          }
        }

        // Clear references to help GC
        (doc as any) = null;
      },
      { url: normalizedUrl, depth, parent }
    );
  }

  public async crawl(): Promise<PageResult[]> {
    log.info('Starting crawl');
    this.queueManager.start();

    try {
      while (this.queueManager.size > 0 || this.queueManager.pending > 0) {
        if (this.abortController.signal.aborted) {
          throw new Error('Crawl aborted');
        }
        await this.queueManager.onIdle();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const timeElapsed = Date.now() - this.queueManager.getProgress().timeElapsed;
      const stats = {
        ...this.queueManager.getProgress(),
        totalResults: this.results.length,
      };
      log.info('Crawl completed:', stats);

      // Return sorted results for consistency
      const sortedResults = [...this.results].sort((a, b) =>
        a.url.localeCompare(b.url)
      );

      this.cleanup();
      return sortedResults;
    } catch (error) {
      log.error('Crawl failed:', error);
      throw error;
    } finally {
      this.queueManager.pause();
    }
  }

  public abort(): void {
    this.abortController.abort();
    this.cleanup();
  }

  private cleanup(): void {
    this.queueManager.clear();
    this.contentHashes.clear();
    this.results = [];
    this.cleanupMemory();
  }

  public getProgress() {
    return this.queueManager.getProgress();
  }
}