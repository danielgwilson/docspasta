'use client';

import { Button } from '@/components/ui/button';
import { useCrawler } from '@/lib/hooks/use-crawler';
import { useCrawlHistory } from '@/lib/context/crawl-history';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { CrawlerForm } from './crawler-form';
import { ResultsList } from './results-list';
import { HistoryGrid } from './history-grid';

export function CrawlerContainer() {
  const { isLoading, error, results, startUrl, title, startCrawl, reset } =
    useCrawler();
  const { recentHistory, pinnedHistory } = useCrawlHistory();

  const showHistory = pinnedHistory.length > 0 || recentHistory.length > 0;

  return (
    <div className="container mx-auto py-8 space-y-8">
      {results.length > 0 ? (
        <>
          <div className="flex justify-end">
            <Button variant="outline" onClick={reset}>
              New Crawl
            </Button>
          </div>
          <ResultsList
            results={results}
            startUrl={startUrl!}
            title={title!}
            isLoading={isLoading}
          />
        </>
      ) : (
        <Card className="max-w-2xl mx-auto">
          <CardHeader className="space-y-2">
            <CardTitle className="text-4xl">Docspasta</CardTitle>
            <CardDescription className="text-xl">
              Enter the URL of the documentation you want to crawl. The crawler
              will extract content from all pages under the same domain.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-8">
            <CrawlerForm onSubmit={startCrawl} isLoading={isLoading} />

            {error && (
              <div className="text-destructive text-center py-4">{error}</div>
            )}
          </CardContent>
        </Card>
      )}

      {showHistory && (
        <Card className={results.length > 0 ? undefined : 'max-w-2xl mx-auto'}>
          <CardContent className="pt-6">
            <HistoryGrid onSelect={startCrawl} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
