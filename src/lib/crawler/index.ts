/**
 * Main crawler engine - integrates all V1 components with modern Next.js
 */

import { JSDOM } from 'jsdom';
import PQueue from 'p-queue';
import { extractContent, extractTitle } from './content-extractor';
import { normalizeUrl, isValidDocumentationUrl, generateFingerprint, generateContentFingerprint } from './url-utils';
// CodeBlockHandler available if needed for future enhancements
import { memoryStore, type CrawlResult } from '../storage/memory-store';

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  followExternalLinks?: boolean;
  includeAnchors?: boolean;
  respectRobots?: boolean;
  delayMs?: number;
}

export interface CrawlProgress {
  currentUrl: string;
  pageCount: number;
  totalPages: number;
  status: string;
}

const DEFAULT_OPTIONS: Required<CrawlOptions> = {
  maxPages: 50,
  maxDepth: 3,
  followExternalLinks: false, // Don't follow external links during crawling
  includeAnchors: false,
  respectRobots: true,
  delayMs: 1000,
};

export class DocspastaCrawler {
  private queue: PQueue;
  private visited = new Set<string>();
  private crawledPages: Array<{
    url: string;
    title: string;
    content: string;
    depth: number;
  }> = [];

  constructor(private options: CrawlOptions = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    this.queue = new PQueue({
      concurrency: 3, // Respectful crawling
      interval: opts.delayMs,
      intervalCap: 1,
    });
  }

  /**
   * Start crawling from a given URL
   */
  async crawl(startUrl: string, crawlId: string): Promise<void> {
    try {
      console.log(`Starting crawl for ${startUrl} with ID ${crawlId}`);
      
      // Update status to processing
      memoryStore.updateCrawl(crawlId, {
        status: 'processing',
        progress: 0
      });

      // Check cache first
      const urlHash = generateFingerprint(startUrl, false);
      if (memoryStore.isCacheFresh(urlHash)) {
        const cached = memoryStore.getCache(urlHash);
        if (cached) {
          console.log(`Using cached result for ${startUrl}`);
          memoryStore.updateCrawl(crawlId, {
            status: 'completed',
            progress: 100,
            markdown: cached.markdown,
            title: cached.title,
            metadata: {
              totalPages: 1,
              totalTokens: this.estimateTokens(cached.markdown),
              crawlDate: new Date().toISOString()
            },
            completedAt: new Date().toISOString()
          });
          return;
        }
      }

      // Start fresh crawl
      await this.crawlUrl(startUrl, 0, crawlId);
      
      // Wait for queue to complete
      await this.queue.onIdle();
      
      console.log(`Crawled ${this.crawledPages.length} pages`);

      // Check if we got any content
      if (this.crawledPages.length === 0) {
        throw new Error('No content could be extracted from the provided URL');
      }

      // Combine all crawled content
      const combinedMarkdown = this.combineContent();
      const title = this.crawledPages[0]?.title || 'Documentation';

      console.log(`Generated ${combinedMarkdown.length} characters of markdown`);

      // Cache the result
      memoryStore.setCache(urlHash, {
        url: startUrl,
        urlHash,
        contentHash: generateContentFingerprint(combinedMarkdown),
        title,
        markdown: combinedMarkdown,
        metadata: {
          totalPages: this.crawledPages.length,
          totalTokens: this.estimateTokens(combinedMarkdown),
        },
        lastCrawled: new Date().toISOString(),
        hitCount: 1
      });

      // Update final result
      memoryStore.updateCrawl(crawlId, {
        status: 'completed',
        progress: 100,
        markdown: combinedMarkdown,
        title,
        metadata: {
          totalPages: this.crawledPages.length,
          totalTokens: this.estimateTokens(combinedMarkdown),
          crawlDate: new Date().toISOString()
        },
        completedAt: new Date().toISOString()
      });

      console.log(`Crawl completed successfully for ${startUrl}`);

    } catch (error) {
      console.error('Crawl error:', error);
      memoryStore.updateCrawl(crawlId, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        completedAt: new Date().toISOString()
      });
    }
  }

  /**
   * Crawl a single URL
   */
  private async crawlUrl(url: string, depth: number, crawlId: string): Promise<void> {
    // For the initial URL (depth 0), always allow it. For subsequent URLs, apply external link filtering
    const allowExternal = depth === 0 || (this.options.followExternalLinks || false);
    const normalizedUrl = normalizeUrl(url, url, allowExternal);
    
    if (!normalizedUrl || 
        this.visited.has(normalizedUrl) || 
        !isValidDocumentationUrl(normalizedUrl) ||
        depth > (this.options.maxDepth || DEFAULT_OPTIONS.maxDepth) ||
        this.crawledPages.length >= (this.options.maxPages || DEFAULT_OPTIONS.maxPages)) {
      return;
    }

    this.visited.add(normalizedUrl);

    try {
      // Update progress
      const progress = Math.min(90, (this.crawledPages.length / (this.options.maxPages || DEFAULT_OPTIONS.maxPages)) * 100);
      memoryStore.updateCrawl(crawlId, {
        progress,
        status: 'processing'
      });

      // Fetch the page
      const response = await fetch(normalizedUrl, {
        headers: {
          'User-Agent': 'Docspasta/2.0 (Documentation Crawler)',
        },
      });

      if (!response.ok) {
        console.warn(`Failed to fetch ${normalizedUrl}: ${response.status}`);
        return;
      }

      const html = await response.text();
      const dom = new JSDOM(html, { url: normalizedUrl });
      const document = dom.window.document;

      // Extract content
      const title = extractTitle(document);
      const content = extractContent(document);

      if (content.trim()) {
        this.crawledPages.push({
          url: normalizedUrl,
          title,
          content,
          depth
        });
      }

      // Find links for further crawling
      if (depth < (this.options.maxDepth || DEFAULT_OPTIONS.maxDepth)) {
        const links = this.extractLinks(document, normalizedUrl);
        
        // Add to queue for processing
        for (const link of links.slice(0, 10)) { // Limit links per page
          this.queue.add(() => this.crawlUrl(link, depth + 1, crawlId));
        }
      }

    } catch (error) {
      console.warn(`Error crawling ${normalizedUrl}:`, error);
    }
  }

  /**
   * Extract links from a document
   */
  private extractLinks(document: Document, baseUrl: string): string[] {
    const links: string[] = [];
    const linkElements = document.querySelectorAll('a[href]');

    for (const link of linkElements) {
      const href = link.getAttribute('href');
      if (!href) continue;

      const normalized = normalizeUrl(
        href, 
        baseUrl, 
        this.options.followExternalLinks || false,
        this.options.includeAnchors || false
      );

      if (normalized && isValidDocumentationUrl(normalized)) {
        links.push(normalized);
      }
    }

    return [...new Set(links)]; // Deduplicate
  }

  /**
   * Combine all crawled content into final markdown
   */
  private combineContent(): string {
    if (this.crawledPages.length === 0) {
      return '';
    }

    if (this.crawledPages.length === 1) {
      return this.crawledPages[0].content;
    }

    // Multiple pages - create table of contents and combine
    let combined = `# ${this.crawledPages[0].title}\n\n`;
    
    // Table of contents
    combined += '## Table of Contents\n\n';
    this.crawledPages.forEach((page, index) => {
      combined += `${index + 1}. [${page.title || 'Page ' + (index + 1)}](#page-${index + 1})\n`;
    });
    combined += '\n';

    // Content
    this.crawledPages.forEach((page, index) => {
      combined += `## Page ${index + 1}: ${page.title}\n\n`;
      combined += `**URL:** ${page.url}\n\n`;
      combined += page.content;
      combined += '\n\n---\n\n';
    });

    return combined;
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }
}

/**
 * Start a new crawl
 */
export async function startCrawl(url: string, options: CrawlOptions = {}): Promise<string> {
  const crawlId = `crawl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`Creating crawl with ID: ${crawlId} for URL: ${url}`);
  
  // Store initial crawl state
  const crawlResult: CrawlResult = {
    id: crawlId,
    url,
    status: 'started',
    progress: 0,
    createdAt: new Date().toISOString()
  };
  
  memoryStore.setCrawl(crawlId, crawlResult);
  
  // Verify it was stored
  const stored = memoryStore.getCrawl(crawlId);
  console.log(`Stored crawl verification:`, stored ? 'SUCCESS' : 'FAILED');

  // Start crawling in background
  const crawler = new DocspastaCrawler(options);
  crawler.crawl(url, crawlId).catch(error => {
    console.error('Background crawl error:', error);
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