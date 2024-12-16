import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { FileText, Hash, Link as LinkIcon } from "lucide-react"
import { motion } from "framer-motion"
import { encode } from "gpt-tokenizer"
import type { CrawlResult } from "@/types/crawler"

interface CrawlProgressProps {
  results: CrawlResult[]
  isFinished: boolean
}

export function CrawlProgress({ results, isFinished }: CrawlProgressProps) {
  const completedCount = results.filter(r => r.status === "complete").length;
  const currentResult = results[results.length - 1];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardContent className="p-4">
          <div className="space-y-2">
            {
              !isFinished &&
              <div className="space-y-2 pb-4">
                <Progress 
                  value={completedCount} 
                  max={Math.max(results.length, completedCount + 1)} 
                  className="w-full rounded"
                />
                <div className="flex justify-between text-sm text-muted-foreground pb-4">
                  <span>
                    Processed: {completedCount}
                  </span>
                  {currentResult && (
                    <span className="truncate ml-2">
                      Currently processing: {currentResult.title}
                    </span>
                  )}
                </div>
                <Separator className="mt-12" />
              </div>
            }
            
            <div className="flex justify-between">
              <motion.div 
                className="w-full space-y-0.5 flex flex-col gap-1 items-center"
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
                {/* <div className="text-[10px] text-muted-foreground">
                  (~{Math.round(results.reduce((sum, r) => sum + encode(r.content).length, 0) * 0.0004 * 100) / 100}¢)
                </div> */}
              </motion.div>
              
              <motion.div 
                className="w-full space-y-0.5 flex flex-col gap-1 items-center"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
              >
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  Words
                </div>
                <p className="text-base font-medium">
                  {Intl.NumberFormat('en-US', { notation: 'compact' }).format(
                    results.reduce((sum, r) => sum + r.content.split(/\s+/).length, 0)
                  )}
                </p>
              </motion.div>
              
              <motion.div 
                className="w-full space-y-0.5 flex flex-col gap-1 items-center"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
              >
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <LinkIcon className="w-3 h-3" />
                  Pages
                </div>
                <p className="text-base font-medium">
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
