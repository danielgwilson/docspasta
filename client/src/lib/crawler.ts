import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';

// Initialize Turndown with optimized configuration
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

export async function fetchPage(url: string, retries = 3): Promise<string> {
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

export function extractLinks(html: string, baseUrl: string): string[] {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  // Get all links and filter out navigation/utility links
  const links = Array.from(doc.querySelectorAll('a[href]'))
    .filter(a => {
      // Skip links in obvious navigation elements
      const isInNav = 
        a.closest('nav') ||
        a.closest('header') ||
        a.closest('footer') ||
        a.closest('[role="navigation"]') ||
        a.closest('.navigation') ||
        a.closest('.menu') ||
        a.closest('.nav');
      
      return !isInNav;
    })
    .map(a => {
      const href = a.getAttribute('href');
      if (!href) return null;
      
      try {
        const url = new URL(href, baseUrl);
        return url.toString();
      } catch {
        return null;
      }
    })
    .filter((url): url is string => {
      if (!url) return false;
      
      try {
        const parsedUrl = new URL(url);
        const baseUrlObj = new URL(baseUrl);
        
        // Only keep links to the same domain
        if (parsedUrl.hostname !== baseUrlObj.hostname) return false;
        
        // Skip common non-documentation URLs
        const skipPatterns = [
          '/wp-admin/',
          '/wp-content/',
          '/wp-includes/',
          '/assets/',
          '/static/',
          '/dist/',
          '/login',
          '/signup',
          '.jpg',
          '.jpeg',
          '.png',
          '.gif',
          '.css',
          '.js'
        ];
        
        return !skipPatterns.some(pattern => url.includes(pattern));
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
  return (
    doc.querySelector('main h1, article h1')?.textContent ||
    doc.querySelector('h1')?.textContent ||
    doc.querySelector('title')?.textContent?.split('|')[0]?.trim() ||
    'Untitled Page'
  );
}

export function extractMainContent(html: string): { content: string, isDocPage: boolean } {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  // Find main content container
  const selectors = [
    'article[role="main"]',
    'main[role="main"]',
    'div[role="main"]',
    'main',
    'article',
    '.content',
    '.article-content',
    '.post-content',
    '.entry-content',
    '.markdown-body',
    '#content',
    '#main'
  ];
  
  let mainElement = null;
  
  // Try each selector until we find content
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
    return { content: '', isDocPage: false };
  }
  
  // Remove clearly non-content elements
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
  
  // Mark navigation elements with placeholders
  mainElement.querySelectorAll('nav, [role="navigation"], .navigation, .menu').forEach(nav => {
    if (nav.querySelectorAll('p, h1, h2, h3, h4, h5, h6').length === 0) {
      nav.innerHTML = '{{ NAVIGATION }}';
    }
  });
  
  // Convert content to markdown
  const markdown = turndownService.turndown(mainElement.innerHTML);
  
  // Structure the output
  const output = `================================================================
Documentation Page
================================================================
Title: ${extractTitle(html)}
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
  
  return { content: output, isDocPage };
}