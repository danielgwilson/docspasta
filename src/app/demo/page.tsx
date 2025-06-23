'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SuggestionsGrid } from '@/components/SuggestionsGrid'
import { SuggestionGridEnhanced } from '@/components/SuggestionCardEnhanced'
import { ArrowLeft, Sparkles, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export default function DemoPage() {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSelect = (selectedUrl: string) => {
    setUrl(selectedUrl)
  }

  const handleStartCrawl = async (crawlUrl: string) => {
    setIsLoading(true)
    console.log('Starting crawl for:', crawlUrl)
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000))
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-100 dark:from-amber-950 dark:via-orange-950 dark:to-yellow-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-200">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-700">
                SuggestionCard Component Demo
              </span>
            </div>
            
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-gray-900 via-amber-800 to-orange-800 bg-clip-text text-transparent dark:from-gray-100 dark:via-amber-200 dark:to-orange-200">
                Component Comparison
              </span>
            </h1>
            
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Compare the current SuggestionCard implementation with enhanced features including API integration, analytics, and improved accessibility.
            </p>
          </div>
        </div>

        {/* Selected URL Display */}
        {url && (
          <Card className="mb-8 border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-600" />
                Selected URL
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-sm bg-white p-3 rounded border">
                {url}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Component Comparison */}
        <Tabs defaultValue="current" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 lg:w-[400px] mx-auto">
            <TabsTrigger value="current">Current Implementation</TabsTrigger>
            <TabsTrigger value="enhanced">Enhanced Version</TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="space-y-4">
            <Card className="border-blue-200 bg-blue-50/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">Current SuggestionGrid</CardTitle>
                  <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                    Production Ready
                  </Badge>
                </div>
                <div className="text-sm text-gray-600 space-y-2">
                  <p><strong>Features:</strong> Static data, rich visual design, hover animations, responsive layout</p>
                  <p><strong>Implementation:</strong> Hardcoded suggestions array, Framer Motion animations, shadcn/ui components</p>
                  <p><strong>Strengths:</strong> Fast loading, no API dependencies, consistent experience</p>
                </div>
              </CardHeader>
              <CardContent>
                <SuggestionsGrid
                  onSelect={handleSelect}
                  onStartCrawl={handleStartCrawl}
                  isLoading={isLoading}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="enhanced" className="space-y-4">
            <Card className="border-green-200 bg-green-50/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">Enhanced SuggestionGrid</CardTitle>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      API Driven
                    </Badge>
                    <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">
                      Analytics
                    </Badge>
                  </div>
                </div>
                <div className="text-sm text-gray-600 space-y-2">
                  <p><strong>Features:</strong> API integration, analytics data, skeleton loading, trending indicators, accessibility improvements</p>
                  <p><strong>Implementation:</strong> Dynamic data fetching, crawl count analytics, reduced motion support, enhanced error handling</p>
                  <p><strong>Strengths:</strong> Scalable, data-driven, personalization ready, better UX</p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Regular suggestions */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-600" />
                      Popular Documentation
                    </h3>
                    <SuggestionGridEnhanced
                      onSelect={handleSelect}
                      onStartCrawl={handleStartCrawl}
                      isLoading={isLoading}
                      limit={4}
                    />
                  </div>

                  {/* Trending suggestions */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-green-600" />
                      Trending This Week
                    </h3>
                    <SuggestionGridEnhanced
                      onSelect={handleSelect}
                      onStartCrawl={handleStartCrawl}
                      isLoading={isLoading}
                      trending={true}
                      limit={4}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Feature Comparison Table */}
        <Card className="mt-8 border-gray-200">
          <CardHeader>
            <CardTitle className="text-xl">Feature Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-semibold">Feature</th>
                    <th className="text-center py-2 font-semibold">Current</th>
                    <th className="text-center py-2 font-semibold">Enhanced</th>
                  </tr>
                </thead>
                <tbody className="space-y-2">
                  <tr className="border-b">
                    <td className="py-2">Visual Design</td>
                    <td className="text-center py-2">✅ Excellent</td>
                    <td className="text-center py-2">✅ Excellent</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">Animations</td>
                    <td className="text-center py-2">✅ Framer Motion</td>
                    <td className="text-center py-2">✅ Framer Motion + Reduced Motion</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">Data Source</td>
                    <td className="text-center py-2">📊 Static Array</td>
                    <td className="text-center py-2">🚀 API Driven</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">Loading States</td>
                    <td className="text-center py-2">⚠️ Basic</td>
                    <td className="text-center py-2">✅ Skeleton Loaders</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">Analytics Data</td>
                    <td className="text-center py-2">❌ None</td>
                    <td className="text-center py-2">✅ Crawl Counts, Trending</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">Accessibility</td>
                    <td className="text-center py-2">⚠️ Basic</td>
                    <td className="text-center py-2">✅ Enhanced a11y</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">Error Handling</td>
                    <td className="text-center py-2">❌ None needed</td>
                    <td className="text-center py-2">✅ Comprehensive</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">Personalization</td>
                    <td className="text-center py-2">❌ Not possible</td>
                    <td className="text-center py-2">🚀 API Ready</td>
                  </tr>
                  <tr>
                    <td className="py-2">Performance</td>
                    <td className="text-center py-2">✅ Instant</td>
                    <td className="text-center py-2">✅ Fast + Skeleton</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}