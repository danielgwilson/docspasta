/**
 * Enhanced sitemap discovery and parsing
 * Inspired by Firecrawl's multi-location strategy
 */

import { parseStringPromise } from 'xml2js';
import { getRedisConnection } from './queue-service';
import { isValidDocumentationUrl } from './url-utils';
import { getRobotsInfo } from './robots';

export interface SitemapResult {
  urls: string[];
  source: 'cache' | 'sitemap' | 'robots' | 'discovery';
  discoveredSitemaps: string[];
}

/**
 * Cache sitemap URLs for a domain
 */
async function cacheSitemapUrls(domain: string, urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  
  const redis = getRedisConnection();
  const key = `sitemap:${domain}:urls`;
  await redis.del(key); // Clear existing
  await redis.sadd(key, ...urls);
  await redis.expire(key, 86400); // Cache for 24 hours
}

/**
 * Get cached sitemap URLs for a domain
 */
async function getCachedSitemapUrls(domain: string): Promise<string[]> {
  const redis = getRedisConnection();
  const key = `sitemap:${domain}:urls`;
  return await redis.smembers(key);
}

/**
 * Discover sitemap URLs for a domain using multiple strategies
 */
export async function discoverSitemapUrls(baseUrl: string): Promise<string[]> {
  const urlObj = new URL(baseUrl);
  const origin = urlObj.origin;
  const hostname = urlObj.hostname;
  
  const potentialSitemaps = new Set<string>();
  
  // Strategy 1: Common sitemap locations
  const commonLocations = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemaps.xml`,
    `${origin}/sitemap/sitemap.xml`,
    `${origin}/sitemaps/sitemap.xml`,
    `${origin}/xml/sitemap.xml`,
    `${origin}/wp-sitemap.xml`, // WordPress
    `${origin}/sitemap-index.xml`,
  ];
  
  commonLocations.forEach(url => potentialSitemaps.add(url));
  
  // Strategy 2: Get sitemaps from robots.txt
  try {
    const robotsInfo = await getRobotsInfo(baseUrl);
    const robotsSitemaps = robotsInfo.getSitemaps();
    robotsSitemaps.forEach(url => potentialSitemaps.add(url));
  } catch (error) {
    console.warn('Failed to get sitemaps from robots.txt:', error);
  }
  
  // Strategy 3: Subdomain handling
  const domainParts = hostname.split('.');
  if (domainParts.length > 2 && domainParts[0] !== 'www') {
    // This might be a subdomain like docs.example.com
    // Try the main domain's sitemap too
    const mainDomain = domainParts.slice(-2).join('.');
    const mainDomainUrl = `${urlObj.protocol}//${mainDomain}`;
    potentialSitemaps.add(`${mainDomainUrl}/sitemap.xml`);
  }
  
  return Array.from(potentialSitemaps);
}

/**
 * Fetch and parse a single sitemap
 */
export async function fetchSitemap(sitemapUrl: string): Promise<{
  urls: string[];
  childSitemaps: string[];
}> {
  try {
    console.log(`Fetching sitemap: ${sitemapUrl}`);
    
    const response = await fetch(sitemapUrl, {
      headers: {
        'User-Agent': 'DocspastaCrawler/1.0 (+https://docspasta.ai/crawler)'
      },
      signal: AbortSignal.timeout(15000) // 15 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const xmlContent = await response.text();
    const parsed = await parseStringPromise(xmlContent);
    
    const urls: string[] = [];
    const childSitemaps: string[] = [];
    
    // Handle sitemap index files (contain references to other sitemaps)
    if (parsed.sitemapindex?.sitemap) {
      for (const sitemap of parsed.sitemapindex.sitemap) {
        if (sitemap.loc?.[0]) {
          childSitemaps.push(sitemap.loc[0].trim());
        }
      }
    }
    
    // Handle regular sitemaps (contain actual URLs)
    if (parsed.urlset?.url) {
      for (const urlEntry of parsed.urlset.url) {
        if (urlEntry.loc?.[0]) {
          const url = urlEntry.loc[0].trim();
          
          // Filter out obvious non-documentation URLs
          if (isValidDocumentationUrl(url)) {
            urls.push(url);
          }
        }
      }
    }
    
    // Handle URLs that might be additional sitemaps
    if (parsed.urlset?.url) {
      for (const urlEntry of parsed.urlset.url) {
        if (urlEntry.loc?.[0]) {
          const url = urlEntry.loc[0].trim().toLowerCase();
          if (url.endsWith('.xml') && (url.includes('sitemap') || url.includes('feed'))) {
            childSitemaps.push(urlEntry.loc[0].trim());
          }
        }
      }
    }
    
    return { urls, childSitemaps };
    
  } catch (error) {
    console.warn(`Failed to fetch sitemap ${sitemapUrl}:`, error);
    return { urls: [], childSitemaps: [] };
  }
}

/**
 * Recursively crawl sitemaps with depth limiting
 */
export async function crawlSitemaps(
  baseUrl: string, 
  maxDepth: number = 3,
  maxUrls: number = 1000
): Promise<SitemapResult> {
  const urlObj = new URL(baseUrl);
  const hostname = urlObj.hostname;
  
  // Check cache first
  const cachedUrls = await getCachedSitemapUrls(hostname);
  if (cachedUrls.length > 0) {
    return {
      urls: cachedUrls.slice(0, maxUrls),
      source: 'cache',
      discoveredSitemaps: []
    };
  }
  
  const allUrls = new Set<string>();
  const visitedSitemaps = new Set<string>();
  const discoveredSitemaps: string[] = [];
  
  // Discover initial sitemap URLs
  const initialSitemaps = await discoverSitemapUrls(baseUrl);
  
  // Recursive function to process sitemaps
  async function processSitemaps(sitemapUrls: string[], depth: number): Promise<void> {
    if (depth > maxDepth || allUrls.size >= maxUrls) return;
    
    const promises = sitemapUrls.map(async (sitemapUrl) => {
      if (visitedSitemaps.has(sitemapUrl) || allUrls.size >= maxUrls) return;
      
      visitedSitemaps.add(sitemapUrl);
      discoveredSitemaps.push(sitemapUrl);
      
      const { urls, childSitemaps } = await fetchSitemap(sitemapUrl);
      
      // Add URLs (up to limit)
      for (const url of urls) {
        if (allUrls.size >= maxUrls) break;
        allUrls.add(url);
      }
      
      // Process child sitemaps recursively
      if (childSitemaps.length > 0 && depth < maxDepth) {
        await processSitemaps(childSitemaps, depth + 1);
      }
    });
    
    await Promise.all(promises);
  }
  
  // Start processing
  await processSitemaps(initialSitemaps, 1);
  
  const finalUrls = Array.from(allUrls).slice(0, maxUrls);
  
  // Cache the results for 24 hours
  if (finalUrls.length > 0) {
    await cacheSitemapUrls(hostname, finalUrls);
  }
  
  return {
    urls: finalUrls,
    source: finalUrls.length > 0 ? 'sitemap' : 'discovery',
    discoveredSitemaps
  };
}

/**
 * Get content quality score for prioritizing URLs
 */
export function getUrlPriority(url: string): number {
  const urlLower = url.toLowerCase();
  let score = 1;
  
  // Higher priority for documentation-like paths
  const highPriorityPaths = [
    '/docs/', '/documentation/', '/guide/', '/tutorial/', '/help/',
    '/api/', '/reference/', '/manual/', '/wiki/', '/kb/', '/faq/'
  ];
  
  if (highPriorityPaths.some(path => urlLower.includes(path))) {
    score += 10;
  }
  
  // Lower priority for these paths
  const lowPriorityPaths = [
    '/blog/', '/news/', '/press/', '/about/', '/contact/',
    '/legal/', '/privacy/', '/terms/', '/changelog/'
  ];
  
  if (lowPriorityPaths.some(path => urlLower.includes(path))) {
    score -= 5;
  }
  
  // Higher priority for structured documentation
  if (urlLower.includes('/getting-started') || urlLower.includes('/quickstart')) {
    score += 15;
  }
  
  // Deprioritize very long URLs (might be auto-generated)
  if (url.length > 200) {
    score -= 3;
  }
  
  return Math.max(score, 0);
}