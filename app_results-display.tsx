'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Copy, Check } from 'lucide-react'

interface ResultsDisplayProps {
  results: string[]
}

export function ResultsDisplay({ results }: ResultsDisplayProps) {
  const [copied, setCopied] = useState(false)
  
  if (results.length === 0) {
    return null
  }

  const combinedText = results.join('\n\n')

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="border rounded-lg">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Results</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleCopy(combinedText)}
        >
          {copied ? (
            <Check className="h-4 w-4 mr-2" />
          ) : (
            <Copy className="h-4 w-4 mr-2" />
          )}
          Copy All
        </Button>
      </div>
      
      <Tabs defaultValue="combined" className="p-4">
        <TabsList>
          <TabsTrigger value="combined">Combined</TabsTrigger>
          <TabsTrigger value="individual">Individual Pages</TabsTrigger>
        </TabsList>
        
        <TabsContent value="combined">
          <ScrollArea className="h-[400px] w-full rounded border p-4">
            <pre className="whitespace-pre-wrap">{combinedText}</pre>
          </ScrollArea>
        </TabsContent>
        
        <TabsContent value="individual">
          <ScrollArea className="h-[400px] w-full">
            {results.map((result, index) => (
              <div key={index} className="border-b p-4 last:border-0">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Page {index + 1}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(result)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <pre className="whitespace-pre-wrap text-sm">{result}</pre>
              </div>
            ))}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}

