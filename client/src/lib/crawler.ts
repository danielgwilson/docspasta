import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';

// Initialize Turndown with optimized configuration
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
  strongDelimiter: '**',
  hr: '---',
  br: '  \n'
});

// Enhanced code block handling
turndownService.addRule('fencedCodeBlock', {
  filter: (node) => {
    return (
      node.nodeName === 'PRE' ||
      (node.nodeName === 'CODE' && node.parentNode?.nodeName !== 'PRE')
    );
  },
  replacement: function(content, node) {
    // Detect language from class or data attribute
    const language = 
      node.getAttribute('class')?.replace(/(language-|highlight-|lang-)/g, '') ||
      node.getAttribute('data-lang') ||
      '';
    
    // Clean up the content
    const cleanContent = content
      .replace(/^\n+|\n+$/g, '') // Remove leading/trailing newlines
      .replace(/\n\s+/g, '\n') // Remove extra whitespace at line starts
      .replace(/\t/g, '  ') // Convert tabs to spaces
      .trim();
    
    return `\n\`\`\`${language}\n${cleanContent}\n\`\`\`\n`;
  }
});

// Improved whitespace handling
turndownService.addRule('paragraph', {
  filter: 'p',
  replacement: function(content) {
    return '\n\n' + content.trim() + '\n\n';
  }
});

// Better list handling
turndownService.addRule('list', {
  filter: ['ul', 'ol'],
  replacement: function(content, node) {
    const isOrdered = node.nodeName === 'OL';
    const listItems = content
      .trim()
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean)
      .map((item, i) => isOrdered ? `${i + 1}. ${item}` : `- ${item}`)
      .join('\n');
    return '\n\n' + listItems + '\n\n';
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
  
  // Enhanced documentation path patterns
  const docPatterns = [
    '/docs/',
    '/documentation/',
    '/guide/',
    '/guides/',
    '/tutorial/',
    '/tutorials/',
    '/reference/',
    '/manual/',
    '/learn/',
    '/api/',
    '/getting-started',
    '/quickstart',
    '/introduction',
    '/overview',
    '/concepts/',
    '/examples/',
    '/faq/',
    '/troubleshooting/',
    '/best-practices/',
  ];
  
  // Get all links, excluding those in navigation elements
  const allLinks = Array.from(doc.querySelectorAll('a[href]')).filter(a => {
    const isInNavigation = 
      a.closest('nav') ||
      a.closest('header') ||
      a.closest('footer') ||
      a.closest('.navigation') ||
      a.closest('.menu') ||
      a.closest('.sidebar') ||
      a.closest('[role="navigation"]') ||
      a.closest('.breadcrumbs') ||
      a.closest('.toc') ||
      a.closest('[class*="menu"]') ||
      a.closest('[class*="nav"]');
    
    return !isInNavigation;
  });
  
  // Process and filter links with improved validation
  const links = allLinks
    .map(a => {
      const href = a.getAttribute('href');
      if (!href) return null;
      
      try {
        const url = new URL(href, baseUrl);
        // Normalize URL
        url.hash = '';
        url.search = '';
        // Remove trailing slash for consistency
        return url.toString().replace(/\/$/, '');
      } catch {
        return null;
      }
    })
    .filter((url): url is string => {
      if (!url) return false;
      
      try {
        const parsedUrl = new URL(url);
        const baseUrlObj = new URL(baseUrl);
        
        // Enhanced hostname validation
        if (parsedUrl.hostname !== baseUrlObj.hostname) return false;
        
        // Comprehensive exclusion patterns
        const excludePatterns = [
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
          '/node_modules/',
          
          // Authentication and user management
          '/login',
          '/logout',
          '/signup',
          '/register',
          '/signin',
          '/signout',
          '/auth/',
          '/oauth/',
          '/account/',
          '/profile/',
          '/password/',
          
          // Media and resource files
          '.jpg',
          '.jpeg',
          '.png',
          '.gif',
          '.svg',
          '.ico',
          '.css',
          '.js',
          '.json',
          '.xml',
          '.pdf',
          '.zip',
          '.tar',
          '.gz',
          
          // Analytics and tracking
          '/analytics/',
          '/tracking/',
          '/metrics/',
          '/stats/',
          
          // Common non-documentation paths
          '/cart/',
          '/checkout/',
          '/pricing/',
          '/download/',
          '/contact/',
          '/support/',
          '/terms/',
          '/privacy/',
          '/sitemap/',
          '/rss/',
          '/feed/',
          '/search/',
          
          // Social media
          '/share/',
          '/social/',
          '/follow/',
          
          // Version control
          '/.git/',
          '/.svn/',
        ];
        
        if (excludePatterns.some(pattern => 
          url.toLowerCase().includes(pattern.toLowerCase())
        )) {
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
  
  // Try to find the main content area with improved selector specificity
  const mainContent =
    doc.querySelector('main[role="main"]') ||
    doc.querySelector('article[role="article"]') ||
    doc.querySelector('[role="main"]') ||
    doc.querySelector('main') ||
    doc.querySelector('article:not(footer article)') ||
    doc.querySelector('.content:not(.nav-content):not(.footer-content)') ||
    doc.querySelector('.documentation:not(.nav-documentation)') ||
    doc.querySelector('[class*="content"]:not([class*="nav"]):not([class*="header"]):not([class*="footer"])') ||
    doc.querySelector('[class*="docs"]:not([class*="nav"]):not([class*="header"]):not([class*="footer"])');
    
  let contentElement = mainContent;
  if (!contentElement) {
    // If no main content area found, try to find the largest text block
    const textBlocks = Array.from(doc.querySelectorAll('div, section'))
      .filter(el => {
        const text = el.textContent || '';
        return text.length > 500 && // Minimum content length
               text.split(/[.!?]/).length > 5; // Minimum number of sentences
      })
      .sort((a, b) => (b.textContent || '').length - (a.textContent || '').length);
    
    contentElement = textBlocks[0] || doc.querySelector('body');
  }
  
  if (!contentElement) {
    return { content: '', isDocPage: false };
  }

  // Enhanced list of elements to remove
  const removeSelectors = [
    // Navigation elements
    'nav', 'header', 'footer', 
    '.nav', '.navigation', '.sidebar', '.menu', '.header', '.footer',
    '[role="navigation"]', '[role="complementary"]',
    '.table-of-contents', '.toc', 
    '.breadcrumbs', '.breadcrumb',
    '[class*="menu"]', '[class*="nav"]',
    
    // Social and interactive elements
    '.share', '.social', '.comments', '.related',
    '[class*="share"]', '[class*="social"]', '[class*="comment"]',
    
    // Advertisement and promotional content
    '.ad', '.ads', '.advertisement', '.sponsored',
    '[class*="ad-"]', '[class*="ads-"]', '[id*="google_ads"]',
    
    // Utility elements
    '.toolbar', '.tools', '.utility', '.print',
    '[class*="toolbar"]', '[class*="utility"]',
    
    // Technical elements
    'style', 'script', 'noscript', 'iframe',
    'link', 'meta', 'template', 'svg',
    
    // Dynamic content containers
    '[data-widget]', '[data-ad]', '[data-tracking]',
    '[id*="tracking"]', '[id*="analytics"]',
    
    // Sidebars and supplementary content
    'aside', '.aside', '.supplementary', '.secondary',
    '[role="complementary"]', '[role="banner"]'
  ];

  // Remove non-content elements
  removeSelectors.forEach(selector => {
    contentElement.querySelectorAll(selector).forEach(el => el.remove());
  });

  // Clean up elements
  contentElement.querySelectorAll('*').forEach(el => {
    // Remove non-content attributes
    const keepAttrs = ['href', 'src', 'alt', 'title', 'lang'];
    Array.from(el.attributes).forEach(attr => {
      if (!keepAttrs.includes(attr.name)) {
        el.removeAttribute(attr.name);
      }
    });
    
    // Normalize whitespace in text nodes
    if (el.childNodes) {
      el.childNodes.forEach(node => {
        if (node.nodeType === 3) { // Text node
          node.textContent = node.textContent?.replace(/\s+/g, ' ').trim();
        }
      });
    }
  });
  
  if (!contentElement) {
    return { content: '', isDocPage: false };
  }

  // Always consider pages with meaningful content as valid
  const isDocPage = Boolean(
    contentElement.querySelector('h1,h2,h3') || // Has headings
    contentElement.querySelector('article') || // Is an article
    contentElement.querySelector('main') || // Has main content
    contentElement.querySelector('section') || // Has sections
    contentElement.querySelector('p') || // Has paragraphs
    contentElement.querySelector('pre') // Has formatted content
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
