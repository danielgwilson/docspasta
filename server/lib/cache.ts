/**
 * Advanced caching system for the documentation crawler.
 * Provides efficient storage and retrieval of page results with versioning.
 * @module CrawlerCache 
 */

import type { PageResult, CrawlerOptions } from '../../shared/types';
import crypto from 'crypto';

// Simple logger helper (retained from original)
const log = {
  debug: (...args: unknown[]) => console.debug('[Cache]', ...args),
  info: (...args: unknown[]) => console.info('[Cache]', ...args),
  warn: (...args: unknown[]) => console.warn('[Cache]', ...args),
  error: (...args: unknown[]) => console.error('[Cache]', ...args),
};

/**
 * Memory-efficient content fingerprinting
 */
const createFingerprint = (content: string): string => {
  return crypto
    .createHash('sha256')
    .update(content.toLowerCase().replace(/\s+/g, ' '))
    .digest('base64');
};

/**
 * In-memory cache for individual page results and entire crawl results.
 * Uses an LRU-style cache with versioning and efficient memory management.
 */
class CrawlerCache {
  private cache: Map<
    string,
    { result: PageResult; timestamp: number; version: number }
  >;
  private crawlCache: Map<
    string,
    { results: PageResult[]; timestamp: number; version: number }
  >;
  private readonly CURRENT_VERSION = 2;
  private _maxAge = 24 * 60 * 60 * 1000; // 24h default
  private _maxSize = 1000; // Maximum number of entries
  private contentFingerprints = new Set<string>();

  constructor() {
    this.cache = new Map();
    this.crawlCache = new Map();
    log.info('Cache initialized');
  }

  /**
   * Set custom max age for cache entries
   */
  setMaxAge(maxAge: number): void {
    this._maxAge = maxAge;
  }

  /**
   * Get current max age setting
   */
  getMaxAge(): number {
    return this._maxAge;
  }

  /**
   * Set maximum size for the cache
   */
  setMaxSize(size: number): void {
    this._maxSize = size;
  }

  private generateCacheKey(url: string): string {
    return url.toLowerCase().trim();
  }

  private generateCrawlCacheKey(
    startUrl: string,
    settings: Required<CrawlerOptions>
  ): string {
    return `${startUrl.toLowerCase().trim()}:${JSON.stringify(settings)}`;
  }

  private isExpired(timestamp: number): boolean {
    return Date.now() - timestamp > this._maxAge;
  }

  private isValidVersion(version: number): boolean {
    return version === this.CURRENT_VERSION;
  }

  private evictOldEntries(): void {
    // LRU-style eviction
    if (this.cache.size > this._maxSize) {
      const entriesToEvict = [...this.cache.entries()]
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)
        .slice(0, Math.floor(this._maxSize * 0.2)); // Remove oldest 20%

      for (const [key] of entriesToEvict) {
        this.cache.delete(key);
      }
      log.debug(`Evicted ${entriesToEvict.length} old cache entries`);
    }
  }

  async get(url: string): Promise<PageResult | null> {
    try {
      const key = this.generateCacheKey(url);
      const cached = this.cache.get(key);
      if (!cached) return null;

      if (!this.isValidVersion(cached.version)) {
        log.debug('Cache version mismatch for URL:', url);
        this.cache.delete(key);
        return null;
      }
      if (this.isExpired(cached.timestamp)) {
        log.debug('Cache entry expired for URL:', url);
        this.cache.delete(key);
        return null;
      }

      // Update timestamp to maintain LRU order
      cached.timestamp = Date.now();
      return cached.result;
    } catch (error) {
      log.error('Error retrieving from cache:', error);
      return null;
    }
  }

  async set(url: string, result: PageResult): Promise<void> {
    try {
      const key = this.generateCacheKey(url);
      this.cache.set(key, {
        result,
        timestamp: Date.now(),
        version: this.CURRENT_VERSION,
      });

      // Store content fingerprint for duplicate detection
      if (result.content) {
        this.contentFingerprints.add(createFingerprint(result.content));
      }

      this.evictOldEntries();
    } catch (error) {
      log.error('Error setting cache:', error);
    }
  }

  /**
   * Check if content is duplicate based on fingerprint
   */
  isDuplicate(content: string): boolean {
    return this.contentFingerprints.has(createFingerprint(content));
  }

  async getCrawlResults(
    startUrl: string,
    settings: Required<CrawlerOptions>
  ): Promise<PageResult[] | null> {
    try {
      const key = this.generateCrawlCacheKey(startUrl, settings);
      const cached = this.crawlCache.get(key);
      if (!cached) return null;

      if (!this.isValidVersion(cached.version)) {
        log.debug('Crawl cache version mismatch for URL:', startUrl);
        this.crawlCache.delete(key);
        return null;
      }
      if (this.isExpired(cached.timestamp)) {
        log.debug('Crawl cache expired for URL:', startUrl);
        this.crawlCache.delete(key);
        return null;
      }

      return cached.results;
    } catch (error) {
      log.error('Error retrieving crawl results from cache:', error);
      return null;
    }
  }

  async setCrawlResults(
    startUrl: string,
    settings: Required<CrawlerOptions>,
    results: PageResult[]
  ): Promise<void> {
    try {
      const key = this.generateCrawlCacheKey(startUrl, settings);
      this.crawlCache.set(key, {
        results,
        timestamp: Date.now(),
        version: this.CURRENT_VERSION,
      });

      // Store content fingerprints for all results
      for (const result of results) {
        if (result.content) {
          this.contentFingerprints.add(createFingerprint(result.content));
        }
      }
    } catch (error) {
      log.error('Error setting crawl results cache:', error);
    }
  }

  clear(): void {
    this.cache.clear();
    this.crawlCache.clear();
    this.contentFingerprints.clear();
    log.info('Cache cleared');
  }

  /**
   * Get cache statistics for monitoring
   */
  getStats(): Record<string, number> {
    return {
      cacheSize: this.cache.size,
      crawlCacheSize: this.crawlCache.size,
      fingerprintsSize: this.contentFingerprints.size,
      maxAge: this._maxAge,
      maxSize: this._maxSize,
    };
  }
}

export const crawlerCache = new CrawlerCache();