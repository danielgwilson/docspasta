'use client'

import { useEffect, useReducer, useRef } from 'react'
import { parseSSEEvent } from '@/lib/schemas/sse-events'

// State shape for the crawl job
interface CrawlJobState {
  status: 'idle' | 'connecting' | 'processing' | 'completed' | 'failed' | 'timeout'
  processed: number
  discovered: number
  total: number
  progress: number
  lastUrl: string | null
  elapsedTime: number
  error: string | null
  events: string[]
  isRestoring: boolean
}

// Actions that can update the state
type CrawlJobAction =
  | { type: 'SET_RESTORING'; isRestoring: boolean }
  | { type: 'STREAM_CONNECTED'; url: string }
  | { type: 'URL_STARTED'; url: string }
  | { type: 'URL_CRAWLED'; url: string; success: boolean; contentLength: number }
  | { type: 'URLS_DISCOVERED'; count: number; totalDiscovered: number }
  | { type: 'PROGRESS_UPDATE'; processed: number; discovered: number }
  | { type: 'TIME_UPDATE'; elapsed: number; processed: number; discovered: number }
  | { type: 'JOB_COMPLETED'; processed: number; discovered: number }
  | { type: 'JOB_FAILED'; error: string }
  | { type: 'JOB_TIMEOUT' }
  | { type: 'CONNECTION_ERROR'; error: string }
  | { type: 'ADD_EVENT'; message: string }
  | { type: 'RESTORE_STATE'; state: Partial<CrawlJobState> }

// Initial state
const initialState: CrawlJobState = {
  status: 'idle',
  processed: 0,
  discovered: 0,
  total: 1, // Avoid division by zero
  progress: 0,
  lastUrl: null,
  elapsedTime: 0,
  error: null,
  events: [],
  isRestoring: true
}

// Reducer to handle state transitions
function crawlJobReducer(state: CrawlJobState, action: CrawlJobAction): CrawlJobState {
  const newState = crawlJobReducerImpl(state, action)
  
  // Log state changes only when progress changes
  if (newState.processed !== state.processed || newState.discovered !== state.discovered) {
    console.log(`[useCrawlJobV2] 📊 Progress update:`, {
      action: action.type,
      before: { processed: state.processed, discovered: state.discovered, progress: state.progress },
      after: { processed: newState.processed, discovered: newState.discovered, progress: newState.progress }
    })
  }
  
  return newState
}

function crawlJobReducerImpl(state: CrawlJobState, action: CrawlJobAction): CrawlJobState {
  
  switch (action.type) {
    case 'SET_RESTORING':
      return { ...state, isRestoring: action.isRestoring }
      
    case 'STREAM_CONNECTED':
      return {
        ...state,
        status: 'processing',
        error: null,
        events: [...state.events.slice(-4), `Connected to ${action.url}`]
      }
      
    case 'URL_STARTED':
      return {
        ...state,
        lastUrl: action.url,
        events: [...state.events.slice(-4), `Crawling: ${new URL(action.url).pathname}`]
      }
      
    case 'URL_CRAWLED': {
      const newProcessed = state.processed + 1
      const newTotal = Math.max(state.discovered, newProcessed, 1)
      const newProgress = (newProcessed / newTotal) * 100
      
      return {
        ...state,
        processed: newProcessed,
        total: newTotal,
        progress: newProgress,
        events: [...state.events.slice(-4), 
          action.success 
            ? `Completed: ${new URL(action.url).pathname} (${action.contentLength} chars)`
            : `Failed: ${new URL(action.url).pathname}`
        ]
      }
    }
    
    case 'URLS_DISCOVERED': {
      const newTotal = Math.max(action.totalDiscovered, state.processed, 1)
      const newProgress = (state.processed / newTotal) * 100
      
      return {
        ...state,
        discovered: action.totalDiscovered,
        total: newTotal,
        progress: newProgress,
        events: [...state.events.slice(-4), `Found ${action.count} new URLs`]
      }
    }
    
    case 'PROGRESS_UPDATE': {
      const newTotal = Math.max(action.discovered, action.processed, 1)
      const newProgress = (action.processed / newTotal) * 100
      
      return {
        ...state,
        processed: action.processed,
        discovered: action.discovered,
        total: newTotal,
        progress: newProgress
      }
    }
    
    case 'TIME_UPDATE': {
      const newTotal = Math.max(action.discovered, action.processed, 1)
      const newProgress = (action.processed / newTotal) * 100
      
      return {
        ...state,
        elapsedTime: action.elapsed,
        processed: action.processed || state.processed,
        discovered: action.discovered || state.discovered,
        total: newTotal,
        progress: newProgress
      }
    }
    
    case 'JOB_COMPLETED': {
      const finalTotal = Math.max(action.discovered, action.processed, 1)
      return {
        ...state,
        status: 'completed',
        processed: action.processed,
        discovered: action.discovered,
        total: finalTotal,
        progress: 100,
        events: [...state.events.slice(-4), 'Crawl completed successfully!']
      }
    }
    
    case 'JOB_FAILED':
      return {
        ...state,
        status: 'failed',
        error: action.error,
        events: [...state.events.slice(-4), `Error: ${action.error}`]
      }
      
    case 'JOB_TIMEOUT':
      return {
        ...state,
        status: 'timeout',
        error: 'Job timed out after 5 minutes',
        events: [...state.events.slice(-4), 'Job timed out after 5 minutes']
      }
      
    case 'CONNECTION_ERROR':
      return {
        ...state,
        error: action.error
      }
      
    case 'ADD_EVENT':
      return {
        ...state,
        events: [...state.events.slice(-4), action.message]
      }
      
    case 'RESTORE_STATE':
      return {
        ...state,
        ...action.state,
        isRestoring: false
      }
      
    default:
      return state
  }
}

export function useCrawlJobV2(jobId: string | null) {
  const [state, dispatch] = useReducer(crawlJobReducer, initialState)
  const eventSourceRef = useRef<EventSource | null>(null)
  const isMountedRef = useRef(true)
  
  // Restore state on mount
  useEffect(() => {
    if (!jobId) return
    
    const fetchJobState = async () => {
      try {
        console.log(`[useCrawlJobV2] Fetching state for job ${jobId}`)
        const response = await fetch(`/api/v4/jobs/${jobId}/state`)
        
        if (!response.ok) {
          console.error('[useCrawlJobV2] Failed to fetch job state:', response.status)
          dispatch({ type: 'SET_RESTORING', isRestoring: false })
          return
        }
        
        const data = await response.json()
        console.log('[useCrawlJobV2] Restored state:', data)
        
        if (data.success && isMountedRef.current) {
          const restoredState: Partial<CrawlJobState> = {
            status: data.status === 'completed' ? 'completed' :
                    data.status === 'failed' ? 'failed' :
                    data.status === 'timeout' ? 'timeout' :
                    'connecting',
            processed: data.totalProcessed || 0,
            discovered: data.totalDiscovered || 0,
            total: Math.max(data.totalDiscovered || 0, data.totalProcessed || 0, 1),
            progress: data.totalProcessed && data.totalDiscovered 
              ? (data.totalProcessed / Math.max(data.totalDiscovered, data.totalProcessed, 1)) * 100 
              : 0,
            error: data.error || null
          }
          
          dispatch({ type: 'RESTORE_STATE', state: restoredState })
        } else {
          dispatch({ type: 'SET_RESTORING', isRestoring: false })
        }
      } catch (error) {
        console.error('[useCrawlJobV2] Error fetching job state:', error)
        dispatch({ type: 'SET_RESTORING', isRestoring: false })
      }
    }
    
    fetchJobState()
  }, [jobId])
  
  // Set up SSE connection
  useEffect(() => {
    if (!jobId || state.isRestoring) return
    
    // Skip SSE for completed/failed/timeout jobs
    if (state.status === 'completed' || state.status === 'failed' || state.status === 'timeout') {
      console.log(`[useCrawlJobV2] Skipping SSE for ${state.status} job`)
      return
    }
    
    // Clean up any existing connection first
    if (eventSourceRef.current) {
      console.log('[useCrawlJobV2] Cleaning up existing SSE connection')
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    
    console.log(`[useCrawlJobV2] Setting up SSE connection for job ${jobId}`)
    
    const streamUrl = `/api/v4/jobs/${jobId}/stream`
    const eventSource = new EventSource(streamUrl)
    eventSourceRef.current = eventSource
    
    eventSource.onopen = () => {
      console.log('[useCrawlJobV2] ✅ SSE connection opened')
    }
    
    eventSource.onerror = (error) => {
      console.error('[useCrawlJobV2] ❌ SSE error:', error)
      if (isMountedRef.current) {
        dispatch({ type: 'CONNECTION_ERROR', error: 'Connection lost' })
      }
    }
    
    // Generic message handler to see ALL events
    eventSource.onmessage = (event) => {
      console.log('[useCrawlJobV2] 📨 Generic message received:', {
        type: event.type,
        data: event.data,
        lastEventId: event.lastEventId
      })
    }
    
    // Remove this debug code since we know events are being received
    
    // Handle specific event types
    eventSource.addEventListener('stream_connected', (event) => {
      const data = parseSSEEvent(event.data)
      if (data?.type === 'stream_connected' && isMountedRef.current) {
        dispatch({ type: 'STREAM_CONNECTED', url: data.url })
      }
    })
    
    eventSource.addEventListener('url_started', (event) => {
      const data = parseSSEEvent(event.data)
      if (data?.type === 'url_started' && isMountedRef.current) {
        dispatch({ type: 'URL_STARTED', url: data.url })
      }
    })
    
    eventSource.addEventListener('url_crawled', (event) => {
      console.log('[useCrawlJobV2] ✅ Received url_crawled event:', event.data)
      const data = parseSSEEvent(event.data)
      console.log('[useCrawlJobV2] 🔍 Parsed url_crawled data:', data)
      if (data?.type === 'url_crawled' && isMountedRef.current) {
        console.log('[useCrawlJobV2] 🎯 Dispatching URL_CRAWLED with:', {
          url: data.url,
          success: data.success,
          contentLength: data.content_length || 0,
          currentState: { processed: state.processed, discovered: state.discovered }
        })
        dispatch({ 
          type: 'URL_CRAWLED', 
          url: data.url,
          success: data.success,
          contentLength: data.content_length || 0
        })
      }
    })
    
    eventSource.addEventListener('urls_discovered', (event) => {
      console.log('[useCrawlJobV2] 🔍 URLs discovered event:', event.data)
      const data = parseSSEEvent(event.data)
      if (data?.type === 'urls_discovered' && isMountedRef.current) {
        console.log('[useCrawlJobV2] 📊 Dispatching URLS_DISCOVERED:', {
          count: data.count,
          totalDiscovered: data.total_discovered
        })
        dispatch({ 
          type: 'URLS_DISCOVERED',
          count: data.count,
          totalDiscovered: data.total_discovered
        })
      }
    })
    
    eventSource.addEventListener('progress', (event) => {
      console.log('[useCrawlJobV2] 📈 Received progress event:', event.data)
      const data = parseSSEEvent(event.data)
      console.log('[useCrawlJobV2] 📊 Parsed progress data:', data)
      if (data?.type === 'progress' && isMountedRef.current) {
        dispatch({ 
          type: 'PROGRESS_UPDATE',
          processed: data.processed,
          discovered: data.discovered
        })
      }
    })
    
    eventSource.addEventListener('time_update', (event) => {
      console.log('[useCrawlJobV2] ⏱️ Received time_update event:', event.data)
      const data = parseSSEEvent(event.data)
      console.log('[useCrawlJobV2] ⏰ Parsed time_update data:', data)
      if (data?.type === 'time_update' && isMountedRef.current) {
        dispatch({ 
          type: 'TIME_UPDATE',
          elapsed: data.elapsed,
          processed: data.totalProcessed || 0,
          discovered: data.totalDiscovered || 0
        })
      }
    })
    
    eventSource.addEventListener('job_completed', (event) => {
      const data = parseSSEEvent(event.data)
      if (data?.type === 'job_completed' && isMountedRef.current) {
        dispatch({ 
          type: 'JOB_COMPLETED',
          processed: data.totalProcessed || state.processed,
          discovered: data.totalDiscovered || state.discovered
        })
        eventSource.close()
      }
    })
    
    eventSource.addEventListener('job_failed', (event) => {
      const data = parseSSEEvent(event.data)
      if (data?.type === 'job_failed' && isMountedRef.current) {
        dispatch({ type: 'JOB_FAILED', error: data.error || 'Job failed' })
        eventSource.close()
      }
    })
    
    eventSource.addEventListener('job_timeout', (event) => {
      const data = parseSSEEvent(event.data)
      if (data?.type === 'job_timeout' && isMountedRef.current) {
        dispatch({ type: 'JOB_TIMEOUT' })
        eventSource.close()
      }
    })
    
    return () => {
      console.log('[useCrawlJobV2] Cleaning up SSE connection')
      eventSource.close()
      eventSourceRef.current = null
    }
  }, [jobId, state.isRestoring, state.status])
  
  // Track component mount state
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])
  
  return {
    ...state,
    downloadUrl: state.status === 'completed' ? `/api/v4/jobs/${jobId}/download` : null
  }
}