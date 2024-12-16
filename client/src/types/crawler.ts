/**
 * Represents a single crawled documentation page result
 */
export interface CrawlResult {
  /** The URL of the crawled page */
  url: string;
  /** Page title extracted from meta or h1 */
  title: string;
  /** Main content of the page */
  content: string;
  /** Status of the crawl operation */
  status: 'processing' | 'complete' | 'error';
  /** Error message if status is 'error' */
  error?: string;
  /** Metadata about the page */
  metadata?: {
    /** Last modified date if available */
    lastModified?: string;
    /** Author if specified */
    author?: string;
    /** Tags or categories */
    tags?: string[];
    /** Programming language if detected */
    language?: string;
  };
  /** Code blocks extracted from the page */
  codeBlocks?: Array<{
    /** The programming language of the code block */
    language: string;
    /** The actual code content */
    content: string;
    /** Optional title or description */
    title?: string;
  }>;
  /** Navigation hierarchy */
  hierarchy?: {
    /** Parent page URL */
    parent?: string;
    /** Child page URLs */
    children?: string[];
    /** Section within the page */
    section?: string;
  };
}

/**
 * Configuration for the crawler
 */
export interface CrawlerSettings {
  /** Maximum depth to crawl */
  maxDepth: number;
  /** Whether to include code blocks */
  includeCodeBlocks: boolean;
  /** Whether to exclude navigation elements */
  excludeNavigation: boolean;
  /** Whether to follow external links */
  followExternalLinks: boolean;
}
