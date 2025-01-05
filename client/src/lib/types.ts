export interface PageResult {
  status: 'complete' | 'error';
  url: string;
  title?: string;
  content?: string;
  depth: number;
  parent?: string;
  hierarchy?: string[];
  anchor?: string;
  newLinksFound?: number;
  error?: string;
  timestamp: number;
}

export interface CrawlerOptions {
  maxDepth?: number;
  includeCodeBlocks?: boolean;
  excludeNavigation?: boolean;
  followExternalLinks?: boolean;
  includeAnchors?: boolean;
  timeout?: number;
  rateLimit?: number;
  maxConcurrentRequests?: number;
}
