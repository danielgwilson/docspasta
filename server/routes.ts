import express, { type Express } from 'express';
import { createServer, type Server } from 'http';
import { DocumentationCrawler } from './lib/crawler';

export function registerRoutes(app: Express): Server {
  const router = express.Router();

  router.post('/api/crawl', async (req, res) => {
    const { url, settings = {} } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    try {
      console.log('Starting crawl with settings:', settings);
      const crawler = new DocumentationCrawler(url, settings, (result) => {
        // Send progress updates through SSE
        if (req.headers.accept?.includes('text/event-stream')) {
          res.write(`data: ${JSON.stringify({ type: 'progress', result })}\n\n`);
        }
      });

      // Set up SSE if client accepts it
      if (req.headers.accept?.includes('text/event-stream')) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
      }

      const results = await crawler.crawl();

      // Send final results
      if (req.headers.accept?.includes('text/event-stream')) {
        res.write(`data: ${JSON.stringify({ type: 'complete', results })}\n\n`);
        res.end();
      } else {
        res.json({ success: true, results });
      }
    } catch (error: unknown) {
      console.error('Crawl error:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';

      if (req.headers.accept?.includes('text/event-stream')) {
        res.write(
          `data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`
        );
        res.end();
      } else {
        res.status(500).json({ success: false, error: errorMessage });
      }
    }
  });

  router.get('/api/crawl/:id/status', (req, res) => {
    // TODO: Implement crawl status endpoint
    res.status(501).json({ error: 'Not implemented' });
  });

  // Mount the router
  app.use(router);

  // Create and return the HTTP server
  const httpServer = createServer(app);
  return httpServer;
}

export default registerRoutes;