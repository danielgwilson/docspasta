import Database from '@replit/database';
import type { PageResult } from '../../client/src/lib/types';
import crypto from 'crypto';

const db = new Database();

/**
 * Generate a cache key for a URL
 */
function generateCacheKey(url: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(url)
    .digest('hex')
    .slice(0, 16);
  return `crawl:${hash}`;
}

export interface CacheEntry {
  result: PageResult;
  timestamp: number;
  expiresAt: number;
}

export class CrawlerCache {
  private ttl: number;

  constructor(ttlHours: number = 24) {
    this.ttl = ttlHours * 60 * 60 * 1000; // Convert hours to milliseconds
  }

  /**
   * Get a cached result for a URL
   */
  async get(url: string): Promise<PageResult | null> {
    try {
      const key = generateCacheKey(url);
      const value = await db.get(key);

      // Handle null case explicitly
      if (!value) return null;

      const entry = value as CacheEntry;

      // Check if entry has expired
      if (Date.now() > entry.expiresAt) {
        await this.delete(url);
        return null;
      }

      return entry.result;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Store a crawl result in the cache
   */
  async set(url: string, result: PageResult): Promise<void> {
    try {
      const key = generateCacheKey(url);
      const entry: CacheEntry = {
        result: {
          ...result,
          status: result.status === 'skipped' ? 'complete' : result.status // Convert skipped to complete for cache
        },
        timestamp: Date.now(),
        expiresAt: Date.now() + this.ttl
      };

      await db.set(key, entry);
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Check if a URL exists in the cache and is not expired
   */
  async has(url: string): Promise<boolean> {
    try {
      const key = generateCacheKey(url);
      const value = await db.get(key);

      // Handle null case explicitly
      if (!value) return false;

      const entry = value as CacheEntry;

      // Check expiration
      if (Date.now() > entry.expiresAt) {
        await this.delete(url);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Cache check error:', error);
      return false;
    }
  }

  /**
   * Delete a cached entry
   */
  async delete(url: string): Promise<void> {
    try {
      const key = generateCacheKey(url);
      await db.delete(key);
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  /**
   * Clear all cached entries
   */
  async clear(): Promise<void> {
    try {
      const keys = (await db.list('crawl:')) as unknown[];
      await Promise.all(keys.map(key => db.delete(key as string)));
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }
}

// Export singleton instance with default TTL
export const crawlerCache = new CrawlerCache();