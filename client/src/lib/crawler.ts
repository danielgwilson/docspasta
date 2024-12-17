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
      const parsed = new URL(url, this.baseUrl);
      // Remove hash and search params
      parsed.hash = '';
      parsed.search = '';
      return parsed.toString().replace(/\/$/, '');
    } catch {
      return '';
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
    
    // Get all links, excluding navigation elements
    return Array.from(doc.querySelectorAll('a[href]'))
      .filter(a => {
        // Skip navigation links
        if (this.options.excludeNavigation) {
          const isInNav = 
            a.closest('nav') ||
            a.closest('header') ||
            a.closest('footer') ||
            a.closest('[role="navigation"]') ||
            a.closest('.navigation') ||
            a.closest('.menu') ||
            a.closest('.nav');
          
          if (isInNav) return false;
        }
        
        return true;
      })
      .map(a => {
        const href = a.getAttribute('href');
        if (!href) return null;
        
        try {
          return this.normalizeUrl(href);
        } catch {
          return null;
        }
      })
      .filter((url): url is string => {
        if (!url) return false;
        return this.isValidDocumentationUrl(url);
      });
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
    while (this.queue.length > 0 && this.visited.size < this.options.maxPages) {
      const url = this.queue.shift()!;
      const normalizedUrl = this.normalizeUrl(url);
      
      // Skip if already visited
      if (this.visited.has(normalizedUrl)) {
        continue;
      }
      
      try {
        const html = await this.fetchPage(url);
        const { content, title, isDocPage } = this.extractMainContent(html);
        
        if (!isDocPage) {
          continue;
        }
        
        // Generate content hash for duplicate detection
        const contentHash = this.generateContentHash(content);
        
        // Check for duplicate content
        const isDuplicate = Array.from(this.visited.values())
          .some(page => page.contentHash === contentHash);
        
        if (isDuplicate) {
          continue;
        }
        
        // Store the visited page
        this.visited.set(normalizedUrl, {
          url: normalizedUrl,
          contentHash,
          title
        });
        
        // Extract and queue new links
        const newLinks = this.extractLinks(html, url)
          .filter(link => !this.visited.has(this.normalizeUrl(link)));
        
        this.queue.push(...newLinks);
        
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
      }
    }
  }
}
