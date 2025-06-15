/**
 * Fetch the state of multiple jobs in a single request.
 * This is more efficient than making individual requests for each job.
 * 
 * @param jobIds Array of job IDs to fetch (max 20)
 * @returns Object with job states and list of not found IDs
 * 
 * @example
 * const result = await fetchBatchJobStates(['job1', 'job2', 'job3'])
 * if (result.success) {
 *   console.log(result.states.job1.status) // 'processing'
 *   console.log(result.notFound) // ['job3']
 * }
 */
export async function fetchBatchJobStates(jobIds: string[]) {
  try {
    const response = await fetch('/api/v4/jobs/batch-state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jobIds }),
    })
    
    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`)
    }
    
    return data
  } catch (error) {
    console.error('Failed to fetch batch job states:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      states: {},
      notFound: jobIds
    }
  }
}

/**
 * React hook for fetching multiple job states with polling support
 * 
 * @example
 * const { states, notFound, loading, error } = useBatchJobStates(['job1', 'job2'], {
 *   pollInterval: 2000,
 *   enabled: true
 * })
 */
import { useState, useEffect, useRef } from 'react'

interface UseBatchJobStatesOptions {
  pollInterval?: number // milliseconds, 0 to disable polling
  enabled?: boolean // whether to fetch/poll
}

export function useBatchJobStates(
  jobIds: string[],
  options: UseBatchJobStatesOptions = {}
) {
  const { pollInterval = 2000, enabled = true } = options
  const [states, setStates] = useState<Record<string, any>>({})
  const [notFound, setNotFound] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  
  useEffect(() => {
    if (!enabled || jobIds.length === 0) {
      return
    }
    
    const fetchStates = async () => {
      setLoading(true)
      setError(null)
      
      const result = await fetchBatchJobStates(jobIds)
      
      if (result.success) {
        setStates(result.states)
        setNotFound(result.notFound)
        
        // Stop polling if all jobs are completed or failed
        const allDone = Object.values(result.states).every(
          (state: any) => ['completed', 'failed', 'timeout'].includes(state.status)
        )
        
        if (allDone && intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      } else {
        setError(result.error)
      }
      
      setLoading(false)
    }
    
    // Initial fetch
    fetchStates()
    
    // Set up polling if enabled
    if (pollInterval > 0) {
      intervalRef.current = setInterval(fetchStates, pollInterval)
    }
    
    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [jobIds.join(','), pollInterval, enabled]) // Re-run if job IDs change
  
  return { states, notFound, loading, error }
}