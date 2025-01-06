import Database from '@replit/database';
import type { PageResult } from '../../client/src/lib/types';
import crypto from 'crypto';

// Initialize database with error handling
let db: Database | null = null;
try {
  db = new Database();
} catch (error) {
  console.error('Failed to initialize Replit Database:', error);
  throw new Error('Failed to initialize database. Please check your configuration.');
}

/**
 * Generate a cache key for a URL
 */
function generateCacheKey(url: string, prefix: string = 'crawl'): string {
  const hash = crypto
    .createHash('sha256')
    .update(url)
    .digest('hex')
    .slice(0, 16);
  return `${prefix}:${hash}`;
}

// Cache entry interface
export interface CacheEntry {
  result: PageResult;
  timestamp: number;
  expiresAt: number;
}

// Full crawl result cache interface
export interface FullCrawlCache {
  results: PageResult[];
  timestamp: number;
  expiresAt: number;
  settings: Record<string, any>;
}

export class CrawlerCache {
  private ttl: number;
  private db: Database;
  private readonly log = {
    info: (...args: any[]) => console.info('[Cache]', ...args),
    debug: (...args: any[]) => console.debug('[Cache]', ...args),
    warn: (...args: any[]) => console.warn('[Cache]', ...args),
    error: (...args: any[]) => console.error('[Cache]', ...args),
  };

  constructor(ttlHours: number = 24) {
    if (!db) {
      throw new Error('Database not initialized');
    }
    this.db = db;
    this.ttl = ttlHours * 60 * 60 * 1000;
  }

  /**
   * Get a cached result for a URL
   */
  async get(url: string): Promise<PageResult | null> {
    try {
      const key = generateCacheKey(url);
      const rawValue = await this.db.get(key);

      if (!rawValue) {
        return null;
      }

      try {
        // Parse the value based on its type
        const parsed = typeof rawValue === 'string' ? 
          JSON.parse(rawValue) : 
          rawValue;

        // Validate the structure
        if (!this.isValidCacheEntry(parsed)) {
          return null;
        }

        // Check expiration
        if (Date.now() > parsed.expiresAt) {
          await this.delete(url);
          return null;
        }

        return parsed.result;
      } catch (e) {
        // Log parse error but don't throw
        this.log.debug('Error parsing cache:', e);
        return null;
      }
    } catch (error) {
      // Log database error but don't throw
      this.log.error('Cache get error:', error);
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
          status: result.status === 'skipped' ? 'complete' : result.status,
        },
        timestamp: Date.now(),
        expiresAt: Date.now() + this.ttl,
      };

      await this.db.set(key, entry);
    } catch (error) {
      this.log.error('Cache set error:', error);
    }
  }

  /**
   * Cache full crawl results by starting URL
   */
  async setCrawlResults(startUrl: string, results: PageResult[], settings: Record<string, any>): Promise<void> {
    try {
      const key = generateCacheKey(startUrl, 'full');
      const entry: FullCrawlCache = {
        results: results.map(result => ({
          ...result,
          status: result.status === 'skipped' ? 'complete' : result.status,
        })),
        timestamp: Date.now(),
        expiresAt: Date.now() + this.ttl,
        settings,
      };

      await this.db.set(key, entry);
    } catch (error) {
      this.log.error('Full crawl cache set error:', error);
    }
  }

  /**
   * Get cached crawl results for a starting URL
   */
  async getCrawlResults(startUrl: string, settings: Record<string, any>): Promise<PageResult[] | null> {
    try {
      const key = generateCacheKey(startUrl, 'full');
      const rawValue = await this.db.get(key);

      if (!rawValue) {
        return null;
      }

      try {
        // Parse the value based on its type
        const parsed = typeof rawValue === 'string' ? 
          JSON.parse(rawValue) : 
          rawValue;

        // Validate the structure
        if (!this.isValidFullCrawlCache(parsed)) {
          return null;
        }

        // Check expiration
        if (Date.now() > parsed.expiresAt) {
          await this.delete(startUrl);
          return null;
        }

        // Compare settings
        if (JSON.stringify(settings) !== JSON.stringify(parsed.settings)) {
          return null;
        }

        return parsed.results;
      } catch (e) {
        this.log.debug('Error parsing full cache:', e);
        return null;
      }
    } catch (error) {
      this.log.error('Get crawl results error:', error);
      return null;
    }
  }

  /**
   * Check if a URL exists in the cache and is not expired
   */
  async has(url: string): Promise<boolean> {
    try {
      const result = await this.get(url);
      return result !== null;
    } catch (error) {
      this.log.error('Cache check error:', error);
      return false;
    }
  }

  /**
   * Delete a cached entry
   */
  async delete(url: string): Promise<void> {
    try {
      const key = generateCacheKey(url);
      await this.db.delete(key);
    } catch (error) {
      this.log.error('Cache delete error:', error);
    }
  }

  /**
   * Clear all cached entries
   */
  async clear(): Promise<void> {
    try {
      const keys = await this.db.list('crawl:');
      if (keys && Array.isArray(keys)) {
        const crawlKeys = keys.filter((key): key is string =>
          typeof key === 'string' && (key.startsWith('crawl:') || key.startsWith('full:'))
        );
        await Promise.all(crawlKeys.map(key => this.db.delete(key)));
      }
    } catch (error) {
      this.log.error('Cache clear error:', error);
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
      typeof entry.timestamp === 'number' &&
      typeof entry.expiresAt === 'number' &&
      entry.result !== undefined &&
      typeof entry.result === 'object' &&
      entry.result !== null
    );
  }

  /**
   * Type guard to validate full crawl cache structure
   */
  private isValidFullCrawlCache(value: unknown): value is FullCrawlCache {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const cache = value as Partial<FullCrawlCache>;
    return (
      Array.isArray(cache.results) &&
      typeof cache.timestamp === 'number' &&
      typeof cache.expiresAt === 'number' &&
      cache.settings !== undefined &&
      typeof cache.settings === 'object'
    );
  }
}

// Export singleton instance with default TTL
export const crawlerCache = new CrawlerCache();