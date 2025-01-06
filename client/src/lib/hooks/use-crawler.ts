'use client';

import { useCallback, useState } from 'react';
import { useCrawlHistory } from '@/lib/context/crawl-history';
import { PageResult } from '../types';

export function useCrawler() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PageResult[]>([]);
  const [startUrl, setStartUrl] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const { addEntry } = useCrawlHistory();

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setResults([]);
    setStartUrl(null);
    setTitle(null);
  }, []);

  const startCrawl = useCallback(
    async (url: string) => {
      try {
        setIsLoading(true);
        setError(null);
        setStartUrl(url);
        setTitle(null);

        const response = await fetch('/api/crawl', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url }),
        });

        if (!response.ok) {
          throw new Error('Failed to start crawl');
        }

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error ?? 'Failed to crawl');
        }

        const newResults = data.results.map((result: any) => ({
          url: result.url,
          title: result.title ?? '',
          content: result.content ?? null,
          status: result.status ?? 'complete',
        }));

        const newTitle = newResults[0]?.title ?? url;

        // Update all state synchronously
        setResults(newResults);
        setTitle(newTitle);
        setIsLoading(false);
        // Add to history immediately
        addEntry(url, newTitle, newResults.length);
      } catch (e) {
        console.error('Crawl error:', e);
        setError(e instanceof Error ? e.message : 'An error occurred');
        setIsLoading(false);
        setResults([]);
      }
    },
    [addEntry]
  );

  return {
    isLoading,
    error,
    results,
    startUrl,
    title,
    startCrawl,
    reset,
  };
}
