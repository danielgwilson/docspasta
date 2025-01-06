import { z } from 'zod';

export interface PageResult {
  url: string;
  title: string;
  content: string | null;
  status: 'complete' | 'error' | 'skipped';
}

export interface CrawlSettings {
  maxPages?: number;
  maxDepth?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  timeout?: number;
}
