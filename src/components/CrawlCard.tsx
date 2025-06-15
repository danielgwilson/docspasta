'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { 
  Globe, 
  Download, 
  AlertCircle, 
  CheckCircle2, 
  Clock,
  Link2,
  Loader2,
  RefreshCw,
  Sparkles,
  Activity,
  X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseSSEEvent } from '@/lib/schemas/sse-events'

interface CrawlCardProps {
  jobId: string
  url: string
  onComplete?: (jobId: string) => void
  onDismiss?: (jobId: string) => void
  className?: string
  // Optional initial state to skip fetching
  initialStatus?: string
  initialProcessed?: number
  initialDiscovered?: number
  initialLastEventId?: string | null
  initialError?: string | null
}

interface CrawlStats {
  processed: number
  discovered: number
  total: number
  startTime: number
  endTime?: number
}

type JobStatus = 'idle' | 'connecting' | 'processing' | 'completed' | 'failed' | 'timeout'

export function CrawlCard({ 
  jobId, 
  url, 
  onComplete, 
  onDismiss, 
  className,
  initialStatus,
  initialProcessed,
  initialDiscovered,
  initialLastEventId,
  initialError
}: CrawlCardProps) {
  // Use initial values if provided
  const [status, setStatus] = useState<JobStatus>(
    initialStatus === 'completed' ? 'completed' :
    initialStatus === 'failed' ? 'failed' :
    initialStatus === 'timeout' ? 'timeout' :
    'connecting'
  )
  const [stats, setStats] = useState<CrawlStats>({
    processed: initialProcessed || 0,
    discovered: initialDiscovered || 0,
    total: Math.max(initialDiscovered || 0, initialProcessed || 0, 1),
    startTime: Date.now()
  })
  const [error, setError] = useState<string | null>(initialError || null)
  const [events, setEvents] = useState<string[]>([])
  const [downloadUrl, setDownloadUrl] = useState<string | null>(
    initialStatus === 'completed' ? `/api/v4/jobs/${jobId}/download` : null
  )
  const [isRestoring, setIsRestoring] = useState(!initialStatus) // Skip restore if we have initial state
  const [lastEventId, setLastEventId] = useState<string | null>(initialLastEventId || null)
  
  // Use ref to access current status value in closures
  const statusRef = useRef(status)
  statusRef.current = status
  
  // Use ref to track lastEventId in closures
  const lastEventIdRef = useRef(lastEventId)
  lastEventIdRef.current = lastEventId

  // Handle initial state or fetch job state on mount
  useEffect(() => {
    if (!jobId) return
    
    // If we have initial state, trigger onComplete if completed
    if (initialStatus === 'completed' && onComplete) {
      onComplete(jobId)
      return
    }
    
    // Skip fetching if we already have initial state
    if (initialStatus) {
      setIsRestoring(false)
      return
    }
    
    const fetchJobState = async () => {
      try {
        console.log(`🔄 Fetching job state for ${jobId}`)
        const response = await fetch(`/api/v4/jobs/${jobId}/state`)
        
        if (!response.ok) {
          console.error('Failed to fetch job state:', response.status)
          setIsRestoring(false)
          return
        }
        
        const data = await response.json()
        console.log('📦 Job state:', data)
        
        // Restore the state
        if (data.success) {
          // Set status based on data.status
          if (data.status === 'completed') {
            setStatus('completed')
            setStats(prev => ({
              ...prev,
              endTime: Date.now(), // We don't have completedAt in the response
              processed: data.totalProcessed || 0,
              discovered: data.totalDiscovered || 0,
              total: Math.max(data.totalDiscovered || 0, data.totalProcessed || 0, 1)
            }))
            setDownloadUrl(`/api/v4/jobs/${jobId}/download`)
            if (onComplete) {
              onComplete(jobId)
            }
          } else if (data.status === 'failed') {
            setStatus('failed')
            setError(data.error || 'Job failed')
            // Update stats for failed jobs too
            setStats(prev => ({
              ...prev,
              processed: data.totalProcessed || 0,
              discovered: data.totalDiscovered || 0,
              total: Math.max(data.totalDiscovered || 0, data.totalProcessed || 0, 1),
              endTime: Date.now()
            }))
          } else if (data.status === 'timeout') {
            setStatus('timeout')
            setError(data.error || 'Job timed out')
            // Update stats for timeout jobs too
            setStats(prev => ({
              ...prev,
              processed: data.totalProcessed || 0,
              discovered: data.totalDiscovered || 0,
              total: Math.max(data.totalDiscovered || 0, data.totalProcessed || 0, 1),
              endTime: Date.now()
            }))
          } else {
            // Job is still running
            setStats(prev => ({
              ...prev,
              processed: data.totalProcessed || 0,
              discovered: data.totalDiscovered || 0,
              total: Math.max(data.totalDiscovered || 0, data.totalProcessed || 0, 1)
            }))
          }
          
          // Restore last event ID for resumption
          if (data.lastEventId) {
            setLastEventId(data.lastEventId)
          }
        }
      } catch (error) {
        console.error('Error fetching job state:', error)
      } finally {
        setIsRestoring(false)
      }
    }
    
    fetchJobState()
  }, [jobId, onComplete, initialStatus])

  useEffect(() => {
    if (!jobId || isRestoring) return
    
    // Skip SSE connection for completed/failed/timeout jobs
    if (status === 'completed' || status === 'failed' || status === 'timeout') {
      console.log(`⏭️ Skipping SSE connection for ${status} job ${jobId}`)
      return
    }

    let eventSource: EventSource | null = null
    let reconnectTimer: NodeJS.Timeout | null = null
    let reconnectAttempts = 0
    const MAX_RECONNECT_ATTEMPTS = 3

    const connect = () => {
      // TODO: Proper stream resumption requires tracking character count, not event IDs
      // The resumable-stream library expects skipCharacters (a number) but EventSource
      // provides Last-Event-ID (a string). For now, we don't support resumption.
      const streamUrl = `/api/v4/jobs/${jobId}/stream`
      console.log(`🔗 Connecting to SSE stream: ${streamUrl}`)

      eventSource = new EventSource(streamUrl)

      eventSource.onopen = () => {
        console.log('✅ SSE connection opened')
        setStatus('processing')
        reconnectAttempts = 0
      }

      eventSource.onerror = (error) => {
        console.error('❌ SSE error:', error)
        eventSource?.close()

        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && statusRef.current === 'processing') {
          reconnectAttempts++
          console.log(`🔄 Reconnecting... (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`)
          reconnectTimer = setTimeout(connect, 2000 * reconnectAttempts)
        } else if (statusRef.current === 'processing') {
          setStatus('failed')
          setError('Connection lost')
        }
      }

      // Helper to update lastEventId from native event
      const updateLastEventId = (event: MessageEvent) => {
        // The lastEventId property is part of the MessageEvent interface
        if (event.lastEventId) {
          setLastEventId(event.lastEventId)
        }
      }

      // Handle specific events
      eventSource.addEventListener('stream_connected', (event) => {
        updateLastEventId(event)
        const data = parseSSEEvent(event.data)
        if (!data || data.type !== 'stream_connected') {
          console.error('Failed to parse stream_connected event:', event.data)
          return
        }
        console.log('📡 Stream connected:', data)
        setStatus('processing')
        addEvent(`Connected to ${data.url}`)
      })

      eventSource.addEventListener('url_started', (event) => {
        updateLastEventId(event)
        const data = parseSSEEvent(event.data)
        if (!data || data.type !== 'url_started') {
          console.error('Failed to parse url_started event:', event.data)
          return
        }
        console.log('🌐 URL started:', data)
        addEvent(`Crawling: ${new URL(data.url).pathname}`)
      })

      eventSource.addEventListener('url_crawled', (event) => {
        updateLastEventId(event)
        const data = parseSSEEvent(event.data)
        if (!data || data.type !== 'url_crawled') {
          console.error('Failed to parse url_crawled event:', event.data)
          return
        }
        console.log('✅ URL crawled:', data)
        
        // Update processed count
        setStats(prev => ({
          ...prev,
          processed: prev.processed + 1
        }))
        
        if (data.success) {
          addEvent(`Completed: ${new URL(data.url).pathname} (${data.content_length} chars)`)
        }
      })

      eventSource.addEventListener('urls_discovered', (event) => {
        updateLastEventId(event)
        const data = parseSSEEvent(event.data)
        if (!data || data.type !== 'urls_discovered') {
          console.error('Failed to parse urls_discovered event:', event.data)
          return
        }
        console.log('🔍 URLs discovered:', data)
        
        // Update discovered count
        setStats(prev => ({
          ...prev,
          discovered: data.total_discovered || prev.discovered,
          total: Math.max(data.total_discovered || 0, prev.processed, prev.total)
        }))
        
        addEvent(`Found ${data.count} new URLs from ${new URL(data.source_url).pathname}`)
      })

      eventSource.addEventListener('url_failed', (event) => {
        updateLastEventId(event)
        const data = parseSSEEvent(event.data)
        if (!data || data.type !== 'url_failed') {
          console.error('Failed to parse url_failed event:', event.data)
          return
        }
        console.log('❌ URL failed:', data)
        addEvent(`Failed: ${new URL(data.url).pathname} - ${data.error}`)
      })

      eventSource.addEventListener('sent_to_processing', (event) => {
        updateLastEventId(event)
        const data = parseSSEEvent(event.data)
        if (!data || data.type !== 'sent_to_processing') {
          console.error('Failed to parse sent_to_processing event:', event.data)
          return
        }
        console.log('📤 Sent to processing:', data)
        // This is more of a debug event, we don't need to show it to users
      })

      eventSource.addEventListener('progress', (event) => {
        updateLastEventId(event)
        const data = parseSSEEvent(event.data)
        if (!data || data.type !== 'progress') {
          console.error('Failed to parse progress event:', event.data)
          return
        }
        console.log('📊 Progress:', data)
        
        // V4 progress event has different field names
        setStats(prev => ({
          ...prev,
          processed: data.processed || prev.processed,
          discovered: data.discovered || prev.discovered,
          total: Math.max(data.discovered || 0, data.processed || 0, prev.total)
        }))
      })

      eventSource.addEventListener('time_update', (event) => {
        updateLastEventId(event)
        const data = parseSSEEvent(event.data)
        if (!data || data.type !== 'time_update') {
          console.error('Failed to parse time_update event:', event.data)
          return
        }
        console.log('⏱️ Time update:', data)
        
        // Update stats from time update which includes queue info
        setStats(prev => ({
          ...prev,
          processed: data.totalProcessed || prev.processed,
          discovered: data.totalDiscovered || prev.discovered,
          total: Math.max(data.totalDiscovered || 0, data.totalProcessed || 0, prev.total)
        }))
      })

      eventSource.addEventListener('job_completed', (event) => {
        updateLastEventId(event)
        const data = parseSSEEvent(event.data)
        if (!data || data.type !== 'job_completed') {
          console.error('Failed to parse job_completed event:', event.data)
          return
        }
        console.log('✅ Job completed:', data)
        
        setStatus('completed')
        setStats(prev => ({
          ...prev,
          endTime: Date.now(),
          processed: data.totalProcessed || prev.processed,
          discovered: data.totalDiscovered || prev.discovered
        }))
        
        addEvent('Crawl completed successfully!')
        eventSource?.close()
        
        // Generate download URL
        setDownloadUrl(`/api/v4/jobs/${jobId}/download`)
        
        if (onComplete) {
          onComplete(jobId)
        }
      })

      eventSource.addEventListener('job_failed', (event) => {
        updateLastEventId(event)
        const data = parseSSEEvent(event.data)
        if (!data || data.type !== 'job_failed') {
          console.error('Failed to parse job_failed event:', event.data)
          return
        }
        console.log('❌ Job failed:', data)
        
        setStatus('failed')
        setError(data.error || 'Job failed')
        addEvent(`Error: ${data.error || 'Unknown error'}`)
        eventSource?.close()
      })

      eventSource.addEventListener('job_timeout', (event) => {
        updateLastEventId(event)
        const data = parseSSEEvent(event.data)
        if (!data || data.type !== 'job_timeout') {
          console.error('Failed to parse job_timeout event:', event.data)
          return
        }
        console.log('⏱️ Job timeout:', data)
        
        setStatus('timeout')
        setStats(prev => ({ ...prev, endTime: Date.now() }))
        addEvent('Job timed out after 5 minutes')
        eventSource?.close()
      })

      // Note: Native EventSource 'error' events are handled by onerror above
      // Server sends specific events like 'job_failed' for job-related errors
    }

    const addEvent = (message: string) => {
      setEvents(prev => [...prev.slice(-4), message])
    }

    // Start connection
    connect()

    // Cleanup
    return () => {
      console.log('🧹 Cleaning up SSE connection')
      eventSource?.close()
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }
    }
  }, [jobId, onComplete, isRestoring, status])

  const getStatusIcon = () => {
    if (isRestoring) {
      return <RefreshCw className="h-5 w-5 animate-spin text-purple-500" />
    }
    
    switch (status) {
      case 'connecting':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
      case 'processing':
        return <Activity className="h-5 w-5 animate-pulse text-blue-500" />
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      case 'timeout':
        return <Clock className="h-5 w-5 text-orange-500" />
      default:
        return <Globe className="h-5 w-5 text-gray-500" />
    }
  }

  const getStatusBadge = () => {
    if (isRestoring) {
      return (
        <Badge variant="secondary" className="font-medium">
          Restoring...
        </Badge>
      )
    }
    
    const variants = {
      connecting: 'outline',
      processing: 'default',
      completed: 'success',
      failed: 'destructive',
      timeout: 'warning'
    } as const

    const labels = {
      connecting: 'Connecting...',
      processing: 'Crawling',
      completed: 'Completed',
      failed: 'Failed',
      timeout: 'Timed Out'
    }

    return (
      <Badge variant={variants[status] || 'outline'} className="font-medium">
        {labels[status]}
      </Badge>
    )
  }

  const getDuration = () => {
    const start = stats.startTime
    const end = stats.endTime || Date.now()
    const seconds = Math.floor((end - start) / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`
    }
    return `${seconds}s`
  }

  const progress = stats.total > 0 ? (stats.processed / stats.total) * 100 : 0

  return (
    <Card className={cn("w-full transition-all duration-300 hover:shadow-lg", className)}>
      <CardHeader className="space-y-1">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1 mr-4">
            <CardTitle className="text-xl flex items-center gap-2">
              {getStatusIcon()}
              <span className="truncate">{new URL(url).hostname}</span>
            </CardTitle>
            <CardDescription className="text-sm truncate">
              {url}
            </CardDescription>
          </div>
          <div className="flex items-start gap-2">
            <div className="flex flex-col items-end gap-2">
              {getStatusBadge()}
              <span className="text-xs text-muted-foreground font-mono">
                {getDuration()}
              </span>
            </div>
            {onDismiss && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-destructive/10"
                onClick={() => onDismiss(jobId)}
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Section */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{stats.processed} / {stats.discovered || '?'} pages</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 py-3">
          <div className="space-y-1">
            <p className="text-sm font-medium flex items-center gap-1">
              <Link2 className="h-3 w-3" />
              Discovered
            </p>
            <p className="text-2xl font-bold">{stats.discovered}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Processed
            </p>
            <p className="text-2xl font-bold">{stats.processed}</p>
          </div>
        </div>

        {/* Activity Log */}
        {events.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground mb-2">Activity</p>
              <AnimatePresence mode="popLayout">
                {events.map((event, index) => (
                  <motion.div
                    key={`${event}-${index}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="text-xs text-muted-foreground flex items-center gap-1"
                  >
                    <Sparkles className="h-3 w-3" />
                    {event}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </>
        )}

        {/* Error Display */}
        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3">
            <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        {status === 'completed' && downloadUrl && (
          <div className="pt-2 flex gap-2">
            <Button 
              variant="default" 
              size="sm" 
              className="flex-1"
              onClick={() => window.open(downloadUrl, '_blank')}
            >
              <Download className="h-4 w-4 mr-2" />
              Download Markdown
            </Button>
          </div>
        )}

        {(status === 'failed' || status === 'timeout') && (
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export default CrawlCard