import { z } from 'zod';

/**
 * Zod schema describing crawler options, with defaults.
 */
export const crawlerOptionsSchema = z.object({
  maxDepth: z.number().int().positive().default(3),
  includeCodeBlocks: z.boolean().default(true),
  excludeNavigation: z.boolean().default(true),
  followExternalLinks: z.boolean().default(false),
  timeout: z.number().int().positive().default(300000),
  rateLimit: z.number().int().positive().default(1000),
  maxConcurrentRequests: z.number().int().positive().default(5),
  includeAnchors: z.boolean().default(false),
  /** Newly added for re-architecture. */
  discoverBasePath: z.boolean().default(true),
  /** Previously not in the schema, now added to fix 'maxRetries' references. */
  maxRetries: z.number().int().positive().default(3),
});

/**
 * The raw (unvalidated) shape of crawler options that can be passed in.
 */
export type CrawlerOptions = z.input<typeof crawlerOptionsSchema>;

/**
 * The validated shape of crawler options after parsing with Zod.
 */
export type ValidatedCrawlerOptions = z.output<typeof crawlerOptionsSchema>;

/**
 * Basic node for representing a discovered page and its hierarchy in a crawl.
 */
export interface PageNode {
  /** The full URL of the page. */
  url: string;
  /** The depth in the crawl hierarchy, starting from 0. */
  depth: number;
  /** The parent page's URL, if any. */
  parent?: string;
}

/**
 * The result of crawling a page, including relevant metadata.
 */
export interface PageResult {
  /** The current status of the crawl for this page. */
  status: 'complete' | 'error' | 'skipped';
  /** The page's URL. */
  url: string;
  /** The page's <title> or derived title, if available. */
  title?: string;
  /** The extracted, processed content in Markdown format, if any. */
  content?: string;
  /** The depth in the crawl hierarchy, starting from 0. */
  depth: number;
  /** The parent page's URL, if any. */
  parent?: string;
  /** An array of hierarchical headings encountered, if extracted. */
  hierarchy?: string[];
  /** For anchor-based crawls, the anchor ID if relevant. */
  anchor?: string;
  /** How many new child links were discovered during this page's processing. */
  newLinksFound?: number;
  /** If the crawl encountered an error on this page, it's stored here. */
  error?: string;
  /** Unix timestamp (ms) when this page finished crawling. */
  timestamp: number;
  /** List of child links found on this page (optional extension used in crawler). */
  links?: string[];
  /** Approx token count for the processed content. */
  tokenCount?: number;
}
