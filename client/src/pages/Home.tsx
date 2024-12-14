import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress"; 
import SettingsPanel from "@/components/ui/settings-panel";
import ResultsList from "@/components/ui/results-list";

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

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              DocCrawler
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <SettingsPanel />

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
