import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { FileText, Hash, Link as LinkIcon } from "lucide-react"
import { motion } from "framer-motion"
import { encode } from "gpt-tokenizer"
import type { CrawlResult } from "@/types/crawler"

interface CrawlProgressProps {
  results: CrawlResult[]
}

export function CrawlProgress({ results }: CrawlProgressProps) {
  const completedCount = results.filter(r => r.status === "complete").length;
  const currentResult = results[results.length - 1];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Progress 
                value={completedCount} 
                max={Math.max(results.length, completedCount + 1)} 
                className="w-full"
              />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>
                  Processed: {completedCount}
                </span>
                {currentResult && (
                  <span className="truncate ml-2">
                    Currently processing: {currentResult.title}
                  </span>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-2 pt-4 border-t">
              <motion.div 
                className="space-y-0.5"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
              >
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  Tokens
                </div>
                <motion.p 
                  className="text-base font-medium"
                  initial={{ color: "hsl(var(--primary))" }}
                  animate={{ color: "hsl(var(--foreground))" }}
                  transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
                >
                  {Intl.NumberFormat('en-US', { notation: 'compact' }).format(
                    results.reduce((sum, r) => sum + encode(r.content).length, 0)
                  )}
                </motion.p>
                <div className="text-[10px] text-muted-foreground">
                  (~{Math.round(results.reduce((sum, r) => sum + encode(r.content).length, 0) * 0.0004 * 100) / 100}¢)
                </div>
              </motion.div>
              
              <motion.div 
                className="space-y-0.5"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
              >
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  Words
                </div>
                <p className="text-sm">
                  {Intl.NumberFormat('en-US', { notation: 'compact' }).format(
                    results.reduce((sum, r) => sum + r.content.split(/\s+/).length, 0)
                  )}
                </p>
              </motion.div>
              
              <motion.div 
                className="space-y-0.5"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
              >
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <LinkIcon className="w-3 h-3" />
                  Pages
                </div>
                <p className="text-sm">
                  {completedCount}
                </p>
              </motion.div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
