import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  FileText,
  Code,
  Link as LinkIcon,
  AlertCircle,
} from 'lucide-react';

interface PageResult {
  status: 'complete' | 'error';
  url: string;
  title?: string;
  content?: string;
  depth: number;
  parent?: string;
  hierarchy?: string[];
  anchor?: string;
  newLinksFound?: number;
  error?: string;
  timestamp: number;
}

interface CrawlerResultsProps {
  results: PageResult[];
  onExport: () => void;
}

export function CrawlerResults({ results, onExport }: CrawlerResultsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTab, setSelectedTab] = useState('all');

  const successfulResults = results.filter((r) => r.status === 'complete');
  const failedResults = results.filter((r) => r.status === 'error');

  const filteredResults = results.filter((result) => {
    if (searchTerm === '') return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      result.url.toLowerCase().includes(searchLower) ||
      result.title?.toLowerCase().includes(searchLower) ||
      result.content?.toLowerCase().includes(searchLower)
    );
  });

  const displayResults =
    selectedTab === 'all'
      ? filteredResults
      : selectedTab === 'success'
      ? filteredResults.filter((r) => r.status === 'complete')
      : filteredResults.filter((r) => r.status === 'error');

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* Summary */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">
              Crawler Results
            </h2>
            <p className="text-sm text-muted-foreground">
              {successfulResults.length} pages processed, {failedResults.length}{' '}
              errors
            </p>
          </div>
          <Button onClick={onExport}>Export Results</Button>
        </div>

        {/* Search and Filters */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <div className="flex-1">
              <Label htmlFor="search" className="sr-only">
                Search Results
              </Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search results..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>

          <Tabs value={selectedTab} onValueChange={setSelectedTab}>
            <TabsList>
              <TabsTrigger value="all">
                All ({filteredResults.length})
              </TabsTrigger>
              <TabsTrigger value="success">
                Success ({successfulResults.length})
              </TabsTrigger>
              <TabsTrigger value="error">
                Errors ({failedResults.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Results List */}
        <ScrollArea className="h-[600px] pr-4">
          <div className="space-y-4">
            {displayResults.map((result, index) => (
              <Card
                key={`${result.url}-${index}`}
                className={`p-4 ${
                  result.status === 'error' ? 'border-red-200 bg-red-50' : ''
                }`}>
                <div className="space-y-2">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <h3 className="font-medium">
                          {result.title || result.url}
                        </h3>
                        <Badge
                          variant={
                            result.status === 'complete'
                              ? 'default'
                              : 'destructive'
                          }>
                          {result.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground break-all">
                        {result.url}
                      </p>
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                    <div className="flex items-center">
                      <FileText className="mr-1 h-4 w-4" />
                      Depth: {result.depth}
                    </div>
                    {result.newLinksFound !== undefined && (
                      <div className="flex items-center">
                        <LinkIcon className="mr-1 h-4 w-4" />
                        {result.newLinksFound} new links
                      </div>
                    )}
                    {result.parent && (
                      <div className="flex items-center">
                        <Code className="mr-1 h-4 w-4" />
                        From: {new URL(result.parent).pathname}
                      </div>
                    )}
                  </div>

                  {/* Content Preview or Error */}
                  {result.status === 'complete' && result.content && (
                    <div className="mt-2">
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {result.content}
                      </p>
                    </div>
                  )}
                  {result.status === 'error' && result.error && (
                    <div className="mt-2 flex items-start space-x-2 text-red-600">
                      <AlertCircle className="h-4 w-4 mt-0.5" />
                      <p className="text-sm">{result.error}</p>
                    </div>
                  )}

                  {/* Hierarchy */}
                  {result.hierarchy && result.hierarchy.length > 0 && (
                    <div className="mt-2">
                      <div className="flex flex-wrap gap-1">
                        {result.hierarchy.map((item, i) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            className="text-xs">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>
    </Card>
  );
}
