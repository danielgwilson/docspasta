import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress"; 
import { Skeleton } from "@/components/ui/skeleton";
import SettingsPanel from "@/components/ui/settings-panel";
import ResultsList from "@/components/ui/results-list";
import { ArrowRight } from "lucide-react";

export type CrawlResult = {
  url: string;
  title: string;
  content: string;
  status: 'processing' | 'complete' | 'error';
  error?: string;
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [results, setResults] = useState<CrawlResult[]>([]);
  const { toast } = useToast();

  const crawlMutation = useMutation({
    mutationFn: async (input: string) => {
      return new Promise((resolve, reject) => {
        const results: CrawlResult[] = [];
        
        fetch("/api/crawl", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: input }),
        }).then(response => {
          if (!response.ok) {
            throw new Error('Network response was not ok');
          }
          
          const reader = response.body?.getReader();
          if (!reader) throw new Error('No response body');
          
          const decoder = new TextDecoder();
          let buffer = '';
          
          function processText(text: string) {
            const lines = text.split('\n');
            lines.forEach(line => {
              if (line.startsWith('data: ')) {
                try {
                    const data = JSON.parse(line.slice(5));
                    if (data.type === 'progress') {
                      const result = data.result;
                      // Only add if not already present
                      if (!results.some(r => r.url === result.url)) {
                        results.push(result);
                        setResults([...results]);
                      }
                    } else if (data.type === 'error') {
                      throw new Error(data.error);
                    } else if (data.type === 'complete') {
                      // Update results one final time before resolving
                      setResults([...results]);
                      resolve(results);
                    }
                  } catch (e) {
                    console.error('Error parsing SSE data:', e);
                  }
              }
            });
          }
          
          function pump(): Promise<void> {
            return reader.read().then(({done, value}) => {
              if (done) {
                if (buffer.length > 0) processText(buffer);
                resolve(results);
                return;
              }
              
              const text = decoder.decode(value, {stream: true});
              buffer += text;
              const lines = buffer.split('\n\n');
              buffer = lines.pop() || '';
              lines.forEach(line => processText(line));
              
              return pump();
            });
          }
          
          pump().catch(reject);
        }).catch(reject);
      });
    },
    onMutate: (input) => {
      setResults([{
        url: input,
        title: "Processing...",
        content: "",
        status: "processing"
      }]);
    },
    onSuccess: (data) => {
      const completedPages = data.filter(r => r.status === "complete").length;
      toast({
        title: "Crawl Complete",
        description: `Processed ${completedPages} pages successfully`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
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
      const response = await fetch("/api/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: input }),
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
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              DocsPasta
            </CardTitle>
            <SettingsPanel />
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="flex gap-4">
              <Input
                type="url"
                placeholder="Enter documentation URL..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1"
              />
              <Button 
                type="submit" 
                disabled={crawlMutation.isPending}
              >
                {crawlMutation.isPending ? "Crawling..." : "Crawl"}
              </Button>
            </form>

            {url && !crawlMutation.isPending && (
              <Card className="border-dashed">
                <CardContent className="pt-6">
                  {previewMutation.isPending ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  ) : previewMutation.isError ? (
                    <p className="text-sm text-muted-foreground">
                      Enter a valid documentation URL to see a preview
                    </p>
                  ) : previewMutation.data ? (
                    <div className="space-y-2">
                      <h3 className="font-medium">{previewMutation.data.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {previewMutation.data.description}
                      </p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        {crawlMutation.isPending && (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Progress 
                  value={results.filter(r => r.status === "complete").length} 
                  max={Math.max(results.length, results.filter(r => r.status === "complete").length + 1)} 
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>
                    Processed: {results.filter(r => r.status === "complete").length} pages 
                    {results.some(r => r.status === "processing") && " (scanning for more...)"}
                  </span>
                  {results.length > 0 && (
                    <span>
                      Currently processing: {results[results.length - 1].title}
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {results.length > 0 && (
          <ResultsList results={results} />
        )}
      </div>
    </div>
  );
}