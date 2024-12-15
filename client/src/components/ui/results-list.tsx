import { useState } from "react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
              <Card key={result.url} className="relative overflow-hidden">
                <CardContent className="py-2 px-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0 pr-20">
                      <div className="flex items-baseline gap-2">
                        <h3 className="font-medium truncate text-sm">
                          {result.title}
                        </h3>
                        <span className="text-xs text-muted-foreground truncate">
                          {result.url}
                        </span>
                      </div>
                    </div>
                    <div className="absolute right-2 top-1.5">
                      {result.status === "complete" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => handleCopy(result.content, result.url)}
                          disabled={copying !== null}
                        >
                          {copying === result.url ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
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
                      <Accordion type="single" collapsible>
                        <AccordionItem value="content">
                          <AccordionTrigger>
                            Preview Content
                          </AccordionTrigger>
                          <AccordionContent>
                            <ScrollArea className="h-[400px]">
                              <pre className="text-sm bg-muted p-4 rounded-md overflow-x-auto whitespace-pre-wrap">
                                <code>{result.content}</code>
                              </pre>
                            </ScrollArea>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
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
