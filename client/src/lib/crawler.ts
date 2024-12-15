import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';

// Initialize Turndown for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

// Configure Turndown to handle code blocks better
turndownService.addRule('fencedCodeBlock', {
  filter: ['pre', 'code'],
  replacement: function(content, node) {
    const language = node.getAttribute('class')?.replace('language-', '') || '';
    return `\n\`\`\`${language}\n${content}\n\`\`\`\n`;
  }
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

export async function fetchPage(url: string, retries = 3): Promise<string> {
  await rateLimit();
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'DocsPasta Documentation Crawler - https://docspasta.com'
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

export function extractLinks(html: string, baseUrl: string): string[] {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  // Common documentation path patterns for prioritization
  const docPatterns = [
    '/docs/',
    '/documentation/',
    '/guide/',
    '/tutorial/',
    '/reference/',
    '/manual/',
    '/learn/',
    '/api/',
    '/getting-started',
    '/quickstart'
  ];
  
  // Get all links from the page
  const allLinks = Array.from(doc.querySelectorAll('a[href]'));
  
  // Process and filter links
  const links = allLinks
    .map(a => a.getAttribute('href'))
    .filter((href): href is string => !!href)
    .map(href => {
      try {
        return new URL(href, baseUrl).toString();
      } catch {
        return null;
      }
    })
    .filter((url): url is string => {
      if (!url) return false;
      try {
        const parsedUrl = new URL(url);
        const baseUrlObj = new URL(baseUrl);
        
        // Must be same hostname
        if (parsedUrl.hostname !== baseUrlObj.hostname) return false;
        
        // Exclude common non-content URLs
        const excludePatterns = [
          '/cdn-cgi/',
          '/wp-admin/',
          '/wp-content/',
          '/assets/',
          '/static/',
          '/login',
          '/logout',
          '/signup',
          '/register',
          '.jpg',
          '.jpeg',
          '.png',
          '.gif',
          '.css',
          '.js'
        ];
        
        if (excludePatterns.some(pattern => url.toLowerCase().includes(pattern))) {
          return false;
        }
        
        return true;
      } catch {
        return false;
      }
    });
    
  // Sort links to prioritize documentation-like paths
  return Array.from(new Set(links)).sort((a, b) => {
    const aIsDoc = docPatterns.some(pattern => a.toLowerCase().includes(pattern));
    const bIsDoc = docPatterns.some(pattern => b.toLowerCase().includes(pattern));
    return bIsDoc ? 1 : aIsDoc ? -1 : 0;
  });

  return Array.from(new Set(links));
}

export function extractTitle(html: string): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  // Try different title sources in order of preference
  const title = 
    // Look for a specific title in the main content
    doc.querySelector('main h1, article h1, .content h1')?.textContent ||
    // Look for page-specific title elements
    doc.querySelector('[class*="title"], [class*="heading"]')?.textContent ||
    // Fall back to the document title
    doc.querySelector('title')?.textContent?.split('|')[0]?.trim() ||
    'Untitled Page';
  
  return title;
}

export function extractMainContent(html: string): { content: string, isDocPage: boolean } {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  // Try to find the main content area
  const mainContent =
    doc.querySelector('main') ||
    doc.querySelector('article') ||
    doc.querySelector('[role="main"]') ||
    doc.querySelector('.content') ||
    doc.querySelector('.documentation') ||
    doc.querySelector('[class*="content"]') ||
    doc.querySelector('[class*="docs"]');
    
  let contentElement = mainContent;
  if (!contentElement) {
    contentElement = doc.querySelector('body');
  }
  
  if (!contentElement) {
    return { content: '', isDocPage: false };
  }

  // Remove non-content elements before processing
  [
    'nav', 'header', 'footer', 
    '.nav', '.navigation', '.sidebar', '.menu', '.header', '.footer',
    'style', 'script', 'noscript', // Remove styles and scripts
    '[role="navigation"]', '[role="complementary"]', // Remove ARIA-marked navigation
    '.table-of-contents', '.toc', // Common table of contents
    '.breadcrumbs', '.breadcrumb', // Navigation breadcrumbs
    '[class*="menu"]', '[class*="nav"]', // Any menu or navigation classes
  ].forEach(selector => {
    contentElement.querySelectorAll(selector).forEach(el => el.remove());
  });

  // Remove style attributes and CSS variables
  contentElement.querySelectorAll('*').forEach(el => {
    el.removeAttribute('style');
    el.removeAttribute('class');
  });
  
  if (!contentElement) {
    return { content: '', isDocPage: false };
  }

  // Check if this looks like a documentation page
  const isDocPage = Boolean(
    contentElement.querySelector('pre code') || // Has code blocks
    contentElement.querySelector('h1,h2,h3') || // Has headings
    /\b(api|function|method|parameter|return|example)\b/i.test(contentElement.textContent || '') // Has common doc terms
  );

  // Convert to markdown
  const markdown = turndownService.turndown(contentElement.innerHTML);
  
  // Format content in a structured way
  const formattedContent = `================================================================
Documentation Page
================================================================
Title: ${extractTitle(html)}
URL: ${contentElement.baseURI || 'Unknown'}
Type: Documentation
Format: Markdown

================================================================
Content
================================================================

${markdown}

================================================================`;
  
  return {
    content: formattedContent,
    isDocPage
  };
}
