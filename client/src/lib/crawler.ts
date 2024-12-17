import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import crypto from 'crypto';
import { Anchor } from './utils/anchor';
import { Hierarchy } from './utils/hierarchy';
import { CodeBlockHandler } from './utils/codeblock';
import { normalizeUrl, generateFingerprint, isValidDocumentationUrl } from './utils/url';
import type { CrawlerOptions, PageResult, PageNode, VisitedPage, ValidatedCrawlerOptions } from './utils/types';
import { crawlerOptionsSchema } from './utils/types';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
  strongDelimiter: '**'
});

export class DocumentationCrawler {
  private visited = new Map<string, VisitedPage>();
  private fingerprints = new Set<string>();
  private contentHashes = new Set<string>();
  private queue: PageNode[] = [];
  private baseUrl: string;
  private options: ValidatedCrawlerOptions;
  private startTime: number;
  private lastRequestTime = 0;
  private activeRequests = 0;
  private readonly logger: Console;

  constructor(startUrl: string, options: CrawlerOptions = {}) {
    this.logger = console;
    this.logDebug(`Initializing crawler for ${startUrl}`);
    
    try {
      this.baseUrl = new URL(startUrl).origin;
      this.options = crawlerOptionsSchema.parse(options);
      this.queue.push({ url: startUrl, depth: 0 });
      this.startTime = Date.now();
    } catch (error) {
      this.logError('Failed to initialize crawler', error as Error);
      throw error;
    }
  }

  private logDebug(message: string, ...args: any[]): void {
    this.logger.debug(`[Crawler] ${message}`, ...args);
  }

  private logError(message: string, error?: Error): void {
    this.logger.error(`[Crawler Error] ${message}`, error);
  }

  private isTimeoutReached(): boolean {
    return Date.now() - this.startTime > this.options.timeout;
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const diff = now - this.lastRequestTime;
    if (diff < this.options.rateLimit) {
      await new Promise(res => setTimeout(res, this.options.rateLimit - diff));
    }
    this.lastRequestTime = Date.now();

    while (this.activeRequests >= this.options.maxConcurrentRequests) {
      await new Promise(res => setTimeout(res, 100));
    }
    this.activeRequests++;
  }

  private extractLinks(html: string, currentUrl: string, currentDepth: number): PageNode[] {
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const seen = new Set<string>();
    const results: PageNode[] = [];

    doc.querySelectorAll('a[href]').forEach(a => {
      if (this.options.excludeNavigation) {
        const inNav = a.closest('nav, header, footer, [role="navigation"], .navigation, .menu, .nav, .sidebar, .toc');
        if (inNav) return;
      }

      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

      const normalized = normalizeUrl(href, this.baseUrl, this.options.followExternalLinks);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);

      if (isValidDocumentationUrl(normalized)) {
        results.push({ url: normalized, depth: currentDepth + 1, parent: currentUrl });
      }
    });
    
    return results;
  }

  private async fetchPage(url: string, retries = 3): Promise<string> {
    await this.rateLimit();
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Documentation Crawler - Friendly Bot' }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return response.text();
      } catch (error) {
        if (attempt === retries - 1) throw error;
        await new Promise(res => setTimeout(res, Math.pow(2, attempt) * 1000));
      }
    }
    
    throw new Error('Failed to fetch after retries');
  }

  public async *crawl(): AsyncGenerator<PageResult> {
    const processingQueue = new Set<string>();
    
    while (this.queue.length > 0 && !this.isTimeoutReached()) {
      try {
        const { url, depth, parent } = this.queue.shift()!;
        
        if (depth > this.options.maxDepth) {
          this.logDebug(`Skipping ${url} - Max depth exceeded`);
          continue;
        }
        
        const fingerprint = generateFingerprint(url, false);
        if (this.fingerprints.has(fingerprint) || processingQueue.has(url)) {
          continue;
        }
        
        this.fingerprints.add(fingerprint);
        processingQueue.add(url);
        
        try {
          const html = await this.fetchPage(url);
          const newNodes = this.extractLinks(html, url, depth);
          this.queue.push(...newNodes);
          
          const contentResult = await this.processContent(html, url);
          const { content, title, isDocPage, hierarchy, anchor, contentHash } = contentResult;
          
          if (!isDocPage || this.contentHashes.has(contentHash)) {
            this.logDebug(`Skipping ${url} - ${!isDocPage ? 'Not a doc page' : 'Duplicate content'}`);
            continue;
          }
          
          this.contentHashes.add(contentHash);
          
          yield {
            url,
            title,
            content,
            depth,
            parent,
            hierarchy,
            anchor,
            status: "complete"
          };
        } catch (error) {
          this.logError(`Failed to process page: ${url}`, error as Error);
          yield {
            url,
            title: url,
            content: "",
            depth,
            parent,
            hierarchy: Hierarchy.generateEmptyHierarchy(),
            status: "error",
            error: (error as Error).message
          };
        }
      } catch (error) {
        this.logError('Unexpected error during crawl', error as Error);
      } finally {
        const currentUrl = this.queue[0]?.url;
        if (currentUrl) {
          processingQueue.delete(currentUrl);
          this.activeRequests--;
        }
      }
    }
  }

  private async processContent(html: string, url: string) {
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const mainElement = this.findMainElement(doc);
    
    if (!mainElement) {
      return {
        content: '',
        title: '',
        isDocPage: false,
        hierarchy: Hierarchy.generateEmptyHierarchy(),
        anchor: null,
        contentHash: ''
      };
    }

    this.cleanContent(mainElement);
    
    CodeBlockHandler.processCodeBlocks(mainElement);
    
    const title = this.extractTitle(doc);
    const markdown = turndownService.turndown(mainElement.innerHTML);
    const cleanContent = this.optimizeContent(markdown);
    const contentHash = this.generateContentHash(cleanContent);
    const hierarchy = Hierarchy.extractHierarchy(mainElement);
    const anchor = Anchor.getAnchor(mainElement);
    
    const isDocPage = Boolean(
      mainElement.querySelector('h1,h2,h3,h4,h5,h6') ||
      mainElement.querySelector('pre code') ||
      (mainElement.textContent?.length || 0) > 500
    );

    const formattedContent = this.formatOutput({
      title,
      url,
      content: cleanContent,
      contentHash
    });

    return {
      content: formattedContent,
      title,
      isDocPage,
      hierarchy,
      anchor,
      contentHash
    };
  }

  private findMainElement(doc: Document): Element | null {
    const selectors = [
      'article[role="main"]', 'main[role="main"]',
      'div[role="main"]', 'main', 'article',
      '.content', '.article-content', '.markdown-body',
      '#content', '#main'
    ];
    
    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      if (el?.textContent?.trim()) return el;
    }
    
    return doc.body;
  }

  private cleanContent(element: Element): void {
    if (this.options.excludeNavigation) {
      const navSelectors = [
        'nav', '[role="navigation"]', '.navigation', '.menu',
        '.sidebar', '.toc', 'header:not(article header)',
        'footer:not(article footer)', '.navbar', '.nav-menu',
        '[aria-label*="navigation"]', '[aria-label*="menu"]'
      ];
      
      element.querySelectorAll(navSelectors.join(',')).forEach(nav => {
        if (this.isNavigationElement(nav)) {
          nav.remove();
        }
      });
    }

    const removeSelectors = [
      'script', 'style', 'iframe', 'form',
      '.advertisement', '#disqus_thread',
      '.comments', '.social-share'
    ];
    
    removeSelectors.forEach(selector => {
      element.querySelectorAll(selector).forEach(el => el.remove());
    });
  }

  private isNavigationElement(element: Element): boolean {
    return (
      element.querySelectorAll('a').length > 3 ||
      element.getAttribute('role') === 'navigation' ||
      element.matches('nav') ||
      (element.textContent?.length || 0) < 200
    ) && (
      element.querySelectorAll('pre, code, p:not(:empty)').length === 0 ||
      element.querySelectorAll('h1, h2, h3, h4, h5, h6').length === 0
    );
  }

  private extractTitle(doc: Document): string {
    return (
      doc.querySelector('main h1, article h1')?.textContent ||
      doc.querySelector('h1')?.textContent ||
      doc.querySelector('title')?.textContent?.split('|')[0]?.trim() ||
      'Untitled Page'
    ).trim();
  }

  private optimizeContent(content: string): string {
    return content
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^[-*]\s*$/gm, '')
      .replace(/```(\w*)\n\n/g, '```$1\n')
      .replace(/\n\n```/g, '\n```')
      .trim();
  }

  private generateContentHash(content: string): string {
    return crypto
      .createHash('sha1')
      .update(content.toLowerCase().replace(/\s+/g, ' '))
      .digest('hex');
  }

  private formatOutput(data: {
    title: string;
    url: string;
    content: string;
    contentHash: string;
  }): string {
    return `================================================================
Documentation Page
================================================================
Title: ${data.title}
URL: ${data.url}
Type: Documentation
Format: Markdown
Content-Hash: ${data.contentHash}
================================================================

${data.content}

================================================================`;
  }
}
