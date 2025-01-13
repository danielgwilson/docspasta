import express, { type Express } from 'express';
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer, createLogger } from 'vite';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { type Server } from 'http';
import viteConfig from '../vite.config';

/**
 * A shared logger for the Vite setup tasks.
 */
const viteLogger = createLogger();

/**
 * Logs server messages with a timestamp and source label.
 */
export function log(message: string, source = 'express'): void {
  const formattedTime = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

/**
 * Sets up Vite in middleware mode for development, attaching it to the existing Express app/server.
 */
export async function setupVite(app: Express, server: Server): Promise<void> {
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        if (
          msg.includes('[TypeScript] Found 0 errors. Watching for file changes')
        ) {
          log('no errors found', 'tsc');
          return;
        }

        if (msg.includes('[TypeScript] ')) {
          const [errors, summary] = msg.split('[TypeScript] ', 2);
          log(`${summary} ${errors}\u001b[0m`, 'tsc');
          return;
        } else {
          viteLogger.error(msg, options);
          process.exit(1);
        }
      },
    },
    server: {
      middlewareMode: true,
      hmr: { server },
    },
    appType: 'custom',
  });

  app.use(vite.middlewares);
  app.use('*', async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        __dirname,
        '..',
        'client',
        'index.html'
      );

      // Always reload the index.html
      const template = await fs.promises.readFile(clientTemplate, 'utf-8');
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

/**
 * Serves the production build from the `public` folder.
 */
export function serveStatic(app: Express): void {
  const distPath = path.resolve(__dirname, 'public');

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // Fallback to index.html if no file is found
  app.use('*', (_req, res) => {
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
}
