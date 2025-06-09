'use client'

import { useState, useEffect, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Copy, Check } from 'lucide-react'

interface QueueSSEEvent {
  type: string
  crawlId?: string
  status?: string
  phase?: string
  processed?: number
  total?: number
  percentage?: number
  discoveredUrls?: number
  failedUrls?: number
  currentUrl?: string
  currentActivity?: string
  results?: any[]
  markdown?: string
  error?: string
  message?: string
  timestamp: number
}

interface QueueSSECrawlResultsProps {
  crawlId: string
  onComplete?: (markdown: string) => void
}

export function QueueSSECrawlResults({ crawlId, onComplete }: QueueSSECrawlResultsProps) {
  const [progress, setProgress] = useState({
    phase: 'idle',
    processed: 0,
    total: 0,
    percentage: 0,
    discoveredUrls: 0,
    failedUrls: 0,
    currentActivity: '',
  })
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)

  const startSSEConnection = () => {
    console.log('[Queue SSE] Starting SSE connection for crawlId:', crawlId)
    
    // Reset state
    setProgress({
      phase: 'connecting',
      processed: 0,
      total: 0,
      percentage: 0,
      discoveredUrls: 0,
      failedUrls: 0,
      currentActivity: 'Connecting to crawl...',
    })
    setError(null)
    setMarkdown(null)
    setIsConnected(false)

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    // Connect to SSE status endpoint
    const eventSource = new EventSource(`/api/crawl-v2/${crawlId}/status`)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      console.log('[Queue SSE] SSE connection opened')
      setIsConnected(true)
    }

    eventSource.onmessage = (event) => {
      try {
        const data: QueueSSEEvent = JSON.parse(event.data)
        console.log('[Queue SSE] Received event:', data.type, data)
        
        switch (data.type) {
          case 'connected':
            break
            
          case 'initial_status':
            setProgress(prev => ({
              ...prev,
              phase: data.progress?.phase || 'active',
              processed: data.progress?.processed || 0,
              total: data.progress?.total || 0,
              percentage: data.progress?.percentage || 0,
              discoveredUrls: data.progress?.discoveredUrls || 0,
              failedUrls: data.progress?.failedUrls || 0,
              currentActivity: data.progress?.message || 'Resuming crawl...',
            }))
            break
            
          case 'progress':
            setProgress(prev => ({
              ...prev,
              phase: data.phase || prev.phase,
              processed: data.processed ?? prev.processed,
              total: data.total ?? prev.total,
              percentage: data.percentage ?? prev.percentage,
              discoveredUrls: data.discoveredUrls ?? prev.discoveredUrls,
              failedUrls: data.failedUrls ?? prev.failedUrls,
              currentActivity: data.currentActivity || data.message || prev.currentActivity,
            }))
            break
            
          case 'completed':
            console.log('[Queue SSE] Crawl completed successfully')
            setProgress(prev => ({
              ...prev,
              phase: 'completed',
              currentActivity: 'Crawl completed successfully!',
            }))
            
            if (data.markdown) {
              setMarkdown(data.markdown)
              setError(null) // Clear any previous errors
              onComplete?.(data.markdown)
            } else if (data.results) {
              // Build markdown from results
              const combinedMarkdown = data.results
                .map((r: any) => `# ${r.title}\n\n> Source: ${r.url}\n\n${r.content}`)
                .join('\n\n---\n\n')
              setMarkdown(combinedMarkdown)
              setError(null)
              onComplete?.(combinedMarkdown)
            }
            
            // Close connection after completion
            setTimeout(() => {
              eventSource.close()
              setIsConnected(false)
            }, 1000)
            break
            
          case 'error':
            console.log('[Queue SSE] Crawl error:', data.message || data.error)
            setError(data.message || data.error || 'Unknown error')
            setProgress(prev => ({
              ...prev,
              phase: 'error',
              currentActivity: 'Crawl failed',
            }))
            eventSource.close()
            setIsConnected(false)
            break
            
          case 'heartbeat':
            // Keep connection alive
            break
            
          default:
            console.log('[Queue SSE] Unknown event type:', data.type)
        }
      } catch (err) {
        console.error('[Queue SSE] Failed to parse event:', err, event.data)
      }
    }

    eventSource.onerror = (err) => {
      console.error('[Queue SSE] EventSource error:', err)
      setIsConnected(false)
      if (!markdown) { // Only set error if we haven't completed successfully
        setError('Connection lost')
      }
    }

    eventSource.onclose = () => {
      console.log('[Queue SSE] EventSource closed')
      setIsConnected(false)
    }
  }

  // Start SSE connection when crawlId is provided
  useEffect(() => {
    if (crawlId) {
      console.log('[Queue SSE] useEffect triggered with crawlId:', crawlId)
      setError(null)
      
      // Small delay to ensure queue worker has time to save the crawl
      setTimeout(() => {
        startSSEConnection()
      }, 1000) // 1 second delay
    }
  }, [crawlId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[Queue SSE] Component unmounting')
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  // Phase display mapping
  const getPhaseDisplay = () => {
    switch (progress.phase) {
      case 'starting':
      case 'initializing':
        return '🚀 Starting crawler...'
      case 'discovery':
      case 'discovering':
        return '🗺️ Discovering URLs...'
      case 'crawling':
        return '📄 Crawling pages...'
      case 'completed':
        return '✅ Crawl completed!'
      case 'failed':
      case 'error':
        return '❌ Crawl failed'
      default:
        if (isConnected && !markdown && !error) {
          return '🔄 Processing...'
        }
        return '⏸️ Idle'
    }
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        {/* Status Indicator */}
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            progress.phase === 'completed' ? 'bg-green-500' : 
            progress.phase === 'error' ? 'bg-red-500' :
            isConnected ? 'bg-blue-500' : 'bg-gray-400'
          }`} />
          <span className="text-sm text-muted-foreground">
            {progress.phase === 'completed' ? 'Complete' :
             progress.phase === 'error' ? 'Error' :
             isConnected ? 'Live' : 'Finished'}
          </span>
          {crawlId && (
            <span className="text-xs text-muted-foreground ml-auto">
              ID: {crawlId.slice(0, 8)}...
            </span>
          )}
        </div>

        {/* Phase Display */}
        <div className="text-lg font-medium text-left">
          {getPhaseDisplay()}
        </div>

        {/* Current Activity */}
        {progress.currentActivity && (
          <div className="text-sm text-muted-foreground text-left">
            {progress.currentActivity}
          </div>
        )}

        {/* Progress Bar */}
        {progress.total > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress: {Math.min(progress.processed, progress.total)} / {progress.total}</span>
              <span>{Math.min(Math.round((progress.processed / progress.total) * 100), 100)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min((progress.processed / progress.total) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Progress Stats */}
        {(progress.discoveredUrls > 0 || progress.failedUrls > 0) && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Discovered:</span>
              <span className="ml-2 font-mono">{progress.discoveredUrls}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Failed:</span>
              <span className="ml-2 font-mono">{progress.failedUrls}</span>
            </div>
          </div>
        )}

        {/* Error Display - Only show if no successful completion */}
        {error && !markdown && (
          <div className="p-3 bg-red-50 text-red-700 rounded text-sm text-left">
            {error}
          </div>
        )}

        {/* Result Display */}
        {markdown && (
          <div className="space-y-3">
            <div className="p-3 bg-green-50 text-green-700 rounded text-sm text-left">
              Successfully crawled! {markdown.length.toLocaleString()} characters of content.
            </div>
            
            {/* Copy Button */}
            <div className="flex justify-start">
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(markdown)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  } catch (err) {
                    console.error('Failed to copy:', err)
                  }
                }}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy Content
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Debug info for development */}
        {process.env.NODE_ENV === 'development' && (
          <div className="text-xs text-muted-foreground">
            Phase: {progress.phase} | Connected: {isConnected ? 'Yes' : 'No'}
          </div>
        )}
      </div>
    </Card>
  )
}