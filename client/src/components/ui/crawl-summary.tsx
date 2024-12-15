import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CrawlResult } from "@/pages/Home";
import { FileText, CheckCircle, XCircle, Link as LinkIcon, Hash } from "lucide-react";
import { encode } from "gpt-tokenizer";

interface CrawlSummaryProps {
  results: CrawlResult[];
}

export default function CrawlSummary({ results }: CrawlSummaryProps) {
  const completedResults = results.filter(r => r.status === "complete");
  const completedPages = completedResults.length;
  const errorPages = results.filter(r => r.status === "error").length;
  
  const totalWordCount = completedResults
    .reduce((sum, r) => sum + r.content.split(/\s+/).length, 0);
    
  const totalTokenCount = completedResults
    .reduce((sum, r) => sum + encode(r.content).length, 0);
  
  const uniqueDomains = new Set(
    results.map(r => {
      try {
        return new URL(r.url).hostname;
      } catch {
        return r.url;
      }
    })
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Crawl Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="flex items-center text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 mr-1" />
              Completed
            </div>
            <p className="text-2xl font-bold">{completedPages}</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center text-sm text-muted-foreground">
              <XCircle className="h-4 w-4 mr-1" />
              Errors
            </div>
            <p className="text-2xl font-bold">{errorPages}</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center text-sm text-muted-foreground">
              <FileText className="h-4 w-4 mr-1" />
              Words / Tokens
            </div>
            <p className="text-2xl font-bold">
              {Intl.NumberFormat('en-US', { notation: 'compact' }).format(totalWordCount)}
              <span className="text-sm text-muted-foreground ml-1">
                (~{Intl.NumberFormat('en-US', { notation: 'compact' }).format(totalTokenCount)} tokens)
              </span>
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center text-sm text-muted-foreground">
              <LinkIcon className="h-4 w-4 mr-1" />
              Domains
            </div>
            <p className="text-2xl font-bold">{uniqueDomains.size}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
