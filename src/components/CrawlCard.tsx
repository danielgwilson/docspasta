'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Copy, 
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Globe,
  FileText
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsClient } from '@/hooks/useIsClient'

interface CrawlStats {
  total: number
  processed: number
  discovered: number
  fromCache: number
  failed: number
  depth: number
}

interface CrawlEvent {
  type: string
  data: any
  timestamp: number
}

interface CrawlCardProps {
  jobId: string
  url: string
  className?: string
  onComplete?: (jobId: string) => void
}

export default function CrawlCard({ jobId, url, className, onComplete }: CrawlCardProps) {
  const isClient = useIsClient()
  const [status, setStatus] = useState<'connecting' | 'processing' | 'completed' | 'error'>('connecting')
  const [title, setTitle] = useState<string>('')
  const [stats, setStats] = useState<CrawlStats>({
    total: 0,
    processed: 0,
    discovered: 0,
    fromCache: 0,
    failed: 0,
    depth: 0,
  })
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<CrawlEvent[]>([])
  const [showDetails, setShowDetails] = useState(false)
  const [copied, setCopied] = useState(false)
  const [markdown, setMarkdown] = useState<string>('')
  const [wordCount, setWordCount] = useState(0)

  // Format URL for display
  const formatUrl = (url: string) => {
    try {
      const u = new URL(url)
      return u.hostname + (u.pathname === '/' ? '' : u.pathname)
    } catch {
      return url
    }
  }

  // Copy to clipboard with animation
  const handleCopy = useCallback(async () => {
    if (status !== 'completed' || !markdown) return
    
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [status, markdown])

  // Connect to SSE stream
  useEffect(() => {
    let eventSource: EventSource | null = null
    
    // First, check if job is already completed
    const initializeJob = async () => {
      try {
        const response = await fetch(`/api/v4/jobs/${jobId}`)
        if (response.ok) {
          const data = await response.json()
          if (data.content) {
            // Job is already completed
            setStatus('completed')
            setMarkdown(data.content)
            setWordCount(data.wordCount || data.content.split(/\s+/).length)
            setTitle(data.title || 'Documentation')
            setStats(prev => ({
              ...prev,
              processed: data.pageCount || prev.processed,
              total: data.pageCount || prev.total
            }))
            return // Don't connect to SSE if already completed
          }
        }
      } catch (err) {
        console.error('Failed to check job status:', err)
      }
      
      // If not completed, connect to SSE stream
      eventSource = new EventSource(`/api/v4/jobs/${jobId}/stream`)
      
      eventSource.onopen = () => {
        console.log('SSE connection opened for job:', jobId)
      }

    // Handler for named events
    const handleEvent = (eventType: string) => (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        const newEvent: CrawlEvent = { type: eventType, data: { ...data, type: eventType }, timestamp: Date.now() }
        setEvents(prev => [...prev.slice(-20), newEvent]) // Keep last 20 events
        
        switch (eventType) {
          case 'stream_connected':
            setStatus('processing')
            break
            
          case 'batch_completed':
            setStats(prev => ({
              ...prev,
              processed: prev.processed + (data.completed || 0),
              failed: prev.failed + (data.failed || 0),
              fromCache: prev.fromCache + (data.fromCache || 0),
            }))
            break
            
          case 'urls_discovered':
            setStats(prev => ({
              ...prev,
              discovered: prev.discovered + (data.count || data.discoveredUrls || 0),
              total: Math.max(prev.total, prev.discovered + (data.count || data.discoveredUrls || 0)),
              depth: Math.max(prev.depth, data.depth || 0),
            }))
            break
            
          case 'job_completed':
            setStatus('completed')
            eventSource.close()
            if (onComplete) onComplete(jobId)
            // Fetch the combined markdown
            fetchCombinedMarkdown()
            break
            
          case 'job_failed':
          case 'job_timeout':
            setStatus('error')
            setError(data.error || 'Job failed')
            eventSource.close()
            break
        }
      } catch (err) {
        console.error('Failed to parse SSE event:', err)
      }
    }

    // Register listeners for all named events
    eventSource.addEventListener('stream_connected', handleEvent('stream_connected'))
    eventSource.addEventListener('batch_completed', handleEvent('batch_completed'))
    eventSource.addEventListener('urls_discovered', handleEvent('urls_discovered'))
    eventSource.addEventListener('job_completed', handleEvent('job_completed'))
    eventSource.addEventListener('job_failed', handleEvent('job_failed'))
    eventSource.addEventListener('job_timeout', handleEvent('job_timeout'))
    eventSource.addEventListener('batch_error', handleEvent('batch_error'))
    eventSource.addEventListener('error', handleEvent('error'))

      eventSource.onerror = () => {
        if (eventSource.readyState === EventSource.CLOSED) {
          setStatus('error')
          setError('Connection lost')
        }
      }
    }
    
    // Initialize the job
    initializeJob()

    return () => {
      if (eventSource) {
        eventSource.close()
      }
    }
  }, [jobId, onComplete])

  // Fetch combined markdown when completed
  const fetchCombinedMarkdown = async () => {
    try {
      const response = await fetch(`/api/v4/jobs/${jobId}`)
      if (response.ok) {
        const data = await response.json()
        if (data.content) {
          setMarkdown(data.content)
          setWordCount(data.content.split(/\s+/).length)
          setTitle(data.title || 'Documentation')
        }
      }
    } catch (err) {
      console.error('Failed to fetch markdown:', err)
    }
  }

  // Calculate progress percentage
  const progress = stats.total > 0 ? (stats.processed / stats.total) * 100 : 0

  // Status icon component
  const StatusIcon = () => {
    switch (status) {
      case 'connecting':
      case 'processing':
        return (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          >
            <Loader2 className="w-5 h-5 text-amber-600" />
          </motion.div>
        )
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "relative overflow-hidden rounded-xl border transition-all duration-200",
        status === 'completed' 
          ? "bg-gradient-to-br from-amber-50/50 to-orange-50/50 border-amber-200 hover:border-amber-300 cursor-pointer hover:shadow-lg" 
          : "bg-white border-gray-200",
        status === 'error' && "border-red-200 bg-red-50/50",
        className
      )}
      onClick={status === 'completed' ? handleCopy : undefined}
    >
      {/* Main Card Content */}
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          {/* Left side - Title and URL */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-gray-600 flex-shrink-0" />
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                {title || 'Crawling documentation...'}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <Globe className="w-3 h-3 text-gray-400 flex-shrink-0" />
              <p className="text-xs sm:text-sm text-gray-600 truncate">{formatUrl(url)}</p>
            </div>
            
            {/* Stats summary - only show when processing or completed */}
            {(status === 'processing' || status === 'completed') && (
              <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-gray-500">
                <span>{stats.processed} pages</span>
                {stats.fromCache > 0 && (
                  <span className="text-amber-600">⚡ {stats.fromCache} cached</span>
                )}
                {wordCount > 0 && (
                  <span className="font-medium">{wordCount.toLocaleString()} words</span>
                )}
              </div>
            )}
          </div>

          {/* Right side - Status and Copy */}
          <div className="flex items-center gap-2 sm:gap-3">
            <StatusIcon />
            
            {status === 'completed' && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="flex items-center gap-2"
              >
                <AnimatePresence mode="wait">
                  {copied ? (
                    <motion.div
                      key="check"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="flex items-center gap-2 text-green-600"
                    >
                      <Check className="w-4 h-4" />
                      <span className="text-xs sm:text-sm font-medium">Copied!</span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="copy"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="flex items-center gap-2 text-gray-600"
                    >
                      <Copy className="w-4 h-4" />
                      <span className="text-xs sm:text-sm hidden sm:inline">Click to copy</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </div>

        {/* Progress bar - subtle and integrated */}
        {status === 'processing' && (
          <div className="mt-4">
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-500"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {status === 'error' && error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 text-sm text-red-600"
          >
            {error}
          </motion.div>
        )}

        {/* Expandable details */}
        {events.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowDetails(!showDetails)
            }}
            className="mt-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showDetails ? 'Hide' : 'Show'} details
          </button>
        )}
      </div>

      {/* Expandable event details */}
      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-gray-100 bg-gray-50/50 px-4 sm:px-6 py-2 sm:py-3 overflow-hidden"
          >
            <div className="max-h-32 overflow-y-auto">
              <div className="space-y-1">
                {events.slice(-5).reverse().map((event, i) => (
                  <div key={i} className="text-xs text-gray-600">
                    <span className="font-mono text-gray-400 text-[10px] sm:text-xs">
                      {isClient ? new Date(event.timestamp).toLocaleTimeString() : '00:00:00'}
                    </span>
                    {' '}
                    <span className="font-medium text-[11px] sm:text-xs">{event.type.replace(/_/g, ' ')}</span>
                    {event.data.count && ` (${event.data.count})`}
                    {event.data.completed && ` (${event.data.completed} done)`}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sparkle effect on completion */}
      {status === 'completed' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="absolute -top-1 -right-1"
        >
          <Sparkles className="w-4 h-4 text-amber-500" />
        </motion.div>
      )}
    </motion.div>
  )
}

// Export both as default and named export
export { CrawlCard }