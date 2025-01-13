import { JSDOM, VirtualConsole } from 'jsdom';
import TurndownService from 'turndown';
import pQueue from 'p-queue';
import { crawlerCache } from './cache';
import type { PageResult, CrawlerOptions, PageNode } from '../../shared/types';

// Create logger helper
const log = {
  debug: (...args: unknown[]) => console.debug('[Crawler]', ...args),
  info: (...args: unknown[]) => console.info('[Crawler]', ...args),
  warn: (...args: unknown[]) => console.warn('[Crawler]', ...args),
  error: (...args: unknown[]) => console.error('[Crawler]', ...args),
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

/**
 * A documentation crawler that crawls a site starting from `startUrl`,
 * extracting content, following links, and producing a set of PageResults.
 */
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

  /**
   * Creates an instance of DocumentationCrawler.
   * @param startUrl - The initial URL to crawl.
   * @param options - The crawler settings.
   * @param onProgress - Optional callback for receiving progress updates.
   */
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
      excludeNavigation: options.excludeNavigation ?? false,
      includeCodeBlocks: options.includeCodeBlocks ?? true,
      includeAnchors: options.includeAnchors ?? false,
      // Additional internal option for number of retries
      // (not in the original zod schema, so we handle fallback manually)
      maxRetries: (options as any).maxRetries ?? 3,
    };

    try {
      const baseObj = new URL(startUrl);
      this.baseUrl = baseObj.origin;
      this.startTime = Date.now();
      this.onProgress = onProgress;

      // Initialize queue with concurrency and rate limiting
      this.queue = new pQueue({
        concurrency: this.options.maxConcurrentRequests,
        interval: this.options.rateLimit,
        intervalCap: this.options.maxConcurrentRequests,
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

  /**
   * Adds a page node (URL + depth) to the queue if not already visited or queued.
   * @param node - The PageNode to queue for processing.
   */
  private queueUrl(node: PageNode): void {
    const { url, depth } = node;
    if (!this.queued.has(url) && !this.visited.has(url)) {
      log.debug(`Queueing URL at depth ${depth}:`, url);
      this.queued.add(url);
      this.queue.add(() => this.processUrl(node));
    }
  }

  /**
   * Fetches a URL with retry logic.
   * @param url - The URL to fetch.
   * @returns The response text if successful.
   */
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

        const contentType = response.headers.get('content-type') ?? '';
        if (
          !contentType.includes('text/html') &&
          !contentType.includes('application/xhtml+xml')
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
          // If it's an invalid URL, no need to retry.
          throw error;
        }
        if (i < maxRetries - 1) {
          // Exponential backoff
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

  /**
   * Extracts links from the DOM of the current document to queue them for further crawling.
   * @param doc - The DOM document.
   * @param baseUrl - The base URL of the current document.
   * @param depth - The current depth in the crawl.
   * @returns An array of child PageNode items.
   */
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
            const anchorUrl = `${baseUrl}${href}`;
            if (!seenUrls.has(anchorUrl)) {
              seenUrls.add(anchorUrl);
              nodes.push({
                url: anchorUrl,
                depth: depth + 1,
                parent: baseUrl,
              });
            }
          }
          continue;
        }

        // Normalize and remove the fragment
        const urlObj = new URL(href, baseUrl);
        const normalizedUrl = urlObj.href.split('#')[0];
        const finalUrl = normalizedUrl.endsWith('/')
          ? normalizedUrl.slice(0, -1)
          : normalizedUrl;

        // Skip if we've seen this URL
        if (seenUrls.has(finalUrl)) {
          continue;
        }
        seenUrls.add(finalUrl);

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
          url: finalUrl,
          depth: depth + 1,
          parent: baseUrl,
        });
      } catch {
        // Skip invalid URLs
        continue;
      }
    }

    return nodes;
  }

  /**
   * Processes a single URL from the queue: fetches, parses, extracts content,
   * and enqueues child links.
   * @param node - The PageNode representing the current URL and depth.
   * @returns A PageResult representing the outcome (success, error, or skipped).
   */
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

  /**
   * Attempts to extract a title from the DOM by checking <h1>, meta[name="title"],
   * or meta[property="og:title"] elements.
   * @param doc - The DOM document.
   * @returns The extracted title or an empty string.
   */
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

  /**
   * Extracts the main content from the DOM, optionally removing navigation,
   * header, and footer elements.
   * @param doc - The DOM document.
   * @returns Inner HTML of the selected main content, or an empty string.
   */
  private extractContent(doc: Document): string {
    // Try to find main content area
    const mainContent = doc.querySelector(
      'main, article, .content, #content, .main, #main'
    );
    if (mainContent) {
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
      if (this.options.excludeNavigation) {
        ['nav', 'header', 'footer'].forEach((selector) => {
          body.querySelectorAll(selector).forEach((el) => el.remove());
        });
      }
      return body.innerHTML;
    }

    return '';
  }

  /**
   * Constructs a hierarchy array from the page's top-level heading plus
   * any <h1>, <h2>, <h3> elements, and merges with parent page hierarchy if any.
   * @param doc - The DOM document.
   * @param pageTitle - The fallback page title.
   * @returns An array of heading texts.
   */
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

    // Attempt to merge parent hierarchy
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

  /**
   * Hashes the content to detect potential duplicates.
   * @param content - The content string (post-turndown).
   * @returns A simple 32-bit integer hash in base-36 for deduplication.
   */
  private hashContent(content: string): string {
    // Normalize content before hashing
    const normalized = content
      .replace(/\s+/g, ' ')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .trim()
      .toLowerCase();

    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Begins processing of all queued URLs. Waits until all have been processed or skipped.
   * @returns A sorted array of PageResults by URL.
   */
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

  /**
   * Cleans up internal state after the crawl completes or fails.
   */
  private cleanup(): void {
    // Clear internal state
    this.visited.clear();
    this.queued.clear();
    this.contentHashes.clear();
    this.errors.clear();
    this.queue.clear();
  }

  /**
   * Returns current progress about visited URLs, error count, queue status,
   * number of results, and time elapsed.
   * @returns A progress object with relevant metrics.
   */
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
