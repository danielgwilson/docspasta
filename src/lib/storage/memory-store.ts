/**
 * In-memory storage for crawl results and cache
 * This will be replaced with Neon DB later
 */

export interface CrawlResult {
  id: string;
  url: string;
  status: 'started' | 'processing' | 'completed' | 'error';
  progress?: number;
  markdown?: string;
  error?: string;
  title?: string;
  metadata?: {
    totalPages?: number;
    totalTokens?: number;
    crawlDate: string;
  };
  createdAt: string;
  completedAt?: string;
}

export interface CacheEntry {
  url: string;
  urlHash: string;
  contentHash: string;
  title: string;
  markdown: string;
  metadata: Record<string, unknown>;
  lastCrawled: string;
  hitCount: number;
}

class MemoryStore {
  private crawls = new Map<string, CrawlResult>();
  private cache = new Map<string, CacheEntry>();
  private maxCacheSize = 1000; // LRU limit

  // Store a crawl result
  setCrawl(id: string, crawl: CrawlResult): void {
    this.crawls.set(id, crawl);
  }

  // Get a crawl result
  getCrawl(id: string): CrawlResult | null {
    return this.crawls.get(id) || null;
  }

  // Update crawl status
  updateCrawl(id: string, updates: Partial<CrawlResult>): void {
    const existing = this.crawls.get(id);
    if (existing) {
      this.crawls.set(id, { ...existing, ...updates });
    }
  }

  // Store cached content
  setCache(urlHash: string, entry: CacheEntry): void {
    // LRU eviction if cache is too large
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(urlHash, entry);
  }

  // Get cached content
  getCache(urlHash: string): CacheEntry | null {
    const entry = this.cache.get(urlHash);
    if (entry) {
      // Update hit count and move to end (LRU)
      entry.hitCount++;
      this.cache.delete(urlHash);
      this.cache.set(urlHash, entry);
      return entry;
    }
    return null;
  }

  // Check if URL is cached and fresh (less than 24 hours old)
  isCacheFresh(urlHash: string): boolean {
    const entry = this.cache.get(urlHash);
    if (!entry) return false;
    
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const lastCrawled = new Date(entry.lastCrawled).getTime();
    
    return lastCrawled > oneDayAgo;
  }

  // Get cache stats
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      entries: Array.from(this.cache.values()).map(entry => ({
        url: entry.url,
        hitCount: entry.hitCount,
        lastCrawled: entry.lastCrawled
      }))
    };
  }

  // Get all crawls (for debugging)
  getAllCrawls(): CrawlResult[] {
    return Array.from(this.crawls.values());
  }

  // Clear old crawls (cleanup)
  clearOldCrawls(maxAge: number = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAge;
    
    for (const [id, crawl] of this.crawls.entries()) {
      const createdAt = new Date(crawl.createdAt).getTime();
      if (createdAt < cutoff) {
        this.crawls.delete(id);
      }
    }
  }
}

// Singleton instance - persist across hot reloads in development
declare global {
  // eslint-disable-next-line no-var
  var __docspasta_memory_store: MemoryStore | undefined;
}

export const memoryStore = globalThis.__docspasta_memory_store ?? new MemoryStore();

if (process.env.NODE_ENV === 'development') {
  globalThis.__docspasta_memory_store = memoryStore;
}