import { z } from 'zod';

export interface CrawlerOptions {
  maxDepth?: number;
  includeCodeBlocks?: boolean;
  excludeNavigation?: boolean;
  followExternalLinks?: boolean;
  timeout?: number;
  rateLimit?: number;
  maxConcurrentRequests?: number;
}

export interface PageResult {
  url: string;
  title: string;
  content: string;
  depth: number;
  parent?: string;
  hierarchy: Record<string, string | null>;
  anchor?: string | null;
  status: 'complete' | 'error';
  error?: string;
}

export interface PageNode {
  url: string;
  depth: number;
  parent?: string;
  hierarchy?: Record<string, string | null>;
  anchor?: string | null;
}

export interface VisitedPage {
  url: string;
  fingerprint: string;
  depth: number;
  title: string;
  parent?: string;
  hierarchy: Record<string, string | null>;
  anchor?: string | null;
}

export const crawlerOptionsSchema = z.object({
  maxDepth: z.number().optional().default(5),
  includeCodeBlocks: z.boolean().optional().default(true),
  excludeNavigation: z.boolean().optional().default(true),
  followExternalLinks: z.boolean().optional().default(false),
  timeout: z.number().optional().default(300000),
  rateLimit: z.number().optional().default(1000),
  maxConcurrentRequests: z.number().optional().default(5)
});

export type ValidatedCrawlerOptions = z.infer<typeof crawlerOptionsSchema>;
