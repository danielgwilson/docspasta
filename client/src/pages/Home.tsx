import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { URLInput } from '@/components/crawler/URLInput';
import { QuickActions } from '@/components/crawler/QuickActions';
import { CrawlProgress } from '@/components/crawler/CrawlProgress';
import { ResultsList } from '@/components/crawler/ResultsList';
import { CrawlSummary } from '@/components/crawler/CrawlSummary';
import type { CrawlResult } from '@/types/crawler';

export default function Home() {
  console.log('🏠 Home component mounted');

  const [url, setUrl] = useState('');
  const [results, setResults] = useState<CrawlResult[]>([]);
  const [settings, setSettings] = useState({
    maxDepth: 3,
    includeCodeBlocks: true,
    excludeNavigation: true,
    followExternalLinks: false,
  });
  const { toast } = useToast();

  // Add effect to monitor results state changes
  useEffect(() => {
    console.log('📊 Results state updated:', {
      length: results.length,
      results,
    });
  }, [results]);

  const crawlMutation = useMutation({
    mutationFn: async (input: string) => {
      console.log('🔍 Starting crawl for:', input, 'with settings:', settings);
      try {
        const response = await fetch('/api/crawl', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            url: input,
            settings: {
              ...settings,
              maxDepth: Number(settings.maxDepth),
            },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.log('🚫 Server error response:', errorText);
          throw new Error(errorText || 'Network response was not ok');
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('Failed to get response reader');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim() || !line.startsWith('data: ')) continue;

            try {
              const data = JSON.parse(line.slice(6));
              console.log('📡 SSE update:', data);

              switch (data.type) {
                case 'progress':
                  setResults((prev) => {
                    const newResults = [...prev];
                    const index = newResults.findIndex(
                      (r) => r.url === data.result.url
                    );
                    if (index >= 0) {
                      newResults[index] = data.result;
                    } else {
                      newResults.push(data.result);
                    }
                    return newResults;
                  });
                  break;

                case 'complete':
                  return data;

                case 'error':
                  throw new Error(data.error);
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }

        throw new Error('Stream ended without completion');
      } catch (error) {
        console.log('❌ Fetch error:', error);
        throw error;
      }
    },
    onMutate: (input) => {
      console.log('⏳ Setting initial processing state for:', input);
      const initialState: CrawlResult[] = [
        {
          url: input,
          title: 'Processing...',
          content: '',
          status: 'processing',
        },
      ];
      setResults(initialState);
      console.log('⏳ Initial state set:', initialState);
    },
    onSuccess: (data) => {
      console.log(
        '✅ Mutation succeeded, full response:',
        JSON.stringify(data, null, 2)
      );

      if (!data || typeof data !== 'object') {
        console.log('❌ Invalid response data format:', data);
        return;
      }

      const crawlResults = Array.isArray(data.results) ? data.results : [];
      console.log('📊 Processed results array:', crawlResults);

      const completedPages = crawlResults.filter(
        (r: CrawlResult) => r.status === 'complete'
      ).length;

      console.log(`🎯 Setting results with ${completedPages} completed pages`);
      setResults(crawlResults);

      toast({
        title: 'Crawl Complete',
        description: `Processed ${completedPages} pages successfully`,
      });
    },
    onError: (error: Error) => {
      console.log('❌ Crawl error:', error);
      const message = error.message.includes('Invalid URL')
        ? 'Please enter a valid URL (e.g., https://example.com/docs)'
        : error.message;

      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
        duration: 5000,
      });
      setResults([]);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    crawlMutation.mutate(url);
  };

  // Preview URL mutation
  const previewMutation = useMutation({
    mutationFn: async (input: string) => {
      const response = await fetch('/api/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: input, settings }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
  });

  // Debounced URL preview
  useEffect(() => {
    if (!url) return;

    const timeoutId = setTimeout(() => {
      previewMutation.mutate(url);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [url]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 sm:py-10 space-y-6 sm:space-y-10 max-w-5xl">
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tighter">
            Documentation Crawler
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Enter a URL to start crawling documentation pages
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <URLInput
            url={url}
            isLoading={crawlMutation.isPending}
            onUrlChange={setUrl}
            onSubmit={() => crawlMutation.mutate(url)}
            settings={settings}
            onSettingsChange={(newSettings) => {
              if (newSettings) {
                setSettings(newSettings);
              }
              return settings;
            }}
          />

          <QuickActions
            isLoading={crawlMutation.isPending}
            onSelect={(selectedUrl) => {
              setUrl(selectedUrl);
              setTimeout(() => crawlMutation.mutate(selectedUrl), 100);
            }}
          />
        </div>

        {url && !crawlMutation.isPending && previewMutation.data && (
          <Card className="border-dashed">
            <CardContent className="p-4">
              <div className="space-y-2">
                <h3 className="font-medium">{previewMutation.data.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {previewMutation.data.description}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {crawlMutation.isPending && (
          <CrawlProgress results={results} isFinished={false} />
        )}

        {results.length > 0 && !crawlMutation.isPending && (
          <div className="space-y-6">
            <CrawlProgress results={results} isFinished />
            <CrawlSummary results={results} />
            <ResultsList results={results} />
          </div>
        )}
      </div>
    </div>
  );
}
