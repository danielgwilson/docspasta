'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles } from 'lucide-react'
import ServerlessProgressV2 from '@/components/ServerlessProgressV2'

export default function Home() {
  // Initialize dev processor in development
  useEffect(() => {
    // Only run on client side
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      fetch('/api/init').catch(console.error)
    }
  }, [])
  
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
        <div className="max-w-4xl mx-auto text-center space-y-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-200">
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-700">
              Turn any docs into LLM-ready markdown
            </span>
          </div>

          {/* Main Heading */}
          <div className="space-y-4">
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
          </div>

          {/* Serverless Progress Component */}
          <ServerlessProgressV2 />
        </div>
      </main>
    </div>
  );
}