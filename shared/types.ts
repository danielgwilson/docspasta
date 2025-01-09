export interface PageResult {
  url: string;
  title: string;
  content: string;
  status: 'processing' | 'complete' | 'error' | 'skipped';
  depth: number;
  parent?: string;
  error: string;
  newLinksFound: number;
  hierarchy: string[];
  timestamp: number;
  anchor?: string;
  links?: string[];
}

export interface CrawlerOptions {
  maxDepth?: number;
  maxConcurrentRequests?: number;
  rateLimit?: number;
  timeout?: number;
  maxRetries?: number;
  followExternalLinks?: boolean;
  excludeNavigation?: boolean;
  includeCodeBlocks?: boolean;
  includeAnchors?: boolean;
}

export interface PageNode {
  url: string;
  depth: number;
  parent?: string;
}

export interface CrawlMetadata {
  lastModified?: string;
  author?: string;
  tags?: string[];
  language?: string;
}

export interface CodeBlock {
  language: string;
  content: string;
  title?: string;
}
