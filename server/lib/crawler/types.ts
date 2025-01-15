export interface PageResult {
  url: string;
  title: string;
  content: string;
  tokenCount?: number;
  timestamp: number;
}

export interface CrawlerOptions {
  maxPages?: number;
  maxDepth?: number;
  includeAnchors?: boolean;
  concurrency?: number;
  timeout?: number;
  allowedDomains?: string[];
  excludePatterns?: RegExp[];
}

export interface CrawlerProgress {
  visited: number;
  errors: number;
  queued: number;
  results: number;
  timeElapsed: number;
}
