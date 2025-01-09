import { JSDOM, VirtualConsole } from 'jsdom';
import TurndownService from 'turndown';
import pQueue from 'p-queue';
import { crawlerCache } from './cache';
import type { PageResult, CrawlerOptions, PageNode } from '../../shared/types';

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
  private contentHashes = new Map<string, string>(); // Track content hashes

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
      maxRetries: options.maxRetries ?? 3,
      followExternalLinks: options.followExternalLinks ?? false,
      excludeNavigation: options.excludeNavigation ?? false,
      includeCodeBlocks: options.includeCodeBlocks ?? true,
      includeAnchors: options.includeAnchors ?? false,
    };

    try {
      const baseObj = new URL(startUrl);
      this.baseUrl = baseObj.origin;
      this.startTime = Date.now();
      this.onProgress = onProgress;

      // Initialize queue with strict rate limiting
      this.queue = new pQueue({
        concurrency: 1, // Process one request at a time
        interval: this.options.rateLimit,
        intervalCap: 1, // Only allow 1 request per interval
        autoStart: false,
        timeout: this.options.timeout,
      });

      // Add initial URL
      this.queueUrl({ url: startUrl, depth: 0 });
    } catch (error) {
      log.error('Failed to initialize:', error);
      throw error;
    }
  }

  private queueUrl(node: PageNode): void {
    const { url, depth } = node;
    if (!this.queued.has(url) && !this.visited.has(url)) {
      log.debug(`Queueing URL at depth ${depth}:`, url);
      this.queued.add(url);
      this.queue.add(() => this.processUrl(node));
    }
  }

  private async fetchWithRetry(url: string): Promise<string> {
    let lastError: Error | null = null;
    const maxRetries = this.options.maxRetries ?? 3;

    for (let i = 0; i < maxRetries; i++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.options.timeout
      );

      try {
        const parsedUrl = new URL(url);
        const response = await fetch(parsedUrl.href, {
          headers: {
            'User-Agent': 'Documentation Crawler Bot',
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        if (
          !contentType?.includes('text/html') &&
          !contentType?.includes('application/xhtml+xml')
        ) {
          throw new Error(`Invalid content type: ${contentType}`);
        }

        const text = await response.text();
        if (!text.trim()) {
          throw new Error('Empty response');
        }

        return text;
      } catch (error) {
        lastError = error as Error;
        log.error('Fetch error:', error);
        if (
          error instanceof TypeError &&
          error.message.includes('Invalid URL')
        ) {
          throw error; // Don't retry invalid URLs
        }
        if (i < maxRetries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, i) * 1000)
          );
          continue;
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError ?? new Error('Failed to fetch after retries');
  }

  private extractLinks(
    doc: Document,
    baseUrl: string,
    depth: number
  ): PageNode[] {
    const links = Array.from(doc.querySelectorAll('a[href]'));
    const nodes: PageNode[] = [];
    const seenUrls = new Set<string>();

    // Only extract links if we haven't reached maxDepth
    if (depth >= this.options.maxDepth) {
      return nodes;
    }

    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href?.trim() || href.startsWith('javascript:')) {
        continue;
      }

      try {
        // Handle anchor links
        if (href.startsWith('#')) {
          if (this.options.includeAnchors) {
            const url = `${baseUrl}${href}`;
            if (!seenUrls.has(url)) {
              seenUrls.add(url);
              nodes.push({
                url,
                depth: depth + 1,
                parent: baseUrl,
              });
            }
          }
          continue;
        }

        // Normalize URL
        const url = new URL(href, baseUrl);
        const normalizedUrl = url.href.split('#')[0]; // Remove hash
        const finalUrl = normalizedUrl.endsWith('/')
          ? normalizedUrl.slice(0, -1)
          : normalizedUrl;

        // Skip if we've seen this URL
        if (seenUrls.has(finalUrl)) {
          continue;
        }
        seenUrls.add(finalUrl);

        // Skip external links if not enabled
        if (!this.options.followExternalLinks && url.origin !== this.baseUrl) {
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
          url: finalUrl,
          depth: depth + 1,
          parent: baseUrl,
        });
      } catch (error) {
        // Skip invalid URLs
        continue;
      }
    }

    return nodes;
  }

  private async processUrl(node: PageNode): Promise<PageResult> {
    const { url, depth, parent } = node;
    log.info('Processing URL:', url, 'at depth', depth);

    // Check if we've already visited this URL
    if (this.visited.has(url)) {
      return {
        url,
        status: 'skipped',
        depth,
        title: 'Already Visited',
        timestamp: Date.now(),
        content: '',
        error: '',
        newLinksFound: 0,
        hierarchy: [],
        parent,
      };
    }

    // Mark as visited before processing to prevent cycles
    this.visited.add(url);
    this.queued.delete(url);

    try {
      const html = await this.fetchWithRetry(url);
      const virtualConsole = new VirtualConsole();
      const dom = new JSDOM(html, {
        url,
        virtualConsole,
        pretendToBeVisual: true,
      });

      const doc = dom.window.document;
      const title = doc.title || this.extractTitle(doc) || url;
      const mainContent = this.extractContent(doc);
      const markdown = turndownService.turndown(mainContent);
      const hierarchy = this.extractHierarchy(doc, title);
      const contentHash = this.hashContent(markdown);

      // Extract links and queue them
      const links = this.extractLinks(doc, url, depth);
      let newLinksFound = 0;

      // Queue child links if we haven't reached max depth
      if (depth < this.options.maxDepth) {
        for (const link of links) {
          if (!this.visited.has(link.url) && !this.queued.has(link.url)) {
            this.queueUrl(link);
            newLinksFound++;
          }
        }
      }

      // Check for duplicate content
      for (const [existingUrl, existingHash] of Array.from(
        this.contentHashes.entries()
      )) {
        if (existingHash === contentHash && existingUrl !== url) {
          log.info('Found duplicate content:', url, 'matches', existingUrl);
          const result: PageResult = {
            url,
            status: 'error',
            depth,
            title,
            timestamp: Date.now(),
            content: '',
            error: `Duplicate content: same as ${existingUrl}`,
            newLinksFound,
            hierarchy: [],
            parent,
            links: links.map((l) => l.url),
          };
          this.results.push(result);
          this.onProgress?.(result);
          return result;
        }
      }

      // Store content hash
      this.contentHashes.set(url, contentHash);

      const result: PageResult = {
        url,
        status: 'complete',
        depth,
        title,
        content: markdown,
        timestamp: Date.now(),
        error: '',
        newLinksFound,
        hierarchy,
        parent,
        links: links.map((l) => l.url),
      };

      this.results.push(result);
      this.onProgress?.(result);

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log.error('Error processing URL:', url, errorMessage);

      const result: PageResult = {
        url,
        status: 'error',
        depth,
        title: 'Error',
        content: '',
        timestamp: Date.now(),
        error: errorMessage,
        newLinksFound: 0,
        hierarchy: [],
        parent,
      };

      this.errors.set(url, error as Error);
      this.results.push(result);
      this.onProgress?.(result);

      return result;
    }
  }

  private extractTitle(doc: Document): string {
    // Try h1 first
    const h1 = doc.querySelector('h1');
    if (h1?.textContent) {
      return h1.textContent.trim();
    }

    // Try meta title
    const metaTitle = doc.querySelector('meta[name="title"]');
    if (metaTitle?.getAttribute('content')) {
      return metaTitle.getAttribute('content')!.trim();
    }

    // Try og:title
    const ogTitle = doc.querySelector('meta[property="og:title"]');
    if (ogTitle?.getAttribute('content')) {
      return ogTitle.getAttribute('content')!.trim();
    }

    return '';
  }

  private extractContent(doc: Document): string {
    // Try to find main content area
    const mainContent = doc.querySelector(
      'main, article, .content, #content, .main, #main'
    );
    if (mainContent) {
      // Remove navigation, header, footer elements if configured
      if (this.options.excludeNavigation) {
        ['nav', 'header', 'footer'].forEach((selector) => {
          mainContent.querySelectorAll(selector).forEach((el) => el.remove());
        });
      }
      return mainContent.innerHTML;
    }

    // Fallback to body
    const body = doc.querySelector('body');
    if (body) {
      // Remove navigation, header, footer elements if configured
      if (this.options.excludeNavigation) {
        ['nav', 'header', 'footer'].forEach((selector) => {
          body.querySelectorAll(selector).forEach((el) => el.remove());
        });
      }
      return body.innerHTML;
    }

    return '';
  }

  private extractHierarchy(doc: Document, pageTitle: string): string[] {
    const hierarchy: string[] = [];

    // Add page title
    if (pageTitle) {
      hierarchy.push(pageTitle);
    }

    // Add section headings
    const headings = Array.from(doc.querySelectorAll('h1, h2, h3'));
    for (const heading of headings) {
      const text = heading.textContent?.trim();
      if (text && !hierarchy.includes(text)) {
        hierarchy.push(text);
      }
    }

    // Add parent hierarchy if available
    const parentUrl = this.results.find(
      (r) => r.url === doc.location.href
    )?.parent;
    if (parentUrl) {
      const parentResult = this.results.find((r) => r.url === parentUrl);
      if (parentResult?.hierarchy) {
        hierarchy.unshift(...parentResult.hierarchy);
      }
    }

    return hierarchy;
  }

  private hashContent(content: string): string {
    // Normalize content before hashing
    const normalized = content
      .replace(/\s+/g, ' ')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .trim()
      .toLowerCase();

    // Simple hash function for content comparison
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  public async crawl(): Promise<PageResult[]> {
    log.info('Starting crawl');
    this.queue.start();

    try {
      // Process all queued URLs
      while (this.queue.size > 0 || this.queue.pending > 0) {
        await this.queue.onIdle();
        // Add a small delay to allow new URLs to be queued
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Get final stats
      const timeElapsed = Date.now() - this.startTime;
      const stats = {
        visited: this.visited.size,
        errors: this.errors.size,
        timeElapsed,
        totalResults: this.results.length,
      };
      log.info('Crawl completed:', stats);

      // Sort results by URL for consistency
      const sortedResults = [...this.results].sort((a, b) =>
        a.url.localeCompare(b.url)
      );

      // Cleanup
      this.cleanup();
      log.info('Crawl cleanup complete');

      return sortedResults;
    } catch (error) {
      log.error('Crawl failed:', error);
      throw error;
    } finally {
      this.queue.pause();
    }
  }

  private cleanup(): void {
    // Clear internal state
    this.visited.clear();
    this.queued.clear();
    this.contentHashes.clear();
    this.errors.clear();
    this.queue.clear();
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
