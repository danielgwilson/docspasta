import type { PageResult, CrawlerOptions } from '../../shared/types';

// Simple logger helper
const log = {
  debug: (...args: unknown[]) => console.debug('[Cache]', ...args),
  info: (...args: unknown[]) => console.info('[Cache]', ...args),
  warn: (...args: unknown[]) => console.warn('[Cache]', ...args),
  error: (...args: unknown[]) => console.error('[Cache]', ...args),
};

/**
 * In-memory cache for individual page results and entire crawl results.
 *
 * @remarks
 * This cache uses a simple Map-based in-memory approach with time-based
 * invalidation and a version check to ensure older entries are discarded.
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
  private readonly CURRENT_VERSION = 2; // Bumped version for new architecture
  private _maxAge = 24 * 60 * 60 * 1000; // 24h default

  constructor() {
    this.cache = new Map();
    this.crawlCache = new Map();
    log.info('Cache initialized');
  }

  /**
   * For testing or custom usage: set a custom max age for the cache.
   */
  setMaxAge(maxAge: number): void {
    this._maxAge = maxAge;
  }

  /**
   * Get the current max age setting for the cache.
   */
  getMaxAge(): number {
    return this._maxAge;
  }

  private generateCacheKey(url: string): string {
    return url.replace(/\/$/, '').toLowerCase().trim();
  }

  private generateCrawlCacheKey(
    startUrl: string,
    settings: Required<CrawlerOptions>
  ): string {
    const normalizedStart = this.generateCacheKey(startUrl);
    return `${normalizedStart}:${JSON.stringify(settings)}`;
  }

  private isExpired(timestamp: number): boolean {
    return Date.now() - timestamp > this._maxAge;
  }

  private isValidVersion(version: number): boolean {
    return version === this.CURRENT_VERSION;
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
    } catch (error) {
      log.error('Error setting cache:', error);
    }
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
    } catch (error) {
      log.error('Error setting crawl results cache:', error);
    }
  }

  clear(): void {
    this.cache.clear();
    this.crawlCache.clear();
    log.info('Cache cleared');
  }
}

export const crawlerCache = new CrawlerCache();
