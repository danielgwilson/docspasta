'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, ExternalLink, Copy, Check, Info } from 'lucide-react';

interface CrawlProgress {
  current: number;
  total: number;
  phase: 'discovery' | 'crawling' | 'completed' | 'failed';
  message: string;
  // Enhanced tracking
  discovered?: number;
  queued?: number;
  processed?: number;
  filtered?: number;
  skipped?: number;
  failed?: number;
}

interface CrawlResult {
  id: string;
  url: string;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  markdown?: string;
  error?: string;
  errorMessage?: string;
  progress?: CrawlProgress;
}

interface CrawlResultsProps {
  result: CrawlResult;
  onCopyMarkdown: (markdown: string) => void;
}

export function CrawlResultsEnhanced({ result, onCopyMarkdown }: CrawlResultsProps) {
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleCopy = async (markdown: string) => {
    await onCopyMarkdown(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getProgressPercentage = () => {
    if (!result.progress || result.progress.total === 0) return 0;
    return Math.min((result.progress.current / result.progress.total) * 100, 100);
  };

  const getStatusColor = () => {
    switch (result.status) {
      case 'completed': return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
      case 'failed':
      case 'cancelled': return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
      default: return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
    }
  };

  const getStatusIcon = () => {
    switch (result.status) {
      case 'completed': return <CheckCircle className="w-5 h-5" />;
      case 'failed':
      case 'cancelled': return <XCircle className="w-5 h-5" />;
      default: return <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />;
    }
  };

  const getStatusText = () => {
    switch (result.status) {
      case 'completed': return 'Crawl Complete';
      case 'failed': return 'Crawl Failed';
      case 'cancelled': return 'Crawl Cancelled';
      case 'active': return result.progress?.phase === 'discovery' ? 'Discovering URLs...' : 'Processing...';
      default: return 'Processing...';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-amber-200/50 shadow-xl overflow-hidden">
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-4 sm:p-6 border-b border-amber-200/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`p-2 rounded-lg flex-shrink-0 ${getStatusColor()}`}>
              {getStatusIcon()}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 capitalize">
                {getStatusText()}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1 truncate">
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{result.url}</span>
              </p>
              
              {/* Enhanced progress display - show for all statuses to see final stats */}
              {result.progress && (
                <div className="mt-3">
                  {/* Progress message - only show during active crawling */}
                  {(result.status === 'active') && (
                    <>
                      <div className="text-sm text-blue-600 dark:text-blue-400 mb-2">
                        {result.progress.message}
                      </div>
                      
                      {/* Progress bar */}
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${getProgressPercentage()}%` }}
                        />
                      </div>
                    </>
                  )}
                  
                  {/* Progress statistics - always show if we have the data */}
                  <div className="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-400">
                    {result.progress.discovered !== undefined && (
                      <span>Discovered: {result.progress.discovered}</span>
                    )}
                    {result.progress.queued !== undefined && (
                      <span className="font-medium">Queued: {result.progress.queued}</span>
                    )}
                    {result.progress.processed !== undefined && (
                      <span className="text-green-600 dark:text-green-400">
                        Processed: {result.progress.processed}
                      </span>
                    )}
                    {(result.progress.skipped || 0) > 0 && (
                      <span className="text-yellow-600 dark:text-yellow-400">
                        Skipped: {result.progress.skipped}
                      </span>
                    )}
                    {(result.progress.failed || 0) > 0 && (
                      <span className="text-red-600 dark:text-red-400">
                        Failed: {result.progress.failed}
                      </span>
                    )}
                  </div>
                  
                  {/* Show/hide details toggle - show if we have filtering data */}
                  {((result.progress.filtered && result.progress.filtered > 0) || 
                    (result.progress.skipped && result.progress.skipped > 0)) && (
                    <button
                      onClick={() => setShowDetails(!showDetails)}
                      className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                    >
                      <Info className="w-3 h-3" />
                      {showDetails ? 'Hide' : 'Show'} details
                    </button>
                  )}
                  
                  {/* Detailed breakdown */}
                  {showDetails && (
                    <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs space-y-1">
                      <div>
                        URLs discovered: {result.progress.discovered || 0}
                      </div>
                      {(result.progress.filtered || 0) > 0 && (
                        <div className="text-yellow-600 dark:text-yellow-400">
                          Filtered out (robots.txt, patterns): {result.progress.filtered}
                        </div>
                      )}
                      {(result.progress.skipped || 0) > 0 && (
                        <div className="text-gray-600 dark:text-gray-400">
                          Skipped (duplicates): {result.progress.skipped}
                        </div>
                      )}
                      <div className="font-medium text-blue-600 dark:text-blue-400">
                        Actually queued for crawling: {result.progress.queued || 0}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Error display */}
              {(result.status === 'failed' || result.status === 'cancelled') && (result.error || result.errorMessage) && (
                <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                  {result.errorMessage || result.error}
                </div>
              )}
            </div>
          </div>
          
          {/* Copy button */}
          {result.markdown && (
            <Button
              onClick={() => handleCopy(result.markdown!)}
              size="sm"
              variant="outline"
              className="flex items-center gap-2 w-full sm:w-auto flex-shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span className="sm:inline">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span className="sm:inline">Copy</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>
      
      {/* Error display */}
      {(result.status === 'failed' || result.status === 'cancelled') && (result.error || result.errorMessage) && (
        <div className="p-6 bg-red-50 dark:bg-red-900/20">
          <p className="text-red-700 dark:text-red-400">{result.errorMessage || result.error}</p>
        </div>
      )}
      
      {/* Markdown display */}
      {result.markdown && (
        <div className="p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100">
              Generated Markdown
            </h4>
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