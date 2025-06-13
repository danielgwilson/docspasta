import { useState, useEffect, useRef } from 'react'
import type { CreateJobRequest, JobState, ProgressEvent } from '@/lib/serverless/types'

interface CrawlResult {
  jobId?: string
  jobState?: JobState
  url?: string
  isLoading: boolean
  error: string | null
  events: ProgressEvent[]
}

const ACTIVE_JOB_KEY = 'docspasta_active_job'

export function useServerlessCrawl() {
  const [result, setResult] = useState<CrawlResult>({
    isLoading: false,
    error: null,
    events: [],
  })
  
  const eventSourceRef = useRef<EventSource | null>(null)
  
  // Function to connect to a stream (new or existing) with retry logic
  const connectToStream = (jobId: string, lastEventId?: string, retryCount = 0) => {
    // Build URL with lastEventId as query param if resuming
    let streamUrl = `/api/v4/jobs/${jobId}/stream`
    if (lastEventId) {
      streamUrl += `?lastEventId=${encodeURIComponent(lastEventId)}`
    }
    
    console.log(`🔗 Connecting to stream (attempt ${retryCount + 1}):`, streamUrl)
    
    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    
    // Start SSE stream
    eventSourceRef.current = new EventSource(streamUrl)
    
    // Set up all the event listeners with retry logic
    setupEventListeners(jobId, retryCount)
  }
  
  // Extract event listener setup to avoid duplication
  const setupEventListeners = (jobId: string, retryCount = 0) => {
    if (!eventSourceRef.current) return
    
    const MAX_RETRIES = 5
    const RETRY_DELAY_MS = Math.min(1000 * Math.pow(2, retryCount), 10000) // Exponential backoff, max 10s
    
    // Handle messages based on event type
    // V4 sends named events
    const eventTypes = [
      'stream_connected',
      'batch_completed',
      'urls_discovered',
      'content_processed',
      'job_completed',
      'job_timeout',
      'job_failed',
      'batch_error'
    ]
    
    eventTypes.forEach(eventType => {
      eventSourceRef.current!.addEventListener(eventType, (event: MessageEvent) => {
        try {
          const progressEvent = JSON.parse(event.data)
          console.log(`Received ${eventType} event:`, progressEvent)
          
          // CRITICAL: Save the event ID after each message for resumption
          if (event.lastEventId) {
            const activeJobStr = localStorage.getItem(ACTIVE_JOB_KEY)
            if (activeJobStr) {
              try {
                const activeJob = JSON.parse(activeJobStr)
                activeJob.lastEventId = event.lastEventId
                localStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify(activeJob))
              } catch (e) {
                console.error('Failed to update lastEventId:', e)
              }
            }
          }
          
          setResult(prev => ({
            ...prev,
            events: [...prev.events, progressEvent],
            // Mark as not loading if job completed
            isLoading: eventType === 'job_completed' ? false : prev.isLoading
          }))
          
          // Close connection and clear localStorage on terminal events
          if (eventType === 'job_completed' || eventType === 'job_failed' || eventType === 'job_timeout') {
            console.log(`🧹 Cleaning up localStorage for completed/failed job: ${eventType}`)
            eventSourceRef.current?.close()
            localStorage.removeItem(ACTIVE_JOB_KEY)
          }
        } catch (error) {
          console.error(`Failed to parse ${eventType} event:`, error)
        }
      })
    })
    
    // Handle job_failed events for error display
    eventSourceRef.current.addEventListener('job_failed', (event: MessageEvent) => {
      try {
        const errorData = JSON.parse(event.data)
        setResult(prev => ({ 
          ...prev, 
          error: errorData.error || 'Job failed', 
          isLoading: false 
        }))
      } catch (error) {
        console.error('Failed to parse job_failed event:', error)
      }
    })
    
    eventSourceRef.current.onerror = (error) => {
      console.error('SSE connection error:', error)
      console.log('EventSource readyState:', eventSourceRef.current?.readyState)
      console.log('EventSource states - CONNECTING:', EventSource.CONNECTING, 'OPEN:', EventSource.OPEN, 'CLOSED:', EventSource.CLOSED)
      
      // Only handle connection errors if the connection is actually closed
      if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
        if (retryCount < MAX_RETRIES) {
          console.log(`🔄 Connection closed, retrying in ${RETRY_DELAY_MS}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`)
          
          // Get job info and retry
          const activeJobStr = localStorage.getItem(ACTIVE_JOB_KEY)
          if (activeJobStr) {
            try {
              const activeJob = JSON.parse(activeJobStr)
              setTimeout(() => {
                connectToStream(activeJob.jobId, activeJob.lastEventId, retryCount + 1)
              }, RETRY_DELAY_MS)
            } catch (e) {
              console.error('Failed to parse job info for retry:', e)
            }
          }
        } else {
          console.log(`🧹 Max retries exceeded, cleaning up localStorage`)
          setResult(prev => ({ 
            ...prev, 
            error: 'Connection lost after multiple retries', 
            isLoading: false 
          }))
          localStorage.removeItem(ACTIVE_JOB_KEY)
        }
      }
    }
  }
  
  const startCrawl = async (request: CreateJobRequest) => {
    setResult(prev => ({ ...prev, isLoading: true, error: null, events: [] }))
    
    try {
      // Create job
      const response = await fetch('/api/v4/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      
      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error)
      }
      
      const jobId = data.data.jobId
      setResult(prev => ({ ...prev, jobId, url: request.url }))
      
      // Save active job to localStorage for resumability
      localStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify({
        jobId,
        url: request.url,
        startedAt: Date.now()
      }))
      
      // Connect to the stream
      connectToStream(jobId)
      
    } catch (error) {
      setResult(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false,
      }))
    }
  }
  
  const stopCrawl = () => {
    eventSourceRef.current?.close()
    setResult(prev => ({ ...prev, isLoading: false }))
    localStorage.removeItem(ACTIVE_JOB_KEY)
  }
  
  const clearJob = () => {
    eventSourceRef.current?.close()
    localStorage.removeItem(ACTIVE_JOB_KEY)
    setResult({
      isLoading: false,
      error: null,
      events: [],
    })
  }
  
  // Check for active job on mount and resume if found
  useEffect(() => {
    const activeJobStr = localStorage.getItem(ACTIVE_JOB_KEY)
    if (activeJobStr) {
      try {
        const activeJob = JSON.parse(activeJobStr)
        console.log('Found active job, resuming:', activeJob)
        
        // Set the job ID and loading state
        setResult(prev => ({ 
          ...prev, 
          jobId: activeJob.jobId,
          url: activeJob.url,
          isLoading: true,
          events: [] // Start fresh with events
        }))
        
        // Connect to the existing stream, passing lastEventId if available
        connectToStream(activeJob.jobId, activeJob.lastEventId)
      } catch (error) {
        console.error('Failed to resume job:', error)
        localStorage.removeItem(ACTIVE_JOB_KEY)
      }
    }
    
    // Cleanup on unmount
    return () => {
      eventSourceRef.current?.close()
    }
  }, [])
  
  return {
    ...result,
    startCrawl,
    stopCrawl,
    clearJob,
  }
}