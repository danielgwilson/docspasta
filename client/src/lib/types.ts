import { z } from 'zod';

export interface PageResult {
  status: 'complete' | 'error' | 'skipped';
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

// Define schema for validation
export const crawlerOptionsSchema = z.object({
  maxDepth: z.number().min(1).default(3),
  includeCodeBlocks: z.boolean().default(true),
  excludeNavigation: z.boolean().default(true),
  followExternalLinks: z.boolean().default(false),
  includeAnchors: z.boolean().default(false),
  timeout: z.number().min(1000).default(30000),
  rateLimit: z.number().min(0).default(1000),
  maxConcurrentRequests: z.number().min(1).default(5)
});

export type ValidatedCrawlerOptions = z.infer<typeof crawlerOptionsSchema>;