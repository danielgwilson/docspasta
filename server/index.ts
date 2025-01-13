import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import registerRoutes from './routes';
import { setupVite, serveStatic, log } from './vite';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Simple request logging + response capturing
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, unknown> | undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on('finish', () => {
    const duration = Date.now() - start;
    if (path.startsWith('/api')) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + '…';
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = registerRoutes(app);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as any).status || (err as any).statusCode || 500;
    const message = (err as any).message || 'Internal Server Error';

    res.status(status).json({ message });
    throw err;
  });

  // Setup Vite in dev, or serve static in production
  if (app.get('env') === 'development') {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    log(`serving on port ${PORT}`);
  });
})();
