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
      const apiKey = localStorage.getItem("openai_api_key");
      if (!apiKey) {
        throw new Error("Please set your OpenAI API key in settings first");
      }

      const response = await fetch("/api/crawl", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: input, apiKey }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
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
      setResults(data);
      toast({
        title: "Crawl Complete",
        description: `Processed ${data.length} pages successfully`,
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
              <Progress value={undefined} className="w-full" />
              <p className="text-sm text-muted-foreground mt-2">
                Crawling documentation pages...
              </p>
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
