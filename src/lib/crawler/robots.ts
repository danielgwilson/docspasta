/**
 * Robots.txt compliance for ethical crawling
 * Inspired by Firecrawl's approach
 */

import robotsParser from 'robots-parser';
import { getRedisConnection } from './queue-service';

export interface RobotsInfo {
  isAllowed: (url: string) => boolean;
  getCrawlDelay: () => number;
  getSitemaps: () => string[];
}

/**
 * Cache robots.txt content
 */
async function cacheRobotsTxt(domain: string, content: string): Promise<void> {
  const redis = getRedisConnection();
  const key = `robots:${domain}`;
  await redis.setex(key, 3600, content); // Cache for 1 hour
}

/**
 * Get cached robots.txt content
 */
async function getCachedRobotsTxt(domain: string): Promise<string | null> {
  const redis = getRedisConnection();
  const key = `robots:${domain}`;
  return await redis.get(key);
}

/**
 * Fetch and parse robots.txt for a domain
 */
export async function getRobotsInfo(baseUrl: string): Promise<RobotsInfo> {
  try {
    const urlObj = new URL(baseUrl);
    const domain = urlObj.hostname;
    const robotsTxtUrl = `${urlObj.protocol}//${urlObj.hostname}/robots.txt`;
    
    // Try to get from cache first
    let robotsTxtContent = await getCachedRobotsTxt(domain);
    
    if (!robotsTxtContent) {
      // Fetch robots.txt
      try {
        const response = await fetch(robotsTxtUrl, {
          headers: {
            'User-Agent': 'DocspastaCrawler/1.0 (+https://docspasta.ai/crawler)'
          },
          signal: AbortSignal.timeout(10000) // 10 second timeout
        });
        
        if (response.ok) {
          robotsTxtContent = await response.text();
          // Cache the result
          await cacheRobotsTxt(domain, robotsTxtContent);
        } else {
          // If robots.txt doesn't exist, cache empty string to avoid repeated requests
          robotsTxtContent = '';
          await cacheRobotsTxt(domain, '');
        }
      } catch (error) {
        console.warn(`Failed to fetch robots.txt for ${domain}:`, error);
        robotsTxtContent = '';
        await cacheRobotsTxt(domain, '');
      }
    }
    
    // Parse robots.txt
    const robots = robotsParser(robotsTxtUrl, robotsTxtContent);
    
    return {
      isAllowed: (url: string) => {
        try {
          // Check for both our user agent and generic rules
          return robots.isAllowed(url, 'DocspastaCrawler') ?? 
                 robots.isAllowed(url, '*') ?? 
                 true; // Default to allowed if uncertain
        } catch {
          return true; // Default to allowed on error
        }
      },
      
      getCrawlDelay: () => {
        try {
          // Get crawl delay for our user agent or generic
          const delay = robots.getCrawlDelay('DocspastaCrawler') ?? 
                       robots.getCrawlDelay('*') ?? 
                       0;
          return Math.max(0, delay * 1000); // Convert to milliseconds
        } catch {
          return 0; // No delay on error
        }
      },
      
      getSitemaps: () => {
        try {
          return robots.getSitemaps() || [];
        } catch {
          return [];
        }
      }
    };
  } catch (error) {
    console.error('Error processing robots.txt:', error);
    
    // Return permissive defaults on error
    return {
      isAllowed: () => true,
      getCrawlDelay: () => 0,
      getSitemaps: () => []
    };
  }
}

/**
 * Check if a URL should be crawled based on robots.txt and patterns
 */
export function shouldCrawlUrl(
  url: string, 
  robotsInfo: RobotsInfo,
  includePatterns: string[] = [],
  excludePatterns: string[] = []
): boolean {
  try {
    // First check robots.txt
    if (!robotsInfo.isAllowed(url)) {
      return false;
    }
    
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    
    // Check exclude patterns first (they take precedence)
    if (excludePatterns.length > 0) {
      for (const pattern of excludePatterns) {
        if (new RegExp(pattern).test(path)) {
          return false;
        }
      }
    }
    
    // Check include patterns (if specified, URL must match at least one)
    if (includePatterns.length > 0) {
      let matchesInclude = false;
      for (const pattern of includePatterns) {
        if (new RegExp(pattern).test(path)) {
          matchesInclude = true;
          break;
        }
      }
      if (!matchesInclude) {
        return false;
      }
    }
    
    return true;
  } catch {
    return false; // Don't crawl on error
  }
}