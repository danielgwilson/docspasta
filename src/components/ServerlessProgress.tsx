'use client'

import { useServerlessCrawl } from '@/hooks/useServerlessCrawl'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { FileText, Zap, XCircle } from 'lucide-react'
import type { ProgressEvent } from '@/lib/serverless/types'

export default function ServerlessProgress() {
  const [inputUrl, setInputUrl] = useState('')
  const { jobId, url, isLoading, error, events, startCrawl, stopCrawl } = useServerlessCrawl()
  
  // Listen for quick action events
  useEffect(() => {
    const handleQuickAction = (e: CustomEvent) => {
      setInputUrl(e.detail)
      startCrawl({
        url: e.detail,
        maxPages: 50,
        maxDepth: 2,
        qualityThreshold: 20,
      })
    }
    
    window.addEventListener('quickaction', handleQuickAction as EventListener)
    return () => window.removeEventListener('quickaction', handleQuickAction as EventListener)
  }, [startCrawl])
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!inputUrl) return
    
    await startCrawl({
      url: inputUrl,
      maxPages: 50,
      maxDepth: 2,
      qualityThreshold: 20,
    })
  }
  
  // Calculate totals from batch_completed events
  let completedUrls = 0
  let failedUrls = 0
  let discoveredUrls = 0
  
  for (const event of events) {
    if (event.type === 'batch_completed') {
      completedUrls += (event as any).completed || 0
      failedUrls += (event as any).failed || 0
      discoveredUrls += (event as any).discovered || 0
    }
  }
  
  // Ensure at least 1 URL (the initial URL)
  discoveredUrls = discoveredUrls || 1
  
  const isComplete = events.some(e => e.type === 'job_completed' || e.type === 'stream_end')
  
  return (
    <>
      {/* Main Input */}
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-300"></div>
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-6 border border-amber-200/50 shadow-xl">
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="https://docs.example.com"
                  className="pl-10 pr-4 py-3 text-lg border-0 bg-gray-50 dark:bg-gray-800 focus:bg-white dark:focus:bg-gray-700 rounded-xl transition-all duration-200 w-full"
                  disabled={isLoading}
                />
              </div>
              <Button 
                type="submit" 
                disabled={isLoading || !inputUrl.trim()}
                size="lg"
                className="px-8 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 rounded-xl font-semibold w-full sm:w-auto"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Crawling...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5" />
                    Paste It!
                  </div>
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <XCircle className="w-5 h-5" />
              <span className="font-medium">Error:</span>
              <span>{error}</span>
            </div>
          </div>
        </div>
      )}

      {/* Progress Display */}
      {jobId && (
        <div className="max-w-4xl mx-auto space-y-6">
          <Card className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-800 p-6">
            <div className="space-y-4">
              {/* Status Badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${isComplete ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`} />
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {isComplete ? 'Crawl Complete' : 'Crawling in Progress'}
                  </span>
                </div>
                {isLoading && (
                  <Button onClick={stopCrawl} variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                    Stop Crawl
                  </Button>
                )}
              </div>

              {/* Progress Bar */}
              {discoveredUrls > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>Progress: {completedUrls + failedUrls} / {discoveredUrls} pages</span>
                    <span>{Math.round(((completedUrls + failedUrls) / discoveredUrls) * 100)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${((completedUrls + failedUrls) / discoveredUrls) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span className="text-green-600">✓ {completedUrls} Success</span>
                    {failedUrls > 0 && <span className="text-red-600">✗ {failedUrls} Failed</span>}
                  </div>
                </div>
              )}

              {/* Current Activity */}
              {!isComplete && events.length > 0 && (
                <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3 text-sm">
                  {(() => {
                    const lastEvent = events[events.length - 1]
                    if (lastEvent.type === 'url_completed' && lastEvent.url) {
                      return (
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">Processing: </span>
                          <span className="text-gray-900 dark:text-gray-100 truncate">{lastEvent.url}</span>
                        </div>
                      )
                    }
                    return <span className="text-gray-600 dark:text-gray-400">Initializing crawler...</span>
                  })()}
                </div>
              )}
            </div>
          </Card>

          {/* Event Stream (collapsible) */}
          <details className="group">
            <summary className="cursor-pointer list-none">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
                <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                View detailed event stream ({events.filter(e => e && e.type).length} events)
              </div>
            </summary>
            <Card className="mt-3 p-4 max-h-96 overflow-y-auto">
              <div className="space-y-2 text-sm">
                {events.filter(event => event && event.type).map((event, index) => (
                  <div key={index} className="flex items-start gap-2 py-1 border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <span className="text-gray-500 text-xs tabular-nums">
                      {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : 'Now'}
                    </span>
                    <div className="flex-1">
                      <span className={`font-medium ${
                        event.type === 'batch_completed' ? 'text-green-600' :
                        event.type === 'batch_error' || event.type === 'job_failed' ? 'text-red-600' :
                        event.type === 'urls_discovered' ? 'text-blue-600' :
                        event.type === 'job_completed' ? 'text-purple-600' :
                        'text-gray-700 dark:text-gray-300'
                      }`}>
                        {event.type.replace(/_/g, ' ')}
                      </span>
                      {event.type === 'url_completed' && event.url && <div className="text-gray-600 dark:text-gray-400 truncate">{event.url}</div>}
                      {(event.type === 'error' || event.type === 'job_failed' || event.type === 'batch_error') && event.error && <div className="text-red-600 text-xs">{event.error}</div>}
                      {event.type === 'batch_completed' && event.completed !== undefined && <div className="text-gray-600">Processed {event.completed} pages{event.failed && event.failed > 0 && `, ${event.failed} failed`}</div>}
                      {event.type === 'urls_discovered' && event.count !== undefined && <div className="text-gray-600">Found {event.count} new URLs</div>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </details>

          {/* Results (when complete) */}
          {isComplete && (
            <Card className="p-6 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <h3 className="text-lg font-semibold text-green-900 dark:text-green-100 mb-2">
                ✅ Crawl Complete!
              </h3>
              <p className="text-green-700 dark:text-green-300">
                Successfully crawled {completedUrls} pages from {url}
              </p>
              <div className="mt-4 flex gap-3">
                <Button variant="outline" size="sm">
                  Copy Markdown
                </Button>
                <Button variant="outline" size="sm">
                  Download
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </>
  )
}