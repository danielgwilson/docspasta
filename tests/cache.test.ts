import { describe, it, expect, beforeEach } from 'vitest';
import { crawlerCache } from '../server/lib/cache';
import type { PageResult, CrawlerOptions } from '../shared/types';

describe('CrawlerCache', () => {
  beforeEach(async () => {
    await crawlerCache.clear();
    crawlerCache.setMaxAge(50); // short expiry
  });

  it('should store and retrieve page results', async () => {
    const testUrl = 'https://test.com/page';
    const testResult: PageResult = {
      url: testUrl,
      title: 'Test Page',
      content: 'Test content',
      status: 'complete',
      depth: 0,
      parent: undefined,
      error: '',
      newLinksFound: 0,
      hierarchy: [],
      timestamp: Date.now(),
    };

    await crawlerCache.set(testUrl, testResult);
    const cached = await crawlerCache.get(testUrl);

    expect(cached).toBeDefined();
    expect(cached).toMatchObject(testResult);
  });

  it('should handle invalid cache entries', async () => {
    const testUrl = 'https://test.com/invalid';
    // @ts-expect-error testing scenario
    await crawlerCache.set(testUrl, null);
    const cached = await crawlerCache.get(testUrl);
    expect(cached).toBeNull();
  });

  it('should store and retrieve full crawl results', async () => {
    const startUrl = 'https://test.com';
    const options: Required<CrawlerOptions> = {
      maxDepth: 2,
      maxConcurrentRequests: 1,
      includeCodeBlocks: true,
      excludeNavigation: true,
      followExternalLinks: false,
      timeout: 30000,
      rateLimit: 1000,
      includeAnchors: false,
      discoverBasePath: true,
      maxRetries: 3,
    };
    const results: PageResult[] = [
      {
        url: startUrl,
        title: 'Test Page',
        content: 'Test content',
        status: 'complete',
        depth: 0,
        parent: undefined,
        error: '',
        newLinksFound: 0,
        hierarchy: [],
        timestamp: Date.now(),
      },
      {
        url: 'https://test.com/page1',
        title: 'Page 1',
        content: 'Page 1 content',
        status: 'complete',
        depth: 1,
        parent: startUrl,
        error: '',
        newLinksFound: 0,
        hierarchy: [],
        timestamp: Date.now(),
      },
    ];

    await crawlerCache.setCrawlResults(startUrl, options, results);
    const cached = await crawlerCache.getCrawlResults(startUrl, options);

    expect(cached).toBeDefined();
    expect(cached).toHaveLength(2);
    expect(cached).toMatchObject(results);
  });

  it('should handle cache versioning', async () => {
    const testUrl = 'https://test.com/version';
    const oldResult: PageResult = {
      url: testUrl,
      title: 'Old Version',
      content: 'Old content',
      status: 'complete',
      depth: 0,
      parent: undefined,
      error: '',
      newLinksFound: 0,
      hierarchy: [],
      timestamp: Date.now(),
    };

    await crawlerCache.set(testUrl, oldResult);

    await new Promise((resolve) => setTimeout(resolve, 100));
    const cached = await crawlerCache.get(testUrl);
    expect(cached).toBeNull();
  });

  it('should handle concurrent cache operations', async () => {
    const testUrl = 'https://test.com/concurrent';
    const operations = Array(5)
      .fill(null)
      .map(async (_, i) => {
        const result: PageResult = {
          url: testUrl,
          title: `Version ${i}`,
          content: `Content ${i}`,
          status: 'complete',
          depth: 0,
          parent: undefined,
          error: '',
          newLinksFound: 0,
          hierarchy: [],
          timestamp: Date.now(),
        };
        await crawlerCache.set(testUrl, result);
        return crawlerCache.get(testUrl);
      });

    const results = await Promise.all(operations);
    expect(results.every((r) => r !== null)).toBe(true);
    expect(new Set(results.map((r) => r?.title)).size).toBe(1);
  });
});
