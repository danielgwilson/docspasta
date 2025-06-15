'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Sparkles, ArrowRight, Globe, RefreshCw } from 'lucide-react'
import { CrawlCard } from '@/components/CrawlCard'
import { motion, AnimatePresence } from 'framer-motion'

interface ActiveJob {
  jobId: string
  url: string
  status?: string
  createdAt?: string
  completedAt?: string
  pagesProcessed?: number
  pagesFound?: number
  totalWords?: number
}

export default function Home() {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([])
  const [error, setError] = useState('')
  const [forceRefresh, setForceRefresh] = useState(false)

  // Load jobs from localStorage on mount (for anonymous users)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedJobs = localStorage.getItem('docspasta-active-jobs')
        if (savedJobs) {
          const parsedJobs = JSON.parse(savedJobs)
          // Validate the structure and keep only minimal data
          if (Array.isArray(parsedJobs)) {
            const validJobs = parsedJobs
              .filter(job => job.jobId && job.url)
              .map(job => ({
                jobId: job.jobId,
                url: job.url
              }))
            setActiveJobs(validJobs)
          }
        }
      } catch (err) {
        console.error('Failed to load active jobs from localStorage:', err)
      }
    }
  }, [])

  // Save active jobs to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        if (activeJobs.length > 0) {
          // Save only minimal data to keep localStorage lean
          const jobsToSave = activeJobs.map(job => ({
            jobId: job.jobId,
            url: job.url
          }))
          localStorage.setItem('docspasta-active-jobs', JSON.stringify(jobsToSave))
        } else {
          // Clear localStorage when no active jobs
          localStorage.removeItem('docspasta-active-jobs')
        }
      } catch (err) {
        console.error('Failed to save active jobs to localStorage:', err)
      }
    }
  }, [activeJobs])

  // Initialize dev processor in development
  useEffect(() => {
    // Only run on client side
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      fetch('/api/init').catch(console.error)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!url) {
      setError('Please enter a URL')
      return
    }

    // Basic URL validation
    try {
      new URL(url)
    } catch {
      setError('Please enter a valid URL')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/v4/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url, force: forceRefresh })
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to start crawl')
      }

      // Add to active jobs
      setActiveJobs(prev => [...prev, {
        jobId: result.data.jobId,
        url: result.data.url
      }])

      // Clear input and reset force
      setUrl('')
      setForceRefresh(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start crawl')
    } finally {
      setIsLoading(false)
    }
  }

  const handleJobComplete = (jobId: string) => {
    console.log(`Job ${jobId} completed`)
    // Keep completed jobs visible until dismissed
  }

  const handleJobDismiss = (jobId: string) => {
    // Remove the job from activeJobs
    setActiveJobs(prev => prev.filter(job => job.jobId !== jobId))
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-100 dark:from-amber-950 dark:via-orange-950 dark:to-yellow-900">
      {/* Header */}
      <header className="border-b border-amber-200/20 bg-white/10 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-xl sm:text-2xl">🍝</div>
            <span className="text-lg sm:text-xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
              Docspasta
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="sm" className="px-3 sm:px-4">
              Sign In
            </Button>
            <Button size="sm" className="px-3 sm:px-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700">
              Sign Up
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Badge */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-200"
          >
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-700">
              Turn any docs into LLM-ready markdown
            </span>
          </motion.div>

          {/* Main Heading */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-4"
          >
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-gray-900 via-amber-800 to-orange-800 bg-clip-text text-transparent dark:from-gray-100 dark:via-amber-200 dark:to-orange-200">
                What docs do you
              </span>
              <br />
              <span className="bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                want to pasta?
              </span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto leading-relaxed">
              Zero friction docs → markdown for AI chats. Just paste a URL and get beautiful, 
              LLM-ready content in seconds.
            </p>
          </motion.div>

          {/* URL Input Form */}
          <motion.form 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            onSubmit={handleSubmit}
            className="max-w-2xl mx-auto space-y-4"
          >
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  type="url"
                  placeholder="https://docs.example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="pl-10 h-12 text-base"
                  disabled={isLoading}
                />
              </div>
              <Button 
                type="submit" 
                size="lg"
                disabled={isLoading}
                className="h-12 px-6 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700"
              >
                {isLoading ? (
                  <>
                    <Sparkles className="mr-2 h-5 w-5 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    Start Crawl
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>
            </div>
            
            {/* Force refresh checkbox */}
            <div className="flex items-center space-x-2 mt-3">
              <Checkbox 
                id="force-refresh" 
                checked={forceRefresh}
                onCheckedChange={(checked) => setForceRefresh(checked === true)}
                disabled={isLoading}
              />
              <label
                htmlFor="force-refresh"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                Force fresh crawl (bypass cache)
              </label>
            </div>
            
            {error && (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm text-red-600 dark:text-red-400"
              >
                {error}
              </motion.p>
            )}
          </motion.form>

          {/* Active Jobs */}
          <AnimatePresence mode="popLayout">
            {activeJobs.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4 mt-8"
              >
                <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                  Active Crawls
                </h2>
                <div className="space-y-4">
                  {activeJobs.map((job) => (
                    <motion.div
                      key={job.jobId}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      layout
                    >
                      <CrawlCard
                        jobId={job.jobId}
                        url={job.url}
                        onComplete={handleJobComplete}
                        onDismiss={handleJobDismiss}
                      />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Example URLs */}
          {activeJobs.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="pt-8"
            >
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Try these examples:
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  'https://docs.stripe.com',
                  'https://tailwindcss.com/docs',
                  'https://react.dev',
                  'https://nextjs.org/docs'
                ].map((exampleUrl) => (
                  <Button
                    key={exampleUrl}
                    variant="outline"
                    size="sm"
                    onClick={() => setUrl(exampleUrl)}
                    className="text-xs"
                  >
                    {new URL(exampleUrl).hostname}
                  </Button>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}