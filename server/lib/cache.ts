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

      if (!value) {
        return null;
      }

      // Type guard to ensure value is a CacheEntry
      if (!this.isValidCacheEntry(value)) {
        await this.delete(url);
        return null;
      }

      // Check if entry has expired
      if (Date.now() > value.expiresAt) {
        await this.delete(url);
        return null;
      }

      return value.result;
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
          status: result.status === 'skipped' ? 'complete' : result.status
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

      if (!value) {
        return false;
      }

      // Type guard to ensure value is a CacheEntry
      if (!this.isValidCacheEntry(value)) {
        await this.delete(url);
        return false;
      }

      // Check expiration
      if (Date.now() > value.expiresAt) {
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
      const keys = await db.list();
      const crawlKeys = keys.filter((key): key is string => 
        typeof key === 'string' && key.startsWith('crawl:')
      );
      await Promise.all(crawlKeys.map(key => db.delete(key)));
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  /**
   * Type guard to validate cache entry structure
   */
  private isValidCacheEntry(value: unknown): value is CacheEntry {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const entry = value as Partial<CacheEntry>;
    return (
      entry.result !== undefined &&
      entry.timestamp !== undefined &&
      entry.expiresAt !== undefined &&
      typeof entry.timestamp === 'number' &&
      typeof entry.expiresAt === 'number'
    );
  }
}

// Export singleton instance with default TTL
export const crawlerCache = new CrawlerCache();