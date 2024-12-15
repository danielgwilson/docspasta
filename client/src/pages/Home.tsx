import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress"; 
import { Skeleton } from "@/components/ui/skeleton";
import SettingsPanel from "@/components/ui/settings-panel";
import ResultsList from "@/components/ui/results-list";
import CrawlSummary from "@/components/ui/crawl-summary";
import { ArrowRight, Link2, Loader2 } from "lucide-react";

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
      return new Promise<CrawlResult[]>((resolve, reject) => {
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
                    if (!results.some(r => r.url === result.url)) {
                      results.push(result);
                      setResults([...results]);
                    }
                  } else if (data.type === 'error') {
                    throw new Error(data.error);
                  } else if (data.type === 'complete') {
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
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto space-y-12">
        <AnimatePresence>
          {!crawlMutation.isPending && (
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-5xl font-bold tracking-tight text-center pt-12"
            >
              What docs should I crawl for you?
            </motion.h1>
          )}
        </AnimatePresence>

        <motion.form 
          className="relative"
          animate={{ 
            y: crawlMutation.isPending ? -80 : 0 
          }}
          transition={{ type: "spring", stiffness: 100 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!url || crawlMutation.isPending) return;
            crawlMutation.mutate(url);
          }}
        >
          <div className="relative flex items-center max-w-3xl mx-auto">
            <div className="relative flex-1">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <Link2 className="w-5 h-5 text-muted-foreground" />
              </div>
              <Input
                placeholder="Enter documentation URL (e.g. https://docs.example.com)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="pl-12 pr-[140px] h-14 text-lg rounded-2xl border-2 hover:border-primary/50 transition-colors"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <SettingsPanel />
                <Button 
                  onClick={handleSubmit}
                  disabled={!url || crawlMutation.isPending}
                  size="sm"
                  className="rounded-xl"
                >
                  {crawlMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Crawling...
                    </span>
                  ) : (
                    <>
                      Crawl
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </motion.form>

        <AnimatePresence>
          {!crawlMutation.isPending && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="flex gap-2 justify-center mt-4"
            >
              <Button 
                variant="outline" 
                className="rounded-full text-sm"
                onClick={() => {
                  setUrl("https://react.dev/reference/react");
                  setTimeout(() => crawlMutation.mutate("https://react.dev/reference/react"), 100);
                }}
              >
                Crawl React documentation →
              </Button>
              <Button 
                variant="outline" 
                className="rounded-full text-sm"
                onClick={() => {
                  setUrl("https://nextjs.org/docs");
                  setTimeout(() => crawlMutation.mutate("https://nextjs.org/docs"), 100);
                }}
              >
                Extract Next.js API docs →
              </Button>
              <Button 
                variant="outline" 
                className="rounded-full text-sm"
                onClick={() => {
                  setUrl("https://tailwindcss.com/docs/installation");
                  setTimeout(() => crawlMutation.mutate("https://tailwindcss.com/docs/installation"), 100);
                }}
              >
                Get Tailwind CSS examples →
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {url && !crawlMutation.isPending && previewMutation.data && (
          <Card className="border-dashed">
            <CardContent className="pt-6">
              <div className="space-y-2">
                <h3 className="font-medium">
                  {previewMutation.data.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {previewMutation.data.description}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

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
          <>
            <CrawlSummary results={results} />
            <ResultsList results={results} />
          </>
        )}
      </div>
    </div>
  );
}
