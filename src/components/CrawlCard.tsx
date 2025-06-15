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
}

interface CrawlStats {
  processed: number
  discovered: number
  total: number
  startTime: number
  endTime?: number
}

type JobStatus = 'idle' | 'connecting' | 'processing' | 'completed' | 'failed' | 'timeout'

export function CrawlCard({ jobId, url, onComplete, onDismiss, className }: CrawlCardProps) {
  const [status, setStatus] = useState<JobStatus>('connecting')
  const [stats, setStats] = useState<CrawlStats>({
    processed: 0,
    discovered: 0,
    total: 1,
    startTime: Date.now()
  })
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<string[]>([])
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  
  // Use ref to access current status value in closures
  const statusRef = useRef(status)
  statusRef.current = status

  useEffect(() => {
    if (!jobId) return

    let eventSource: EventSource | null = null
    let reconnectTimer: NodeJS.Timeout | null = null
    let reconnectAttempts = 0
    const MAX_RECONNECT_ATTEMPTS = 3

    const connect = () => {
      // Construct stream URL
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

      // Handle specific events
      eventSource.addEventListener('stream_connected', (event) => {
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
        const data = parseSSEEvent(event.data)
        if (!data || data.type !== 'url_started') {
          console.error('Failed to parse url_started event:', event.data)
          return
        }
        console.log('🌐 URL started:', data)
        addEvent(`Crawling: ${new URL(data.url).pathname}`)
      })

      eventSource.addEventListener('url_crawled', (event) => {
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
        const data = parseSSEEvent(event.data)
        if (!data || data.type !== 'url_failed') {
          console.error('Failed to parse url_failed event:', event.data)
          return
        }
        console.log('❌ URL failed:', data)
        addEvent(`Failed: ${new URL(data.url).pathname} - ${data.error}`)
      })

      eventSource.addEventListener('sent_to_processing', (event) => {
        const data = parseSSEEvent(event.data)
        if (!data || data.type !== 'sent_to_processing') {
          console.error('Failed to parse sent_to_processing event:', event.data)
          return
        }
        console.log('📤 Sent to processing:', data)
        // This is more of a debug event, we don't need to show it to users
      })

      eventSource.addEventListener('progress', (event) => {
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
  }, [jobId, onComplete])

  const getStatusIcon = () => {
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