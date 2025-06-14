'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sparkles, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import CrawlCard from './CrawlCard'
import { useIsClient } from '@/hooks/useIsClient'

interface ActiveJob {
  jobId: string
  url: string
  timestamp: number
}

const LOCALSTORAGE_KEY = 'docspasta-active-jobs'

export default function ServerlessProgressV2() {
  const isClient = useIsClient()
  const [inputUrl, setInputUrl] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([])
  const [isLoadingJobs, setIsLoadingJobs] = useState(true)

  // Load jobs from localStorage and database on mount
  useEffect(() => {
    if (!isClient) return

    const loadJobs = async () => {
      try {
        // First, load from localStorage for immediate display
        const storedJobs = localStorage.getItem(LOCALSTORAGE_KEY)
        if (storedJobs) {
          try {
            const parsedJobs = JSON.parse(storedJobs) as ActiveJob[]
            // Filter out jobs older than 24 hours
            const recentJobs = parsedJobs.filter(
              job => Date.now() - job.timestamp < 24 * 60 * 60 * 1000
            )
            setActiveJobs(recentJobs)
          } catch (e) {
            console.error('Failed to parse stored jobs:', e)
            localStorage.removeItem(LOCALSTORAGE_KEY)
          }
        }

        // Then fetch active jobs from database
        try {
          const response = await fetch('/api/v4/jobs')
          if (response.ok) {
            const data = await response.json()
            if (data.success && data.data) {
              // Merge database jobs with localStorage jobs
              const dbJobs = data.data.map((job: any) => ({
                jobId: job.id,
                url: job.url,
                timestamp: new Date(job.created_at).getTime()
              }))
              
              // Merge and deduplicate
              setActiveJobs(prev => {
                const jobMap = new Map<string, ActiveJob>()
                
                // Add localStorage jobs first
                prev.forEach(job => jobMap.set(job.jobId, job))
                
                // Add database jobs (will override if duplicate)
                dbJobs.forEach((job: ActiveJob) => jobMap.set(job.jobId, job))
                
                // Convert back to array and sort by timestamp
                return Array.from(jobMap.values()).sort((a, b) => b.timestamp - a.timestamp)
              })
            }
          }
        } catch (err) {
          console.error('Failed to fetch active jobs from database:', err)
        }
      } finally {
        setIsLoadingJobs(false)
      }
    }

    loadJobs()
  }, [isClient])

  // Persist jobs to localStorage whenever they change
  useEffect(() => {
    if (!isClient) return
    
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(activeJobs))
  }, [activeJobs, isClient])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputUrl.trim()) return

    setIsCreating(true)
    setError(null)

    try {
      const response = await fetch('/api/v4/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inputUrl.trim() })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create job')
      }

      // Add new job to the list
      setActiveJobs(prev => [{
        jobId: data.data.jobId,
        url: inputUrl.trim(),
        timestamp: Date.now()
      }, ...prev])

      // Clear input
      setInputUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start crawl')
    } finally {
      setIsCreating(false)
    }
  }

  const handleQuickAction = (url: string) => {
    setInputUrl(url)
    // Auto-submit
    setTimeout(() => {
      const form = document.getElementById('crawl-form') as HTMLFormElement
      form?.requestSubmit()
    }, 100)
  }

  const handleJobComplete = useCallback((completedJobId: string) => {
    // Job stays in the list but is marked as completed via the CrawlCard's internal state
    console.log(`Job ${completedJobId} completed`)
    // Note: We keep completed jobs in the list so users can see results after refresh
    // The CrawlCard component will handle displaying the appropriate state
  }, [])

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Input Form */}
      <form id="crawl-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            type="url"
            placeholder="Enter documentation URL"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            disabled={isCreating}
            className="flex-1 h-12 text-base placeholder:text-sm sm:placeholder:text-base"
          />
          <Button 
            type="submit" 
            disabled={!inputUrl.trim() || isCreating}
            size="lg"
            className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 px-6 sm:px-8 w-full sm:w-auto"
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Crawl Docs
              </>
            )}
          </Button>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2"
          >
            {error}
          </motion.div>
        )}
      </form>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
        {[
          { url: 'https://docs.lovable.dev/', label: 'Lovable', emoji: '💖' },
          { url: 'https://nextjs.org/docs', label: 'Next.js', emoji: '⚡' },
          { url: 'https://tailwindcss.com/docs', label: 'Tailwind', emoji: '🎨' },
          { url: 'https://react.dev/', label: 'React', emoji: '⚛️' },
        ].map((action) => (
          <Button
            key={action.url}
            variant="outline"
            size="sm"
            onClick={() => handleQuickAction(action.url)}
            className="hover:bg-amber-50 hover:border-amber-300 flex-1 sm:flex-initial min-w-[80px] max-w-[150px] sm:max-w-none"
          >
            <span className="mr-1">{action.emoji}</span>
            {action.label}
          </Button>
        ))}
      </div>

      {/* Active Jobs */}
      <AnimatePresence mode="popLayout">
        {activeJobs.map((job) => (
          <CrawlCard
            key={job.jobId}
            jobId={job.jobId}
            url={job.url}
            onComplete={handleJobComplete}
          />
        ))}
      </AnimatePresence>

      {/* Empty state or loading */}
      {activeJobs.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-8 sm:py-12 text-gray-500"
        >
          {isLoadingJobs ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p className="text-base sm:text-lg">Loading jobs...</p>
            </>
          ) : (
            <>
              <p className="text-base sm:text-lg">No active crawls</p>
              <p className="text-xs sm:text-sm mt-2">Enter a URL above or try a quick action</p>
            </>
          )}
        </motion.div>
      )}
    </div>
  )
}