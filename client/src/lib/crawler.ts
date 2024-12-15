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
  
  // Common documentation path patterns
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
  
  // First, try to identify the main documentation navigation
  const possibleNavs = [
    ...Array.from(doc.querySelectorAll('nav')),
    ...Array.from(doc.querySelectorAll('[role="navigation"]')),
    ...Array.from(doc.querySelectorAll('.sidebar')),
    ...Array.from(doc.querySelectorAll('[class*="sidebar"]')),
    ...Array.from(doc.querySelectorAll('[class*="nav"]')),
  ];
  
  // Extract links from navigation and filter for documentation links
  const navLinks = possibleNavs.flatMap(nav => 
    Array.from(nav.querySelectorAll('a[href]'))
  );
  
  // Also get links from the main content area that might be "next" or "previous" links
  const contentLinks = Array.from(doc.querySelectorAll('main a[href], article a[href], .content a[href]'));
  
  // Combine and process all links
  const links = [...navLinks, ...contentLinks]
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
        
        // Check against documentation patterns
        return docPatterns.some(pattern => 
          url.toLowerCase().includes(pattern.toLowerCase())
        );
      } catch {
        return false;
      }
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
    
  // Remove non-content elements before processing
  ['nav', 'header', 'footer', '.nav', '.navigation', '.sidebar', '.menu', '.header', '.footer'].forEach(selector => {
    doc.querySelectorAll(selector).forEach(el => el.remove());
  });

  let contentElement = mainContent;
  if (!contentElement) {
    contentElement = doc.querySelector('body');
  }
  
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
