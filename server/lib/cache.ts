import type { PageResult } from './utils/types';
import type { CrawlerOptions } from './utils/types';

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

// In-memory cache for development
const cache = new Map<string, CacheEntry>();
const fullCrawlCache = new Map<string, FullCrawlCacheEntry>();

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function isValidCacheEntry(entry: CacheEntry): boolean {
  const now = Date.now();
  if (now - entry.timestamp > CACHE_TTL) {
    return false;
  }
  return true;
}

function isValidFullCrawlCacheEntry(entry: FullCrawlCacheEntry): boolean {
  const now = Date.now();
  if (now - entry.timestamp > CACHE_TTL) {
    return false;
  }
  return true;
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
    const entry = cache.get(url);
    if (!entry || !isValidCacheEntry(entry)) {
      return null;
    }

    // Handle 'skipped' status by converting it to 'complete'
    return {
      ...entry.result,
      status: normalizeStatus(entry.result.status),
    };
  },

  async set(url: string, result: PageResult): Promise<void> {
    // Store the result with its original status
    cache.set(url, {
      url,
      result,
      timestamp: Date.now(),
    });
  },

  async getCrawlResults(
    startUrl: string,
    settings: Required<CrawlerOptions>
  ): Promise<PageResult[] | null> {
    const entry = fullCrawlCache.get(startUrl);
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
  },

  async setCrawlResults(
    startUrl: string,
    results: PageResult[],
    settings: Required<CrawlerOptions>
  ): Promise<void> {
    // Store results with their original status
    fullCrawlCache.set(startUrl, {
      startUrl,
      results,
      settings,
      timestamp: Date.now(),
    });
  },

  clear(): void {
    cache.clear();
    fullCrawlCache.clear();
  },
};
