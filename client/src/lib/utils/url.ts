import crypto from 'crypto';

/**
 * Normalize a URL by removing query parameters, hash fragments,
 * and trailing slashes, and converting to lowercase.
 */
export function normalizeUrl(url: string, baseUrl: string, followExternalLinks: boolean): string {
  try {
    const parsed = new URL(url, baseUrl);
    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/$/, '').toLowerCase();
    
    if (!followExternalLinks && parsed.origin !== new URL(baseUrl).origin) {
      return '';
    }
    
    return parsed.toString();
  } catch {
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
  
  const skipPatterns = [
    '/cdn-cgi/', '/__/', '/wp-admin/', '/wp-content/',
    '/wp-includes/', '/assets/', '/static/', '/dist/',
    '/login', '/signup', '/register', '/account/',
    '.jpg', '.jpeg', '.png', '.gif', '.css', '.js', '.xml', '.pdf'
  ];
  
  if (skipPatterns.some(pattern => normalized.includes(pattern))) {
    return false;
  }
  
  const docPatterns = [
    '/docs/', '/documentation/', '/guide/', '/reference/',
    '/manual/', '/learn/', '/tutorial/', '/api/',
    '/getting-started', '/quickstart', '/introduction'
  ];
  
  if (docPatterns.some(pattern => normalized.includes(pattern))) {
    return true;
  }
  
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.length > 1;
  } catch {
    return false;
  }
}
