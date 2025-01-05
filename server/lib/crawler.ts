import { JSDOM, VirtualConsole } from 'jsdom';
import TurndownService from 'turndown';
import crypto from 'crypto';
import pQueue from 'p-queue';

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

interface PageResult {
  url: string;
  status: 'complete' | 'error' | 'skipped';
  depth: number;
  title?: string;
  content?: string;
  contentLength?: number;
  error?: Error;
}

export class DocumentationCrawler {
  private visited = new Set<string>();
  private queued = new Set<string>(); // Track queued URLs separately
  private queue: pQueue;
  private baseUrl: string;
  private options: Required<CrawlerOptions>;
  private readonly startTime: number;
  private errors: Map<string, Error> = new Map();
  private onProgress?: (result: PageResult) => void;
  private results: PageResult[] = [];

  constructor(
    startUrl: string,
    options: CrawlerOptions = {},
    onProgress?: (result: PageResult) => void
  ) {
    log.info('Initializing crawler for', startUrl);

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
          continue; // Skip pure anchor links
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
          url: urlWithoutHash, // Use URL without hash
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
      const result = {
        url,
        status: 'skipped' as const,
        depth,
        title: 'Max Depth Reached',
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
      log.debug('Fetched HTML length:', html.length);

      // Configure JSDOM with proper settings
      const dom = new JSDOM(html, {
        url,
        contentType: 'text/html',
        pretendToBeVisual: true,
        runScripts: 'dangerously',
        resources: 'usable',
        virtualConsole: new VirtualConsole(),
        beforeParse(window) {
          window._virtualConsole = window._virtualConsole || { on: () => {} };
          window.HTMLElement.prototype.scrollIntoView = () => {};
          window.HTMLElement.prototype.getBoundingClientRect = () => ({
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            width: 0,
            height: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                width: 0,
                height: 0,
                x: 0,
                y: 0,
              };
            },
          });
        },
      });

      const document = dom.window.document;
      log.debug('Document title:', document.title);

      // Find main content area
      const mainElement = this.findMainElement(document);
      this.cleanContent(mainElement);

      // Extract and convert content to markdown
      const markdown = turndownService.turndown(mainElement.innerHTML);
      log.debug('Body length:', markdown.length);

      // Extract links before completing
      if (depth < this.options.maxDepth) {
        const links = this.extractLinks(document, url, depth);
        log.debug(`Found ${links.length} links at depth ${depth}`);

        // Queue the next set of URLs
        for (const link of links) {
          this.queueUrl(link);
        }
      }

      const result = {
        url,
        status: 'complete' as const,
        depth,
        title: document.title,
        content: markdown,
        contentLength: markdown.length,
      };

      log.info('Successfully processed:', url, {
        title: result.title,
        contentLength: result.contentLength,
      });

      this.results.push(result);
      this.onProgress?.(result);
      return result;
    } catch (error) {
      const result = {
        url,
        status: 'error' as const,
        depth,
        error: error as Error,
      };
      this.errors.set(url, error as Error);
      this.results.push(result);
      this.onProgress?.(result);
      return result;
    }
  }

  public async crawl(): Promise<PageResult[]> {
    log.info('Starting crawl');

    try {
      await this.queue.onIdle();
      const timeElapsed = Date.now() - this.startTime;

      log.info('Crawl completed:', {
        visited: this.visited.size,
        errors: this.errors.size,
        timeElapsed,
        totalResults: this.results.length,
      });

      // Sort results by depth and then URL for consistency
      return this.results.sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        return a.url.localeCompare(b.url);
      });
    } catch (error) {
      log.error('Fatal crawl error:', error);
      throw error;
    } finally {
      this.queue.clear();
      log.info('Crawl cleanup complete');
    }
  }

  // Helper method to get current progress
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
