'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { FileText, Zap, XCircle, CheckCircle2, Loader2 } from 'lucide-react'

interface CrawlStats {
  completed: number
  failed: number
  discovered: number
  fromCache: number
}

interface PersistedState {
  jobId: string
  inputUrl: string
  stats: CrawlStats
  isComplete: boolean
  error: string | null
  lastEventId?: string  // Only store last event ID, not full history
  timestamp: number
}

const STORAGE_KEY = 'docspasta-v4-active-job'
const STATE_EXPIRY_MS = 10 * 60 * 1000 // 10 minutes

export default function ServerlessProgressV2() {
  const [inputUrl, setInputUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [stats, setStats] = useState<CrawlStats>({
    completed: 0,
    failed: 0,
    discovered: 0,
    fromCache: 0
  })
  const [isComplete, setIsComplete] = useState(false)
  const [events, setEvents] = useState<any[]>([])
  const [lastEventId, setLastEventId] = useState<string | undefined>(undefined)
  const eventSourceRef = useRef<EventSource | null>(null)

  const setupEventListeners = (eventSource: EventSource) => {
    eventSource.addEventListener('stream_connected', (e) => {
      const data = JSON.parse(e.data)
      console.log('Stream connected:', data)
      // Store event ID if available
      if (e.lastEventId) {
        setLastEventId(e.lastEventId)
      }
      setEvents(prev => [...prev, { 
        type: 'stream_connected', 
        data, 
        timestamp: Date.now(),
        id: e.lastEventId || Date.now().toString()
      }])
    })
    
    eventSource.addEventListener('batch_completed', (e) => {
      const data = JSON.parse(e.data)
      console.log('Batch completed:', data)
      
      if (e.lastEventId) {
        setLastEventId(e.lastEventId)
      }
      
      setStats(prev => ({
        completed: prev.completed + (data.completed || 0),
        failed: prev.failed + (data.failed || 0),
        discovered: Math.max(prev.discovered, data.discovered || 0),
        fromCache: prev.fromCache + (data.fromCache || 0)
      }))
      
      setEvents(prev => [...prev, { 
        type: 'batch_completed', 
        data, 
        timestamp: Date.now(),
        id: e.lastEventId || Date.now().toString()
      }])
    })
    
    eventSource.addEventListener('urls_discovered', (e) => {
      const data = JSON.parse(e.data)
      console.log('URLs discovered:', data)
      
      setStats(prev => ({
        ...prev,
        discovered: prev.discovered + (data.count || 0)
      }))
      
      setEvents(prev => [...prev, { type: 'urls_discovered', data, timestamp: Date.now() }])
    })
    
    eventSource.addEventListener('job_completed', (e) => {
      const data = JSON.parse(e.data)
      console.log('Job completed:', data)
      setIsComplete(true)
      setIsLoading(false)
      eventSource.close()
      setEvents(prev => [...prev, { type: 'job_completed', data, timestamp: Date.now() }])
    })
    
    eventSource.addEventListener('job_failed', (e) => {
      const data = JSON.parse(e.data)
      console.error('Job failed:', data)
      setError(data.error || 'Job failed')
      setIsLoading(false)
      eventSource.close()
      setEvents(prev => [...prev, { type: 'job_failed', data, timestamp: Date.now() }])
    })
    
    eventSource.addEventListener('job_timeout', (e) => {
      const data = JSON.parse(e.data)
      console.log('Job timeout:', data)
      setError('Job timed out')
      setIsComplete(true)
      setIsLoading(false)
      eventSource.close()
      setEvents(prev => [...prev, { type: 'job_timeout', data, timestamp: Date.now() }])
    })
    
    eventSource.onerror = (error) => {
      console.error('SSE error:', error)
      if (eventSource.readyState === EventSource.CLOSED) {
        setError('Connection lost')
        setIsLoading(false)
      }
    }
  }

  const reconnectToStream = (reconnectJobId: string, lastEventId?: string) => {
    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    // EventSource will automatically send Last-Event-ID header if we set withCredentials
    const eventSource = new EventSource(`/api/v4/jobs/${reconnectJobId}/stream`, {
      withCredentials: true
    })
    
    // Manually set lastEventId if available (for initial connection)
    if (lastEventId) {
      // Note: EventSource doesn't expose a way to set Last-Event-ID on first connection
      // This is a limitation we need to handle server-side
      console.log('Resuming from event:', lastEventId)
    }
    
    eventSourceRef.current = eventSource
    setupEventListeners(eventSource)
  }

  // Load persisted state on mount
  useEffect(() => {
    const savedStateStr = localStorage.getItem(STORAGE_KEY)
    if (savedStateStr) {
      try {
        const savedState: PersistedState = JSON.parse(savedStateStr)
        
        // Check if state is not expired
        if (Date.now() - savedState.timestamp < STATE_EXPIRY_MS) {
          // Restore state
          setJobId(savedState.jobId)
          setInputUrl(savedState.inputUrl)
          setStats(savedState.stats)
          setIsComplete(savedState.isComplete)
          setError(savedState.error)
          setLastEventId(savedState.lastEventId)
          
          // If not complete and no error, reconnect to stream
          if (!savedState.isComplete && !savedState.error && savedState.jobId) {
            setIsLoading(true)
            // Delay reconnection to ensure component is mounted
            setTimeout(() => {
              reconnectToStream(savedState.jobId, savedState.lastEventId)
            }, 100)
          }
        } else {
          // State expired, clear it
          localStorage.removeItem(STORAGE_KEY)
        }
      } catch (e) {
        console.error('Failed to parse saved state:', e)
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [])

  // Save state whenever it changes
  useEffect(() => {
    if (jobId) {
      const stateToSave: PersistedState = {
        jobId,
        inputUrl,
        stats,
        isComplete,
        error,
        lastEventId: lastEventId,
        timestamp: Date.now()
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave))
    }
  }, [jobId, inputUrl, stats, isComplete, error, lastEventId])

  // Clean up completed/errored jobs after a delay
  useEffect(() => {
    if (isComplete || error) {
      const timer = setTimeout(() => {
        localStorage.removeItem(STORAGE_KEY)
      }, 30000) // Clear after 30 seconds
      
      return () => clearTimeout(timer)
    }
  }, [isComplete, error])

  // Listen for quick action events
  useEffect(() => {
    const handleQuickAction = (e: CustomEvent) => {
      setInputUrl(e.detail)
      // Auto-submit after a short delay
      setTimeout(() => {
        const form = document.querySelector('form') as HTMLFormElement
        if (form) form.requestSubmit()
      }, 100)
    }
    
    window.addEventListener('quickaction-v2', handleQuickAction as EventListener)
    return () => window.removeEventListener('quickaction-v2', handleQuickAction as EventListener)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!inputUrl.trim()) return
    
    // Clear any existing state
    localStorage.removeItem(STORAGE_KEY)
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    
    // Reset state
    setError(null)
    setIsLoading(true)
    setIsComplete(false)
    setStats({ completed: 0, failed: 0, discovered: 0, fromCache: 0 })
    setEvents([])
    setJobId(null)
    
    try {
      // Create job
      const response = await fetch('/api/v4/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inputUrl }),
      })
      
      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to create job')
      }
      
      const newJobId = data.data.jobId
      setJobId(newJobId)
      
      // Connect to SSE stream
      const eventSource = new EventSource(`/api/v4/jobs/${newJobId}/stream`)
      eventSourceRef.current = eventSource
      
      setupEventListeners(eventSource)
      
    } catch (err) {
      console.error('Error:', err)
      setError(err instanceof Error ? err.message : 'Failed to start crawl')
      setIsLoading(false)
    }
  }

  // Calculate progress
  const totalProcessed = stats.completed + stats.failed
  const progressPercent = stats.discovered > 0 ? Math.round((totalProcessed / stats.discovered) * 100) : 0

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
                    <Loader2 className="w-5 h-5 animate-spin" />
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
      {jobId && !error && (
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Main Status Card */}
          <Card className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-800 p-6">
            <div className="space-y-4">
              {/* Status Badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isComplete ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        Crawl Complete
                      </span>
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        Crawling in Progress
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Completed</div>
                </div>
                {stats.failed > 0 && (
                  <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Failed</div>
                  </div>
                )}
                <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-blue-600">{stats.discovered}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Discovered</div>
                </div>
                {stats.fromCache > 0 && (
                  <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-purple-600">{stats.fromCache}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">From Cache</div>
                  </div>
                )}
              </div>

              {/* Progress Bar */}
              {stats.discovered > 0 && !isComplete && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>Progress: {totalProcessed} / {stats.discovered} pages</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* URL being crawled */}
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">URL:</span> {inputUrl}
              </div>
            </div>
          </Card>

          {/* Results (when complete) */}
          {isComplete && stats.completed > 0 && (
            <Card className="p-6 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <h3 className="text-lg font-semibold text-green-900 dark:text-green-100 mb-2">
                ✅ Crawl Complete!
              </h3>
              <p className="text-green-700 dark:text-green-300 mb-4">
                Successfully crawled {stats.completed} pages
                {stats.fromCache > 0 && ` (${stats.fromCache} from cache)`}
              </p>
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    // TODO: Implement copy markdown
                    alert('Copy markdown feature coming soon!')
                  }}
                >
                  Copy Markdown
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    // TODO: Implement download
                    alert('Download feature coming soon!')
                  }}
                >
                  Download
                </Button>
              </div>
            </Card>
          )}

          {/* Event Log (minimal, collapsible) */}
          <details className="group">
            <summary className="cursor-pointer list-none">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
                <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Debug: View event stream ({events.length} events)
              </div>
            </summary>
            <Card className="mt-3 p-4 max-h-48 overflow-y-auto">
              <div className="space-y-1 text-xs font-mono">
                {events.map((event, index) => (
                  <div key={index} className="text-gray-600 dark:text-gray-400">
                    {new Date(event.timestamp).toLocaleTimeString()} - {event.type}
                    {event.type === 'batch_completed' && ` (${event.data.completed} completed, ${event.data.fromCache} cached)`}
                  </div>
                ))}
              </div>
            </Card>
          </details>
        </div>
      )}
    </>
  )
}