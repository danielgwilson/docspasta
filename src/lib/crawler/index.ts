/**
 * Main crawler engine - integrates all V1 components with modern Next.js
 * PHASE 1 ENHANCED: Redis deduplication, robots.txt compliance, sitemap discovery, quality assessment
 */

import { JSDOM } from 'jsdom';
import PQueue from 'p-queue';
import { extractContent, extractTitle } from './content-extractor';
import { normalizeUrl, isValidDocumentationUrl, generateFingerprint, generateContentFingerprint } from './url-utils';
import { memoryStore, type CrawlResult } from '../storage/memory-store';
import { addDiscoveredUrl, isUrlDiscovered, updateCrawlProgress } from '../redis';
import { getRobotsInfo, shouldCrawlUrl, respectCrawlDelay } from './robots';
import { crawlSitemaps, getUrlPriority } from './sitemap';
import { assessContentQuality, shouldCrawlBasedOnUrl } from './quality';

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  followExternalLinks?: boolean;
  includeAnchors?: boolean;
  respectRobots?: boolean;
  delayMs?: number;
  useSitemap?: boolean;
  qualityThreshold?: number; // 0-100, minimum quality score to include content
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
  useSitemap: true,
  qualityThreshold: 40, // Accept "acceptable" quality and above
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
   * Start crawling from a given URL - PHASE 1 ENHANCED
   */
  async crawl(startUrl: string, crawlId: string): Promise<void> {
    try {
      console.log(`🚀 Starting Phase 1 enhanced crawl for ${startUrl} with ID ${crawlId}`);
      
      // Update status to processing
      memoryStore.updateCrawl(crawlId, {
        status: 'processing',
        progress: 0
      });

      // Update Redis progress tracking
      await updateCrawlProgress(crawlId, {
        status: 'processing',
        processedUrls: 0,
        totalUrls: 1,
        currentUrl: startUrl
      });

      // Check cache first
      const urlHash = generateFingerprint(startUrl, false);
      if (memoryStore.isCacheFresh(urlHash)) {
        const cached = memoryStore.getCache(urlHash);
        if (cached) {
          console.log(`📋 Using cached result for ${startUrl}`);
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

      // Phase 1: Sitemap discovery (if enabled)
      let discoveredUrls: string[] = [startUrl];
      
      if (this.options.useSitemap) {
        console.log(`🗺️  Discovering URLs via sitemap...`);
        try {
          const sitemapResult = await crawlSitemaps(startUrl, this.options.maxDepth, this.options.maxPages);
          if (sitemapResult.urls.length > 0) {
            console.log(`📍 Found ${sitemapResult.urls.length} URLs from sitemap (source: ${sitemapResult.source})`);
            
            // Prioritize URLs and add to discovery list
            const prioritizedUrls = sitemapResult.urls
              .filter(url => shouldCrawlBasedOnUrl(url))
              .map(url => ({ url, priority: getUrlPriority(url) }))
              .sort((a, b) => b.priority - a.priority)
              .slice(0, this.options.maxPages || DEFAULT_OPTIONS.maxPages)
              .map(item => item.url);
            
            discoveredUrls = prioritizedUrls;
            console.log(`🎯 Prioritized to ${discoveredUrls.length} high-quality URLs`);
          }
        } catch (error) {
          console.warn('⚠️  Sitemap discovery failed, falling back to single URL crawl:', error);
        }
      }

      // Phase 2: Robots.txt compliance check
      let robotsInfo;
      let crawlDelay = this.options.delayMs || DEFAULT_OPTIONS.delayMs;
      
      if (this.options.respectRobots) {
        console.log(`🤖 Checking robots.txt compliance...`);
        try {
          robotsInfo = await getRobotsInfo(startUrl);
          crawlDelay = Math.max(crawlDelay, robotsInfo.getCrawlDelay());
          console.log(`⏱️  Crawl delay set to ${crawlDelay}ms`);
        } catch (error) {
          console.warn('⚠️  Robots.txt check failed, proceeding with default settings:', error);
        }
      }

      // Phase 3: Crawl discovered URLs
      console.log(`🔍 Starting to crawl ${discoveredUrls.length} URLs...`);
      
      let processedCount = 0;
      for (const url of discoveredUrls) {
        if (this.crawledPages.length >= (this.options.maxPages || DEFAULT_OPTIONS.maxPages)) {
          console.log(`🛑 Reached max pages limit (${this.options.maxPages})`);
          break;
        }

        try {
          // Redis deduplication check
          const alreadyDiscovered = await isUrlDiscovered(crawlId, url);
          if (alreadyDiscovered) {
            console.log(`⏭️  Skipping already discovered URL: ${url}`);
            continue;
          }

          // Add to discovered set
          await addDiscoveredUrl(crawlId, url);

          // Robots.txt compliance for individual URLs
          if (this.options.respectRobots && robotsInfo) {
            const shouldCrawl = await shouldCrawlUrl(startUrl, url);
            if (!shouldCrawl.allowed) {
              console.log(`🚫 Skipping ${url}: ${shouldCrawl.reason}`);
              continue;
            }
            
            // Respect crawl delay
            if (shouldCrawl.crawlDelay > 0) {
              await respectCrawlDelay(shouldCrawl.crawlDelay);
            }
          }

          console.log(`📖 Crawling URL ${processedCount + 1}/${discoveredUrls.length}: ${url}`);
          
          // Update progress
          await updateCrawlProgress(crawlId, {
            status: 'processing',
            processedUrls: processedCount,
            totalUrls: discoveredUrls.length,
            currentUrl: url
          });

          await this.crawlUrl(url, 0, crawlId);
          processedCount++;

          // Update memory store progress
          const progress = Math.min(90, (processedCount / discoveredUrls.length) * 100);
          memoryStore.updateCrawl(crawlId, { progress });

          // Respect crawl delay between requests
          if (crawlDelay > 0) {
            await respectCrawlDelay(crawlDelay);
          }

        } catch (error) {
          console.warn(`⚠️  Error crawling ${url}:`, error);
          processedCount++;
        }
      }
      
      // Wait for queue to complete
      await this.queue.onIdle();
      
      console.log(`✅ Crawled ${this.crawledPages.length} pages successfully`);

      // Check if we got any content
      if (this.crawledPages.length === 0) {
        throw new Error('No content could be extracted from the provided URL(s)');
      }

      // Phase 4: Quality filtering and combination
      const qualityThreshold = this.options.qualityThreshold || DEFAULT_OPTIONS.qualityThreshold;
      
      const qualityFilteredPages = this.crawledPages.filter(page => {
        const quality = assessContentQuality(page.content, 200, page.title, page.url);
        console.log(`📊 Quality score for ${page.url}: ${quality.score}/100 (${quality.recommendation})`);
        return quality.score >= qualityThreshold;
      });

      console.log(`🎯 Quality filter: ${qualityFilteredPages.length}/${this.crawledPages.length} pages meet threshold (${qualityThreshold})`);

      // Use filtered pages for final result
      this.crawledPages = qualityFilteredPages;

      if (this.crawledPages.length === 0) {
        throw new Error(`No content met the quality threshold of ${qualityThreshold}. Try lowering the threshold.`);
      }

      // Combine all crawled content
      const combinedMarkdown = this.combineContent();
      const title = this.crawledPages[0]?.title || 'Documentation';

      console.log(`📝 Generated ${combinedMarkdown.length} characters of markdown`);

      // Final quality assessment
      const finalQuality = assessContentQuality(combinedMarkdown, 200, title, startUrl);
      console.log(`🏆 Final content quality: ${finalQuality.score}/100 (${finalQuality.recommendation})`);

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
          qualityScore: finalQuality.score,
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
          crawlDate: new Date().toISOString(),
          qualityScore: finalQuality.score,
          sitemapUsed: this.options.useSitemap,
          robotsRespected: this.options.respectRobots
        },
        completedAt: new Date().toISOString()
      });

      // Update Redis final progress
      await updateCrawlProgress(crawlId, {
        status: 'completed',
        processedUrls: processedCount,
        totalUrls: discoveredUrls.length
      });

      console.log(`🎉 Crawl completed successfully for ${startUrl}`);

    } catch (error) {
      console.error('💥 Crawl error:', error);
      
      memoryStore.updateCrawl(crawlId, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        completedAt: new Date().toISOString()
      });

      await updateCrawlProgress(crawlId, {
        status: 'error',
        processedUrls: 0,
        totalUrls: 1,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
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