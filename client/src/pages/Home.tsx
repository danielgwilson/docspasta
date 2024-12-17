import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { URLInput } from "@/components/crawler/URLInput";
import { QuickActions } from "@/components/crawler/QuickActions";
import { CrawlProgress } from "@/components/crawler/CrawlProgress";
import ResultsList from "@/components/ui/results-list";
import CrawlSummary from "@/components/ui/crawl-summary";
import type { CrawlResult } from "@/types/crawler";

export default function Home() {
  const [url, setUrl] = useState("");
  const [results, setResults] = useState<CrawlResult[]>([]);
  const [settings, setSettings] = useState({
    maxDepth: 3,
    includeCodeBlocks: true,
    excludeNavigation: true,
    followExternalLinks: false,
  });
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
          body: JSON.stringify({ url: input, settings }),
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error("Network response was not ok");
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error("No response body");

            const decoder = new TextDecoder();
            let buffer = "";

            function processText(text: string) {
              const lines = text.split("\n");
              lines.forEach((line) => {
                if (line.startsWith("data: ")) {
                  try {
                    const data = JSON.parse(line.slice(5));
                    if (data.type === "progress") {
                      const result = data.result;
                      if (!results.some((r) => r.url === result.url)) {
                        results.push(result);
                        setResults([...results]);
                      }
                    } else if (data.type === "error") {
                      throw new Error(data.error);
                    } else if (data.type === "complete") {
                      setResults([...results]);
                      resolve(results);
                    }
                  } catch (e) {
                    console.error("Error parsing SSE data:", e);
                  }
                }
              });
            }

            async function pump(): Promise<void> {
              if (!reader) {
                return Promise.reject(new Error("No response body"));
              }

              const { done, value } = await reader.read();

              if (done) {
                if (buffer.length > 0) processText(buffer);
                resolve(results);
                return;
              }

              const text = decoder.decode(value, { stream: true });
              buffer += text;
              const lines = buffer.split("\n\n");
              buffer = lines.pop() || "";
              lines.forEach((line) => processText(line));

              return pump();
            }

            pump().catch(reject);
          })
          .catch(reject);
      });
    },
    onMutate: (input) => {
      setResults([
        {
          url: input,
          title: "Processing...",
          content: "",
          status: "processing",
        },
      ]);
    },
    onSuccess: (data) => {
      const completedPages = data.filter((r) => r.status === "complete").length;
      toast({
        title: "Crawl Complete",
        description: `Processed ${completedPages} pages successfully`,
      });
    },
    onError: (error: Error) => {
      const message = error.message.includes('Invalid URL') 
        ? 'Please enter a valid URL (e.g., https://example.com/docs)'
        : error.message;
      
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
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
      const response = await fetch("/api/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
    <div className="min-h-screen bg-background flex items-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-3xl w-full mx-auto space-y-12">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4">
            <AnimatePresence mode="wait">
              {!crawlMutation.isPending && (
                <motion.h1
                  key="title"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="text-5xl font-bold tracking-tight text-center pb-8"
                >
                  What docs should I crawl for you?
                </motion.h1>
              )}
            </AnimatePresence>
  
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
          </div>
  
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

        {crawlMutation.isPending && <CrawlProgress results={results} isFinished={false} />}

        <AnimatePresence mode="wait">
          {results.length > 0 && !crawlMutation.isPending && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <CrawlProgress results={results} isFinished />
              {/* <CrawlSummary results={results} /> */}
              <ResultsList results={results} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
