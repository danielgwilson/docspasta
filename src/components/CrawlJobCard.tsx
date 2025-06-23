'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { motion } from 'framer-motion'
import { 
  Globe, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Copy, 
  Check,
  Loader2,
  FileText,
  X
} from 'lucide-react'
import { useCrawlJob } from '@/hooks/useCrawlJob'

interface CrawlJobCardProps {
  job: {
    id: string
    url: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    statusMessage?: string | null
    createdAt: string
    updatedAt: string
  }
  onDismiss?: (jobId: string) => void
}

export function CrawlJobCard({ job, onDismiss }: CrawlJobCardProps) {
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  
  // Use the crawl job hook to get real-time SSE updates
  const crawlState = useCrawlJob(job.id)
  
  // Extract domain for display
  const domain = new URL(job.url).hostname
  
  // Calculate progress percentage
  const percentage = crawlState.discovered > 0 
    ? Math.min((crawlState.processed / crawlState.discovered) * 100, 100) 
    : crawlState.progress

  const handleCopy = async () => {
    if (!crawlState.downloadUrl) return
    
    try {
      setDownloading(true)
      // Fetch the markdown content
      const response = await fetch(crawlState.downloadUrl)
      if (!response.ok) {
        throw new Error('Failed to download markdown')
      }
      const markdown = await response.text()
      
      // Copy to clipboard
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy markdown:', err)
    } finally {
      setDownloading(false)
    }
  }
  
  const formatElapsedTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }
  
  const getStatusBadge = () => {
    // Use hook state for more accurate status
    const status = crawlState.status
    
    if (status === 'connecting' || status === 'processing') {
      return (
        <Badge variant="default" className="bg-gradient-to-r from-amber-600 to-orange-600">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Crawling
        </Badge>
      )
    }
    
    if (status === 'completed') {
      return (
        <Badge variant="default" className="bg-green-600">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Completed
        </Badge>
      )
    }
    
    if (status === 'failed' || status === 'timeout') {
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />
          {status === 'timeout' ? 'Timeout' : 'Error'}
        </Badge>
      )
    }
    
    // Fallback for other states
    return (
      <Badge variant="outline">
        <Clock className="mr-1 h-3 w-3" />
        {status}
      </Badge>
    )
  }
  
  return (
    <Card className="w-full border-amber-200/50 shadow-lg overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-600 to-orange-600">
        <motion.div
          className="h-full bg-gradient-to-r from-amber-300 to-orange-300"
          style={{ width: `${percentage}%` }}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <h3 className="font-semibold text-lg truncate">{domain}</h3>
            </div>
            <p className="text-sm text-muted-foreground truncate mt-1">{job.url}</p>
          </div>
          <div className="flex items-center gap-2 ml-2">
            {getStatusBadge()}
            {onDismiss && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-destructive/10"
                onClick={() => onDismiss(job.id)}
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-3">
          {/* Progress info */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <span className="font-medium">
                {crawlState.processed} / {crawlState.discovered || '?'} pages
              </span>
              <span className="text-muted-foreground">
                {percentage.toFixed(0)}%
              </span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{formatElapsedTime(crawlState.elapsedTime)}</span>
            </div>
          </div>
          
          {/* Progress bar */}
          <Progress value={percentage} className="h-2" />
          
          {/* Error message */}
          {crawlState.error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3">
              <p className="text-sm text-red-600 dark:text-red-400">{crawlState.error}</p>
            </div>
          )}
          
          {/* Recent events */}
          {crawlState.events.length > 0 && (crawlState.status === 'processing' || crawlState.status === 'connecting') && (
            <div className="rounded-md bg-gray-50 dark:bg-gray-900/20 p-3">
              <div className="space-y-1">
                {crawlState.events.slice(-2).map((event, index) => (
                  <p key={index} className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                    {event}
                  </p>
                ))}
              </div>
            </div>
          )}
          
          {/* Action buttons */}
          {crawlState.status === 'completed' && crawlState.downloadUrl && (
            <div className="flex gap-2 pt-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleCopy}
                className="flex-1"
                disabled={downloading}
              >
                {downloading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Markdown
                  </>
                )}
              </Button>
              <Button 
                size="sm"
                className="flex-1 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700"
                onClick={() => window.open(crawlState.downloadUrl!, '_blank')}
              >
                <FileText className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}