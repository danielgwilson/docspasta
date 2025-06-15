'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Globe, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Copy, 
  Check,
  Loader2,
  Sparkles,
  FileText,
  X
} from 'lucide-react'
import { DateTime } from 'luxon'

interface CrawlProgressProps {
  jobId: string
  url: string
  onDismiss?: (jobId: string) => void
}

type CrawlStatus = 'processing' | 'completed' | 'error'

export function CrawlProgress({ jobId, url, onDismiss }: CrawlProgressProps) {
  const [status, setStatus] = useState<CrawlStatus>('processing')
  const [processed, setProcessed] = useState(0)
  const [discovered, setDiscovered] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [startTime] = useState(Date.now())
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [copied, setCopied] = useState(false)
  
  // Extract domain for display
  const domain = new URL(url).hostname
  
  // Update elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startTime])
  
  // Connect to SSE stream
  useEffect(() => {
    const eventSource = new EventSource(`/api/v4/jobs/${jobId}/stream`)
    
    eventSource.addEventListener('url_crawled', () => {
      setProcessed(p => p + 1)
    })
    
    eventSource.addEventListener('time_update', (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.totalProcessed !== undefined) setProcessed(data.totalProcessed)
        if (data.totalDiscovered !== undefined) setDiscovered(data.totalDiscovered)
      } catch (e) {
        console.error('Parse error:', e)
      }
    })
    
    eventSource.addEventListener('completed', () => {
      setStatus('completed')
    })
    
    eventSource.addEventListener('error', (event) => {
      try {
        const data = JSON.parse(event.data)
        setError(data.message || 'An error occurred')
        setStatus('error')
      } catch {
        setError('An error occurred')
        setStatus('error')
      }
    })
    
    eventSource.onerror = () => {
      // Connection error - check if job is complete
      if (status === 'processing') {
        setStatus('completed')
      }
      eventSource.close()
    }
    
    return () => eventSource.close()
  }, [jobId, status])
  
  const percentage = discovered > 0 ? Math.min((processed / discovered) * 100, 100) : 0
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`https://docspasta.com/crawl/${jobId}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }
  
  const formatElapsedTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }
  
  return (
    <Card className="overflow-hidden border-amber-200/50 shadow-lg bg-gradient-to-br from-white to-amber-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="p-2 rounded-lg bg-amber-100/50 shrink-0">
              <Globe className="h-5 w-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">{domain}</h3>
              <p className="text-sm text-gray-500 truncate">{url}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            {status === 'processing' && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Processing
              </Badge>
            )}
            {status === 'completed' && (
              <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Complete
              </Badge>
            )}
            {status === 'error' && (
              <Badge variant="secondary" className="bg-red-100 text-red-700 border-red-200">
                <XCircle className="mr-1 h-3 w-3" />
                Error
              </Badge>
            )}
            
            {onDismiss && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDismiss(jobId)}
                className="h-8 w-8 p-0"
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
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-400" />
              <span className="font-medium">
                {processed} / {discovered || '?'} pages
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-500">
              <Clock className="h-3 w-3" />
              <span>{formatElapsedTime(elapsedSeconds)}</span>
            </div>
          </div>
          
          <Progress 
            value={percentage} 
            className="h-2 bg-amber-100"
            indicatorClassName="bg-gradient-to-r from-amber-500 to-orange-500"
          />
          
          <div className="text-xs text-gray-500 text-right">
            {percentage.toFixed(0)}% complete
          </div>
        </div>
        
        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-lg bg-red-50 border border-red-200"
          >
            <p className="text-sm text-red-700">{error}</p>
          </motion.div>
        )}
        
        {/* Completion Actions */}
        <AnimatePresence>
          {status === 'completed' && !error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex gap-2"
            >
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                className="flex-1"
              >
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Link
                  </>
                )}
              </Button>
              
              <Button
                size="sm"
                className="flex-1 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700"
                onClick={() => window.open(`/crawl/${jobId}`, '_blank')}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                View Results
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}

export default CrawlProgress