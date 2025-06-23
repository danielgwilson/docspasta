import { createHash } from 'crypto'

/**
 * Normalize a URL for consistent deduplication
 * - Removes hash fragments
 * - Sorts query parameters
 * - Removes tracking parameters
 * - Lowercases the hostname
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    
    // Lowercase hostname
    parsed.hostname = parsed.hostname.toLowerCase()
    
    // Remove hash
    parsed.hash = ''
    
    // Remove common tracking parameters
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid'
    ]
    
    trackingParams.forEach(param => parsed.searchParams.delete(param))
    
    // Sort remaining parameters for consistency
    const sortedParams = new URLSearchParams(
      [...parsed.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b))
    )
    parsed.search = sortedParams.toString()
    
    // Don't remove trailing slash - it can be significant for path prefix matching
    
    return parsed.toString()
  } catch (error) {
    // If URL parsing fails, return as-is
    console.error('Failed to normalize URL:', url, error)
    return url
  }
}

/**
 * Create a SHA-256 hash of a URL for efficient storage and lookup
 */
export function createUrlHash(url: string): string {
  const normalized = normalizeUrl(url)
  return createHash('sha256').update(normalized).digest('hex')
}

/**
 * Check if a URL is valid for crawling
 * - Must be http/https
 * - Not a file/data URL
 * - Not a mailto/tel link
 */
export function isValidCrawlUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    
    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false
    }
    
    // Skip common file extensions that aren't documentation
    const pathname = parsed.pathname.toLowerCase()
    const skipExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
      '.pdf', '.zip', '.tar', '.gz',
      '.mp4', '.webm', '.mov',
      '.css', '.js', '.json' // Usually assets, not docs
    ]
    
    if (skipExtensions.some(ext => pathname.endsWith(ext))) {
      return false
    }
    
    return true
  } catch {
    return false
  }
}

/**
 * Check if a URL belongs to the same domain (for crawl boundaries)
 */
export function isSameDomain(url1: string, url2: string): boolean {
  try {
    const parsed1 = new URL(url1)
    const parsed2 = new URL(url2)
    
    // Compare hostnames (includes subdomains)
    return parsed1.hostname === parsed2.hostname
  } catch {
    return false
  }
}

/**
 * Check if a URL matches the allowed path prefix
 * This ensures we only crawl within a specific docs section
 */
export function isWithinPathPrefix(url: string, baseUrl: string): boolean {
  try {
    const urlParsed = new URL(url)
    const baseParsed = new URL(baseUrl)
    
    // Must be same domain first
    if (urlParsed.hostname !== baseParsed.hostname) {
      return false
    }
    
    // Ensure base path ends with / for proper prefix matching
    let basePath = baseParsed.pathname
    if (!basePath.endsWith('/')) {
      basePath += '/'
    }
    
    // Check if URL path starts with base path
    // This prevents matching /docsomething when base is /docs/
    return urlParsed.pathname === baseParsed.pathname || 
           urlParsed.pathname.startsWith(basePath)
  } catch {
    return false
  }
}

/**
 * Extract clean links from a page
 * - Converts relative to absolute URLs
 * - Filters out invalid URLs
 * - Deduplicates
 * - Enforces path prefix boundaries
 */
export function extractValidLinks(links: string[], baseUrl: string, originalJobUrl: string): string[] {
  const seen = new Set<string>()
  const valid: string[] = []
  
  for (const link of links) {
    try {
      // Convert relative URLs to absolute
      const absolute = new URL(link, baseUrl).toString()
      const normalized = normalizeUrl(absolute)
      
      // Check if valid and not seen
      if (isValidCrawlUrl(normalized) && !seen.has(normalized)) {
        seen.add(normalized)
        
        // Must be within the original path prefix
        if (isWithinPathPrefix(normalized, originalJobUrl)) {
          valid.push(normalized)
        }
      }
    } catch {
      // Skip invalid URLs
      continue
    }
  }
  
  return valid
}

/**
 * Estimate if a URL is likely documentation based on path patterns
 */
export function isLikelyDocumentationUrl(url: string): boolean {
  const docPatterns = [
    '/docs/', '/documentation/', '/guide/', '/guides/',
    '/tutorial/', '/tutorials/', '/manual/', '/reference/',
    '/api/', '/learn/', '/getting-started/', '/handbook/'
  ]
  
  const pathname = url.toLowerCase()
  return docPatterns.some(pattern => pathname.includes(pattern))
}