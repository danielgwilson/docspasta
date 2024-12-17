import type { Express } from "express";
import { createServer } from "http";
import { processDocPage } from "../client/src/lib/openai";
import { DocumentationCrawler } from "../client/src/lib/crawler";
import { JSDOM } from 'jsdom';

export function registerRoutes(app: Express) {
  const httpServer = createServer(app);
  
  // Preview URL metadata
  app.post("/api/preview", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      const html = await fetchPage(url);
      const dom = new JSDOM(html);
      const doc = dom.window.document;
      
      const title = doc.querySelector('title')?.textContent || 'Untitled Page';
      const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
                         doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
                         'No description available';

      res.json({ title, description });
    } catch (error: any) {
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

      // Make a minimal API call to test the key
      await processDocPage("Test content", apiKey);
      
      res.json({ success: true });
    } catch (error: any) {
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
        maxPages: 20, // More reasonable default
        includeCodeBlocks: settings?.includeCodeBlocks ?? true,
        excludeNavigation: settings?.excludeNavigation ?? true,
        followExternalLinks: settings?.followExternalLinks ?? false,
      });

      let processedCount = 0;

      // Send initial status
      res.write(`data: ${JSON.stringify({ 
        type: 'status', 
        processed: processedCount,
        total: 20, // Maximum pages we'll crawl
        remaining: 1 // Starting with 1 URL
      })}\n\n`);

      for await (const result of crawler.crawl()) {
        if (result.status === "complete") {
          processedCount++;
        }
        
        results.push(result);
        
        // Send progress update
        res.write(`data: ${JSON.stringify({ 
          type: 'progress', 
          result,
          status: {
            processed: processedCount,
            total: 20,
            remaining: Math.max(0, 20 - processedCount)
          }
        })}\n\n`);
      }

      // Send completion message
      res.write(`data: ${JSON.stringify({ type: 'complete', results })}\n\n`);
      res.end();
    } catch (error: any) {
      // Only send error if headers haven't been sent
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      }
      // If headers were sent, send error through SSE
      else {
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
        res.end();
      }
    }
  });

  return httpServer;
}