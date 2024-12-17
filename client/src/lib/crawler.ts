import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';

// Initialize Turndown for Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
  strongDelimiter: '**'
});

// Rate limiting utilities
const RATE_LIMIT = 1000; // 1 request per second
let lastRequestTime = 0;

async function rateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();
}

// Documentation URL patterns
const DOC_PATTERNS = [
  '/docs/',
  '/documentation/',
  '/guide/',
  '/reference/',
  '/manual/',
  '/learn/',
  '/tutorial/',
  '/api/',
  '/getting-started',
  '/quickstart',
  '/introduction',
];

// URL patterns to skip
const SKIP_PATTERNS = [
  // Infrastructure and system paths
  '/cdn-cgi/',
  '/__/',
  '/wp-admin/',
  '/wp-content/',
  '/wp-includes/',
  '/assets/',
  '/static/',
  '/dist/',
  '/build/',
  
  // Authentication and user pages
  '/login',
  '/signup',
  '/register',
  '/account/',
  '/profile/',
  
  // Media files
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.css',
  '.js',
  '.xml',
  '.pdf',
];

interface CrawlOptions {
  maxPages?: number;
  includeCodeBlocks?: boolean;
  excludeNavigation?: boolean;
  followExternalLinks?: boolean;
}

interface VisitedPage {
  url: string;
  contentHash: string;
  title: string;
}

export class DocumentationCrawler {
  private visited = new Map<string, VisitedPage>();
  private queue: string[] = [];
  private baseUrl: string;
  private options: Required<CrawlOptions>;

  constructor(startUrl: string, options: CrawlOptions = {}) {
    this.baseUrl = new URL(startUrl).origin;
    this.options = {
      maxPages: options.maxPages ?? 20,
      includeCodeBlocks: options.includeCodeBlocks ?? true,
      excludeNavigation: options.excludeNavigation ?? true,
      followExternalLinks: options.followExternalLinks ?? false,
    };
    this.queue.push(startUrl);
  }

  private normalizeUrl(url: string): string {
    try {
      // Handle relative URLs and normalize them
      const parsed = new URL(url, this.baseUrl);
      
      // Remove hash and search params
      parsed.hash = '';
      parsed.search = '';
      
      // Normalize pathname (remove trailing slash and normalize case)
      parsed.pathname = parsed.pathname.replace(/\/$/, '').toLowerCase();
      
      // For absolute URLs, ensure they're in the same domain
      if (!this.options.followExternalLinks && parsed.origin !== this.baseUrl) {
        return '';
      }
      
      return parsed.toString();
    } catch {
      return '';
    }
  }

  private isSameDomain(url: string): boolean {
    try {
      return new URL(url).origin === new URL(this.baseUrl).origin;
    } catch {
      return false;
    }
  }

  private async fetchPage(url: string, retries = 3): Promise<string> {
    await rateLimit();
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Documentation Crawler - Friendly Bot'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch page: ${response.statusText}`);
        }
        
        return response.text();
      } catch (error) {
        if (attempt === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
    
    throw new Error('Failed to fetch page after multiple retries');
  }

  private isValidDocumentationUrl(url: string): boolean {
    const normalized = url.toLowerCase();
    
    // Skip if matches any skip patterns
    if (SKIP_PATTERNS.some(pattern => normalized.includes(pattern))) {
      return false;
    }
    
    // Always allow if matches documentation patterns
    if (DOC_PATTERNS.some(pattern => normalized.includes(pattern))) {
      return true;
    }
    
    // Additional validation for non-doc-pattern URLs
    try {
      const urlObj = new URL(url);
      
      // Only allow same domain unless followExternalLinks is true
      if (!this.options.followExternalLinks && urlObj.hostname !== new URL(this.baseUrl).hostname) {
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  }

  private extractLinks(html: string, baseUrl: string): string[] {
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    
    // Get all links
    const links = new Set<string>();
    
    // Process all anchor tags
    Array.from(doc.querySelectorAll('a[href]')).forEach(a => {
      // Skip navigation links if configured
      if (this.options.excludeNavigation) {
        const isInNav = 
          a.closest('nav, header, footer, [role="navigation"], .navigation, .menu, .nav, .sidebar, .toc');
        if (isInNav) return;
      }
      
      const href = a.getAttribute('href');
      if (!href) return;
      
      // Skip anchors and javascript links
      if (href.startsWith('#') || href.startsWith('javascript:')) return;
      
      // Normalize the URL
      const normalizedUrl = this.normalizeUrl(href);
      if (!normalizedUrl) return;
      
      // Apply documentation-specific filtering
      if (this.isValidDocumentationUrl(normalizedUrl)) {
        links.add(normalizedUrl);
      }
    });
    
    return Array.from(links);
  }

  private generateContentHash(content: string): string {
    // Create a simple hash of the content to detect duplicates
    // This ignores whitespace and case to catch near-duplicates
    return content
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100); // Use first 100 chars for hash
  }

  private extractMainContent(html: string): { content: string, title: string, isDocPage: boolean } {
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    
    // Try to find the main content container
    const selectors = [
      'article[role="main"]',
      'main[role="main"]',
      'div[role="main"]',
      'main',
      'article',
      '.content',
      '.article-content',
      '.markdown-body',
      '#content',
      '#main'
    ];
    
    let mainElement = null;
    
    // Try each selector
    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      if (element && element.textContent?.trim()) {
        mainElement = element;
        break;
      }
    }
    
    // If no main content found, look for the largest content block
    if (!mainElement) {
      const contentBlocks = Array.from(doc.querySelectorAll('div, section'))
        .filter(el => {
          const text = el.textContent || '';
          const hasParagraphs = el.querySelectorAll('p').length > 0;
          const hasHeaders = el.querySelectorAll('h1, h2, h3, h4, h5, h6').length > 0;
          return text.length > 200 && (hasParagraphs || hasHeaders);
        })
        .sort((a, b) => (b.textContent?.length || 0) - (a.textContent?.length || 0));
      
      mainElement = contentBlocks[0] || doc.body;
    }
    
    if (!mainElement) {
      return { content: '', title: '', isDocPage: false };
    }
    
    // Clean up the content
    const removeSelectors = [
      'script',
      'style',
      'iframe',
      'form',
      '.advertisement',
      '#disqus_thread',
      '.comments',
      '.social-share'
    ];
    
    removeSelectors.forEach(selector => {
      mainElement?.querySelectorAll(selector).forEach(el => el.remove());
    });
    
    // Handle navigation elements
    if (this.options.excludeNavigation) {
      mainElement.querySelectorAll('nav, [role="navigation"], .navigation, .menu').forEach(nav => {
        if (nav.querySelectorAll('p, h1, h2, h3, h4, h5, h6').length === 0) {
          nav.innerHTML = '{{ NAVIGATION }}';
        }
      });
    }
    
    // Extract title
    const title = 
      doc.querySelector('main h1, article h1')?.textContent ||
      doc.querySelector('h1')?.textContent ||
      doc.querySelector('title')?.textContent?.split('|')[0]?.trim() ||
      'Untitled Page';
    
    // Convert to markdown
    const markdown = turndownService.turndown(mainElement.innerHTML);
    
    // Structure the output
    const output = `================================================================
Documentation Page
================================================================
Title: ${title}
URL: ${mainElement.baseURI || 'Unknown'}
Type: Documentation
Format: Markdown

================================================================
Content
================================================================

${markdown}

================================================================`;
    
    // Determine if this is a documentation page
    const isDocPage = Boolean(
      mainElement.querySelector('h1, h2, h3') ||
      mainElement.querySelector('pre code') ||
      (mainElement.textContent?.length || 0) > 500
    );
    
    return { content: output, title, isDocPage };
  }

  public async *crawl() {
    const processingQueue = new Set<string>();
    
    while (this.queue.length > 0 && this.visited.size < this.options.maxPages) {
      const url = this.queue.shift()!;
      const normalizedUrl = this.normalizeUrl(url);
      
      // Skip invalid URLs
      if (!normalizedUrl) continue;
      
      // Skip if already visited or currently processing
      if (this.visited.has(normalizedUrl) || processingQueue.has(normalizedUrl)) {
        continue;
      }
      
      // Mark as being processed
      processingQueue.add(normalizedUrl);
      
      try {
        const html = await this.fetchPage(url);
        
        // Extract and queue new links before processing content
        // This ensures we discover links even if content processing fails
        const newLinks = this.extractLinks(html, url)
          .filter(link => {
            const normalized = this.normalizeUrl(link);
            return normalized && 
                   !this.visited.has(normalized) && 
                   !processingQueue.has(normalized);
          });
        
        // Add new links to the beginning of the queue for breadth-first traversal
        this.queue.unshift(...newLinks);
        
        // Process the content
        const { content, title, isDocPage } = this.extractMainContent(html);
        
        if (!isDocPage) {
          processingQueue.delete(normalizedUrl);
          continue;
        }
        
        // Generate content hash for duplicate detection
        const contentHash = this.generateContentHash(content);
        
        // Check for duplicate content
        const isDuplicate = Array.from(this.visited.values())
          .some(page => page.contentHash === contentHash);
        
        if (isDuplicate) {
          processingQueue.delete(normalizedUrl);
          continue;
        }
        
        // Store the visited page
        this.visited.set(normalizedUrl, {
          url: normalizedUrl,
          contentHash,
          title
        });
        
        // Yield the processed page
        yield {
          url: normalizedUrl,
          title,
          content,
          status: "complete"
        };
        
      } catch (error: any) {
        yield {
          url,
          title: url,
          content: "",
          status: "error",
          error: error.message
        };
      } finally {
        processingQueue.delete(normalizedUrl);
      }
    }
  }
}
