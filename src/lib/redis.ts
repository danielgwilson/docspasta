/**
 * Redis client for URL deduplication and caching
 * Uses Upstash Redis from Vercel marketplace
 */

import { Redis } from '@upstash/redis';

// Initialize Redis client from environment variables
export const redis = Redis.fromEnv();

/**
 * Add URL to crawl deduplication set
 * Returns true if URL was newly added, false if already existed
 */
export async function addDiscoveredUrl(crawlId: string, url: string): Promise<boolean> {
  const normalizedUrl = normalizeUrlForDedup(url);
  const key = `crawl:${crawlId}:discovered`;
  
  // SADD returns 1 if element was added, 0 if already existed
  const wasAdded = await redis.sadd(key, normalizedUrl);
  
  // Set expiration (3600 seconds = 1 hour)
  await redis.expire(key, 3600, 'NX'); // NX = only set if no expiration exists
  
  return wasAdded === 1;
}

/**
 * Check if URL has already been discovered in this crawl
 */
export async function isUrlDiscovered(crawlId: string, url: string): Promise<boolean> {
  const normalizedUrl = normalizeUrlForDedup(url);
  const key = `crawl:${crawlId}:discovered`;
  
  const isMember = await redis.sismember(key, normalizedUrl);
  return isMember === 1;
}

/**
 * Get count of discovered URLs for a crawl
 */
export async function getDiscoveredUrlCount(crawlId: string): Promise<number> {
  const key = `crawl:${crawlId}:discovered`;
  return await redis.scard(key);
}

/**
 * Cache robots.txt content
 */
export async function cacheRobotsTxt(domain: string, content: string): Promise<void> {
  const key = `robots:${domain}`;
  await redis.setex(key, 3600, content); // Cache for 1 hour
}

/**
 * Get cached robots.txt content
 */
export async function getCachedRobotsTxt(domain: string): Promise<string | null> {
  const key = `robots:${domain}`;
  return await redis.get(key);
}

/**
 * Cache sitemap URLs for a domain
 */
export async function cacheSitemapUrls(domain: string, urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  
  const key = `sitemap:${domain}:urls`;
  await redis.del(key); // Clear existing
  await redis.sadd(key, ...urls);
  await redis.expire(key, 86400); // Cache for 24 hours
}

/**
 * Get cached sitemap URLs for a domain
 */
export async function getCachedSitemapUrls(domain: string): Promise<string[]> {
  const key = `sitemap:${domain}:urls`;
  return await redis.smembers(key);
}

/**
 * Normalize URL for deduplication (Firecrawl pattern)
 * Removes protocol, www, and trailing slash
 */
function normalizeUrlForDedup(url: string): string {
  try {
    let normalized = url.toLowerCase();
    
    // Remove protocol
    normalized = normalized.replace(/^https?:\/\//, '');
    
    // Remove www
    normalized = normalized.replace(/^www\./, '');
    
    // Remove trailing slash
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    
    return normalized;
  } catch {
    // If URL parsing fails, return original
    return url.toLowerCase();
  }
}

/**
 * Store crawl progress in Redis for real-time updates
 */
export async function updateCrawlProgress(
  crawlId: string, 
  progress: {
    status: 'started' | 'processing' | 'completed' | 'error';
    processedUrls: number;
    totalUrls: number;
    currentUrl?: string;
    error?: string;
  }
): Promise<void> {
  const key = `crawl:${crawlId}:progress`;
  await redis.setex(key, 3600, JSON.stringify({
    ...progress,
    lastUpdated: new Date().toISOString()
  }));
}

/**
 * Get crawl progress from Redis
 */
export async function getCrawlProgress(crawlId: string): Promise<{
  status: string;
  processedUrls: number;
  totalUrls: number;
  currentUrl?: string;
  error?: string;
  lastUpdated: string;
} | null> {
  const key = `crawl:${crawlId}:progress`;
  const data = await redis.get(key);
  return data ? JSON.parse(data as string) : null;
}