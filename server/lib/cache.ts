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

// Try to initialize Replit DB, fall back to in-memory if not available
let db: Database | null = null;
try {
  db = new Database();
} catch (error) {
  console.warn('[Cache] Replit DB not available, using in-memory cache');
}

// In-memory cache fallback
const memoryCache = new Map<string, CacheEntry>();
const memoryCrawlCache = new Map<string, FullCrawlCacheEntry>();

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_PREFIX = 'crawl:';
const FULL_CACHE_PREFIX = 'full:';

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

function isValidFullCrawlCacheEntry(
  entry: unknown
): entry is FullCrawlCacheEntry {
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
  // Only compare the fields that affect crawling behavior
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

export const crawlerCache = {
  async get(url: string): Promise<PageResult | null> {
    try {
      if (db) {
        const key = generateCacheKey(url);
        const rawEntry = await db.get(key);

        if (!isValidCacheEntry(rawEntry)) {
          return null;
        }

        // Check TTL
        const now = Date.now();
        if (now - rawEntry.timestamp > CACHE_TTL) {
          return null;
        }

        return {
          ...rawEntry.result,
          status: normalizeStatus(rawEntry.result.status),
        };
      } else {
        const entry = memoryCache.get(url);
        if (!entry || !isValidCacheEntry(entry)) {
          return null;
        }

        // Check TTL
        const now = Date.now();
        if (now - entry.timestamp > CACHE_TTL) {
          memoryCache.delete(url);
          return null;
        }

        return {
          ...entry.result,
          status: normalizeStatus(entry.result.status),
        };
      }
    } catch (error) {
      console.error('[Cache] Error getting entry:', error);
      return null;
    }
  },

  async set(url: string, result: PageResult): Promise<void> {
    try {
      const entry: CacheEntry = {
        url,
        result,
        timestamp: Date.now(),
      };

      if (db) {
        const key = generateCacheKey(url);
        await db.set(key, entry);
      } else {
        memoryCache.set(url, entry);
      }
    } catch (error) {
      console.error('[Cache] Error setting entry:', error);
    }
  },

  async getCrawlResults(
    startUrl: string,
    settings: Required<CrawlerOptions>
  ): Promise<PageResult[] | null> {
    try {
      let entry: FullCrawlCacheEntry | null = null;

      if (db) {
        const key = generateCacheKey(startUrl, FULL_CACHE_PREFIX);
        const rawEntry = await db.get(key);

        if (!isValidFullCrawlCacheEntry(rawEntry)) {
          return null;
        }

        // Check TTL
        const now = Date.now();
        if (now - rawEntry.timestamp > CACHE_TTL) {
          return null;
        }

        entry = rawEntry;
      } else {
        entry = memoryCrawlCache.get(startUrl) ?? null;
      }

      if (!entry || !isValidFullCrawlCacheEntry(entry)) {
        return null;
      }

      // Compare only relevant settings that affect crawling behavior
      if (!compareSettings(settings, entry.settings)) {
        return null;
      }

      // Normalize any 'skipped' statuses to 'complete'
      return entry.results.map((result) => ({
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
    try {
      const entry: FullCrawlCacheEntry = {
        startUrl,
        results,
        settings,
        timestamp: Date.now(),
      };

      if (db) {
        const key = generateCacheKey(startUrl, FULL_CACHE_PREFIX);
        await db.set(key, entry);
      } else {
        memoryCrawlCache.set(startUrl, entry);
      }
    } catch (error) {
      console.error('[Cache] Error setting crawl results:', error);
    }
  },

  async clear(): Promise<void> {
    try {
      if (db) {
        const keys = await db.list();
        // Handle Replit DB response
        const keyList = Array.isArray(keys) ? keys : [];
        const crawlKeys = keyList.filter(
          (key: string) =>
            key.startsWith(CACHE_PREFIX) || key.startsWith(FULL_CACHE_PREFIX)
        );
        await Promise.all(crawlKeys.map((key: string) => db!.delete(key)));
      } else {
        memoryCache.clear();
        memoryCrawlCache.clear();
      }
    } catch (error) {
      console.error('[Cache] Error clearing cache:', error);
    }
  },
};
