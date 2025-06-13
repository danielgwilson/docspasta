'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sparkles, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import CrawlCard from './CrawlCard'

interface ActiveJob {
  jobId: string
  url: string
  timestamp: number
}

export default function ServerlessProgressV2() {
  const [inputUrl, setInputUrl] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([])

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
  }, [])

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Input Form */}
      <form id="crawl-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2">
          <Input
            type="url"
            placeholder="Enter documentation URL (e.g. https://docs.example.com)"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            disabled={isCreating}
            className="flex-1 h-12 text-base"
          />
          <Button 
            type="submit" 
            disabled={!inputUrl.trim() || isCreating}
            size="lg"
            className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 px-8"
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
      <div className="flex flex-wrap gap-2">
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
            className="hover:bg-amber-50 hover:border-amber-300"
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

      {/* Empty state */}
      {activeJobs.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12 text-gray-500"
        >
          <p className="text-lg">No active crawls</p>
          <p className="text-sm mt-2">Enter a URL above or try a quick action</p>
        </motion.div>
      )}
    </div>
  )
}