export type CrawlResult = {
  url: string;
  title: string;
  content: string;
  status: 'processing' | 'complete' | 'error';
  error?: string;
};
