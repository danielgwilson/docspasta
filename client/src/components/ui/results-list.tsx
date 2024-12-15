import { useState } from "react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { CrawlResult } from "@/pages/Home";
import { Copy, CheckCircle, XCircle, Loader2 } from "lucide-react";

interface ResultsListProps {
  results: CrawlResult[];
}

export default function ResultsList({ results }: ResultsListProps) {
  const [copying, setCopying] = useState<string | null>(null);
  const { toast } = useToast();

  const handleCopy = async (content: string, url: string) => {
    try {
      setCopying(url);
      await navigator.clipboard.writeText(content);
      toast({
        title: "Copied!",
        description: "Content copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy content",
        variant: "destructive",
      });
    } finally {
      setCopying(null);
    }
  };

  const handleCopyAll = async () => {
    try {
      setCopying("all");
      const allContent = `================================================================
Documentation Collection
================================================================
Total Pages: ${results.filter(r => r.status === "complete").length}
Timestamp: ${new Date().toISOString()}
Source: docspasta crawler

${results
  .filter(r => r.status === "complete")
  .map(r => r.content)
  .join("\n\n")}

================================================================
End of Documentation
================================================================`;
      await navigator.clipboard.writeText(allContent);
      toast({
        title: "Copied All",
        description: "All content copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy content",
        variant: "destructive",
      });
    } finally {
      setCopying(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Results</CardTitle>
        <Button
          onClick={handleCopyAll}
          disabled={copying !== null || !results.some(r => r.status === "complete")}
        >
          {copying === "all" ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Copy className="h-4 w-4 mr-2" />
          )}
          Copy All
        </Button>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-4">
            {results.map((result) => (
              <Card key={result.url}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-medium">
                        {result.title}
                      </h3>
                      <a 
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-muted-foreground hover:underline"
                      >
                        {result.url}
                      </a>
                    </div>
                    {result.status === "complete" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopy(result.content, result.url)}
                        disabled={copying !== null}
                      >
                        {copying === result.url ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Copy className="h-4 w-4 mr-2" />
                        )}
                        Copy
                      </Button>
                    )}
                  </div>
                  
                  <div className="mt-2 flex items-center gap-2">
                    {result.status === "processing" && (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Processing...
                        </span>
                      </>
                    )}
                    {result.status === "complete" && (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-muted-foreground">
                          Complete
                        </span>
                      </>
                    )}
                    {result.status === "error" && (
                      <>
                        <XCircle className="h-4 w-4 text-destructive" />
                        <span className="text-sm text-destructive">
                          {result.error || "Error processing page"}
                        </span>
                      </>
                    )}
                  </div>

                  {result.status === "complete" && (
                    <div className="mt-4">
                      <pre className="text-sm bg-muted p-4 rounded-md overflow-x-auto">
                        <code>
                          {result.content.slice(0, 200)}...
                        </code>
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
