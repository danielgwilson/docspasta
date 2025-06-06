/**
 * Robots.txt compliance for ethical crawling
 * Inspired by Firecrawl's approach
 */

import robotsParser from 'robots-parser';
import { getCachedRobotsTxt, cacheRobotsTxt } from '../redis';

export interface RobotsInfo {
  isAllowed: (url: string) => boolean;
  getCrawlDelay: () => number;
  getSitemaps: () => string[];
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
          // Get crawl delay for our user agent, fallback to generic
          const delay = robots.getCrawlDelay('DocspastaCrawler') ?? 
                       robots.getCrawlDelay('*') ?? 
                       0;
          
          // Cap at reasonable maximum (10 seconds)
          return Math.min(delay * 1000, 10000);
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
    console.warn(`Error processing robots.txt for ${baseUrl}:`, error);
    
    // Return permissive defaults on error
    return {
      isAllowed: () => true,
      getCrawlDelay: () => 0,
      getSitemaps: () => []
    };
  }
}

/**
 * Check if a specific URL should be crawled according to robots.txt
 */
export async function shouldCrawlUrl(url: string, robotsInfo: RobotsInfo): Promise<{ allowed: boolean; reason?: string; crawlDelay: number }> {
  try {
    const allowed = robotsInfo.isAllowed(url);
    const crawlDelay = robotsInfo.getCrawlDelay();
    
    return {
      allowed,
      reason: allowed ? undefined : 'Disallowed by robots.txt',
      crawlDelay
    };
  } catch {
    // Default to allowing on error
    return {
      allowed: true,
      reason: undefined,
      crawlDelay: 0
    };
  }
}

/**
 * Respect crawl delay by waiting
 */
export async function respectCrawlDelay(delayMs: number): Promise<void> {
  if (delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}