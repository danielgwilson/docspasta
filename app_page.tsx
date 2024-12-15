'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Settings, ArrowRight, Link2 } from 'lucide-react'
import { SettingsDialog } from './settings-dialog'
import { ResultsDisplay } from './results-display'
import { crawlDocs } from './actions'

export default function DocsCrawler() {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState<string[]>([])
  const [settings, setSettings] = useState({
    maxDepth: 3,
    includeCodeBlocks: true,
    excludeNavigation: true,
    followExternalLinks: false
  })

  const handleCrawl = async () => {
    if (!url) return
    
    setIsLoading(true)
    try {
      const crawledResults = await crawlDocs(url, settings)
      setResults(crawledResults)
    } catch (error) {
      console.error('Crawling failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto space-y-12">
        <h1 className="text-5xl font-bold tracking-tight text-center">
          What docs should I crawl for you?
        </h1>

        <div className="relative">
          <div className="relative flex items-center max-w-3xl mx-auto">
            <div className="relative flex-1">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <Link2 className="w-5 h-5 text-muted-foreground" />
              </div>
              <Input
                placeholder="Enter documentation URL (e.g. https://docs.example.com)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="pl-12 pr-[140px] h-14 text-lg rounded-2xl border-2 hover:border-primary/50 transition-colors"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <SettingsDialog settings={settings} onSettingsChange={setSettings} />
                <Button 
                  onClick={handleCrawl}
                  disabled={!url || isLoading}
                  size="sm"
                  className="rounded-xl"
                >
                  {isLoading ? 'Crawling...' : (
                    <>
                      Crawl
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-center">
          <Button variant="outline" className="rounded-full text-sm">
            Crawl React documentation →
          </Button>
          <Button variant="outline" className="rounded-full text-sm">
            Extract Next.js API docs →
          </Button>
          <Button variant="outline" className="rounded-full text-sm">
            Get Tailwind CSS examples →
          </Button>
        </div>

        <ResultsDisplay results={results} />
      </div>
    </div>
  )
}

