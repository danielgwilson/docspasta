import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Copy, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { CrawlResult } from '@/types/crawler';

interface ResultsListProps {
  results: CrawlResult[];
}

export function ResultsList({ results }: ResultsListProps) {
  const { toast } = useToast();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isCopyingAll, setIsCopyingAll] = useState(false);

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(cleanContent(text));
      setCopiedIndex(index);
      toast({
        title: 'Copied!',
        description: 'Content copied to clipboard',
      });
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      toast({
        title: 'Failed to copy',
        description: 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const handleCopyAll = async () => {
    try {
      setIsCopyingAll(true);
      const allContent = results
        .map((r) => `# ${r.title}\n\n${cleanContent(r.content)}`)
        .join('\n\n---\n\n');
      await navigator.clipboard.writeText(allContent);
      toast({
        title: 'Copied All!',
        description: 'All content copied to clipboard',
      });
      setTimeout(() => setIsCopyingAll(false), 2000);
    } catch (err) {
      toast({
        title: 'Failed to copy',
        description: 'Please try again',
        variant: 'destructive',
      });
      setIsCopyingAll(false);
    }
  };

  const handleExport = (result: CrawlResult) => {
    const cleanedResult = {
      ...result,
      content: cleanContent(result.content),
    };
    const blob = new Blob([JSON.stringify(cleanedResult, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: 'Exported!',
      description: 'Result saved as JSON',
    });
  };

  const cleanContent = (content: string): string => {
    return (
      content
        // Remove excessive newlines (more than 2)
        .replace(/\n{3,}/g, '\n\n')
        // Remove lines that are just whitespace or single characters
        .replace(/^\s*[\r\n]{1,2}|^[\s\u200B]+$/gm, '')
        // Remove unnecessary whitespace at the end of lines
        .replace(/\s+$/gm, '')
        // Remove zero-width spaces
        .replace(/\u200B/g, '')
        // Normalize markdown headers with no content
        .replace(/#{1,6}\s*\n/g, '')
        // Clean up empty markdown links
        .replace(/\[\s*\]\(\s*\)/g, '')
        // Remove empty navigation sections
        .replace(/Navigation\s*\n\s*\n/gi, 'Navigation\n')
        // Trim the final string
        .trim()
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold tracking-tight">Results</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={handleCopyAll}>
            {isCopyingAll ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Copied All
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Copy All
              </>
            )}
          </Button>
          <Button
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={() => {
              const blob = new Blob([JSON.stringify(results, null, 2)], {
                type: 'application/json',
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'crawler-results.json';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);

              toast({
                title: 'Exported All!',
                description: 'All results saved as JSON',
              });
            }}>
            <Download className="mr-2 h-4 w-4" />
            Export All
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        {results.map((result, index) => (
          <Card key={result.url} className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 sm:px-6">
              <CardTitle className="text-xl font-semibold line-clamp-1">
                {result.title || 'Untitled'}
              </CardTitle>
              <div className="flex gap-2 ml-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopy(result.content, index)}>
                  {copiedIndex === index ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleExport(result)}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline break-all">
                    {result.url}
                  </a>
                </div>
                <ScrollArea className="h-[200px] sm:h-[300px] w-full rounded-md border p-4">
                  <pre className="text-sm whitespace-pre-wrap">
                    {cleanContent(result.content)}
                  </pre>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
