import crypto from 'crypto';

/**
 * Normalize a URL by removing query parameters, hash fragments,
 * and trailing slashes, and converting to lowercase.
 */
export function normalizeUrl(url: string, baseUrl: string, followExternalLinks: boolean): string {
  try {
    // Basic validation
    if (!url?.trim() || url === '/' || url === '#' || url.includes('javascript:')) {
      return '';
    }

    // Clean up input URL
    url = url.trim().replace(/([^:]\/)\/+/g, '$1');

    // Handle relative URLs and add protocol if missing
    if (url.startsWith('//')) {
      url = 'https:' + url;
    } else if (url.startsWith('/')) {
      const base = new URL(baseUrl);
      url = `${base.origin}${url}`;
    } else if (!url.match(/^https?:\/\//)) {
      url = 'https://' + url.replace(/^:?\/?\/?/, '');
    }
    
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/$/, '').toLowerCase();
    
    if (!followExternalLinks && baseUrl) {
      const baseUrlParsed = new URL(baseUrl);
      if (parsed.origin !== baseUrlParsed.origin) {
        return '';
      }
    }
    
    return parsed.toString();
  } catch (error) {
    return '';
  }
}

/**
 * Generate a fingerprint for URL deduplication.
 * If includeScheme is false, strips the protocol for scheme-agnostic comparison.
 */
export function generateFingerprint(url: string, includeScheme = true): string {
  const parsed = new URL(url);
  parsed.hash = '';
  parsed.search = '';
  
  let urlForFingerprint = parsed.toString();
  if (!includeScheme) {
    urlForFingerprint = urlForFingerprint.replace(/^(https?):\/\//, '');
  }
  
  return crypto.createHash('sha1').update(urlForFingerprint).digest('hex');
}

/**
 * Checks if a URL is likely to be a documentation page based on
 * path patterns and extensions.
 */
export function isValidDocumentationUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  
  // Skip binary and asset files
  const skipExtensions = [
    '.jpg', '.jpeg', '.png', '.gif', '.css', '.js', 
    '.xml', '.pdf', '.zip', '.tar', '.gz', '.mp4'
  ];
  
  if (skipExtensions.some(ext => normalized.endsWith(ext))) {
    return false;
  }
  
  // Skip system and admin paths
  const skipPaths = [
    '/cdn-cgi/', '/__/', '/wp-admin/', '/wp-includes/',
    '/login', '/signup', '/register', '/account/'
  ];
  
  if (skipPaths.some(path => normalized.includes(path))) {
    return false;
  }
  
  // Check for documentation-related patterns
  const docPatterns = [
    '/docs/', '/documentation/', '/guide/', '/reference/',
    '/manual/', '/learn/', '/tutorial/', '/api/',
    '/getting-started', '/quickstart', '/introduction',
    '/overview', '/start', '/examples', '/usage'
  ];
  
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.toLowerCase();
    
    // Always allow the root path and known doc patterns
    return path === '/' || 
           path === '/index.html' ||
           docPatterns.some(pattern => path.includes(pattern)) ||
           // Allow paths that look like documentation sections
           /^\/[\w-]+(?:\/[\w-]+)*\/?$/.test(path);
  } catch {
    return false;
  }
}