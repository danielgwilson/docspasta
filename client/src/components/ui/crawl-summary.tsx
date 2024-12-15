import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CrawlResult } from "@/pages/Home";
import { FileText, CheckCircle, XCircle, Link as LinkIcon } from "lucide-react";

interface CrawlSummaryProps {
  results: CrawlResult[];
}

export default function CrawlSummary({ results }: CrawlSummaryProps) {
  const completedPages = results.filter(r => r.status === "complete").length;
  const errorPages = results.filter(r => r.status === "error").length;
  const totalWordCount = results
    .filter(r => r.status === "complete")
    .reduce((sum, r) => sum + r.content.split(/\s+/).length, 0);
  
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
              Words
            </div>
            <p className="text-2xl font-bold">
              {Intl.NumberFormat('en-US', { notation: 'compact' }).format(totalWordCount)}
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
