export {
  PageResult,
  CrawlerOptions,
  PageNode,
  CrawlMetadata,
  CodeBlock,
} from '../../../shared/types';

// Additional client-specific types
export interface CrawlHistoryEntry {
  url: string;
  title: string;
  timestamp: number;
  pageCount: number;
}

export interface CrawlState {
  isLoading: boolean;
  error: string | null;
  results: PageResult[];
  startUrl: string | null;
  title: string | null;
}
