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

// Check if we're running in a Replit environment
const isReplit = process.env.REPL_ID && process.env.REPL_OWNER;

// Initialize database with proper error handling
let db: Database | null = null;
if (isReplit) {
  try {
    db = new Database();
    console.log('[Cache] Successfully initialized Replit DB');
  } catch (error) {
    console.warn('[Cache] Failed to initialize Replit DB:', error);
    console.warn('[Cache] Falling back to in-memory cache');
  }
} else {
  console.log(
    '[Cache] Not running in Replit environment, using in-memory cache'
  );
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
  if (!entry || typeof entry !== 'object') {
    console.debug('[Cache] Entry validation failed: not an object');
    return false;
  }

  const e = entry as any;

  // Log the actual structure for debugging
  console.debug('[Cache] Validating entry structure:', {
    hasUrl: typeof e.url === 'string',
    hasResult: e.result !== undefined,
    hasTimestamp: typeof e.timestamp === 'number',
  });

  return (
    typeof e.url === 'string' &&
    e.result !== undefined && // Just check if result exists
    typeof e.timestamp === 'number'
  );
}

function isValidFullCrawlCacheEntry(
  entry: unknown
): entry is FullCrawlCacheEntry {
  if (!entry || typeof entry !== 'object') {
    console.debug('[Cache] Full crawl entry validation failed: not an object');
    return false;
  }

  const e = entry as any;

  // Log the actual structure for debugging
  console.debug('[Cache] Validating full crawl entry structure:', {
    hasStartUrl: typeof e.startUrl === 'string',
    hasResults: Array.isArray(e.results),
    hasSettings: e.settings !== undefined,
    hasTimestamp: typeof e.timestamp === 'number',
  });

  return (
    typeof e.startUrl === 'string' &&
    Array.isArray(e.results) &&
    e.settings !== undefined && // Just check if settings exists
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

export const crawlerCache = {
  async get(url: string): Promise<PageResult | null> {
    try {
      if (db) {
        const key = generateCacheKey(url);
        const rawEntry = await db.get(key);

        // Handle null/undefined case explicitly
        if (!rawEntry) {
          console.debug(`[Cache] No entry found for URL: ${url}`);
          return null;
        }

        // Parse the entry handling Replit DB's nested structure
        let entry: unknown;
        try {
          // First handle the possible {ok, value} wrapper
          let parsedValue = rawEntry;
          if (
            typeof rawEntry === 'object' &&
            'value' in rawEntry &&
            rawEntry.value
          ) {
            console.debug('[Cache] Found Replit DB wrapper structure');
            parsedValue = rawEntry.value;
          }

          // Then parse any remaining string JSON
          entry =
            typeof parsedValue === 'string'
              ? JSON.parse(parsedValue)
              : parsedValue;

          console.debug('[Cache] Successfully parsed entry:', {
            type: typeof entry,
            structure: entry ? Object.keys(entry as object) : null,
          });
        } catch (parseError) {
          console.warn('[Cache] Failed to parse entry:', parseError);
          await db.delete(key);
          return null;
        }

        if (!isValidCacheEntry(entry)) {
          console.warn(`[Cache] Invalid cache structure for URL: ${url}`, {
            entry:
              typeof entry === 'object' ? JSON.stringify(entry) : typeof entry,
            rawEntry:
              typeof rawEntry === 'object'
                ? JSON.stringify(rawEntry)
                : typeof rawEntry,
          });
          await db.delete(key);
          return null;
        }

        // Check TTL
        const now = Date.now();
        if (now - entry.timestamp > CACHE_TTL) {
          console.debug(`[Cache] Entry expired for URL: ${url}`);
          await db.delete(key);
          return null;
        }

        return {
          ...entry.result,
          status: normalizeStatus(entry.result.status),
        };
      } else {
        const entry = memoryCache.get(url);
        if (!entry) return null;

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
        // Explicitly stringify the entry for Replit DB
        await db.set(key, JSON.stringify(entry));
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

        // Handle null/undefined case explicitly
        if (!rawEntry) return null;

        // Parse the entry if it's a string
        const parsedEntry =
          typeof rawEntry === 'string' ? JSON.parse(rawEntry) : rawEntry;

        if (!isValidFullCrawlCacheEntry(parsedEntry)) {
          console.warn(
            `[Cache] Invalid full crawl cache structure for URL: ${startUrl}`
          );
          await db.delete(key);
          return null;
        }

        // Check TTL
        const now = Date.now();
        if (now - parsedEntry.timestamp > CACHE_TTL) {
          await db.delete(key);
          return null;
        }

        entry = parsedEntry;
      } else {
        entry = memoryCrawlCache.get(startUrl) ?? null;
      }

      if (!entry) return null;

      // Compare settings
      if (!compareSettings(settings, entry.settings)) {
        return null;
      }

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
        // Explicitly stringify the entry for Replit DB
        await db.set(key, JSON.stringify(entry));
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
        const keyList = Array.isArray(keys) ? keys : Object.keys(keys);
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
