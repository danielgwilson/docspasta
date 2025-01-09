import type { PageResult, CrawlerOptions } from '../../shared/types';

// Create logger helper
const log = {
  debug: (...args: any[]) => console.debug('[Cache]', ...args),
  info: (...args: any[]) => console.info('[Cache]', ...args),
  warn: (...args: any[]) => console.warn('[Cache]', ...args),
  error: (...args: any[]) => console.error('[Cache]', ...args),
};

// Cache implementation
class CrawlerCache {
  private cache: Map<
    string,
    { result: PageResult; timestamp: number; version: number }
  >;
  private crawlCache: Map<
    string,
    { results: PageResult[]; timestamp: number; version: number }
  >;
  private readonly CURRENT_VERSION = 1;
  private _maxAge = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.cache = new Map();
    this.crawlCache = new Map();
    log.info('Cache initialized');
  }

  // For testing purposes
  setMaxAge(maxAge: number): void {
    this._maxAge = maxAge;
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

  async get(url: string): Promise<PageResult | null> {
    try {
      const key = this.generateCacheKey(url);
      const cached = this.cache.get(key);

      if (!cached) {
        return null;
      }

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

      if (!cached) {
        return null;
      }

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
