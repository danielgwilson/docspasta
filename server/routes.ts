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

  // Crawl documentation pages
  app.post("/api/crawl", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      const visited = new Set<string>();
      const results: any[] = [];
      let queue = [url];
      const MAX_PAGES = 20;
      let processedCount = 0;

      while (queue.length > 0 && visited.size < MAX_PAGES) {
        const currentUrl = queue.shift()!;
        if (visited.has(currentUrl)) continue;
        visited.add(currentUrl);

        try {
          const html = await fetchPage(currentUrl);
          const title = extractTitle(html);
          const { content, isDocPage } = extractMainContent(html);
          
          if (isDocPage && content) {
            processedCount++;
            // Extract and queue new links before adding result
            // This ensures better breadth-first crawling
            const newLinks = extractLinks(html, currentUrl)
              .filter(link => !visited.has(link) && !queue.includes(link));
            
            // Prioritize links that seem more relevant
            const prioritizedLinks = newLinks.sort((a, b) => {
              const aScore = a.toLowerCase().includes('/guide/') || a.toLowerCase().includes('/tutorial/') ? 1 : 0;
              const bScore = b.toLowerCase().includes('/guide/') || b.toLowerCase().includes('/tutorial/') ? 1 : 0;
              return bScore - aScore;
            });
            
            queue.push(...prioritizedLinks);
            
            results.push({
              url: currentUrl,
              title,
              content,
              status: "complete"
            });
          } else {
            results.push({
              url: currentUrl,
              title,
              content: "",
              status: "error",
              error: processed.error || "Not a valid documentation page"
            });
          }
        } catch (error: any) {
          results.push({
            url: currentUrl,
            title: currentUrl,
            content: "",
            status: "error",
            error: error.message
          });
        }
      }

      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
