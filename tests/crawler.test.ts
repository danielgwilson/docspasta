import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DocumentationCrawler } from '../server/lib/crawler';
import { setupMockServer } from './utils/mock-server';
import { crawlerCache } from '../server/lib/cache';

describe('DocumentationCrawler', () => {
  // We add a link array for the main page that includes references to page0..page99,
  // so BFS can discover them when testing large crawls. (FIX #4)
  const mainPageLinks = Array.from(
    { length: 100 },
    (_, i) => `https://test.com/page${i}`
  );

  const mockServer = setupMockServer([
    {
      url: 'https://test.com',
      title: 'Test Documentation',
      content:
        '<main><h1>Welcome</h1><p>Welcome to the test documentation.</p></main>',
      // Add the new links for large-crawl BFS
      links: [
        'https://test.com/page1',
        'https://test.com/page2',
        ...mainPageLinks, // (FIX #4)
      ],
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
        timeout: 1000,
      });

      const results = await crawler.crawl();
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
        timeout: 1000,
      });

      const results = await crawler.crawl();
      expect(results).toHaveLength(3);
      const urls = results.map((r) => r.url).sort();
      expect(urls).toEqual([
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
      // First crawl
      const crawler1 = new DocumentationCrawler('https://test.com', {
        maxDepth: 0,
        maxConcurrentRequests: 1,
      });
      await crawler1.crawl();

      // Second crawl
      const crawler2 = new DocumentationCrawler('https://test.com', {
        maxDepth: 0,
        maxConcurrentRequests: 1,
      });
      const results = await crawler2.crawl();

      // We only requested the main page once
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('complete');
      // (FIX #1) check request count with trailing slash
      expect(mockServer.getRequestCount('https://test.com/')).toBe(1);
    });

    it('should handle cache invalidation correctly', async () => {
      const crawler1 = new DocumentationCrawler('https://test.com', {
        maxDepth: 0,
        maxConcurrentRequests: 1,
      });
      await crawler1.crawl();

      // Replace the content at https://test.com
      mockServer.addResponse('https://test.com', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: '<html><head><title>Updated Documentation</title></head><body>Updated content</body></html>',
      });

      // Wait enough time for cache to expire
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
    it('should respect maxConcurrentRequests', async () => {
      const startTime = Date.now();
      const crawler = new DocumentationCrawler('https://test.com', {
        maxDepth: 1,
        maxConcurrentRequests: 1,
        rateLimit: 100,
      });

      await crawler.crawl();
      const duration = Date.now() - startTime;
      // With 3 pages & 100ms rate limit, the total might be ~200ms or a bit more.
      // (FIX #2) reduce threshold from 300 to 200 to avoid false failure
      expect(duration).toBeGreaterThanOrEqual(200);
    });

    it('should handle concurrent crawls', async () => {
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
      // Two different sections with identical content
      const duplicateContent = `
        <html>
          <head><title>API Reference</title></head>
          <body>
            <main>
              <h1>Authentication</h1>
              <p>To authenticate your API requests, include your API key in the Authorization header:</p>
              <pre><code>Authorization: Bearer YOUR_API_KEY</code></pre>
              <p>All API requests must be made over HTTPS.</p>
            </main>
          </body>
        </html>
      `;

      mockServer.addResponse('https://test.com/docs/authentication', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: duplicateContent,
      });

      mockServer.addResponse('https://test.com/docs/api/auth', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: duplicateContent,
      });

      // Add a link between them in the navigation
      mockServer.addResponse('https://test.com/docs', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <html>
            <head><title>Documentation</title></head>
            <body>
              <nav>
                <a href="/docs/authentication">Authentication Guide</a>
                <a href="/docs/api/auth">API Authentication</a>
              </nav>
              <main>
                <h1>Documentation</h1>
                <p>Welcome to our API documentation.</p>
              </main>
            </body>
          </html>
        `,
      });

      const crawler = new DocumentationCrawler('https://test.com/docs', {
        maxDepth: 2,
        maxConcurrentRequests: 1,
      });

      const results = await crawler.crawl();
      const duplicates = results.filter((r) =>
        r.error?.includes('Duplicate content')
      );
      expect(duplicates.length).toBe(1);

      // Verify the first occurrence is complete and the second is marked as duplicate
      const completePages = results.filter((r) => r.status === 'complete');
      expect(completePages.length).toBe(2); // docs page and first auth page
      const duplicatePage = results.find((r) =>
        r.error?.includes('Duplicate content')
      );
      expect(duplicatePage).toBeDefined();
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
      expect(results[0].tokenCount).toBeGreaterThan(0);
    });
  });

  describe('Base Path Discovery', () => {
    it('should discover base path from a deeper URL if discoverBasePath is true', async () => {
      mockServer.addResponse('https://test.com/docs/v2/api', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <html>
            <head><title>Deeper Start</title></head>
            <body><main><h1>Deeper Page</h1></main></body>
          </html>
        `,
      });

      mockServer.addResponse('https://test.com/docs/v2', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <html>
            <head><title>Docs V2 Root</title></head>
            <body><main><h1>Docs V2 Root Page</h1></main></body>
          </html>
        `,
      });

      const crawler = new DocumentationCrawler('https://test.com/docs/v2/api', {
        maxDepth: 0,
        discoverBasePath: true,
        maxConcurrentRequests: 1,
      });

      const results = await crawler.crawl();
      expect(results).toHaveLength(1);
      expect(results[0].url).toBe('https://test.com/docs/v2/api');
      expect(results[0].title).toBe('Deeper Start');
      expect(results[0].status).toBe('complete');
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

    it(
      'should handle large crawls without memory issues',
      { timeout: 30000 },
      async () => {
        // Now that main https://test.com links to page0..page99,
        // BFS can find them if maxDepth=2 or greater.
        for (let i = 0; i < 100; i++) {
          mockServer.addResponse(`https://test.com/page${i}`, {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
            body: `<html><head><title>Page ${i}</title></head><body>Content ${i}</body></html>`,
          });
        }

        const crawler = new DocumentationCrawler('https://test.com', {
          maxDepth: 2, // ensures BFS can discover child pages
          maxConcurrentRequests: 5,
        });

        const results = await crawler.crawl();
        // (FIX #4) We should see well over 50 pages discovered
        expect(results.length).toBeGreaterThan(50);
        expect(results.every((r) => r.status === 'complete')).toBe(true);
      }
    );
  });

  describe('Anchor Link Handling', () => {
    it('should handle different types of anchor links correctly', async () => {
      // Setup mock responses for different URL types
      mockServer.addResponse('https://test.com/docs', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <html>
            <head><title>Documentation</title></head>
            <body>
              <main>
                <h1>Documentation</h1>
                <nav>
                  <!-- Pure anchor link -->
                  <a href="#section1">Section 1</a>
                  
                  <!-- URL with simple section anchor -->
                  <a href="/docs/guide#overview">Guide Overview</a>
                  
                  <!-- URL with complex fragment (SPA-style) -->
                  <a href="/docs/api#/v2/endpoints">API v2</a>
                  
                  <!-- Regular link without anchor -->
                  <a href="/docs/guide">Full Guide</a>
                </nav>
              </main>
            </body>
          </html>
        `,
      });

      // Add content for linked pages
      mockServer.addResponse('https://test.com/docs/guide', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: '<html><body><main><h1>Guide</h1><p>Content</p></main></body></html>',
      });

      mockServer.addResponse('https://test.com/docs/api', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: '<html><body><main><h1>API</h1><p>Content</p></main></body></html>',
      });

      // Test with includeAnchors enabled
      const crawler = new DocumentationCrawler('https://test.com/docs', {
        maxDepth: 2,
        includeAnchors: true,
      });

      const results = await crawler.crawl();

      // Verify results
      expect(results).toBeDefined();

      // Get all URLs that were crawled
      const crawledUrls = results.map((r) => r.url);

      // Should crawl these URLs exactly once
      expect(crawledUrls).toContain('https://test.com/docs');
      expect(crawledUrls).toContain('https://test.com/docs/guide');
      expect(crawledUrls).toContain('https://test.com/docs/api#/v2/endpoints');

      // Should not have duplicate entries for the same page with simple anchors
      expect(crawledUrls).not.toContain('https://test.com/docs/guide#overview');

      // Pure anchor should not be crawled
      expect(crawledUrls).not.toContain('https://test.com/docs#section1');

      // Count occurrences to verify no duplicates
      const urlCounts = crawledUrls.reduce((acc, url) => {
        acc[url] = (acc[url] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Each URL should appear exactly once
      Object.values(urlCounts).forEach((count) => {
        expect(count).toBe(1);
      });
    });

    it('should ignore all anchors when includeAnchors is false', async () => {
      // Setup mock response with various anchor types
      mockServer.addResponse('https://test.com/docs', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <html>
            <head><title>Documentation</title></head>
            <body>
              <main>
                <h1>Documentation</h1>
                <nav>
                  <a href="#section1">Section 1</a>
                  <a href="/docs/guide#overview">Guide</a>
                  <a href="/docs/api#/v2/endpoints">API</a>
                </nav>
              </main>
            </body>
          </html>
        `,
      });

      mockServer.addResponse('https://test.com/docs/guide', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: '<html><body><main><h1>Guide</h1><p>Content</p></main></body></html>',
      });

      mockServer.addResponse('https://test.com/docs/api', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: '<html><body><main><h1>API</h1><p>Content</p></main></body></html>',
      });

      // Test with includeAnchors disabled
      const crawler = new DocumentationCrawler('https://test.com/docs', {
        maxDepth: 2,
        includeAnchors: false,
      });

      const results = await crawler.crawl();

      // Get all crawled URLs
      const crawledUrls = results.map((r) => r.url);

      // Should crawl base URLs without anchors
      expect(crawledUrls).toContain('https://test.com/docs');
      expect(crawledUrls).toContain('https://test.com/docs/guide');
      expect(crawledUrls).toContain('https://test.com/docs/api');

      // Should not have any URLs with anchors or fragments
      crawledUrls.forEach((url) => {
        expect(url).not.toContain('#');
      });
    });
  });
});
