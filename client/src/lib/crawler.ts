
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import crypto from 'crypto';
import { Anchor } from './utils/anchor';
import { Hierarchy } from './utils/hierarchy';
import { CodeBlockHandler } from './utils/codeblock';
import { normalizeUrl, generateFingerprint, isValidDocumentationUrl } from './utils/url';
import type { CrawlerOptions, PageResult, PageNode, ValidatedCrawlerOptions } from './utils/types';
import { crawlerOptionsSchema } from './utils/types';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
  strongDelimiter: '**'
});

export class DocumentationCrawler {
  private visited = new Set<string>();
  private fingerprints = new Set<string>();
  private contentHashes = new Set<string>();
  private queue: PageNode[] = [];
  private baseUrl: string;
  private options: ValidatedCrawlerOptions;
  public readonly startTime: number;
  private lastRequestTime = 0;
  private activeRequests = 0;

  constructor(startUrl: string, options: CrawlerOptions = {}) {
    console.debug(`[Crawler] Initializing crawler for ${startUrl}`);
    
    try {
      const baseObj = new URL(startUrl);
      this.baseUrl = baseObj.origin;
      this.options = crawlerOptionsSchema.parse(options);
      this.queue.push({ url: startUrl, depth: 0 });
      this.startTime = Date.now();
    } catch (error) {
      console.error('[Crawler] Failed to initialize:', error);
      throw error;
    }
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
  }

  private extractLinks(doc: Document, currentUrl: string, currentDepth: number): PageNode[] {
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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      try {
        const response = await fetch(url, {
          headers: { 
            'User-Agent': 'Mozilla/5.0 (compatible; Documentation Crawler Bot/1.0)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const text = await response.text();
        if (!text.trim()) {
          throw new Error('Empty response');
        }
        
        return text;
      } catch (error) {
        clearTimeout(timeoutId);
        if (attempt === retries - 1) throw error;
        await new Promise(res => setTimeout(res, Math.pow(2, attempt) * 1000));
      }
    }
    
    throw new Error('Failed to fetch after retries');
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
    const removeSelectors = [
      'script', 'style', 'iframe', 'form',
      '.advertisement', '#disqus_thread',
      '.comments', '.social-share'
    ];
    
    removeSelectors.forEach(selector => {
      element.querySelectorAll(selector).forEach(el => el.remove());
    });

    if (this.options.excludeNavigation) {
      const navSelectors = [
        'nav', '[role="navigation"]', '.navigation', '.menu',
        '.sidebar', '.toc', 'header:not(article header)',
        'footer:not(article footer)'
      ];
      
      element.querySelectorAll(navSelectors.join(',')).forEach(nav => nav.remove());
    }
  }

  private generateContentHash(content: string): string {
    return crypto
      .createHash('sha1')
      .update(content.toLowerCase().replace(/\s+/g, ' '))
      .digest('hex');
  }

  public async *crawl(): AsyncGenerator<PageResult> {
    console.debug(`[Crawler] Starting crawl with ${this.queue.length} URLs in queue`);
    
    while (this.queue.length > 0 && !this.isTimeoutReached()) {
      if (this.activeRequests >= this.options.maxConcurrentRequests) {
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      const { url, depth, parent } = this.queue.shift()!;
      console.debug(`[Crawler] Processing ${url} at depth ${depth}`);
      
      if (depth > this.options.maxDepth) {
        console.debug(`[Crawler] Skipping ${url} - Max depth exceeded`);
        continue;
      }

      if (this.visited.has(url)) {
        console.debug(`[Crawler] Skipping ${url} - Already visited`);
        continue;
      }

      // Mark as visited before processing to prevent duplicates
      this.visited.add(url);
      this.activeRequests++;
      
      try {
        const html = await this.fetchPage(url);
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // Extract new links before cleaning content
        const newNodes = this.extractLinks(doc, url, depth);
        let newLinksCount = 0;
        for (const node of newNodes) {
          const fingerprint = generateFingerprint(node.url, false);
          if (!this.fingerprints.has(fingerprint)) {
            this.queue.push(node);
            this.fingerprints.add(fingerprint);
            newLinksCount++;
          }
        }

        const mainElement = this.findMainElement(doc);
        if (!mainElement) {
          console.debug(`[Crawler] No main content found for ${url}`);
          continue;
        }

        this.cleanContent(mainElement);
        CodeBlockHandler.processCodeBlocks(mainElement);
        
        // Analyze page content
        const hasHeadings = mainElement.querySelectorAll('h1,h2,h3,h4,h5,h6').length > 0;
        const hasCodeBlocks = mainElement.querySelectorAll('pre code').length > 0;
        const hasSubstantialText = (mainElement.textContent?.length || 0) > 200;
        const hasParagraphs = mainElement.querySelectorAll('p').length > 0;
        
        const isDocPage = hasHeadings || hasCodeBlocks || (hasSubstantialText && hasParagraphs);
        
        if (!isDocPage) {
          console.debug(`[Crawler] Skipping ${url} - Not a documentation page`);
          continue;
        }

        const title = doc.querySelector('title')?.textContent?.split('|')[0].trim() || 'Untitled';
        const content = turndownService.turndown(mainElement.innerHTML);
        const contentHash = this.generateContentHash(content);
        
        if (this.contentHashes.has(contentHash)) {
          console.debug(`[Crawler] Skipping ${url} - Duplicate content`);
          continue;
        }
        
        this.contentHashes.add(contentHash);
        const hierarchy = Hierarchy.extractHierarchy(mainElement);
        const anchor = Anchor.getAnchor(mainElement);

        yield {
          url,
          title,
          content,
          depth,
          parent,
          hierarchy,
          anchor,
          status: "complete",
          newLinksFound: newLinksCount
        };
      } catch (error) {
        console.error(`[Crawler] Error processing ${url}:`, error);
        yield {
          url,
          title: url,
          content: "",
          depth,
          parent,
          hierarchy: Hierarchy.generateEmptyHierarchy(),
          status: "error",
          error: error instanceof Error ? error.message : String(error)
        };
      } finally {
        this.activeRequests--;
      }
    }
    
    // Wait for any remaining requests to complete
    while (this.activeRequests > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.debug(`[Crawler] Crawl complete. Processed ${this.visited.size} pages`);
  }
}
