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
 * Respect crawl delay with Promise-based delay
 */
export async function respectCrawlDelay(delayMs: number): Promise<void> {
  if (delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}

/**
 * Check if URL should be crawled based on robots.txt and our internal rules
 */
export async function shouldCrawlUrl(baseUrl: string, targetUrl: string): Promise<{
  allowed: boolean;
  reason?: string;
  crawlDelay: number;
}> {
  try {
    const robotsInfo = await getRobotsInfo(baseUrl);
    
    // Check robots.txt permission
    if (!robotsInfo.isAllowed(targetUrl)) {
      return {
        allowed: false,
        reason: 'Disallowed by robots.txt',
        crawlDelay: robotsInfo.getCrawlDelay()
      };
    }
    
    // Additional checks for documentation relevance
    const urlObj = new URL(targetUrl);
    
    // Skip obvious non-documentation paths
    const skipPaths = [
      '/login', '/logout', '/signin', '/signup', '/register',
      '/admin', '/dashboard', '/settings', '/profile',
      '/cart', '/checkout', '/payment', '/billing',
      '/search', '/filter', '/sort'
    ];
    
    if (skipPaths.some(path => urlObj.pathname.toLowerCase().includes(path))) {
      return {
        allowed: false,
        reason: 'Non-documentation path detected',
        crawlDelay: robotsInfo.getCrawlDelay()
      };
    }
    
    // Skip URLs with query parameters that suggest dynamic/personalized content
    const skipParams = ['utm_', 'fbclid', 'gclid', 'ref=', 'source=', 'medium='];
    const searchParams = urlObj.search.toLowerCase();
    
    if (skipParams.some(param => searchParams.includes(param))) {
      return {
        allowed: false,
        reason: 'Dynamic/tracking parameters detected',
        crawlDelay: robotsInfo.getCrawlDelay()
      };
    }
    
    return {
      allowed: true,
      crawlDelay: robotsInfo.getCrawlDelay()
    };
    
  } catch (error) {
    console.warn(`Error checking if should crawl ${targetUrl}:`, error);
    return {
      allowed: true, // Default to allowed on error
      crawlDelay: 0
    };
  }
}