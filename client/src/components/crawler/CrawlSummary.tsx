import { Card, CardContent } from "@/components/ui/card"
import { FileText, Hash, Link as LinkIcon, Check, XCircle } from "lucide-react"
import { motion } from "framer-motion"
import type { CrawlResult } from "@/types/crawler"

interface CrawlSummaryProps {
  results: CrawlResult[]
}

export function CrawlSummary({ results }: CrawlSummaryProps) {
  const completedCount = results.filter(r => r.status === "complete").length
  const errorCount = results.filter(r => r.status === "error").length
  const totalWords = results.reduce((sum, r) => sum + r.content.split(/\s+/).length, 0)
  const domains = new Set(results.map(r => new URL(r.url).hostname)).size

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Check className="w-4 h-4 text-green-500" />
              Completed
            </div>
            <p className="text-2xl font-semibold">{completedCount}</p>
          </div>

          <div className="space-y-1">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <XCircle className="w-4 h-4 text-red-500" />
              Errors
            </div>
            <p className="text-2xl font-semibold">{errorCount}</p>
          </div>

          <div className="space-y-1">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <FileText className="w-4 h-4" />
              Words
            </div>
            <p className="text-2xl font-semibold">
              {Intl.NumberFormat('en-US', { notation: 'compact' }).format(totalWords)}
            </p>
          </div>

          <div className="space-y-1">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <LinkIcon className="w-4 h-4" />
              Domains
            </div>
            <p className="text-2xl font-semibold">{domains}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
