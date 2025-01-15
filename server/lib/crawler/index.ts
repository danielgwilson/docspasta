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
import type { PageResult, CrawlerOptions, CrawlerProgress } from './types';

export class DocumentationCrawler {
  private queueManager: QueueManager;
  private contentHashes = new Set<string>();
  private results: PageResult[] = [];
  private baseUrl: string;
  private options: Required<CrawlerOptions>;

  constructor(baseUrl: string, options: CrawlerOptions = {}) {
    this.baseUrl = baseUrl;
    this.options = {
      maxPages: options.maxPages ?? 100,
      maxDepth: options.maxDepth ?? 3,
      includeAnchors: options.includeAnchors ?? false,
      concurrency: options.concurrency ?? 3,
      timeout: options.timeout ?? 30000,
      allowedDomains: options.allowedDomains ?? [],
      excludePatterns: options.excludePatterns ?? [],
    };
    this.queueManager = new QueueManager(this.options.concurrency);
    this.addPage(baseUrl, 0);
  }

  private async fetchPage(url: string): Promise<Document | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.options.timeout
      );

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      const dom = new JSDOM(html);
      return dom.window.document;
    } catch (error) {
      log.error(`Failed to fetch ${url}:`, error);
      this.queueManager.markError(url);
      return null;
    }
  }

  private addPage(url: string, depth: number): void {
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

    this.queueManager.add(async () => {
      const doc = await this.fetchPage(normalizedUrl);
      if (!doc) return;

      this.queueManager.markVisited(normalizedUrl);

      // Extract and process content
      const content = extractContent(doc);
      const hash = hashContent(content);

      // Skip if we've seen this content before
      if (this.contentHashes.has(hash)) {
        return;
      }
      this.contentHashes.add(hash);

      // Store the result
      const result: PageResult = {
        url: normalizedUrl,
        title: extractTitle(doc),
        content,
        timestamp: Date.now(),
      };
      this.results.push(result);
      this.queueManager.incrementResults();

      // Extract and queue new links
      if (this.results.length < this.options.maxPages) {
        const links = extractLinks(doc, normalizedUrl);
        for (const link of links) {
          this.addPage(link, depth + 1);
        }
      }
    });
  }

  public async crawl(): Promise<PageResult[]> {
    log.info('Starting crawl');
    this.queueManager.start();

    try {
      while (this.queueManager.size > 0 || this.queueManager.pending > 0) {
        await this.queueManager.onIdle();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const timeElapsed =
        Date.now() - this.queueManager.getProgress().timeElapsed;
      const stats = {
        ...this.queueManager.getProgress(),
        totalResults: this.results.length,
        totalTokens: this.results.reduce(
          (acc, r) => acc + (r.tokenCount ?? 0),
          0
        ),
      };
      log.info('Crawl completed:', stats);

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

  private cleanup(): void {
    this.queueManager.clear();
    this.contentHashes.clear();
    this.results = [];
  }

  public getProgress(): CrawlerProgress {
    return this.queueManager.getProgress();
  }
}
