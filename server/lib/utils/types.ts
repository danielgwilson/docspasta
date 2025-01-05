import { z } from 'zod';

export const crawlerOptionsSchema = z.object({
  maxDepth: z.number().int().positive().default(3),
  includeCodeBlocks: z.boolean().default(true),
  excludeNavigation: z.boolean().default(true),
  followExternalLinks: z.boolean().default(false),
  timeout: z.number().int().positive().default(300000),
  rateLimit: z.number().int().positive().default(1000),
  maxConcurrentRequests: z.number().int().positive().default(5),
  includeAnchors: z.boolean().default(false),
});

export type CrawlerOptions = z.input<typeof crawlerOptionsSchema>;
export type ValidatedCrawlerOptions = z.output<typeof crawlerOptionsSchema>;

export interface PageNode {
  url: string;
  depth: number;
  parent?: string;
}

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
