import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import crypto from 'crypto';
import { Anchor } from './utils/anchor';
import { Hierarchy } from './utils/hierarchy';

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

interface CrawlOptions {
  maxDepth?: number;
  includeCodeBlocks?: boolean;
  excludeNavigation?: boolean;
  followExternalLinks?: boolean;
  timeout?: number;
}

interface VisitedPage {
  url: string;
  fingerprint: string;
  depth: number;
  title: string;
  parent?: string;
  hierarchy: Record<string, string | null>;
  anchor?: string | null;
}

interface PageNode {
  url: string;
  depth: number;
  parent?: string;
  hierarchy?: Record<string, string | null>;
  anchor?: string | null;
}

export class DocumentationCrawler {
  private visited = new Map<string, VisitedPage>();
  private fingerprints = new Set<string>();
  private schemeFingerprints = new Set<string>();
  private queue: PageNode[] = [];
  private baseUrl: string;
  private options: Required<CrawlOptions>;
  private startTime: number;

  constructor(startUrl: string, options: CrawlOptions = {}) {
    this.baseUrl = new URL(startUrl).origin;
    this.options = {
      maxDepth: options.maxDepth ?? 5,
      includeCodeBlocks: options.includeCodeBlocks ?? true,
      excludeNavigation: options.excludeNavigation ?? true,
      followExternalLinks: options.followExternalLinks ?? false,
      timeout: options.timeout ?? 300000, // 5 minutes default
    };
    this.queue.push({ url: startUrl, depth: 0 });
    this.startTime = Date.now();
  }

  private isTimeoutReached(): boolean {
    return Date.now() - this.startTime > this.options.timeout;
  }

  private generateFingerprint(url: string, includeScheme = true): string {
    // Remove query parameters and fragments
    const normalizedUrl = new URL(url);
    normalizedUrl.search = '';
    normalizedUrl.hash = '';
    
    let urlForFingerprint = normalizedUrl.toString();
    
    // Make scheme-agnostic if requested
    if (!includeScheme) {
      urlForFingerprint = urlForFingerprint.replace(/^(https?):\/\//, '');
    }
    
    return crypto.createHash('sha1')
      .update(urlForFingerprint)
      .digest('hex');
  }

  private normalizeUrl(url: string): string {
    try {
      // Handle relative URLs and normalize them
      const parsed = new URL(url, this.baseUrl);
      
      // Remove hash and search params
      parsed.hash = '';
      parsed.search = '';
      
      // Normalize pathname
      parsed.pathname = parsed.pathname.replace(/\/$/, '').toLowerCase();
      
      // External link handling
      if (!this.options.followExternalLinks && parsed.origin !== this.baseUrl) {
        return '';
      }
      
      return parsed.toString();
    } catch {
      return '';
    }
  }

  private isValidDocumentationUrl(url: string): boolean {
    const normalized = url.toLowerCase();
    
    // Skip obvious non-documentation URLs
    const skipPatterns = [
      '/cdn-cgi/', '/__/', '/wp-admin/', '/wp-content/',
      '/wp-includes/', '/assets/', '/static/', '/dist/',
      '/login', '/signup', '/register', '/account/',
      '.jpg', '.jpeg', '.png', '.gif', '.css', '.js', '.xml', '.pdf'
    ];
    
    if (skipPatterns.some(pattern => normalized.includes(pattern))) {
      return false;
    }
    
    // Prioritize documentation URLs
    const docPatterns = [
      '/docs/', '/documentation/', '/guide/', '/reference/',
      '/manual/', '/learn/', '/tutorial/', '/api/',
      '/getting-started', '/quickstart', '/introduction'
    ];
    
    // Always allow documentation paths
    if (docPatterns.some(pattern => normalized.includes(pattern))) {
      return true;
    }
    
    // Additional validation
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.length > 1; // At least some path
    } catch {
      return false;
    }
  }

  private extractLinks(html: string, currentUrl: string, currentDepth: number): PageNode[] {
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    
    const newNodes: PageNode[] = [];
    const seenUrls = new Set<string>();
    
    // Process all anchor tags
    Array.from(doc.querySelectorAll('a[href]')).forEach(a => {
      // Skip navigation links if configured
      if (this.options.excludeNavigation) {
        const isInNav = a.closest(
          'nav, header, footer, [role="navigation"], ' +
          '.navigation, .menu, .nav, .sidebar, .toc'
        );
        if (isInNav) return;
      }
      
      const href = a.getAttribute('href');
      if (!href) return;
      
      // Skip anchors and javascript links
      if (href.startsWith('#') || href.startsWith('javascript:')) return;
      
      // Normalize URL
      const normalizedUrl = this.normalizeUrl(href);
      if (!normalizedUrl || seenUrls.has(normalizedUrl)) return;
      
      seenUrls.add(normalizedUrl);
      
      // Check if URL is valid for crawling
      if (this.isValidDocumentationUrl(normalizedUrl)) {
        newNodes.push({
          url: normalizedUrl,
          depth: currentDepth + 1,
          parent: currentUrl
        });
      }
    });
    
    return newNodes;
  }

  private extractMainContent(html: string): { 
    content: string, 
    title: string, 
    isDocPage: boolean,
    hierarchy: Record<string, string | null>,
    anchor: string | null
  } {
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    
    // Find main content container
    const selectors = [
      'article[role="main"]', 'main[role="main"]',
      'div[role="main"]', 'main', 'article',
      '.content', '.article-content', '.markdown-body',
      '#content', '#main'
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
    
    // Fallback to largest content block
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
    
    // Clean up content
    const removeSelectors = [
      'script', 'style', 'iframe', 'form',
      '.advertisement', '#disqus_thread',
      '.comments', '.social-share'
    ];
    
    removeSelectors.forEach(selector => {
      mainElement?.querySelectorAll(selector).forEach(el => el.remove());
    });
    
    // Handle navigation
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
    
    // Build hierarchy
    const hierarchy = Hierarchy.generateEmptyHierarchy();
    const levels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    
    levels.forEach((tag, index) => {
      const element = mainElement?.querySelector(tag);
      if (element) {
        hierarchy[`lvl${index}`] = element.textContent?.trim() || null;
      }
    });

    // Get anchor
    const anchor = Anchor.getAnchor(mainElement);
    
    const isDocPage = Boolean(
      mainElement.querySelector('h1, h2, h3') ||
      mainElement.querySelector('pre code') ||
      (mainElement.textContent?.length || 0) > 500
    );
    
    return { content: output, title, isDocPage, hierarchy, anchor };
  }

  public async *crawl() {
    const processingQueue = new Set<string>();
    
    while (this.queue.length > 0 && !this.isTimeoutReached()) {
      const node = this.queue.shift()!;
      const { url, depth, parent } = node;
      
      // Skip if depth exceeded
      if (depth > this.options.maxDepth) {
        continue;
      }
      
      // Generate fingerprints for deduplication
      const fingerprint = this.generateFingerprint(url, false);
      const schemeFingerprint = this.generateFingerprint(url, true);
      
      // Skip if already seen (either scheme-agnostic or scheme-specific)
      if (this.fingerprints.has(fingerprint) || processingQueue.has(url)) {
        continue;
      }
      
      // Track both fingerprints
      this.fingerprints.add(fingerprint);
      this.schemeFingerprints.add(schemeFingerprint);
      processingQueue.add(url);
      
      try {
        const html = await this.fetchPage(url);
        
        // Extract new links before processing content
        const newNodes = this.extractLinks(html, url, depth);
        
        // Add new nodes to the beginning for breadth-first traversal
        this.queue.unshift(...newNodes);
        
        // Process content
        const { content, title, isDocPage, hierarchy, anchor } = this.extractMainContent(html);
        
        if (!isDocPage) {
          continue;
        }
        
        // Store the visited page
        this.visited.set(url, {
          url,
          fingerprint,
          depth,
          title,
          parent,
          hierarchy,
          anchor
        });
        
        // Yield the processed page
        yield {
          url,
          title,
          content,
          depth,
          parent,
          hierarchy,
          hierarchyRadio: Hierarchy.getHierarchyRadio(hierarchy, 'content', ['lvl0', 'lvl1', 'lvl2', 'lvl3', 'lvl4', 'lvl5', 'lvl6']),
          anchor,
          status: "complete"
        };
        
      } catch (error: any) {
        yield {
          url,
          title: url,
          content: "",
          depth,
          parent,
          status: "error",
          error: error.message
        };
      } finally {
        processingQueue.delete(url);
      }
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
}
