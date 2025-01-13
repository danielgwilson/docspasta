import crypto from 'crypto';

/**
 * Normalize a URL by resolving relative paths and removing trailing slashes.
 * Optionally preserves fragments and handles external URLs.
 *
 * @param href - The raw URL to normalize.
 * @param baseUrl - The base URL (context) for resolving relative URLs.
 * @param followExternalLinks - If false, returns null for external origins.
 * @param includeAnchors - If true, preserves URL fragments.
 * @returns The normalized URL string or null if invalid/out of scope.
 */
export function normalizeUrl(
  href: string,
  baseUrl: string,
  followExternalLinks: boolean,
  includeAnchors: boolean = false
): string | null {
  try {
    const url = new URL(href, baseUrl);
    const baseUrlObj = new URL(baseUrl);

    // Remove trailing slash
    let normalized = url.href.replace(/\/$/, '');

    // Handle fragments based on settings
    if (!href.startsWith('#')) {
      if (!includeAnchors) {
        // Strip all fragments when includeAnchors is false
        normalized = normalized.split('#')[0];
      } else {
        // When includeAnchors is true:
        // 1. Keep complex fragments (e.g., #/v2/api, #!docs)
        // 2. Strip simple section anchors (e.g., #overview, #section-1)
        const fragment = url.hash;
        const isSimpleSectionAnchor = /^#[\w-]+$/.test(fragment);
        if (isSimpleSectionAnchor) {
          normalized = normalized.split('#')[0];
        }
      }
    }

    // Handle external links if followExternalLinks is false
    if (!followExternalLinks && url.origin !== baseUrlObj.origin) {
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
 * Checks if a URL is likely to be a documentation page by excluding
 * common asset paths and file extensions.
 *
 * @param url - The URL to check for doc-likeness.
 * @returns A boolean indicating if it looks like documentation content.
 */
export function isValidDocumentationUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);

    // If it's just the domain root (like "https://example.com/"),
    // we do NOT automatically exclude it. Let the caller decide.
    // So we remove the prior "if (urlObj.pathname === '/' ...) return false;"

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
      '.pdf',
      '.zip',
      '.tar',
    ];
    if (
      skipExtensions.some((ext) => urlObj.pathname.toLowerCase().endsWith(ext))
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Attempt to discover a "root path" from a given URL by climbing up
 * until a shorter path is found that still appears to be in the same domain.
 *
 * For example, if the startUrl is https://docs.example.com/foo/bar,
 * we try:
 *   - https://docs.example.com/foo
 *   - https://docs.example.com/
 * Then we store whichever is used. In a real scenario we might do
 * HEAD requests or additional checks to see if it's a doc landing page.
 *
 * @param startUrl - The user-supplied starting point.
 * @returns The discovered root path (e.g. "https://docs.example.com/foo"), never with a trailing slash.
 */
export function discoverRootPath(startUrl: string): string {
  try {
    const urlObj = new URL(startUrl);
    let path = urlObj.pathname;
    const origin = urlObj.origin;

    // If path is root or empty, just return origin
    if (!path || path === '/') {
      return origin;
    }

    // In this naive approach, we remove segments one by one
    // and then break if that path is too short or is just "/"
    const segments = path.split('/').filter(Boolean); // remove empty
    if (segments.length <= 1) {
      // e.g. "/foo" → origin
      return `${origin}/${segments[0] || ''}`.replace(/\/$/, '');
    }

    // Remove the last segment to climb up
    segments.pop();
    const climbedPath = segments.join('/');
    if (!climbedPath) {
      // means we popped the only segment
      return origin;
    }

    // Return the resulting path, with no trailing slash
    return `${origin}/${climbedPath.replace(/\/$/, '')}`;
  } catch {
    // fallback
    return startUrl.replace(/\/$/, '');
  }
}

/**
 * Checks if a candidate path is within (or exactly equal to) the discovered base path.
 * E.g., base=/docs, candidate=/docs/foo, return true. candidate=/about, return false.
 *
 * @param basePath - The discovered base path, e.g. "/docs"
 * @param candidatePath - The path from a candidate URL, e.g. "/docs/foo/bar"
 */
export function isPathWithinBase(
  basePath: string,
  candidatePath: string
): boolean {
  if (!basePath || basePath === '/') {
    return true; // treat everything in same domain as in-scope if base is root
  }
  // Ensure both start with '/'
  const base = basePath.startsWith('/') ? basePath : `/${basePath}`;
  const candidate = candidatePath.startsWith('/')
    ? candidatePath
    : `/${candidatePath}`;

  return candidate.startsWith(base);
}
