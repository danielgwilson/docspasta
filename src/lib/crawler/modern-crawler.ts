/**
 * Modern Web Crawler - Pure Queue-Based Architecture
 * 
 * Features:
 * - Fully async queue-based processing with p-queue
 * - Real-time progress tracking with events
 * - Individual page timeouts that don't kill the whole operation
 * - Dynamic URL discovery during crawling
 * - Proper error handling and resilience
 * - Parallel processing with configurable concurrency
 */

import PQueue from 'p-queue';
import { JSDOM } from 'jsdom';
import { EventEmitter } from 'events';
import { normalizeUrl, isValidDocumentationUrl } from './url-utils';
import { extractContent, extractTitle } from './content-extractor';
import { memoryStore } from '../storage/memory-store';
import { crawlSitemaps } from './sitemap';
import { getRobotsInfo, shouldCrawlUrl, type RobotsInfo } from './robots';
import { addDiscoveredUrl, isUrlDiscovered } from '../redis';

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  concurrency?: number;
  pageTimeout?: number;
  delayMs?: number;
  followExternalLinks?: boolean;
  respectRobots?: boolean;
  useSitemap?: boolean;
  qualityThreshold?: number;
  includePaths?: string[];  // Regex patterns for paths to include
  excludePaths?: string[];  // Regex patterns for paths to exclude
  maxLinksPerPage?: number; // Maximum links to queue from each page
}

export interface CrawlProgress {
  currentUrl: string;
  pageCount: number;
  totalDiscovered: number;
  inProgress: number;
  queueSize: number;
  status: string;
}

export interface CrawledPage {
  url: string;
  title: string;
  content: string;
  depth: number;
  qualityScore: number;
}

const DEFAULT_OPTIONS: Required<CrawlOptions> = {
  maxPages: 200,
  maxDepth: 4,
  concurrency: 3, // Respectful parallel processing
  pageTimeout: 5000, // 5 second per-page timeout
  delayMs: 300,
  followExternalLinks: false,
  respectRobots: true,
  useSitemap: true,
  qualityThreshold: 15, // Lower default for real-world content
  includePaths: [],  // Empty = include all
  excludePaths: [],  // Empty = exclude none
  maxLinksPerPage: 50, // Default to 50 links per page
};

export class ModernCrawler extends EventEmitter {
  private queue: PQueue;
  private visited = new Set<string>();
  private crawledPages: CrawledPage[] = [];
  private options: Required<CrawlOptions>;
  private inProgress = 0;
  private processed = 0;
  private startUrl: string = '';
  private crawlId: string = '';
  private robotsInfo: RobotsInfo | null = null;
  private isCompleted = false;
  private totalDiscovered = 0;
  private allDiscoveredUrls = new Set<string>(); // Track ALL discovered URLs
  private processedCount = 0; // Track pages being processed

  constructor(options: CrawlOptions = {}) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
    
    this.queue = new PQueue({
      concurrency: this.options.concurrency,
      timeout: this.options.pageTimeout + 1000, // Queue timeout > page timeout
      throwOnTimeout: false // Continue on timeout rather than crashing
    });

    // Listen to queue events for progress tracking
    this.queue.on('add', () => this.emitProgress());
    this.queue.on('next', () => this.emitProgress());
    this.queue.on('idle', () => this.handleQueueIdle());
  }

  /**
   * Start crawling from a URL
   */
  async crawl(startUrl: string, crawlId: string): Promise<void> {
    this.startUrl = startUrl;
    this.crawlId = crawlId;
    this.isCompleted = false;
    this.allDiscoveredUrls.add(startUrl); // Start tracking URLs immediately

    console.log(`🚀 Starting modern queue-based crawl for ${startUrl}`);

    try {
      // Phase 1: Initial setup and sitemap discovery
      await this.initializeCrawl();

      // Phase 2: Seed the queue with initial URLs
      await this.seedQueue();

      // Phase 3: Wait for all crawling to complete
      console.log(`⏳ Waiting for queue to complete (${this.queue.size} tasks, ${this.queue.pending} pending)`);
      await this.queue.onIdle();
      console.log(`✅ Queue completed! Processed ${this.processedCount} pages, crawled ${this.crawledPages.length} pages`);

      // Phase 4: Finalize results
      this.finalizeCrawl();

    } catch (error) {
      console.error(`💥 Crawl error:`, error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Initialize crawl with sitemap and robots.txt discovery
   */
  private async initializeCrawl(): Promise<void> {
    // Update initial progress
    this.totalDiscovered = 1; // Start URL counts as discovered
    this.allDiscoveredUrls.add(this.startUrl); // Track start URL
    
    // Emit progress immediately
    this.emitProgress(this.startUrl);
    
    memoryStore.updateCrawl(this.crawlId, {
      status: 'processing',
      progress: {
        currentUrl: this.startUrl,
        pageCount: 0,
        totalPages: 1,
        status: 'Initializing crawl'
      }
    });

    // Get robots.txt info if enabled
    if (this.options.respectRobots) {
      try {
        console.log(`🤖 Checking robots.txt compliance...`);
        this.robotsInfo = await getRobotsInfo(this.startUrl);
      } catch (error) {
        console.warn(`⚠️  Robots.txt check failed:`, error);
      }
    }
  }

  /**
   * Seed the queue with initial URLs from sitemap or start URL
   */
  private async seedQueue(): Promise<string[]> {
    let initialUrls: string[] = [this.startUrl];

    // Try sitemap discovery
    if (this.options.useSitemap) {
      try {
        console.log(`🗺️  Discovering URLs via sitemap...`);
        const sitemapResult = await crawlSitemaps(this.startUrl, this.options.maxDepth, this.options.maxPages * 2); // Get more URLs to filter
        
        if (sitemapResult.urls.length > 0) {
          // Track ALL discovered URLs before filtering
          sitemapResult.urls.forEach(url => this.allDiscoveredUrls.add(url));
          
          console.log(`📍 Found ${sitemapResult.urls.length} URLs from sitemap`);
          
          // Apply include/exclude filters if specified
          let filteredUrls = sitemapResult.urls;
          
          if ((this.options.includePaths && this.options.includePaths.length > 0) || 
              (this.options.excludePaths && this.options.excludePaths.length > 0)) {
            filteredUrls = sitemapResult.urls.filter(url => this.shouldCrawlUrl(url));
            console.log(`🎯 Filtered to ${filteredUrls.length} URLs based on include/exclude paths`);
          }
          
          initialUrls = filteredUrls.slice(0, this.options.maxPages);
          console.log(`📚 Will crawl ${initialUrls.length} URLs from sitemap`);
        } else {
          console.log(`📍 No sitemap found, will discover URLs through HTML crawling`);
        }
      } catch (error) {
        console.warn('⚠️  Sitemap discovery failed, will discover URLs through HTML crawling:', error);
      }
    }

    // Ensure we have at least the start URL
    if (initialUrls.length === 0) {
      console.log(`⚠️  No URLs to crawl, adding start URL`);
      initialUrls = [this.startUrl];
    }
    
    // Add initial URL to allDiscoveredUrls if not from sitemap
    if (!this.options.useSitemap || initialUrls.length === 1) {
      this.allDiscoveredUrls.add(this.startUrl);
    }
    
    // Add all initial URLs to queue
    for (const url of initialUrls) {
      this.addUrlToQueue(url, 0);
    }

    // Update total discovered count
    this.totalDiscovered = this.visited.size;

    // Emit progress immediately after seeding
    this.emitProgress(this.startUrl);
    
    // Update progress with discovered URLs
    memoryStore.updateCrawl(this.crawlId, {
      progress: {
        currentUrl: this.startUrl,
        pageCount: 0,
        totalPages: this.allDiscoveredUrls.size,
        status: `Queue seeded with ${initialUrls.length} URLs`
      }
    });

    console.log(`🔍 Seeded queue with ${initialUrls.length} URLs`);
    return initialUrls;
  }

  /**
   * Add a URL to the crawling queue
   */
  private addUrlToQueue(url: string, depth: number): void {
    const normalizedUrl = normalizeUrl(url, this.startUrl, depth === 0 || this.options.followExternalLinks);
    
    // Debug logging removed for production (available in regression tests)
    
    if (!normalizedUrl || 
        this.visited.has(normalizedUrl) || 
        !isValidDocumentationUrl(normalizedUrl) ||
        !this.shouldCrawlUrl(normalizedUrl) || // Apply include/exclude filters
        depth > this.options.maxDepth ||
        this.crawledPages.length >= this.options.maxPages) {
      console.log(`❌ URL filtered out: ${url}`);
      return;
    }

    this.visited.add(normalizedUrl);
    this.totalDiscovered = this.visited.size;
    this.allDiscoveredUrls.add(normalizedUrl); // Track all discovered

    // Add crawl task to queue
    console.log(`📥 Adding URL to queue: ${normalizedUrl} (depth: ${depth})`);
    this.queue.add(async () => {
      console.log(`🔄 Queue executing task for: ${normalizedUrl}`);
      await this.crawlPage(normalizedUrl, depth);
    });
  }

  /**
   * Crawl a single page
   */
  private async crawlPage(url: string, depth: number): Promise<void> {
    this.inProgress++;
    this.processedCount++; // Increment immediately when starting to process
    this.emitProgress(url);

    try {
      // Note: Removed Redis deduplication check here to fix race condition
      // The in-memory visited set already handles deduplication during addUrlToQueue

      await addDiscoveredUrl(this.crawlId, url);
      console.log(`🕷️  Crawling page ${this.processedCount}/${this.allDiscoveredUrls.size}: ${url}`);
      
      // Log when we're actually processing
      console.log(`   Starting fetch for ${url}...`);

      // Robots.txt compliance check
      if (this.options.respectRobots && this.robotsInfo) {
        const shouldCrawl = await shouldCrawlUrl(url, this.robotsInfo);
        if (!shouldCrawl.allowed) {
          console.log(`🚫 Skipping ${url}: ${shouldCrawl.reason}`);
          return;
        }

        // Respect crawl delay
        if (shouldCrawl.crawlDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, shouldCrawl.crawlDelay));
        }
      }

      // Fetch page with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.options.pageTimeout);

      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Docspasta/2.0 (Documentation Crawler)',
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.warn(`❌ Failed to fetch ${url}: ${response.status}`);
          return;
        }

        const html = await response.text();
        const dom = new JSDOM(html, { url });
        const document = dom.window.document;

        // Extract content
        const title = extractTitle(document);
        const content = extractContent(document);

        if (content.trim()) {
          const qualityScore = this.assessContentQuality(content);
          
          const threshold = this.options.qualityThreshold ?? 40;
          
          if (qualityScore >= threshold) {
            this.crawledPages.push({
              url,
              title,
              content,
              depth,
              qualityScore
            });

            console.log(`✅ Crawled page ${this.crawledPages.length}: ${url} (quality: ${qualityScore})`);
          } else {
            console.log(`📊 Quality score too low for ${url}: ${qualityScore}/${threshold}`);
          }
        }

        // Discover new URLs if within depth limit
        if (depth < this.options.maxDepth) {
          this.discoverLinksFromPage(document, url, depth);
        }

        // Respect crawl delay
        if (this.options.delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, this.options.delayMs));
        }

      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          console.warn(`⏰ Timeout crawling ${url} (>${this.options.pageTimeout}ms)`);
        } else {
          console.warn(`⚠️  Error crawling ${url}:`, error);
        }
      }

    } catch (error) {
      console.warn(`💥 Critical error crawling ${url}:`, error);
    } finally {
      this.inProgress--;
      this.processed++;
      // processedCount already incremented at start of crawlPage
      this.emitProgress();
    }
  }

  /**
   * Discover and queue new links from a page
   */
  private discoverLinksFromPage(document: Document, baseUrl: string, depth: number): void {
    const links = this.extractLinks(document, baseUrl);
    
    // Track ALL discovered URLs before filtering
    links.forEach(link => this.allDiscoveredUrls.add(link));
    
    // Apply include/exclude filters
    const filteredLinks = links.filter(link => this.shouldCrawlUrl(link));
    
    // Limit links per page to prevent queue explosion
    const maxLinks = this.options.maxLinksPerPage || 50; // Default to 50 links per page
    const limitedLinks = filteredLinks.slice(0, maxLinks);
    
    for (const link of limitedLinks) {
      this.addUrlToQueue(link, depth + 1);
    }

    if (limitedLinks.length > 0) {
      console.log(`🔗 Discovered ${links.length} total links, queued ${limitedLinks.length} documentation links from ${baseUrl}`);
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

      try {
        const absoluteUrl = new URL(href, baseUrl).toString();
        links.push(absoluteUrl);
      } catch {
        // Invalid URL, skip
      }
    }

    return links;
  }

  /**
   * Assess content quality
   */
  private assessContentQuality(content: string): number {
    let score = 0;
    
    // Structure indicators (30 points)
    if (content.includes('# ') || content.includes('## ')) score += 15;
    if (content.includes('```')) score += 15;
    
    // Content depth (25 points) 
    if (content.length > 1000) score += 10;
    if (content.length > 5000) score += 15;
    
    // Code examples (20 points)
    const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).length;
    score += Math.min(codeBlocks * 5, 20);
    
    // Documentation indicators (25 points)
    const docKeywords = ['API', 'documentation', 'guide', 'tutorial'];
    docKeywords.forEach(keyword => {
      if (content.toLowerCase().includes(keyword.toLowerCase())) score += 5;
    });
    
    return Math.min(score, 100);
  }

  /**
   * Emit real-time progress updates
   */
  private emitProgress(currentUrl: string = ''): void {
    // Show pages being processed immediately, not just successfully crawled
    const displayCount = Math.max(this.processedCount, this.crawledPages.length);
    
    const progress: CrawlProgress = {
      currentUrl,
      pageCount: displayCount,
      totalDiscovered: this.allDiscoveredUrls.size || 1, // Show ALL discovered URLs
      inProgress: this.inProgress,
      queueSize: this.queue.size,
      status: this.isCompleted ? 'Completed' : 'Crawling pages'
    };

    // Update memory store for API polling
    memoryStore.updateCrawl(this.crawlId, {
      progress: {
        currentUrl: progress.currentUrl || this.startUrl,
        pageCount: progress.pageCount,
        totalPages: progress.totalDiscovered,
        status: progress.status
      }
    });

    // Emit event for real-time listeners
    this.emit('progress', progress);
  }

  /**
   * Handle queue becoming idle (all tasks completed)
   */
  private handleQueueIdle(): void {
    // Just log, don't finalize - that's done in the main crawl method
    console.log(`🎉 Queue processing completed. Crawled ${this.crawledPages.length} pages.`);
  }

  /**
   * Finalize crawl and generate results
   */
  private finalizeCrawl(): void {
    this.isCompleted = true;

    if (this.crawledPages.length === 0) {
      throw new Error('No content could be extracted from the provided URL(s)');
    }

    // Generate final markdown
    const markdown = this.generateMarkdown();
    const totalTokens = this.estimateTokens(markdown);

    // Update final results
    memoryStore.updateCrawl(this.crawlId, {
      status: 'completed',
      markdown,
      title: `Documentation from ${new URL(this.startUrl).hostname}`,
      metadata: {
        totalPages: this.crawledPages.length,
        totalTokens,
        crawlDate: new Date().toISOString(),
        qualityScore: Math.round(this.crawledPages.reduce((sum, page) => sum + page.qualityScore, 0) / this.crawledPages.length),
        sitemapUsed: this.options.useSitemap,
        robotsRespected: this.options.respectRobots
      },
      completedAt: new Date().toISOString(),
      progress: {
        currentUrl: '',
        pageCount: this.crawledPages.length,
        totalPages: this.crawledPages.length,
        status: 'Completed'
      }
    });

    console.log(`✅ Crawl completed: ${this.crawledPages.length} pages, ${totalTokens} tokens`);
    this.emit('completed', this.crawledPages);
  }

  /**
   * Generate final markdown from all crawled pages
   */
  private generateMarkdown(): string {
    const pages = this.crawledPages
      .sort((a, b) => b.qualityScore - a.qualityScore) // Best quality first
      .slice(0, this.options.maxPages);

    let markdown = `# Documentation from ${new URL(this.startUrl).hostname}\n\n`;
    markdown += `*Crawled ${pages.length} pages on ${new Date().toLocaleDateString()}*\n\n`;
    markdown += `---\n\n`;

    for (const page of pages) {
      markdown += `## ${page.title}\n\n`;
      markdown += `**Source:** ${page.url}\n`;
      markdown += `**Quality Score:** ${page.qualityScore}/100\n\n`;
      markdown += page.content;
      markdown += `\n\n---\n\n`;
    }

    return markdown;
  }

  /**
   * Estimate token count for content
   */
  private estimateTokens(content: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(content.length / 4);
  }

  /**
   * Get current crawl statistics
   */
  getStats() {
    return {
      processed: this.processed,
      inProgress: this.inProgress,
      queueSize: this.queue.size,
      totalDiscovered: this.visited.size,
      totalCrawled: this.crawledPages.length,
      isCompleted: this.isCompleted
    };
  }

  /**
   * Stop the crawler gracefully
   */
  async stop(): Promise<void> {
    console.log('🛑 Stopping crawler gracefully...');
    this.queue.clear();
    await this.queue.onIdle();
    this.isCompleted = true;
    console.log('✅ Crawler stopped');
  }

  /**
   * Get all crawled pages
   */
  getPages(): CrawledPage[] {
    return this.crawledPages;
  }

  /**
   * Check if URL should be crawled based on include/exclude filters
   * Following Firecrawl's philosophy of user control
   */
  private shouldCrawlUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      
      // Debug logging available in regression tests
      
      // If include paths are specified, URL must match at least one
      if (this.options.includePaths && this.options.includePaths.length > 0) {
        const included = this.options.includePaths.some(pattern => {
          try {
            const matches = new RegExp(pattern).test(path);
            return matches;
          } catch {
            return path.includes(pattern); // Fallback to simple string match
          }
        });
        if (!included) {
          return false;
        }
      }
      
      // If exclude paths are specified, URL must not match any
      if (this.options.excludePaths && this.options.excludePaths.length > 0) {
        const excluded = this.options.excludePaths.some(pattern => {
          try {
            const matches = new RegExp(pattern).test(path);
            return matches;
          } catch {
            return path.includes(pattern); // Fallback to simple string match
          }
        });
        if (excluded) {
          return false;
        }
      }
      
      return true;
    } catch {
      return false;
    }
  }
}