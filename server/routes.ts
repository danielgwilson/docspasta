import type { Express } from "express";
import { createServer } from "http";
import { processDocPage } from "../client/src/lib/openai";
import { fetchPage, extractLinks, extractTitle } from "../client/src/lib/crawler";

export function registerRoutes(app: Express) {
  const httpServer = createServer(app);
  
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
      const { url, apiKey } = req.body;
      if (!url || !apiKey) {
        return res.status(400).json({ error: "URL and API key are required" });
      }

      const visited = new Set<string>();
      const results: any[] = [];
      let queue = [url];
      const MAX_PAGES = 20;

      while (queue.length > 0 && visited.size < MAX_PAGES) {
        const currentUrl = queue.shift()!;
        if (visited.has(currentUrl)) continue;
        visited.add(currentUrl);

        try {
          const html = await fetchPage(currentUrl);
          const title = extractTitle(html);
          
          // Process with OpenAI
          const processed = await processDocPage(html, apiKey);
          
          if (processed.isValid && processed.content) {
            results.push({
              url: currentUrl,
              title,
              content: processed.content,
              status: "complete"
            });

            // Extract and queue new links
            const newLinks = extractLinks(html, currentUrl)
              .filter(link => !visited.has(link));
            queue.push(...newLinks);
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
