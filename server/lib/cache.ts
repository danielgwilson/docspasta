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
    this.ttl = ttlHours * 60 * 60 * 1000; // Convert hours to milliseconds
  }

  /**
   * Get a cached result for a URL
   */
  async get(url: string): Promise<PageResult | null> {
    try {
      const key = generateCacheKey(url);
      const value = await this.db.get(key);

      if (!value) {
        this.log.debug('Cache miss for URL:', url);
        return null;
      }

      // Type guard to ensure value is a CacheEntry
      if (!this.isValidCacheEntry(value)) {
        this.log.warn('Invalid cache entry for URL:', url);
        await this.delete(url);
        return null;
      }

      // Check if entry has expired
      if (Date.now() > value.expiresAt) {
        this.log.debug('Cache expired for URL:', url);
        await this.delete(url);
        return null;
      }

      this.log.info('Cache hit for URL:', url);
      return value.result;
    } catch (error) {
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
          status: result.status === 'skipped' ? 'complete' : result.status
        },
        timestamp: Date.now(),
        expiresAt: Date.now() + this.ttl
      };

      await this.db.set(key, entry);
      this.log.info('Cached result for URL:', url);
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
        results,
        timestamp: Date.now(),
        expiresAt: Date.now() + this.ttl,
        settings,
      };

      await this.db.set(key, entry);
      this.log.info('Cached full crawl results for starting URL:', startUrl, 'with', results.length, 'pages');
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
      const value = await this.db.get(key);

      if (!value || typeof value !== 'object') {
        this.log.debug('No cached crawl results for URL:', startUrl);
        return null;
      }

      const cache = value as unknown as FullCrawlCache;

      // Validate cache structure
      if (!Array.isArray(cache.results) || !cache.timestamp || !cache.expiresAt || !cache.settings) {
        this.log.warn('Invalid cache structure for URL:', startUrl);
        await this.db.delete(key);
        return null;
      }

      if (Date.now() > cache.expiresAt) {
        this.log.debug('Cached crawl results expired for URL:', startUrl);
        await this.db.delete(key);
        return null;
      }

      // Compare settings to ensure cache validity
      const settingsMatch = JSON.stringify(settings) === JSON.stringify(cache.settings);
      if (!settingsMatch) {
        this.log.debug('Cached crawl settings mismatch for URL:', startUrl);
        return null;
      }

      this.log.info('Cache hit for full crawl of URL:', startUrl);
      return cache.results;
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
      const key = generateCacheKey(url);
      const value = await this.db.get(key);

      if (!value) {
        this.log.debug('URL not in cache:', url);
        return false;
      }

      // Type guard to ensure value is a CacheEntry
      if (!this.isValidCacheEntry(value)) {
        this.log.warn('Invalid cache entry found for URL:', url);
        await this.delete(url);
        return false;
      }

      // Check expiration
      if (Date.now() > value.expiresAt) {
        this.log.debug('Cache entry expired for URL:', url);
        await this.delete(url);
        return false;
      }

      return true;
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
      this.log.debug('Deleted cache entry for URL:', url);
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
        this.log.info('Cleared all cache entries:', crawlKeys.length, 'entries removed');
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