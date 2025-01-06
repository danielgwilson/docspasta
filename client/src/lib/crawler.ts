import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import crypto from 'crypto';
import pQueue from 'p-queue';
import { Anchor } from './utils/anchor';
import { Hierarchy } from './utils/hierarchy';
import { CodeBlockHandler } from './utils/codeblock';
import {
  normalizeUrl,
  generateFingerprint,
  isValidDocumentationUrl,
} from './utils/url';
import type {
  CrawlerOptions,
  PageResult,
  PageNode,
  ValidatedCrawlerOptions,
} from './utils/types';
import { crawlerOptionsSchema } from './utils/types';

// Create logger helper
const log = {
  debug: (...args: any[]) => console.debug('[Crawler]', ...args),
  info: (...args: any[]) => console.info('[Crawler]', ...args),
  warn: (...args: any[]) => console.warn('[Crawler]', ...args),
  error: (...args: any[]) => console.error('[Crawler]', ...args),
};

// Create JSDOM instance with secure configuration
const jsdom = new JSDOM('', {
  runScripts: 'dangerously',
  resources: 'usable',
  url: 'http://localhost',
  beforeParse(window) {
    // Block execution of scripts from crawled content
    window.eval = () => {
      throw new Error('Script execution disabled');
    };
    // @ts-ignore - Intentionally disable WebAssembly
    window.WebAssembly = undefined;
    window.requestAnimationFrame = () => 0;
    window.cancelAnimationFrame = () => {};
    window.requestIdleCallback = () => 0;
    window.cancelIdleCallback = () => {};
    window.matchMedia = () => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });

    // Prevent network requests
    window.fetch = () => Promise.reject(new Error('Network requests disabled'));
    // @ts-ignore - Intentionally disable XMLHttpRequest
    window.XMLHttpRequest = undefined;
    // @ts-ignore - Intentionally disable WebSocket
    window.WebSocket = undefined;

    // Prevent navigation
    window.location = new Proxy(window.location, {
      set: () => true, // Silently ignore navigation attempts
    });
  },
});

// Add browser API mocks
const mockMatchMedia = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});

// Mock window properties and methods
Object.defineProperties(jsdom.window, {
  matchMedia: {
    writable: true,
    value: mockMatchMedia,
  },
  innerWidth: {
    writable: true,
    value: 1024,
  },
  innerHeight: {
    writable: true,
    value: 768,
  },
  devicePixelRatio: {
    writable: true,
    value: 1,
  },
});

// Mock document methods
jsdom.window.document.createRange = () => ({
  setStart: () => {},
  setEnd: () => {},
  commonAncestorContainer: jsdom.window.document.body,
  // Add required Range properties
  collapsed: true,
  startContainer: jsdom.window.document.body,
  endContainer: jsdom.window.document.body,
  startOffset: 0,
  endOffset: 0,
  selectNode: () => {},
  selectNodeContents: () => {},
  insertNode: () => {},
  surroundContents: () => {},
  cloneContents: () => jsdom.window.document.createDocumentFragment(),
  extractContents: () => jsdom.window.document.createDocumentFragment(),
  deleteContents: () => {},
  cloneRange: () => jsdom.window.document.createRange(),
  toString: () => '',
  detach: () => {},
  expand: () => {},
  compareBoundaryPoints: () => 0,
  comparePoint: () => 0,
  createContextualFragment: (html: string) => {
    const template = jsdom.window.document.createElement('template');
    template.innerHTML = html;
    return template.content;
  },
  getBoundingClientRect: () => ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON: () => ({}),
  }),
  getClientRects: () => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: function* () {},
  }),
  intersectsNode: () => false,
  isPointInRange: () => false,
  // Add remaining required Range methods
  collapse: () => {},
  setEndAfter: () => {},
  setEndBefore: () => {},
  setStartAfter: () => {},
  setStartBefore: () => {},
  isEqual: () => false,
  END_TO_END: 2,
  END_TO_START: 3,
  START_TO_END: 1,
  START_TO_START: 0,
});

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

// Add better code block handling
turndownService.addRule('fencedCodeBlock', {
  filter: (node) => {
    return node.nodeName === 'PRE' && node.firstChild?.nodeName === 'CODE';
  },
  replacement: (content, node) => {
    const code = node.firstChild as HTMLElement;
    const language = code.className.match(/language-(\w+)/)?.[1] || '';
    const finalContent = content.trim().replace(/\n\s*\n/g, '\n\n');
    return `\n\`\`\`${language}\n${finalContent}\n\`\`\`\n\n`;
  },
});

export class DocumentationCrawler {
  private visited = new Set<string>();
  private fingerprints = new Set<string>();
  private contentHashes = new Set<string>();
  public queue: pQueue;
  private baseUrl: string;
  private options: ValidatedCrawlerOptions;
  public readonly startTime: number;
  private errors: Map<string, Error> = new Map();
  private retryCount: Map<string, number> = new Map();
  private queueCompleteResolver: ((value: PageResult | null) => void) | null =
    null;

  constructor(startUrl: string, options: CrawlerOptions = {}) {
    log.info('Initializing crawler for', startUrl);
    log.debug('Options:', options);

    try {
      const baseObj = new URL(startUrl);
      this.baseUrl = baseObj.origin;
      this.options = crawlerOptionsSchema.parse(options);
      this.startTime = Date.now();

      // Initialize queue with concurrency control
      this.queue = new pQueue({
        concurrency: this.options.maxConcurrentRequests,
        interval: this.options.rateLimit,
        intervalCap: 1,
      });

      log.debug('Queue initialized with settings:', {
        concurrency: this.options.maxConcurrentRequests,
        rateLimit: this.options.rateLimit,
      });

      // Set up queue completion handler
      this.queue.on('completed', (result: PageResult) => {
        log.debug('Queue item completed:', {
          url: result.url,
          status: result.status,
          depth: result.depth,
        });
        if (this.queueCompleteResolver) {
          this.queueCompleteResolver(result);
          this.queueCompleteResolver = null;
        }
      });

      this.queue.on('error', (error) => {
        log.error('Queue error:', error);
      });

      this.queue.on('idle', () => {
        log.debug('Queue is idle');
      });

      // Add initial URL
      const fingerprint = generateFingerprint(startUrl, false);
      this.fingerprints.add(fingerprint);
      log.info('Adding initial URL to queue:', startUrl);
      this.queue.add(() => this.processUrl({ url: startUrl, depth: 0 }));
    } catch (error) {
      log.error('Failed to initialize:', error);
      throw error;
    }
  }

  private isTimeoutReached(): boolean {
    const isTimeout = Date.now() - this.startTime > this.options.timeout;
    if (isTimeout) {
      log.warn('Timeout reached after', this.options.timeout, 'ms');
    }
    return isTimeout;
  }

  private shouldRetry(url: string, error: Error): boolean {
    const count = this.retryCount.get(url) || 0;
    if (count >= 3) {
      log.warn('Max retries reached for', url);
      return false;
    }

    const retryableErrors = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'EPIPE',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'ENOTFOUND',
    ];

    const shouldRetry = retryableErrors.some((e) => error.message.includes(e));
    log.debug(
      'Retry decision for',
      url,
      ':',
      shouldRetry,
      'attempt:',
      count + 1
    );
    return shouldRetry;
  }

  private async fetchWithRetry(url: string): Promise<string> {
    log.debug('Fetching URL:', url);
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; Documentation Crawler Bot/1.0)',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      if (!text.trim()) {
        throw new Error('Empty response');
      }

      log.debug('Successfully fetched URL:', url, 'length:', text.length);
      return text;
    } catch (error: any) {
      log.error('Fetch error for', url, ':', error);
      if (this.shouldRetry(url, error)) {
        const count = (this.retryCount.get(url) || 0) + 1;
        this.retryCount.set(url, count);
        const delay = Math.pow(2, count) * 1000;
        log.debug('Retrying after', delay, 'ms');
        await new Promise((res) => setTimeout(res, delay));
        return this.fetchWithRetry(url);
      }
      throw error;
    }
  }

  private extractLinks(
    doc: Document,
    currentUrl: string,
    currentDepth: number
  ): PageNode[] {
    log.debug('Extracting links from', currentUrl, 'at depth', currentDepth);
    const seen = new Set<string>();
    const results: PageNode[] = [];

    const links = Array.from(doc.querySelectorAll('a[href]'));
    log.debug('Found', links.length, 'total links');

    for (const a of links) {
      if (this.options.excludeNavigation) {
        const inNav = a.closest(
          'nav, header, footer, [role="navigation"], .navigation, .menu, .nav, .sidebar, .toc'
        );
        if (inNav) {
          log.debug('Skipping navigation link:', a.getAttribute('href'));
          continue;
        }
      }

      const href = a.getAttribute('href');
      if (!href) continue;

      if (href.startsWith('#')) {
        if (this.options.includeAnchors) {
          const normalized = `${currentUrl}${href}`;
          if (!seen.has(normalized)) {
            seen.add(normalized);
            results.push({
              url: normalized,
              depth: currentDepth,
              parent: currentUrl,
            });
            log.debug('Added anchor link:', normalized);
          }
        }
        continue;
      }

      if (!href.startsWith('http') && !href.startsWith('/')) {
        log.debug('Skipping invalid protocol:', href);
        continue;
      }

      try {
        const normalized = normalizeUrl(
          href,
          this.baseUrl,
          this.options.followExternalLinks
        );
        if (!normalized || seen.has(normalized)) {
          log.debug('Skipping duplicate or invalid URL:', href);
          continue;
        }

        seen.add(normalized);
        if (isValidDocumentationUrl(normalized)) {
          results.push({
            url: normalized,
            depth: currentDepth + 1,
            parent: currentUrl,
          });
          log.debug('Added new URL:', normalized, 'at depth', currentDepth + 1);
        } else {
          log.debug('Skipping non-documentation URL:', normalized);
        }
      } catch (error) {
        log.warn('Invalid URL:', href, error);
      }
    }

    log.info('Extracted', results.length, 'valid links from', currentUrl);
    return results;
  }

  private findMainElement(doc: Document): Element | null {
    // Try to find the main content area using various selectors
    const selectors = [
      // Role-based selectors
      '[role="main"]',
      'main',
      'article',

      // Common documentation selectors
      '.documentation',
      '.docs-content',
      '.markdown-body',
      '.content',
      '.article-content',

      // Generic content selectors
      '#content',
      '#main',
      '.main',

      // Fallback to body if nothing else found
      'body',
    ];

    for (const selector of selectors) {
      const elements = Array.from(doc.querySelectorAll(selector));
      // Find the element with the most content
      const el = elements.reduce((best, current) => {
        const bestLength = best?.textContent?.trim().length || 0;
        const currentLength = current?.textContent?.trim().length || 0;
        return currentLength > bestLength ? current : best;
      }, null as Element | null);

      if (el?.textContent?.trim()) return el;
    }

    return null;
  }

  private cleanContent(element: Element): void {
    // Remove unwanted elements
    const removeSelectors = [
      // Interactive elements
      'script',
      'style',
      'iframe',
      'form',
      'button',

      // Ads and comments
      '.advertisement',
      '#disqus_thread',
      '.comments',

      // Social and sharing
      '.social-share',
      '.share-buttons',

      // Navigation elements if configured
      ...(this.options.excludeNavigation
        ? [
            'nav:not([aria-label="breadcrumb"])',
            '[role="navigation"]',
            '.navigation',
            '.menu',
            '.sidebar:not(.content-sidebar)',
            '.toc:not(.content-toc)',
            'header:not(article header)',
            'footer:not(article footer)',
          ]
        : []),
    ];

    removeSelectors.forEach((selector) => {
      element.querySelectorAll(selector).forEach((el) => el.remove());
    });

    // Clean up whitespace
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );

    const nodes: Text[] = [];
    let node;
    while ((node = walker.nextNode() as Text)) {
      nodes.push(node);
    }

    nodes.forEach((node) => {
      node.textContent = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    });
  }

  private generateContentHash(content: string): string {
    return crypto
      .createHash('sha1')
      .update(content.toLowerCase().replace(/\s+/g, ' '))
      .digest('hex');
  }

  private logState(): void {
    log.debug('Current State:', {
      queueSize: this.queue.size,
      queuePending: this.queue.pending,
      visited: this.visited.size,
      fingerprints: this.fingerprints.size,
      contentHashes: this.contentHashes.size,
      errors: this.errors.size,
      timeElapsed: Date.now() - this.startTime,
    });
  }

  private async processUrl(node: PageNode): Promise<PageResult> {
    const { url, depth, parent } = node;
    log.info('Processing URL:', url, 'at depth', depth);
    this.logState();

    if (this.visited.has(url)) {
      log.debug('URL already visited:', url);
      return {
        status: 'error',
        url,
        depth,
        parent,
        error: 'Already visited',
        timestamp: Date.now(),
      };
    }

    this.visited.add(url);
    log.debug('Marked as visited:', url);

    try {
      const html = await this.fetchWithRetry(url);
      const dom = new JSDOM(html, {
        runScripts: 'outside-only',
        resources: 'usable',
        url: url,
      });
      const doc = dom.window.document;

      const newNodes = this.extractLinks(doc, url, depth);
      let newLinksCount = 0;

      for (const node of newNodes) {
        if (node.depth <= this.options.maxDepth) {
          const fingerprint = generateFingerprint(node.url, false);
          if (!this.fingerprints.has(fingerprint)) {
            this.fingerprints.add(fingerprint);
            log.debug('Queueing new URL:', node.url, 'at depth', node.depth);
            this.queue.add(() => this.processUrl(node));
            newLinksCount++;
          } else {
            log.debug('Skipping duplicate URL:', node.url);
          }
        } else {
          log.debug('Skipping URL due to depth limit:', node.url);
        }
      }

      const mainElement = this.findMainElement(doc);
      if (!mainElement) {
        log.warn('No main content found for:', url);
        throw new Error('No main content found');
      }

      this.cleanContent(mainElement);
      CodeBlockHandler.processCodeBlocks(mainElement);

      const hasHeadings =
        mainElement.querySelectorAll('h1,h2,h3,h4,h5,h6').length > 0;
      const hasCodeBlocks = mainElement.querySelectorAll('pre code').length > 0;
      const hasSubstantialText = (mainElement.textContent?.length || 0) > 200;
      const hasParagraphs = mainElement.querySelectorAll('p').length > 0;

      log.debug('Content analysis:', {
        url,
        hasHeadings,
        hasCodeBlocks,
        hasSubstantialText,
        hasParagraphs,
      });

      const isDocPage =
        hasHeadings || hasCodeBlocks || (hasSubstantialText && hasParagraphs);
      if (!isDocPage) {
        log.warn('Not a documentation page:', url);
        throw new Error('Not a documentation page');
      }

      const title =
        doc.querySelector('title')?.textContent?.split('|')[0].trim() ||
        'Untitled';
      const content = turndownService.turndown(mainElement.innerHTML);
      const contentHash = this.generateContentHash(content);

      if (this.contentHashes.has(contentHash)) {
        log.warn('Duplicate content found:', url);
        throw new Error('Duplicate content');
      }

      this.contentHashes.add(contentHash);
      const hierarchy = Hierarchy.extractHierarchy(mainElement);
      const anchor = Anchor.getAnchor(mainElement);

      log.info('Successfully processed:', url, {
        title,
        contentLength: content.length,
        newLinksFound: newLinksCount,
      });

      return {
        status: 'complete',
        url,
        title,
        content,
        depth,
        parent,
        hierarchy: hierarchy.map((h) => h.text),
        anchor: anchor || undefined,
        newLinksFound: newLinksCount,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      log.error('Error processing URL:', url, error);
      this.errors.set(url, error);
      return {
        status: 'error',
        url,
        depth,
        parent,
        error: error.message,
        timestamp: Date.now(),
      };
    }
  }

  public async *crawl(): AsyncGenerator<PageResult> {
    log.info('Starting crawl');
    this.logState();

    try {
      while (
        !this.isTimeoutReached() &&
        (this.queue.size > 0 || this.queue.pending > 0)
      ) {
        log.debug('Crawl iteration - Queue state:', {
          size: this.queue.size,
          pending: this.queue.pending,
        });

        // Wait for either queue completion or next result
        const result = await Promise.race<PageResult | null>([
          // Wait for next completed item
          new Promise<PageResult | null>((resolve) => {
            this.queueCompleteResolver = resolve;
          }),
          // Or wait for queue to be completely empty
          new Promise<null>((resolve) => {
            const checkQueue = () => {
              if (this.queue.size === 0 && this.queue.pending === 0) {
                resolve(null);
              } else {
                setTimeout(checkQueue, 100);
              }
            };
            checkQueue();
          }),
        ]);

        if (result) {
          log.debug('Yielding result:', {
            url: result.url,
            status: result.status,
            depth: result.depth,
          });
          yield result;
        } else {
          log.info('No more results to process');
          break;
        }
      }

      if (this.isTimeoutReached()) {
        log.warn('Crawl timeout reached');
      }

      log.info('Crawl completed:', {
        visited: this.visited.size,
        errors: this.errors.size,
        contentHashes: this.contentHashes.size,
        timeElapsed: Date.now() - this.startTime,
      });
    } catch (error) {
      log.error('Fatal crawl error:', error);
      throw error;
    } finally {
      this.queue.clear();
      log.info('Crawl cleanup complete');
    }
  }
}
