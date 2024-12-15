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
import { Copy, CheckCircle, XCircle, Loader2, ChevronDown } from "lucide-react";

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
          <div className="space-y-1">
            {results.map((result) => (
              <>
                <div key={result.url} className="group flex items-center gap-2 py-1.5 px-2 hover:bg-muted/50 rounded-sm">
                  <div className="flex-none w-5">
                    {result.status === "processing" && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    {result.status === "complete" && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                    {result.status === "error" && (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0 flex items-baseline gap-2">
                    <h3 className="font-medium truncate text-sm">
                      {result.title}
                    </h3>
                    <span className="text-xs text-muted-foreground truncate">
                      {result.url}
                    </span>
                    {result.status === "error" && (
                      <span className="text-xs text-destructive">
                        {result.error || "Error processing page"}
                      </span>
                    )}
                  </div>

                  {result.status === "complete" && (
                    <div className="flex-none opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => handleCopy(result.content, result.url)}
                        disabled={copying !== null}
                      >
                        {copying === result.url ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          const el = document.querySelector(`[data-accordion-id="${result.url}"]`);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                          }
                        }}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {result.status === "complete" && (
                  <Accordion type="single" collapsible className="px-2">
                    <AccordionItem value="preview" data-accordion-id={result.url}>
                      <AccordionTrigger className="py-2">
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
                )}
              </>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
