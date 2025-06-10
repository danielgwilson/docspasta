'use client'

import { useState, useEffect, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Copy, Check } from 'lucide-react'

interface QueueSSEEvent {
  type: string
  crawlId?: string
  id?: string
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
  progress?: {
    phase?: string
    current?: number
    processed?: number
    total?: number
    percentage?: number
    discovered?: number
    discoveredUrls?: number
    failed?: number
    failedUrls?: number
    message?: string
    currentActivity?: string
  }
  data?: {
    id?: string
    status?: string
    markdown?: string
    results?: any[]
    timestamp?: number
    progress?: {
      phase?: string
      current?: number
      processed?: number
      total?: number
      percentage?: number
      discovered?: number
      discoveredUrls?: number
      failed?: number
      failedUrls?: number
      message?: string
      currentActivity?: string
      currentUrl?: string
      batch?: {
        current?: number
        total?: number
        processed?: number
        failed?: number
      }
    }
  }
}

interface QueueSSECrawlResultsProps {
  crawlId: string
  onComplete?: (markdown: string) => void
}

function QueueSSECrawlResults({ crawlId, onComplete }: QueueSSECrawlResultsProps) {
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
  const sessionId = useRef(`ui-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
  
  // 🔒 CRITICAL: Enhanced validation for multi-user isolation
  const isValidEvent = (eventData: any) => {
    const eventCrawlId = eventData.crawlId || eventData.id || eventData._crawlId
    
    // Primary validation: crawl ID must match
    if (!eventCrawlId || eventCrawlId !== crawlId) {
      console.log(`[UI ${sessionId.current}] Rejecting event - crawl ID mismatch: got ${eventCrawlId}, expected ${crawlId}`)
      return false
    }
    
    // Secondary validation: if event has session info, log it for debugging
    if (eventData._sessionId) {
      console.log(`[UI ${sessionId.current}] Event from SSE session ${eventData._sessionId} for crawl ${crawlId}`)
    }
    
    return true
  }

  const startSSEConnection = () => {
    console.log(`[Queue SSE ${sessionId.current}] Starting SSE connection for crawlId:`, crawlId)
    
    // Reset state
    setProgress({
      phase: 'connecting',
      processed: 0,
      total: 0,
      percentage: 0,
      discoveredUrls: 0,
      failedUrls: 0,
      currentActivity: 'Starting real-time connection...',
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
        console.log(`[UI ${sessionId.current}] Received event:`, data.type, `for crawl: ${data.crawlId || data.id || data._crawlId || 'unknown'}`, data)
        
        // 🔒 CRITICAL: Only process events for THIS component's crawl ID
        if (!isValidEvent(data)) {
          return // Already logged in isValidEvent
        }
        
        switch (data.type) {
          case 'connected':
            setProgress(prev => ({
              ...prev,
              phase: 'initializing',
              currentActivity: 'Connected! Waiting for crawl to start...',
            }))
            break
            
          case 'initial_status':
            // 🔧 CRITICAL FIX: Access nested initial status data correctly
            const initialData = data.data?.progress || data.progress || data
            setProgress(prev => ({
              ...prev,
              phase: initialData.phase || data.phase || 'active',
              processed: initialData.processed || initialData.current || data.processed || 0,
              total: initialData.total || data.total || 0,
              percentage: initialData.percentage || data.percentage || 0,
              discoveredUrls: initialData.discovered || initialData.discoveredUrls || data.discoveredUrls || 0,
              failedUrls: initialData.failed || initialData.failedUrls || data.failedUrls || 0,
              currentActivity: initialData.message || initialData.currentActivity || data.message || 'Resuming crawl...',
            }))
            console.log(`[UI ${sessionId.current}] Initial status loaded:`, {
              phase: initialData.phase,
              processed: initialData.processed || initialData.current,
              total: initialData.total
            })
            break
            
          case 'progress':
            // 🔧 CRITICAL FIX: Access nested progress fields correctly
            const progressData = data.progress || data.data?.progress || data
            setProgress(prev => ({
              ...prev,
              phase: progressData.phase || data.phase || prev.phase,
              processed: progressData.processed || progressData.current || (data.processed ?? prev.processed),
              total: progressData.total || (data.total ?? prev.total),
              percentage: progressData.percentage || (data.percentage ?? prev.percentage),
              discoveredUrls: progressData.discovered || progressData.discoveredUrls || (data.discoveredUrls ?? prev.discoveredUrls),
              failedUrls: progressData.failed || progressData.failedUrls || (data.failedUrls ?? prev.failedUrls),
              currentActivity: progressData.currentActivity || progressData.message || data.currentActivity || data.message || prev.currentActivity,
            }))
            console.log(`[UI ${sessionId.current}] Updated progress:`, {
              phase: progressData.phase,
              processed: progressData.processed || progressData.current,
              total: progressData.total,
              percentage: progressData.percentage
            })
            break
            
          case 'completed':
            console.log(`[UI ${sessionId.current}] Crawl completed successfully`)
            setProgress(prev => ({
              ...prev,
              phase: 'completed',
              currentActivity: 'Crawl completed successfully!',
            }))
            
            // 🔧 CRITICAL FIX: Access nested completion data correctly
            const completionData = data.data || data
            const markdown = completionData.markdown || data.markdown
            const results = completionData.results || data.results
            
            if (markdown) {
              setMarkdown(markdown)
              setError(null) // Clear any previous errors
              onComplete?.(markdown)
              console.log(`[UI ${sessionId.current}] Received markdown: ${markdown.length} characters`)
            } else if (results) {
              // Build markdown from results
              const combinedMarkdown = results
                .map((r: any) => `# ${r.title}\n\n> Source: ${r.url}\n\n${r.content}`)
                .join('\n\n---\n\n')
              setMarkdown(combinedMarkdown)
              setError(null)
              onComplete?.(combinedMarkdown)
              console.log(`[UI ${sessionId.current}] Built markdown from ${results.length} results`)
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

    // EventSource doesn't have onclose event - handled via onerror and manual close
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
      case 'connecting':
        return '📡 Connecting to crawl...'
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
          if (progress.total === 0) {
            return '⏳ Waiting for crawl to start...'
          }
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
        {progress.currentActivity && !progress.currentActivity.toLowerCase().includes('process') ? (
          <div className="text-sm text-muted-foreground text-left">
            {progress.currentActivity}
          </div>
        ) : isConnected && progress.total === 0 ? (
          <div className="text-sm text-muted-foreground text-left flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
            Connected! Crawler is starting up...
          </div>
        ) : !isConnected ? (
          <div className="text-sm text-muted-foreground text-left flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            Connecting to real-time updates...
          </div>
        ) : null}

        {/* Progress Bar - Show when we have real progress */}
        {(progress.total > 0 || progress.processed > 0 || progress.discoveredUrls > 0) && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Pages: {Math.min(progress.processed, progress.total || progress.processed)} / {progress.total || progress.discoveredUrls || '?'}</span>
              <span>{Math.min(progress.percentage || (progress.total > 0 ? Math.round(progress.processed / progress.total * 100) : (progress.discoveredUrls > 0 ? Math.round(progress.processed / progress.discoveredUrls * 100) : 0)), 100)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(progress.percentage || (progress.total > 0 ? Math.round(progress.processed / progress.total * 100) : (progress.discoveredUrls > 0 ? Math.round(progress.processed / progress.discoveredUrls * 100) : 0)), 100)}%` }}
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
            Session: {sessionId.current} | Phase: {progress.phase} | Connected: {isConnected ? 'Yes' : 'No'}
          </div>
        )}
      </div>
    </Card>
  )
}

export default QueueSSECrawlResults
export { QueueSSECrawlResults }