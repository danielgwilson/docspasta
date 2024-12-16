import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp, ExternalLink, Clock, User, Hash, Code, File } from "lucide-react"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { CrawlResult } from "@/types/crawler"

interface ResultsListProps {
  results: CrawlResult[]
}

export function ResultsList({ results }: ResultsListProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  const toggleItem = (url: string) => {
    const newExpanded = new Set(expandedItems)
    if (expandedItems.has(url)) {
      newExpanded.delete(url)
    } else {
      newExpanded.add(url)
    }
    setExpandedItems(newExpanded)
  }

  return (
    <div className="space-y-4">
      {results.filter(r => r.status === "complete").map((result) => {
        const isExpanded = expandedItems.has(result.url)
        const hostname = new URL(result.url).hostname
        const pathname = new URL(result.url).pathname
        
        return (
          <Card key={result.url} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <h3 className="font-semibold text-lg leading-none">
                    {result.title}
                  </h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="font-medium">{hostname}</span>
                    <span className="text-muted-foreground/60">{pathname}</span>
                  </p>
                  
                  {/* Metadata badges */}
                  {result.metadata && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {result.metadata.lastModified && (
                        <div className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded">
                          <Clock className="w-3 h-3" />
                          {new Date(result.metadata.lastModified).toLocaleDateString()}
                        </div>
                      )}
                      {result.metadata.author && (
                        <div className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded">
                          <User className="w-3 h-3" />
                          {result.metadata.author}
                        </div>
                      )}
                      {result.metadata.language && (
                        <div className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded">
                          <Code className="w-3 h-3" />
                          {result.metadata.language}
                        </div>
                      )}
                      {result.metadata.tags?.map(tag => (
                        <div key={tag} className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded">
                          <Hash className="w-3 h-3" />
                          {tag}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => window.open(result.url, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleItem(result.url)}
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-4 mt-4 border-t space-y-4">
                      {/* Navigation hierarchy */}
                      {result.hierarchy && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <FileTree className="w-4 h-4" />
                          <div className="flex items-center gap-1">
                            {result.hierarchy.parent && (
                              <span className="hover:underline cursor-pointer">
                                Parent
                              </span>
                            )}
                            {result.hierarchy.section && (
                              <span className="text-muted-foreground/60">
                                › {result.hierarchy.section}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Main content */}
                      <div className="prose prose-sm max-w-none">
                        {result.content}
                      </div>

                      {/* Code blocks */}
                      {result.codeBlocks && result.codeBlocks.length > 0 && (
                        <div className="space-y-4">
                          <h4 className="text-sm font-medium">Code Examples</h4>
                          {result.codeBlocks.map((block, index) => (
                            <div key={index} className="space-y-2">
                              {block.title && (
                                <div className="text-xs text-muted-foreground">
                                  {block.title}
                                </div>
                              )}
                              <pre className="text-sm whitespace-pre-wrap font-mono bg-muted p-4 rounded-lg overflow-x-auto">
                                <code className={`language-${block.language}`}>
                                  {block.content}
                                </code>
                              </pre>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
