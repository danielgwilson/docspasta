/**
 * URL handling utilities for the DocumentationCrawler
 */

export function normalizeUrl(
  url: string,
  includeAnchors: boolean = false
): string {
  try {
    const parsed = new URL(url);

    // Remove trailing slashes
    parsed.pathname = parsed.pathname.replace(/\/$/, '');

    // Handle fragments based on includeAnchors option
    if (!includeAnchors) {
      parsed.hash = '';
    }

    // Remove default ports
    if (
      (parsed.protocol === 'http:' && parsed.port === '80') ||
      (parsed.protocol === 'https:' && parsed.port === '443')
    ) {
      parsed.port = '';
    }

    // Sort query parameters
    const searchParams = Array.from(parsed.searchParams.entries()).sort(
      ([a], [b]) => a.localeCompare(b)
    );
    parsed.search = searchParams.length
      ? `?${new URLSearchParams(searchParams).toString()}`
      : '';

    return parsed.toString();
  } catch {
    return url;
  }
}

export function extractLinks(doc: Document, baseUrl: string): string[] {
  const links = new Set<string>();
  const anchors = doc.querySelectorAll('a');

  anchors.forEach((anchor) => {
    const href = anchor.getAttribute('href');
    if (!href) return;

    try {
      // Handle relative URLs
      const absoluteUrl = new URL(href, baseUrl).toString();
      links.add(absoluteUrl);
    } catch {
      // Skip invalid URLs
    }
  });

  return Array.from(links);
}

export function shouldCrawl(
  url: string,
  allowedDomains: string[],
  excludePatterns: RegExp[],
  maxDepth: number,
  currentDepth: number
): boolean {
  try {
    const parsed = new URL(url);

    // Check domain
    if (
      allowedDomains.length > 0 &&
      !allowedDomains.includes(parsed.hostname)
    ) {
      return false;
    }

    // Check exclude patterns
    if (excludePatterns.some((pattern) => pattern.test(url))) {
      return false;
    }

    // Check depth
    if (maxDepth > 0 && currentDepth >= maxDepth) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function getUrlDepth(url: string, baseUrl: string): number {
  try {
    const base = new URL(baseUrl);
    const target = new URL(url);

    // If different domains, return max depth
    if (base.hostname !== target.hostname) {
      return Number.MAX_SAFE_INTEGER;
    }

    // Count path segments
    const basePath = base.pathname.split('/').filter(Boolean);
    const targetPath = target.pathname.split('/').filter(Boolean);

    // Return difference in path depth
    return Math.max(0, targetPath.length - basePath.length);
  } catch {
    return 0;
  }
}
