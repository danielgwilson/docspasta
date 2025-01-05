import type { Express } from "express";
import { createServer } from "http";
import { processDocPage } from "../client/src/lib/openai";
import { DocumentationCrawler } from "../client/src/lib/crawler";
import { JSDOM } from 'jsdom';

async function fetchUrlPreview(url: string) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Documentation Crawler - Preview Bot' }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.text();
  } catch (error) {
    throw new Error(`Failed to fetch URL: ${(error as Error).message}`);
  }
}

export function registerRoutes(app: Express) {
  const httpServer = createServer(app);
  
  // Preview URL metadata
  app.post("/api/preview", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      const html = await fetchUrlPreview(url);
      const dom = new JSDOM(html);
      const doc = dom.window.document;
      
      const title = doc.querySelector('title')?.textContent || 'Untitled Page';
      const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
                         doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
                         'No description available';

      res.json({ title, description });
    } catch (error: any) {
      console.error('Preview error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Test OpenAI API key
  app.post("/api/test-key", async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey) {
        return res.status(400).json({ error: "API key is required" });
      }

      await processDocPage("Test content", apiKey);
      res.json({ success: true });
    } catch (error: any) {
      console.error('API key test error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // Crawl documentation pages with progress updates
  app.post("/api/crawl", async (req, res) => {
    try {
      const { url, settings } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      // Set headers for SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const results: any[] = [];
      const crawler = new DocumentationCrawler(url, {
        maxDepth: settings?.maxDepth ?? 3,
        includeCodeBlocks: settings?.includeCodeBlocks ?? true,
        excludeNavigation: settings?.excludeNavigation ?? true,
        followExternalLinks: settings?.followExternalLinks ?? false,
        timeout: settings?.timeout ?? 300000, // 5 minutes default
        rateLimit: settings?.rateLimit ?? 1000, // 1 request per second default
        maxConcurrentRequests: settings?.maxConcurrentRequests ?? 5
      });

      let processedCount = 0;
      let totalFound = 1; // Start with 1 for the initial URL
      let isFinished = false;

      // Send status updates
      const sendStatus = (type: string, data: any = {}) => {
        if (!res.closed) {
          res.write(`data: ${JSON.stringify({ 
            type,
            ...data,
            status: {
              processed: processedCount,
              total: totalFound,
              remaining: Math.max(0, totalFound - processedCount)
            }
          })}\n\n`);
        }
      };

      // Send initial status
      sendStatus('status');

      // Handle client disconnect
      let isClosed = false;
      req.on('close', () => {
        isClosed = true;
      });

      // Process pages
      try {
        for await (const result of crawler.crawl()) {
          if (isClosed) break;

          if (result.status === "complete") {
            processedCount++;
            results.push(result);
            sendStatus('progress', { result });
          } else if (result.status === "error") {
            console.error('Page processing error:', result.error);
            sendStatus('warning', { 
              message: `Failed to process ${result.url}: ${result.error}` 
            });
          }

          // Update total count based on discovered links
          if (result.newLinksFound) {
            totalFound += result.newLinksFound;
          }
        }

        isFinished = true;
        if (!isClosed) {
          sendStatus('complete', { 
            results,
            summary: {
              totalProcessed: processedCount,
              totalPages: results.length,
              timeElapsed: Date.now() - crawler.startTime
            }
          });
        }
      } catch (error: any) {
        console.error('Crawl iteration error:', error);
        if (!isClosed) {
          sendStatus('error', { error: error.message });
        }
      }

      // Only end the response if we finished normally
      if (isFinished && !isClosed) {
        res.end();
      }
    } catch (error: any) {
      console.error('Crawl initialization error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
        res.end();
      }
    }
  });

  return httpServer;
}