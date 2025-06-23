'use client'

import { useState, useEffect } from 'react'

interface JobStatistics {
  pagesProcessed: number
  pagesFound: number
  totalWords: number
  discoveredUrls: number
  failedUrls: number
  pendingPages: number
}

interface ActiveJob {
  id: string
  url: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  statusMessage: string | null
  stateVersion: number
  createdAt: string
  updatedAt: string
  statistics: JobStatistics
}

interface UseActiveJobsResult {
  activeJobs: ActiveJob[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Hook to fetch and manage active jobs (pending/running) for the current user
 * Replaces localStorage-based job restoration with database-driven approach
 */
export function useActiveJobs(): UseActiveJobsResult {
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchActiveJobs = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch('/api/v5/jobs/active')
      
      if (!response.ok) {
        throw new Error(`Failed to fetch active jobs: ${response.status}`)
      }

      const data = await response.json()
      
      if (data.success) {
        setActiveJobs(data.activeJobs || [])
      } else {
        throw new Error(data.error || 'Failed to fetch active jobs')
      }

    } catch (err) {
      console.error('Error fetching active jobs:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setActiveJobs([])
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch active jobs on mount
  useEffect(() => {
    fetchActiveJobs()
  }, [])

  return {
    activeJobs,
    isLoading,
    error,
    refetch: fetchActiveJobs,
  }
}