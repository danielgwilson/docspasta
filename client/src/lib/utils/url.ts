import crypto from 'crypto';

/**
 * Normalize a URL by removing query parameters, hash fragments,
 * and trailing slashes, and converting to lowercase.
 */
export function normalizeUrl(url: string, baseUrl: string, followExternalLinks: boolean): string {
  try {
    // Ensure URL has a protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/$/, '').toLowerCase();
    
    // Only check external links if we have a baseUrl
    if (baseUrl && !followExternalLinks) {
      try {
        const baseUrlParsed = new URL(baseUrl);
        if (parsed.origin !== baseUrlParsed.origin) {
          return '';
        }
      } catch {
        // If baseUrl is invalid, continue with the original URL
      }
    }
    
    return parsed.toString();
  } catch (error) {
    console.error('Failed to parse URL:', url, error);
    throw new Error(`Failed to parse URL: ${url}. Please make sure you entered a valid URL.`);
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