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
      const allContent = results
        .filter(r => r.status === "complete")
        .map(r => r.content)
        .join("\n\n");
      
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
      <CardHeader className="flex flex-row items-center justify-between pb-2">
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
          <div>
            {results.map((result, index) => (
              <div key={result.url}>
                <div className="group flex items-center py-1 hover:bg-muted/50 rounded-sm">
                  {/* Status Icon */}
                  <div className="flex-none w-4 ml-1">
                    {result.status === "processing" && (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    )}
                    {result.status === "complete" && (
                      <CheckCircle className="h-3 w-3 text-green-500" />
                    )}
                    {result.status === "error" && (
                      <XCircle className="h-3 w-3 text-destructive" />
                    )}
                  </div>
                  
                  {/* Title and URL */}
                  <div className="flex-1 min-w-0 ml-2">
                    <div className="flex items-baseline gap-2 truncate">
                      <span className="font-medium text-sm truncate">
                        {result.title}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {result.url}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  {result.status === "complete" && (
                    <div className="flex-none opacity-0 group-hover:opacity-100 transition-opacity mr-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => handleCopy(result.content, result.url)}
                        disabled={copying !== null}
                      >
                        {copying === result.url ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => {
                          const el = document.querySelector(`[data-accordion-id="${result.url}"]`);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                          }
                        }}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Preview Content */}
                {result.status === "complete" && (
                  <Accordion type="single" collapsible>
                    <AccordionItem value="preview" data-accordion-id={result.url}>
                      <AccordionTrigger className="py-1 px-2 text-xs">
                        Preview Content
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="px-2">
                          <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap">
                            <code>{result.content}</code>
                          </pre>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
