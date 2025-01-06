'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy, Download } from 'lucide-react';
import type { PageResult } from '@/lib/types';

interface ResultsListProps {
  results: PageResult[];
  startUrl: string;
  title: string;
  isLoading: boolean;
}

export function ResultsList({
  results,
  startUrl,
  title,
  isLoading,
}: ResultsListProps) {
  const copyResults = async () => {
    try {
      const text = results
        .map((page) => `# ${page.title}\n\n${page.content}`)
        .join('\n\n---\n\n');
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Failed to copy results:', error);
    }
  };

  const exportResults = () => {
    try {
      const blob = new Blob([JSON.stringify(results, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.toLowerCase().replace(/\s+/g, '-')}-${
        new Date().toISOString().split('T')[0]
      }.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export results:', error);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{title}</CardTitle>
              <div className="text-sm text-muted-foreground">{startUrl}</div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={copyResults}
                disabled={isLoading}>
                <Copy className="h-4 w-4" />
                Copy All
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={exportResults}
                disabled={isLoading}>
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {results.map((result, index) => (
              <div key={result.url} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{result.title}</h3>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            result.content ?? ''
                          );
                        } catch (error) {
                          console.error('Failed to copy content:', error);
                        }
                      }}
                      disabled={isLoading}>
                      <Copy className="h-4 w-4" />
                      <span className="sr-only">Copy</span>
                    </Button>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {result.url}
                </div>
                {result.content && (
                  <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-lg">
                    {result.content}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
