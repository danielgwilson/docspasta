import type { Express } from "express";
import { createServer } from "http";
import { processDocPage } from "../client/src/lib/openai";
import { fetchPage, extractLinks, extractTitle, extractMainContent } from "../client/src/lib/crawler";
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
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      // Set headers for SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const visited = new Set<string>();
      const results: any[] = [];
      let queue = [url];
      const MAX_PAGES = 20;
      let processedCount = 0;

      // Send initial status
      res.write(`data: ${JSON.stringify({ 
        type: 'status', 
        processed: processedCount,
        total: MAX_PAGES,
        remaining: queue.length
      })}\n\n`);

      const CONCURRENT_REQUESTS = 5;
      
      async function processBatch() {
        if (queue.length === 0 || visited.size >= MAX_PAGES) return;
        
        const batch = [];
        while (batch.length < CONCURRENT_REQUESTS && queue.length > 0 && visited.size < MAX_PAGES) {
          const url = queue.shift()!;
          if (!visited.has(url)) {
            visited.add(url);
            batch.push(url);
          }
        }
        
        await Promise.all(batch.map(async (currentUrl) => {
          try {
            const html = await fetchPage(currentUrl);
            const title = extractTitle(html);
            const { content, isDocPage } = extractMainContent(html);
            
            if (content) {
              processedCount++;
              // Extract and queue new links
              const newLinks = extractLinks(html, currentUrl)
                .filter(link => !visited.has(link) && !queue.includes(link));
              
              queue.push(...newLinks);
              
              const result = {
                url: currentUrl,
                title,
                content,
                status: "complete"
              };
              results.push(result);
              
              // Send progress update
              res.write(`data: ${JSON.stringify({ 
                type: 'progress', 
                result,
                status: {
                  processed: processedCount,
                  total: MAX_PAGES,
                  remaining: queue.length
                }
              })}\n\n`);
            } else {
              const result = {
                url: currentUrl,
                title,
                content: "",
                status: "error",
                error: "Empty or invalid content"
              };
              results.push(result);
              res.write(`data: ${JSON.stringify({ type: 'progress', result })}\n\n`);
            }
          } catch (error: any) {
            const result = {
              url: currentUrl,
              title: currentUrl,
              content: "",
              status: "error",
              error: error.message
            };
            results.push(result);
            res.write(`data: ${JSON.stringify({ type: 'progress', result })}\n\n`);
          }
        }));
        
        if (queue.length > 0 && visited.size < MAX_PAGES) {
          await processBatch();
        }
      }
      
      await processBatch();
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