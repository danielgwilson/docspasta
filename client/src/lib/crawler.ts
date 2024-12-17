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
  br: '\n',
  blankReplacement: (content, node) => {
    // Check if node is a block element based on display style
    const isBlock = node instanceof HTMLElement && 
      (window.getComputedStyle(node).display === 'block' ||
       ['div', 'p', 'section', 'article'].includes(node.tagName.toLowerCase()));
    return isBlock ? '\n\n' : '';
  },
  keepReplacement: (content, node) => {
    // Check if node is a block element based on display style
    const isBlock = node instanceof HTMLElement && 
      (window.getComputedStyle(node).display === 'block' ||
       ['div', 'p', 'section', 'article'].includes(node.tagName.toLowerCase()));
    return isBlock ? `\n\n${content}\n\n` : content;
  }
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

// Function to generate content fingerprint for duplicate detection
function generateFingerprint(content: string): string {
  return content
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 100); // Use first 100 chars for fingerprint
}

// Cache for duplicate section detection
const sectionFingerprints = new Map<string, string>();

// Common section patterns for replacement
const commonSections = {
  navigation: {
    patterns: [
      /(?:Navigation|Menu|Site Map)[\s\S]{0,500}(?:Home|About|Contact|Documentation)/i,
      /<nav[\s\S]*?<\/nav>/i,
      /<header[\s\S]*?<\/header>/i
    ],
    placeholder: '{{ NAVIGATION }}'
  },
  footer: {
    patterns: [
      /(?:Footer|Copyright|All rights reserved)[\s\S]{0,500}(?:\d{4}|Terms|Privacy)/i,
      /<footer[\s\S]*?<\/footer>/i
    ],
    placeholder: '{{ FOOTER }}'
  },
  sidebar: {
    patterns: [
      /(?:Table of Contents|On this page|In this article)[\s\S]{0,300}(?:<ul|<ol)/i,
      /<aside[\s\S]*?<\/aside>/i
    ],
    placeholder: '{{ SIDEBAR }}'
  }
};

export function extractMainContent(html: string): { content: string, isDocPage: boolean } {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  // First, try to find the main content container using a prioritized list of selectors
  const mainSelectors = [
    // Semantic main content containers
    'main[role="main"]',
    'article[role="article"]',
    '[role="main"]',
    'main',
    'article:not(footer article)',
    
    // Documentation-specific containers
    '.documentation-content',
    '.docs-content',
    '.markdown-body',
    '.article-content',
    
    // Generic content containers, being more specific to avoid nav/header/footer
    '.content:not(.nav-content):not(.footer-content)',
    '.main-content:not(.nav-content)',
    '[class*="content"]:not([class*="nav"]):not([class*="header"]):not([class*="footer"])',
    '[class*="docs"]:not([class*="nav"]):not([class*="header"]):not([class*="footer"])'
  ];
  
  let contentElement = null;
  for (const selector of mainSelectors) {
    contentElement = doc.querySelector(selector);
    if (contentElement) break;
  }
  
  // If no main content found, look for the most content-rich section
  if (!contentElement) {
    const contentSections = Array.from(doc.querySelectorAll('div, section'))
      .filter(el => {
        // Must have multiple paragraphs or significant content
        const hasMultipleParagraphs = el.querySelectorAll('p').length > 1;
        const hasHeaders = el.querySelector('h1, h2, h3, h4, h5, h6');
        const hasCodeBlocks = el.querySelector('pre, code');
        const hasSignificantText = (el.textContent || '').length > 500;
        
        return (hasMultipleParagraphs || hasHeaders || hasCodeBlocks) && hasSignificantText;
      })
      .sort((a, b) => {
        // Score sections based on content indicators
        const score = (el: Element) => {
          let value = 0;
          value += (el.querySelectorAll('p').length * 10);
          value += (el.querySelectorAll('h1, h2, h3, h4, h5, h6').length * 15);
          value += (el.querySelectorAll('pre, code').length * 20);
          value += (el.querySelectorAll('ul, ol').length * 5);
          value += ((el.textContent || '').length / 100);
          return value;
        };
        return score(b) - score(a);
      });
    
    contentElement = contentSections[0] || doc.querySelector('body');
  }
  
  if (!contentElement) {
    return { content: '', isDocPage: false };
  }

  // Keep track of identified navigation sections
  const navigationSections = new Set<Element>();
  
  // First pass: identify navigation and common sections
  Array.from(contentElement.querySelectorAll('*')).forEach(section => {
    // Skip text nodes and small elements
    if (section.nodeType !== 1) return;
    
    // Only process elements that look like structural containers
    const isContainer = 
      section instanceof HTMLElement && 
      (section.tagName === 'DIV' || 
       section.tagName === 'NAV' ||
       section.tagName === 'HEADER' ||
       section.tagName === 'FOOTER' ||
       section.tagName === 'ASIDE' ||
       section.tagName === 'SECTION');
    
    if (!isContainer) return;

    // Check if this is definitely a navigation element
    const isDefinitelyNavigation = 
      section.tagName === 'NAV' ||
      section.getAttribute('role') === 'navigation' ||
      (section.className && /\b(navigation|navbar|nav-menu|main-nav)\b/i.test(section.className));

    if (isDefinitelyNavigation) {
      navigationSections.add(section);
      section.innerHTML = '{{ NAVIGATION }}';
      return;
    }

    // For other elements, check content characteristics
    const hasContentValue = 
      section.querySelector('p, pre, code, h1, h2, h3, h4, h5, h6') ||
      (section.textContent?.trim().length || 0) > 200;

    const looksLikeNavigation = 
      section.querySelectorAll('a').length > 5 &&
      !hasContentValue &&
      (
        /\b(menu|nav|sidebar|toc|contents)\b/i.test(section.className || '') ||
        /\b(menu|nav|sidebar|toc|contents)\b/i.test(section.id || '') ||
        section.querySelector('.menu, .nav, .sidebar, .toc, .contents')
      );

    if (looksLikeNavigation) {
      navigationSections.add(section);
      section.innerHTML = '{{ NAVIGATION }}';
      return;
    }

    // Check for footer-like sections
    const isFooter = 
      section.tagName === 'FOOTER' ||
      (section.className && /\b(footer|bottom|copyright)\b/i.test(section.className));

    if (isFooter && !hasContentValue) {
      navigationSections.add(section);
      section.innerHTML = '{{ FOOTER }}';
      return;
    }
  });
  
  // Second pass: handle duplicate sections, but only for navigation elements
  navigationSections.forEach(section => {
    const fingerprint = generateFingerprint(section.innerHTML);
    if (sectionFingerprints.has(fingerprint)) {
      section.remove();
    } else {
      sectionFingerprints.set(fingerprint, section.innerHTML);
    }
  });

  // Remove definitely non-content elements first
  const removeSelectors = [
    // Technical elements
    'style', 'script', 'noscript', 'link', 'meta',
    
    // Ads and tracking
    '[id*="google_ads"]', '[id*="carbonads"]',
    '[data-analytics]', '[class*="tracking"]',
    '.advertisement', '.sponsored-content',
    
    // Social and interactive
    '.share-buttons', '.social-share',
    '.comments-section', '.feedback-form',
  ];

  removeSelectors.forEach(selector => {
    contentElement.querySelectorAll(selector).forEach(el => el.remove());
  });

  // Clean up remaining elements
  Array.from(contentElement.querySelectorAll('*')).forEach(el => {
    if (!(el instanceof HTMLElement)) return;

    // Keep elements that definitely contain content
    const hasContent = 
      el.querySelector('p, pre, code, h1, h2, h3, h4, h5, h6, img, table') ||
      (el.tagName === 'P' && el.textContent?.trim()) ||
      (el.tagName === 'PRE' && el.textContent?.trim()) ||
      (el.tagName === 'CODE' && el.textContent?.trim()) ||
      (/^H[1-6]$/.test(el.tagName) && el.textContent?.trim());

    // Remove empty or purely decorative elements
    const isEmpty = !el.textContent?.trim() && !hasContent;
    const isPurelyDecorative = 
      el.getAttribute('aria-hidden') === 'true' ||
      el.getAttribute('role') === 'presentation' ||
      (el.className && /\b(decorative|icon|separator|spacer)\b/i.test(el.className));

    if (isEmpty || isPurelyDecorative) {
      el.remove();
      return;
    }

    // Clean up attributes, keeping only essential ones
    const keepAttributes = ['href', 'src', 'alt', 'title', 'lang', 'id'];
    Array.from(el.attributes).forEach(attr => {
      if (!keepAttributes.includes(attr.name)) {
        el.removeAttribute(attr.name);
      }
    });
  });

  // Clean up elements and handle link whitespace
  contentElement.querySelectorAll('*').forEach(el => {
    // Clean up link elements specifically
    if (el.tagName === 'A') {
      const textContent = el.textContent?.trim();
      if (textContent) {
        el.textContent = textContent; // Remove extra whitespace within link text
      }
    }
    
    // Remove non-content attributes
    const keepAttrs = ['href', 'src', 'alt', 'title', 'lang'];
    Array.from(el.attributes).forEach(attr => {
      if (!keepAttrs.includes(attr.name)) {
        el.removeAttribute(attr.name);
      }
    });
    
    // Enhanced whitespace normalization
    if (el.childNodes) {
      el.childNodes.forEach(node => {
        if (node.nodeType === 3) { // Text node
          let content = node.textContent || '';
          content = content
            .replace(/\s+/g, ' ') // Collapse multiple spaces
            .replace(/\n{2,}/g, '\n') // Collapse multiple newlines
            .replace(/^\s+|\s+$/g, '') // Trim start/end whitespace
            .trim();
          node.textContent = content;
        }
      });
    }
  });

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
