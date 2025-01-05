import crypto from 'crypto';

/**
 * Normalize a URL by resolving relative paths and handling edge cases
 */
export function normalizeUrl(
  href: string,
  baseUrl: string,
  followExternalLinks: boolean
): string | null {
  try {
    const url = new URL(href, baseUrl);
    const baseUrlObj = new URL(baseUrl);

    // Remove trailing slashes
    let normalized = url.href.replace(/\/$/, '');

    // Remove fragments unless it's an anchor link
    if (!href.startsWith('#')) {
      normalized = normalized.split('#')[0];
    }

    // Handle external links
    if (!followExternalLinks && url.origin !== baseUrlObj.origin) {
      return null;
    }

    // Skip URLs that are clearly not documentation
    if (url.pathname === '/' || url.pathname === '') {
      return null;
    }

    return normalized;
  } catch (error) {
    return null;
  }
}

/**
 * Generate a unique fingerprint for a URL
 */
export function generateFingerprint(
  url: string,
  includeFragment: boolean
): string {
  const urlObj = new URL(url);
  const parts = [
    urlObj.protocol,
    urlObj.hostname,
    urlObj.pathname.replace(/\/$/, ''),
    urlObj.search,
  ];

  if (includeFragment) {
    parts.push(urlObj.hash);
  }

  return crypto.createHash('sha1').update(parts.join('')).digest('hex');
}

/**
 * Check if a URL is likely to be a documentation page
 */
export function isValidDocumentationUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);

    // Skip common non-documentation paths
    const skipPaths = [
      '/assets/',
      '/images/',
      '/img/',
      '/css/',
      '/js/',
      '/fonts/',
      '/static/',
      '/media/',
    ];

    if (
      skipPaths.some((path) => urlObj.pathname.toLowerCase().includes(path))
    ) {
      return false;
    }

    // Skip common file extensions
    const skipExtensions = [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.svg',
      '.ico',
      '.css',
      '.js',
      '.map',
      '.mp4',
      '.webm',
      '.mp3',
      '.wav',
      '.ttf',
      '.woff',
      '.woff2',
      '.eot',
    ];

    if (
      skipExtensions.some((ext) => urlObj.pathname.toLowerCase().endsWith(ext))
    ) {
      return false;
    }

    // Skip URLs that are clearly not documentation
    if (urlObj.pathname === '/' || urlObj.pathname === '') {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}
