import { JSDOM, VirtualConsole } from 'jsdom';
import TurndownService from 'turndown';
import pQueue from 'p-queue';
import { crawlerCache } from './cache';
import type { PageResult } from '../../client/src/lib/types';

// Create logger helper
const log = {
  debug: (...args: any[]) => console.debug('[Crawler]', ...args),
  info: (...args: any[]) => console.info('[Crawler]', ...args),
  warn: (...args: any[]) => console.warn('[Crawler]', ...args),
  error: (...args: any[]) => console.error('[Crawler]', ...args),
};

// Configure Turndown with better settings
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
  strongDelimiter: '**',
  hr: '---',
  br: '  \n',
});

interface CrawlerOptions {
  maxDepth?: number;
  maxConcurrentRequests?: number;
  rateLimit?: number;
  timeout?: number;
  followExternalLinks?: boolean;
  excludeNavigation?: boolean;
}

interface PageNode {
  url: string;
  depth: number;
  parent?: string;
}

export class DocumentationCrawler {
  private visited = new Set<string>();
  private queued = new Set<string>();
  private queue: pQueue;
  private baseUrl: string;
  private options: Required<CrawlerOptions>;
  private readonly startTime: number;
  private errors: Map<string, Error> = new Map();
  private onProgress?: (result: PageResult) => void;
  private results: PageResult[] = [];
  private startUrl: string;

  constructor(
    startUrl: string,
    options: CrawlerOptions = {},
    onProgress?: (result: PageResult) => void
  ) {
    log.info('Initializing crawler for', startUrl);
    this.startUrl = startUrl;

    // Set default options
    this.options = {
      maxDepth: options.maxDepth ?? 3,
      maxConcurrentRequests: options.maxConcurrentRequests ?? 5,
      rateLimit: options.rateLimit ?? 1000,
      timeout: options.timeout ?? 30000,
      followExternalLinks: options.followExternalLinks ?? false,
      excludeNavigation: options.excludeNavigation ?? true,
    };

    try {
      const baseObj = new URL(startUrl);
      this.baseUrl = baseObj.origin;
      this.startTime = Date.now();
      this.onProgress = onProgress;

      // Initialize queue with concurrency control
      this.queue = new pQueue({
        concurrency: this.options.maxConcurrentRequests,
        interval: this.options.rateLimit,
        intervalCap: 1,
      });

      // Add initial URL
      this.queueUrl({ url: startUrl, depth: 0 });
    } catch (error) {
      log.error('Failed to initialize:', error);
      throw error;
    }
  }

  private queueUrl(node: PageNode): void {
    const { url } = node;
    if (!this.queued.has(url) && !this.visited.has(url)) {
      log.debug(`Queueing URL at depth ${node.depth}:`, url);
      this.queued.add(url);
      this.queue.add(() => this.processUrl(node));
    }
  }

  private async fetchWithRetry(url: string): Promise<string> {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Documentation Crawler Bot' },
        signal: AbortSignal.timeout(this.options.timeout),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      log.error('Error fetching URL:', url, error);
      throw error;
    }
  }

  private extractLinks(
    doc: Document,
    baseUrl: string,
    depth: number
  ): PageNode[] {
    const links = Array.from(doc.querySelectorAll('a[href]'));
    const nodes: PageNode[] = [];
    const seenUrls = new Set<string>();

    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href?.trim() || href.startsWith('javascript:')) {
        continue;
      }

      try {
        // Handle anchor links
        if (href.startsWith('#')) {
          continue;
        }

        const url = new URL(href, baseUrl).href;
        const urlObj = new URL(url);

        // Remove hash/fragment for deduplication
        const urlWithoutHash = url.split('#')[0];

        // Skip if we've seen this URL (ignoring hash)
        if (seenUrls.has(urlWithoutHash)) {
          continue;
        }
        seenUrls.add(urlWithoutHash);

        // Skip external links if not enabled
        if (
          !this.options.followExternalLinks &&
          urlObj.origin !== this.baseUrl
        ) {
          continue;
        }

        // Skip navigation elements if configured
        if (
          this.options.excludeNavigation &&
          (link.closest('nav') ||
            link.closest('header') ||
            link.closest('footer'))
        ) {
          continue;
        }

        nodes.push({
          url: urlWithoutHash,
          depth: depth + 1,
          parent: baseUrl,
        });
      } catch (error) {
        continue;
      }
    }

    return nodes;
  }

  private findMainElement(doc: Document): Element {
    const selectors = [
      'main',
      'article',
      '[role="main"]',
      '.main-content',
      '.content',
      '.article',
      '.documentation',
      '.docs-content',
      '#main-content',
      '#content',
    ];

    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      if (element) return element;
    }

    return doc.body;
  }

  private cleanContent(element: Element): void {
    const unwantedSelectors = [
      'script',
      'style',
      'iframe',
      'noscript',
      '[aria-hidden="true"]',
      '.hidden',
      '.display-none',
    ];

    unwantedSelectors.forEach((selector) => {
      element.querySelectorAll(selector).forEach((el) => el.remove());
    });
  }

  private async processUrl(node: PageNode): Promise<PageResult> {
    const { url, depth } = node;
    log.info('Processing URL:', url, 'at depth', depth);

    // Check depth before processing
    if (depth > this.options.maxDepth) {
      log.debug('Skipping - max depth reached:', url, depth);
      const result: PageResult = {
        url,
        status: 'skipped',
        depth,
        title: 'Max Depth Reached',
        timestamp: Date.now(),
        content: '',
        error: '',
      };
      this.results.push(result);
      this.onProgress?.(result);
      return result;
    }

    // Check cache first
    const cachedResult = await crawlerCache.get(url);
    if (cachedResult) {
      log.info('Cache hit for URL:', url);
      this.visited.add(url);
      this.queued.delete(url);

      // Update depth and timestamp for the cached result
      const result: PageResult = {
        ...cachedResult,
        depth,
        timestamp: Date.now(),
      };
      this.results.push(result);
      this.onProgress?.(result);
      return result;
    }

    // Mark as visited at the start of processing
    this.visited.add(url);
    this.queued.delete(url);

    try {
      const html = await this.fetchWithRetry(url);
      const dom = new JSDOM(html, {
        url,
        virtualConsole: new VirtualConsole(),
        runScripts: 'dangerously',
        resources: 'usable',
      });

      const document = dom.window.document;
      const mainElement = this.findMainElement(document);
      this.cleanContent(mainElement);

      const markdown = turndownService.turndown(mainElement.innerHTML);

      // Extract links before completing
      if (depth < this.options.maxDepth) {
        const links = this.extractLinks(document, url, depth);
        for (const link of links) {
          this.queueUrl(link);
        }
      }

      const result: PageResult = {
        url,
        status: 'complete',
        depth,
        title: document.title,
        content: markdown,
        timestamp: Date.now(),
        error: '',
      };

      // Cache the successful result
      await crawlerCache.set(url, result);

      log.info('Successfully processed:', url);
      this.results.push(result);
      this.onProgress?.(result);
      return result;
    } catch (error) {
      const result: PageResult = {
        url,
        status: 'error',
        depth,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        content: '',
        title: '',
      };

      this.errors.set(url, error instanceof Error ? error : new Error(String(error)));
      this.results.push(result);
      this.onProgress?.(result);
      return result;
    }
  }

  public async crawl(): Promise<PageResult[]> {
    log.info('Starting crawl');

    try {
      // Check for cached full crawl results first
      const cachedResults = await crawlerCache.getCrawlResults(this.startUrl, this.options);
      if (cachedResults) {
        log.info('Using cached crawl results for:', this.startUrl);

        // Send progress updates for cached results
        for (const result of cachedResults) {
          this.onProgress?.(result);
        }

        return cachedResults;
      }

      await this.queue.onIdle();
      const timeElapsed = Date.now() - this.startTime;

      log.info('Crawl completed:', {
        visited: this.visited.size,
        errors: this.errors.size,
        timeElapsed,
        totalResults: this.results.length,
      });

      // Sort results by depth and then URL for consistency
      const sortedResults = this.results.sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        return a.url.localeCompare(b.url);
      });

      // Cache the complete crawl results
      await crawlerCache.setCrawlResults(this.startUrl, sortedResults, this.options);

      return sortedResults;
    } catch (error) {
      log.error('Fatal crawl error:', error);
      throw error;
    } finally {
      this.queue.clear();
      log.info('Crawl cleanup complete');
    }
  }

  public getProgress(): {
    visited: number;
    errors: number;
    queued: number;
    results: number;
    timeElapsed: number;
  } {
    return {
      visited: this.visited.size,
      errors: this.errors.size,
      queued: this.queue.size + this.queue.pending,
      results: this.results.length,
      timeElapsed: Date.now() - this.startTime,
    };
  }
}