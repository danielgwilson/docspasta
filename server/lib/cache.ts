import type { PageResult } from './utils/types';
import type { CrawlerOptions } from './utils/types';
import Database from '@replit/database';

interface CacheEntry {
  url: string;
  result: PageResult;
  timestamp: number;
}

interface FullCrawlCacheEntry {
  startUrl: string;
  results: PageResult[];
  settings: Required<CrawlerOptions>;
  timestamp: number;
}

// Initialize Replit DB with proper error handling
let db: Database | null = null;
let useMemoryCache = false;

// In-memory cache fallback
const memoryCache = new Map<string, CacheEntry>();
const memoryCrawlCache = new Map<string, FullCrawlCacheEntry>();

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_PREFIX = 'crawl:';
const FULL_CACHE_PREFIX = 'full:';

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Initialize database
try {
  console.log('[Cache] Attempting to initialize Replit DB');
  db = new Database(); // Replit will automatically use the correct URL
  console.log('[Cache] Successfully initialized Replit DB');
} catch (error) {
  console.error('[Cache] Fatal error during database initialization:', error);
  useMemoryCache = true;
  db = null;
}

function generateCacheKey(key: string, prefix: string = CACHE_PREFIX): string {
  return `${prefix}${key}`;
}

function isValidCacheEntry(entry: unknown): entry is CacheEntry {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as any;
  return (
    typeof e.url === 'string' &&
    typeof e.result === 'object' &&
    typeof e.timestamp === 'number'
  );
}

function isValidFullCrawlCacheEntry(entry: unknown): entry is FullCrawlCacheEntry {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as any;
  return (
    typeof e.startUrl === 'string' &&
    Array.isArray(e.results) &&
    typeof e.settings === 'object' &&
    typeof e.timestamp === 'number'
  );
}

function compareSettings(
  a: Required<CrawlerOptions>,
  b: Required<CrawlerOptions>
): boolean {
  const relevantFields: (keyof Required<CrawlerOptions>)[] = [
    'maxDepth',
    'followExternalLinks',
    'excludeNavigation',
  ];
  return relevantFields.every((field) => a[field] === b[field]);
}

function normalizeStatus(status: PageResult['status']): 'complete' | 'error' {
  return status === 'skipped' ? 'complete' : status;
}

// Retry wrapper for database operations
async function retryOperation<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.error(`[Cache] Operation attempt ${attempt} failed:`, error);

      if (attempt === MAX_RETRIES) {
        console.error('[Cache] Max retries reached, operation failed');
        useMemoryCache = true;
        throw error;
      }

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
    }
  }

  throw new Error('Unexpected retry loop exit');
}

export const crawlerCache = {
  async get(url: string): Promise<PageResult | null> {
    if (!db || useMemoryCache) {
      console.log('[Cache] Using memory cache for get operation');
      const entry = memoryCache.get(url);
      if (!entry || Date.now() - entry.timestamp > CACHE_TTL) {
        return null;
      }
      return {
        ...entry.result,
        status: normalizeStatus(entry.result.status),
      };
    }

    try {
      const key = generateCacheKey(url);
      console.log('[Cache] Fetching from database:', key);
      const entry = await retryOperation(() => db!.get(key));

      if (!isValidCacheEntry(entry) || Date.now() - entry.timestamp > CACHE_TTL) {
        console.log('[Cache] Invalid or expired entry for:', key);
        return null;
      }

      console.log('[Cache] Successfully retrieved entry for:', key);
      return {
        ...entry.result,
        status: normalizeStatus(entry.result.status),
      };
    } catch (error) {
      console.error('[Cache] Error getting entry:', error);
      return null;
    }
  },

  async set(url: string, result: PageResult): Promise<void> {
    const entry: CacheEntry = {
      url,
      result,
      timestamp: Date.now(),
    };

    if (!db || useMemoryCache) {
      console.log('[Cache] Using memory cache for set operation');
      memoryCache.set(url, entry);
      return;
    }

    try {
      const key = generateCacheKey(url);
      console.log('[Cache] Setting database entry:', key);
      await retryOperation(() => db!.set(key, entry));
      console.log('[Cache] Successfully set entry for:', key);
    } catch (error) {
      console.error('[Cache] Error setting entry, falling back to memory cache:', error);
      memoryCache.set(url, entry);
    }
  },

  async getCrawlResults(
    startUrl: string,
    settings: Required<CrawlerOptions>
  ): Promise<PageResult[] | null> {
    if (!db || useMemoryCache) {
      console.log('[Cache] Using memory cache for crawl results');
      const entry = memoryCrawlCache.get(startUrl);
      if (!entry || 
          !isValidFullCrawlCacheEntry(entry) || 
          Date.now() - entry.timestamp > CACHE_TTL ||
          !compareSettings(settings, entry.settings)) {
        return null;
      }
      return entry.results.map(result => ({
        ...result,
        status: normalizeStatus(result.status),
      }));
    }

    try {
      const key = generateCacheKey(startUrl, FULL_CACHE_PREFIX);
      console.log('[Cache] Fetching crawl results from database:', key);
      const entry = await retryOperation(() => db!.get(key));

      if (!isValidFullCrawlCacheEntry(entry) || 
          Date.now() - entry.timestamp > CACHE_TTL ||
          !compareSettings(settings, entry.settings)) {
        console.log('[Cache] Invalid or expired crawl results for:', key);
        return null;
      }

      console.log('[Cache] Successfully retrieved crawl results for:', key);
      return entry.results.map(result => ({
        ...result,
        status: normalizeStatus(result.status),
      }));
    } catch (error) {
      console.error('[Cache] Error getting crawl results:', error);
      return null;
    }
  },

  async setCrawlResults(
    startUrl: string,
    results: PageResult[],
    settings: Required<CrawlerOptions>
  ): Promise<void> {
    const entry: FullCrawlCacheEntry = {
      startUrl,
      results,
      settings,
      timestamp: Date.now(),
    };

    if (!db || useMemoryCache) {
      console.log('[Cache] Using memory cache for setting crawl results');
      memoryCrawlCache.set(startUrl, entry);
      return;
    }

    try {
      const key = generateCacheKey(startUrl, FULL_CACHE_PREFIX);
      console.log('[Cache] Setting crawl results in database:', key);
      await retryOperation(() => db!.set(key, entry));
      console.log('[Cache] Successfully set crawl results for:', key);
    } catch (error) {
      console.error('[Cache] Error setting crawl results, falling back to memory cache:', error);
      memoryCrawlCache.set(startUrl, entry);
    }
  },

  async clear(): Promise<void> {
    if (!db || useMemoryCache) {
      console.log('[Cache] Clearing memory cache');
      memoryCache.clear();
      memoryCrawlCache.clear();
      return;
    }

    try {
      console.log('[Cache] Clearing database cache');
      const keys = await retryOperation(() => db!.list());
      const crawlKeys = Array.isArray(keys) ? keys.filter(
        key => key.startsWith(CACHE_PREFIX) || key.startsWith(FULL_CACHE_PREFIX)
      ) : [];

      await Promise.all(
        crawlKeys.map(key => retryOperation(() => db!.delete(key)))
      );
      console.log('[Cache] Successfully cleared database cache');
    } catch (error) {
      console.error('[Cache] Error clearing cache, falling back to memory cache:', error);
      memoryCache.clear();
      memoryCrawlCache.clear();
    }
  },
};