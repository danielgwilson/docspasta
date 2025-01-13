import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DocumentationCrawler } from '../server/lib/crawler';
import { setupMockServer } from './utils/mock-server';
import { crawlerCache } from '../server/lib/cache';

describe('DocumentationCrawler', () => {
  const mockServer = setupMockServer([
    {
      url: 'https://test.com',
      title: 'Test Documentation',
      content:
        '<main><h1>Welcome</h1><p>Welcome to the test documentation.</p></main>',
      links: ['https://test.com/page1', 'https://test.com/page2'],
    },
    {
      url: 'https://test.com/page1',
      title: 'Page 1',
      content:
        '<main><h1>Page 1</h1><p>This is page 1.</p><pre><code>const x = 1;</code></pre></main>',
      links: ['https://test.com/page2'],
    },
    {
      url: 'https://test.com/page2',
      title: 'Page 2',
      content: '<main><h1>Page 2</h1><p>This is page 2.</p></main>',
      links: ['https://test.com/page1'],
    },
  ]);

  beforeEach(async () => {
    console.log('Setting up test...');
    mockServer.reset();
    await crawlerCache.clear();
    vi.clearAllMocks();
    crawlerCache.setMaxAge(50); // short expiry for testing
  });

  afterEach(() => {
    console.log('Cleaning up test...');
    mockServer.server.resetHandlers();
  });

  describe('Core Functionality', () => {
    it('should crawl a single page successfully', async () => {
      const crawler = new DocumentationCrawler('https://test.com', {
        maxDepth: 0,
        maxConcurrentRequests: 1,
        timeout: 1000, // shorter for tests
      });

      const results = await crawler.crawl();
      console.log('Crawl results:', JSON.stringify(results, null, 2));

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        url: 'https://test.com',
        title: 'Test Documentation',
        status: 'complete',
      });
    });

    it('should respect maxDepth setting', async () => {
      const crawler = new DocumentationCrawler('https://test.com', {
        maxDepth: 1,
        maxConcurrentRequests: 1,
        timeout: 1000, // shorter for tests
      });

      const results = await crawler.crawl();

      expect(results).toHaveLength(3);
      expect(results.map((r) => r.url).sort()).toEqual([
        'https://test.com',
        'https://test.com/page1',
        'https://test.com/page2',
      ]);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockServer.addErrorResponse(
        'https://test.com/error',
        500,
        'Internal Server Error'
      );
      mockServer.addResponse('https://test.com/success', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: '<html><head><title>Success</title></head><body>Success</body></html>',
      });

      const crawler = new DocumentationCrawler('https://test.com/error', {
        maxDepth: 0,
        maxConcurrentRequests: 1,
      });

      const results = await crawler.crawl();
      const errors = results.filter((r) => r.status === 'error');
      const successful = results.filter((r) => r.status === 'complete');

      expect(errors.length).toBeGreaterThan(0);
      expect(successful.length).toBe(0);
      expect(errors[0].error).toBeDefined();
    });

    it('should handle malformed HTML gracefully', async () => {
      mockServer.addResponse('https://test.com/malformed', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: '<html><head><title>Malformed</title></head><body><div>Unclosed div</body></html>',
      });

      const crawler = new DocumentationCrawler('https://test.com/malformed', {
        maxDepth: 0,
        maxConcurrentRequests: 1,
      });

      const results = await crawler.crawl();
      expect(results[0].status).toBe('complete');
      expect(results[0].content).toBeDefined();
    });

    it('should handle non-HTML responses gracefully', async () => {
      mockServer.addResponse('https://test.com/pdf', {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
        body: 'PDF content',
      });

      const crawler = new DocumentationCrawler('https://test.com/pdf', {
        maxDepth: 0,
        maxConcurrentRequests: 1,
      });

      const results = await crawler.crawl();
      expect(results[0].status).toBe('error');
      expect(results[0].error).toContain('Invalid content type');
    });
  });

  describe('Cache Handling', () => {
    it('should use cached results when available', async () => {
      const crawler1 = new DocumentationCrawler('https://test.com', {
        maxDepth: 0,
        maxConcurrentRequests: 1,
      });

      await crawler1.crawl();

      const crawler2 = new DocumentationCrawler('https://test.com', {
        maxDepth: 0,
        maxConcurrentRequests: 1,
      });

      const results = await crawler2.crawl();
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('complete');
      expect(mockServer.getRequestCount('https://test.com')).toEqual(1);
    });

    it('should handle cache invalidation correctly', async () => {
      const crawler1 = new DocumentationCrawler('https://test.com', {
        maxDepth: 0,
        maxConcurrentRequests: 1,
      });

      await crawler1.crawl();

      // Update the content
      mockServer.addResponse('https://test.com', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: '<html><head><title>Updated Documentation</title></head><body>Updated content</body></html>',
      });

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      const crawler2 = new DocumentationCrawler('https://test.com', {
        maxDepth: 0,
        maxConcurrentRequests: 1,
      });

      const results = await crawler2.crawl();
      expect(results[0].title).toBe('Updated Documentation');
      expect(results[0].content).toContain('Updated content');
    });
  });

  describe('Concurrency and Rate Limiting', () => {
    it('should respect maxConcurrentRequests setting', async () => {
      const startTime = Date.now();

      const crawler = new DocumentationCrawler('https://test.com', {
        maxDepth: 1,
        maxConcurrentRequests: 1,
        rateLimit: 100,
      });

      await crawler.crawl();
      const duration = Date.now() - startTime;

      // With 3 pages and 100ms rate limit, should be >= 300ms
      expect(duration).toBeGreaterThanOrEqual(300);
    });

    it('should handle concurrent crawls correctly', async () => {
      const crawler1 = new DocumentationCrawler('https://test.com', {
        maxDepth: 0,
        maxConcurrentRequests: 1,
      });

      const crawler2 = new DocumentationCrawler('https://test.com/page1', {
        maxDepth: 0,
        maxConcurrentRequests: 1,
      });

      const [results1, results2] = await Promise.all([
        crawler1.crawl(),
        crawler2.crawl(),
      ]);

      expect(results1).toHaveLength(1);
      expect(results2).toHaveLength(1);
      expect(results1[0].url).toBe('https://test.com');
      expect(results2[0].url).toBe('https://test.com/page1');
    });
  });

  describe('Content Processing', () => {
    it('should handle duplicate content correctly', async () => {
      mockServer.addResponse('https://test.com/duplicate1', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: '<html><head><title>Duplicate</title></head><body>Same content</body></html>',
      });

      mockServer.addResponse('https://test.com/duplicate2', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: '<html><head><title>Duplicate</title></head><body>Same content</body></html>',
      });

      const crawler = new DocumentationCrawler('https://test.com/duplicate1', {
        maxDepth: 1,
        maxConcurrentRequests: 1,
      });

      const results = await crawler.crawl();
      const duplicates = results.filter((r) =>
        r.error?.includes('Duplicate content')
      );

      expect(duplicates.length).toBeGreaterThan(0);
    });

    it('should extract metadata correctly', async () => {
      mockServer.addResponse('https://test.com/metadata', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <html>
            <head>
              <title>Test</title>
              <meta name="description" content="Test page">
            </head>
            <body>
              <main>
                <h1>Test Page</h1>
                <pre><code class="language-javascript">const x = 1;</code></pre>
              </main>
            </body>
          </html>
        `,
      });

      const crawler = new DocumentationCrawler('https://test.com/metadata', {
        maxDepth: 0,
        maxConcurrentRequests: 1,
      });

      const results = await crawler.crawl();
      expect(results[0].title).toBe('Test');
      expect(results[0].content).toContain('```javascript\nconst x = 1;\n```');
      expect(results[0].hierarchy).toContain('Test Page');
    });
  });

  describe('Memory Management', () => {
    it('should clean up resources after crawl', async () => {
      const crawler = new DocumentationCrawler('https://test.com', {
        maxDepth: 0,
        maxConcurrentRequests: 1,
      });

      await crawler.crawl();
      expect(crawler.getProgress().queued).toBe(0);
    });

    it('should handle large crawls without memory issues', async () => {
      // Create a large number of pages
      for (let i = 0; i < 100; i++) {
        mockServer.addResponse(`https://test.com/page${i}`, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
          body: `<html><head><title>Page ${i}</title></head><body>Content ${i}</body></html>`,
        });
      }

      const crawler = new DocumentationCrawler('https://test.com', {
        maxDepth: 2,
        maxConcurrentRequests: 5,
      });

      const results = await crawler.crawl();
      expect(results.length).toBeGreaterThan(50);
      expect(results.every((r) => r.status === 'complete')).toBe(true);
    });
  });
});
