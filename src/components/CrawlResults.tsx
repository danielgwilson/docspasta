'use client';

import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, ExternalLink, Copy } from 'lucide-react';

interface CrawlResult {
  id: string;
  url: string;
  status: 'started' | 'processing' | 'completed' | 'error';
  markdown?: string;
  error?: string;
}

interface CrawlResultsProps {
  result: CrawlResult;
  onCopyMarkdown: (markdown: string) => void;
}

export function CrawlResults({ result, onCopyMarkdown }: CrawlResultsProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-amber-200/50 shadow-xl overflow-hidden">
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-4 sm:p-6 border-b border-amber-200/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`p-2 rounded-lg flex-shrink-0 ${
              result.status === 'completed' 
                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                : result.status === 'error'
                ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
            }`}>
              {result.status === 'completed' ? (
                <CheckCircle className="w-5 h-5" />
              ) : result.status === 'error' ? (
                <XCircle className="w-5 h-5" />
              ) : (
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 capitalize">
                {result.status === 'completed' ? 'Crawl Complete' : 
                 result.status === 'error' ? 'Crawl Failed' : 'Processing...'}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1 truncate">
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{result.url}</span>
              </p>
            </div>
          </div>
          {result.markdown && (
            <Button
              onClick={() => onCopyMarkdown(result.markdown!)}
              size="sm"
              variant="outline"
              className="flex items-center gap-2 w-full sm:w-auto flex-shrink-0"
            >
              <Copy className="w-4 h-4" />
              <span className="sm:inline">Copy Markdown</span>
            </Button>
          )}
        </div>
      </div>
      
      {result.error && (
        <div className="p-6 bg-red-50 dark:bg-red-900/20">
          <p className="text-red-700 dark:text-red-400">{result.error}</p>
        </div>
      )}
      
      {result.markdown && (
        <div className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100">
              Generated Markdown
            </h4>
            <Button
              onClick={() => onCopyMarkdown(result.markdown!)}
              size="sm"
              variant="outline"
              className="flex items-center gap-2 w-full sm:w-auto sm:hidden"
            >
              <Copy className="w-4 h-4" />
              Copy Markdown
            </Button>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 max-h-96 overflow-auto">
            <pre className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono break-words overflow-wrap-anywhere">
              {result.markdown}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}