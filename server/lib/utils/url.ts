import crypto from 'crypto';

/**
 * Normalize a URL by resolving relative paths and removing trailing slashes.
 * Omits fragments unless it's an anchor link, and optionally discards external URLs.
 *
 * @param href - The raw URL to normalize.
 * @param baseUrl - The base URL (context) for resolving relative URLs.
 * @param followExternalLinks - If false, returns null for external origins.
 * @returns The normalized URL string or null if invalid/out of scope.
 */
export function normalizeUrl(
  href: string,
  baseUrl: string,
  followExternalLinks: boolean
): string | null {
  try {
    const url = new URL(href, baseUrl);
    const baseUrlObj = new URL(baseUrl);

    // Remove trailing slash
    let normalized = url.href.replace(/\/$/, '');

    // Remove fragments unless it's an anchor-only link (e.g., #section)
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
  } catch {
    return null;
  }
}

/**
 * Generate a unique fingerprint (SHA-1) for a URL.
 *
 * @param url - The URL to fingerprint.
 * @param includeFragment - Whether to include the fragment (hash) in the fingerprint.
 * @returns A hex string representing the SHA-1 hash of the URL.
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
 * Checks if a URL is likely to be a documentation page
 * by excluding common asset paths and file extensions.
 *
 * @param url - The URL to check for doc-likeness.
 * @returns A boolean indicating if it looks like documentation content.
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

    // Skip default index pages
    if (urlObj.pathname === '/' || urlObj.pathname === '') {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
