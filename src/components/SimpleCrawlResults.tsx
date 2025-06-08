'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Copy, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SimpleCrawlResultsProps {
  crawlId: string;
  onComplete?: (markdown: string) => void;
}

export function SimpleCrawlResults({ crawlId, onComplete }: SimpleCrawlResultsProps) {
  const [status, setStatus] = useState<'loading' | 'active' | 'completed' | 'failed'>('loading');
  const [markdown, setMarkdown] = useState<string>('');
  const [progress, setProgress] = useState({ current: 0, total: 0, phase: 'initializing' });
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [hasReceivedRealProgress, setHasReceivedRealProgress] = useState(false);

  useEffect(() => {
    if (!crawlId) return;

    console.log(`🎯 SimpleCrawlResults: Starting SSE for ${crawlId}`);
    
    const eventSource = new EventSource(`/api/crawl-v2/${crawlId}/stream`);
    
    eventSource.onopen = () => {
      console.log('✅ SSE connected');
      setStatus('active');
    };
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📨 SSE event:', data.type, data);
        
        if (data.type === 'progress' && data.data) {
          const processed = data.data.progress?.processed || data.data.progress?.current || 0;
          const total = data.data.progress?.total || 0;
          const phase = data.data.progress?.phase || 'crawling';
          
          // Ignore initial 0/0 snapshots
          if (total > 0 || phase !== 'initializing') {
            setHasReceivedRealProgress(true);
            setProgress({
              current: processed,
              total: total || 1, // Prevent division by zero
              phase: phase
            });
          }
        } else if (data.type === 'complete' && data.data) {
          console.log('🎉 Crawl complete!', data.data);
          setStatus('completed');
          
          // Get markdown from the completion event
          if (data.data.markdown) {
            setMarkdown(data.data.markdown);
            onComplete?.(data.data.markdown);
          } else {
            console.warn('⚠️ No markdown in completion event');
            // Fallback: fetch from API
            fetchCrawlData();
          }
          
          eventSource.close();
        } else if (data.type === 'error') {
          setStatus('failed');
          setError(data.error || 'Unknown error');
          eventSource.close();
        }
      } catch (e) {
        console.error('Failed to parse SSE event:', e);
      }
    };
    
    eventSource.onerror = (e) => {
      console.error('SSE error:', e);
      eventSource.close();
      // Fallback to polling
      pollCrawlStatus();
    };
    
    // Cleanup
    return () => {
      console.log('🧹 Closing SSE connection');
      eventSource.close();
    };
  }, [crawlId]);

  const fetchCrawlData = async () => {
    try {
      const response = await fetch(`/api/crawl-v2/${crawlId}`);
      const result = await response.json();
      
      if (result.success && result.data) {
        console.log('📦 Fetched crawl data:', result.data);
        
        if (result.data.markdown) {
          setMarkdown(result.data.markdown);
          onComplete?.(result.data.markdown);
        } else if (result.data.results && result.data.results.length > 0) {
          // Build markdown from results
          const combinedMarkdown = result.data.results
            .map((r: any) => r.content)
            .filter(Boolean)
            .join('\n\n---\n\n');
          setMarkdown(combinedMarkdown);
          onComplete?.(combinedMarkdown);
        }
      }
    } catch (e) {
      console.error('Failed to fetch crawl data:', e);
    }
  };

  const pollCrawlStatus = async () => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/crawl-v2/${crawlId}`);
        const result = await response.json();
        
        if (result.success && result.data) {
          const processed = result.data.progress?.processed || result.data.progress?.current || 0;
          const total = result.data.progress?.total || 0;
          
          if (total > 0) {
            setHasReceivedRealProgress(true);
            setProgress({
              current: processed,
              total: total,
              phase: result.data.progress?.phase || 'crawling'
            });
          }
          
          if (result.data.status === 'completed') {
            setStatus('completed');
            if (result.data.markdown) {
              setMarkdown(result.data.markdown);
              onComplete?.(result.data.markdown);
            }
            clearInterval(pollInterval);
          } else if (result.data.status === 'failed') {
            setStatus('failed');
            setError(result.data.errorMessage || 'Crawl failed');
            clearInterval(pollInterval);
          }
        }
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, 2000);

    // Cleanup
    return () => clearInterval(pollInterval);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  const getProgressPercentage = () => {
    if (progress.total === 0) return 0;
    return Math.round((progress.current / progress.total) * 100);
  };

  // Loading state
  if (status === 'loading') {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-amber-600" />
        <p className="text-gray-600 mt-2">Connecting to crawler...</p>
      </div>
    );
  }

  // Active crawling state
  if (status === 'active') {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-amber-200/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <h3 className="font-semibold">
            {progress.phase === 'initializing' || !hasReceivedRealProgress
              ? 'Starting crawler...'
              : progress.phase === 'discovering'
              ? 'Discovering URLs...'
              : 'Crawling pages...'}
          </h3>
        </div>
        
        <div className="space-y-3">
          {hasReceivedRealProgress ? (
            <>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Progress</span>
                <span>{progress.current} / {progress.total} pages</span>
              </div>
              
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${getProgressPercentage()}%` }}
                />
              </div>
              
              <p className="text-sm text-gray-500">{getProgressPercentage()}% complete</p>
            </>
          ) : (
            <p className="text-sm text-gray-500">
              {progress.phase === 'discovering' 
                ? 'Analyzing site structure...'
                : 'Initializing crawler...'}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Failed state
  if (status === 'failed') {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
        <div className="flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-700 dark:text-red-400">Crawl Failed</h3>
            <p className="text-sm text-red-600 dark:text-red-300 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Completed state
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-amber-200/50 overflow-hidden">
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 p-6 border-b border-green-200/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-600" />
            <div>
              <h3 className="font-semibold text-green-700 dark:text-green-400">
                Crawl Complete!
              </h3>
              <p className="text-sm text-green-600 dark:text-green-300">
                Successfully extracted {progress.current} pages
              </p>
            </div>
          </div>
          
          <Button
            onClick={handleCopy}
            size="sm"
            variant="outline"
            className="border-green-200 hover:bg-green-50 dark:hover:bg-green-900/20"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Copy Markdown
              </>
            )}
          </Button>
        </div>
      </div>
      
      {markdown && (
        <div className="p-6">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <pre className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto">
              <code className="text-xs">{markdown.substring(0, 500)}...</code>
            </pre>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            {markdown.length} characters extracted
          </p>
        </div>
      )}
    </div>
  );
}