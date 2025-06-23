'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Clock, FileText, Star, ExternalLink, Zap, CheckCircle2 } from 'lucide-react'

export interface SuggestionItem {
  id: string
  title: string
  url: string
  description: string
  icon: string
  category: 'API' | 'Framework' | 'Library' | 'Platform' | 'Tool'
  tags: string[]
  estimatedPages: number
  estimatedTime: string
  popularity: 'high' | 'medium' | 'low'
  featured?: boolean
}

interface SuggestionCardProps {
  suggestion: SuggestionItem
  onStartCrawl: (url: string, title: string) => void
  isLoading?: boolean
}

// Skeleton loader component
export function SuggestionCardSkeleton() {
  return (
    <div className="w-full">
      <Card className="h-full overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200">
        <CardContent className="p-6">
          {/* Header skeleton */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-200 rounded animate-pulse" />
              <div className="flex-1">
                <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-5 w-16 bg-gray-200 rounded animate-pulse" />
                  <div className="h-3 w-3 bg-gray-200 rounded-full animate-pulse" />
                </div>
              </div>
            </div>
          </div>

          {/* Description skeleton */}
          <div className="space-y-2 mb-4">
            <div className="h-3 w-full bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-3/4 bg-gray-200 rounded animate-pulse" />
          </div>

          {/* Tags skeleton */}
          <div className="flex gap-1 mb-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-5 w-12 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>

          {/* Stats skeleton */}
          <div className="flex items-center gap-4 mb-4">
            <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
          </div>

          {/* Button skeleton */}
          <div className="h-8 w-full bg-gray-200 rounded animate-pulse" />
        </CardContent>
      </Card>
    </div>
  )
}

const categoryColors = {
  API: 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 text-blue-700',
  Framework: 'bg-gradient-to-br from-green-50 to-green-100 border-green-200 text-green-700',
  Library: 'bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200 text-purple-700',
  Platform: 'bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200 text-orange-700',
  Tool: 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200 text-gray-700'
}

const popularityIcons = {
  high: { icon: Star, color: 'text-yellow-500' },
  medium: { icon: Zap, color: 'text-orange-500' },
  low: { icon: FileText, color: 'text-gray-500' }
}

export function SuggestionCard({ suggestion, onStartCrawl, isLoading = false }: SuggestionCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const PopularityIcon = popularityIcons[suggestion.popularity].icon

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)
    
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }
    
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const handleStartCrawl = () => {
    if (!isLoading && !showSuccess) {
      // Show success animation
      setShowSuccess(true)
      
      // Call the parent handler after a brief delay for the animation
      setTimeout(() => {
        onStartCrawl(suggestion.url, suggestion.title)
        // Reset success state after some time
        setTimeout(() => setShowSuccess(false), 2000)
      }, 400)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={prefersReducedMotion ? {} : { y: -4, scale: 1.02 }}
      whileTap={prefersReducedMotion ? {} : { scale: 0.98 }}
      transition={{ 
        duration: prefersReducedMotion ? 0 : 0.2,
        ease: "easeOut"
      }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="w-full relative"
    >
      {/* Success overlay animation */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-lg"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 15 }}
              className="flex flex-col items-center gap-2"
            >
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <span className="text-sm font-medium text-gray-700">Starting crawl!</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Card className={`
        h-full overflow-hidden cursor-pointer transition-all duration-300
        ${suggestion.featured ? 'ring-2 ring-amber-200 shadow-lg' : 'shadow-sm hover:shadow-lg'}
        ${categoryColors[suggestion.category]}
        ${isLoading ? 'opacity-75 cursor-not-allowed' : 'hover:border-amber-300'}
      `}>
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="text-2xl">{suggestion.icon}</div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                  {suggestion.title}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge 
                    variant="secondary" 
                    className="text-xs px-2 py-0.5 bg-white/50 text-gray-600"
                  >
                    {suggestion.category}
                  </Badge>
                  <PopularityIcon 
                    className={`h-3 w-3 ${popularityIcons[suggestion.popularity].color}`} 
                  />
                </div>
              </div>
            </div>
            
            {suggestion.featured && (
              <motion.div
                animate={prefersReducedMotion ? {} : {
                  scale: [1, 1.05, 1],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                <Badge className="bg-amber-500 text-white text-xs relative overflow-hidden">
                  <span className="relative z-10">Popular</span>
                  {!prefersReducedMotion && (
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-amber-400 to-amber-600"
                      animate={{
                        x: ['-100%', '100%'],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "linear"
                      }}
                    />
                  )}
                </Badge>
              </motion.div>
            )}
          </div>

          {/* Description */}
          <p className="text-sm text-gray-600 mb-4 line-clamp-2 leading-relaxed">
            {suggestion.description}
          </p>

          {/* Tags */}
          <div className="flex flex-wrap gap-1 mb-4">
            {suggestion.tags.slice(0, 3).map((tag, index) => (
              <motion.div
                key={tag}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ 
                  delay: prefersReducedMotion ? 0 : index * 0.05,
                  duration: 0.2
                }}
                whileHover={prefersReducedMotion ? {} : { scale: 1.05 }}
              >
                <Badge 
                  variant="outline" 
                  className="text-xs px-2 py-0.5 bg-white/30 border-gray-300 transition-colors hover:bg-white/50"
                >
                  {tag}
                </Badge>
              </motion.div>
            ))}
            {suggestion.tags.length > 3 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ 
                  delay: prefersReducedMotion ? 0 : 0.15,
                  duration: 0.2
                }}
              >
                <Badge 
                  variant="outline" 
                  className="text-xs px-2 py-0.5 bg-white/30 border-gray-300"
                >
                  +{suggestion.tags.length - 3}
                </Badge>
              </motion.div>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                ~{suggestion.estimatedPages} pages
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {suggestion.estimatedTime}
              </span>
            </div>
          </div>

          {/* Action Button */}
          <motion.div
            whileHover={prefersReducedMotion ? {} : { scale: 1.02 }}
            whileTap={prefersReducedMotion ? {} : { scale: 0.98 }}
          >
            <Button
              onClick={handleStartCrawl}
              disabled={isLoading || showSuccess}
              size="sm"
              className={`
                w-full transition-all duration-200 relative overflow-hidden
                ${isHovered && !isLoading && !showSuccess
                  ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-md' 
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }
                ${isLoading || showSuccess ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}
              `}
            >
              <AnimatePresence mode="wait">
                {isLoading ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center gap-2"
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full"
                    />
                    Starting Crawl...
                  </motion.div>
                ) : showSuccess ? (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-2"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Success!
                  </motion.div>
                ) : (
                  <motion.div
                    key="default"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center gap-2"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {isHovered ? 'Start Crawling' : 'Try This'}
                  </motion.div>
                )}
              </AnimatePresence>
            </Button>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// Sample data for different types of documentation sites
export const suggestionData: SuggestionItem[] = [
  {
    id: 'stripe',
    title: 'Stripe API Docs',
    url: 'https://docs.stripe.com',
    description: 'Complete payment processing API documentation with guides, references, and examples.',
    icon: '💳',
    category: 'API',
    tags: ['Payments', 'API', 'REST', 'Webhooks'],
    estimatedPages: 150,
    estimatedTime: '2-3 min',
    popularity: 'high',
    featured: true
  },
  {
    id: 'nextjs',
    title: 'Next.js Documentation',
    url: 'https://nextjs.org/docs',
    description: 'React framework for production with file-based routing, API routes, and more.',
    icon: '⚡',
    category: 'Framework',
    tags: ['React', 'SSR', 'Fullstack'],
    estimatedPages: 200,
    estimatedTime: '3-4 min',
    popularity: 'high',
    featured: true
  },
  {
    id: 'tailwind',
    title: 'Tailwind CSS',
    url: 'https://tailwindcss.com/docs',
    description: 'Utility-first CSS framework with comprehensive class reference and examples.',
    icon: '🎨',
    category: 'Framework',
    tags: ['CSS', 'Utility', 'Design'],
    estimatedPages: 180,
    estimatedTime: '2-3 min',
    popularity: 'high'
  },
  {
    id: 'react',
    title: 'React Documentation',
    url: 'https://react.dev',
    description: 'Learn React with the new official docs featuring hooks, concurrent features, and more.',
    icon: '⚛️',
    category: 'Library',
    tags: ['JavaScript', 'UI', 'Components'],
    estimatedPages: 120,
    estimatedTime: '2 min',
    popularity: 'high'
  },
  {
    id: 'vercel',
    title: 'Vercel Platform',
    url: 'https://vercel.com/docs',
    description: 'Frontend cloud platform for static sites and serverless functions.',
    icon: '🔺',
    category: 'Platform',
    tags: ['Deployment', 'Serverless', 'JAMstack'],
    estimatedPages: 100,
    estimatedTime: '1-2 min',
    popularity: 'medium'
  },
  {
    id: 'openai',
    title: 'OpenAI API',
    url: 'https://platform.openai.com/docs',
    description: 'Access powerful AI models through a simple API for text, code, and image generation.',
    icon: '🤖',
    category: 'API',
    tags: ['AI', 'GPT', 'Machine Learning'],
    estimatedPages: 80,
    estimatedTime: '1-2 min',
    popularity: 'high'
  },
  {
    id: 'supabase',
    title: 'Supabase Docs',
    url: 'https://supabase.com/docs',
    description: 'Open source Firebase alternative with Postgres database and real-time subscriptions.',
    icon: '🟢',
    category: 'Platform',
    tags: ['Database', 'Backend', 'Real-time'],
    estimatedPages: 150,
    estimatedTime: '2-3 min',
    popularity: 'medium'
  },
  {
    id: 'framer',
    title: 'Framer Motion',
    url: 'https://www.framer.com/motion',
    description: 'Production-ready motion library for React with simple declarative animations.',
    icon: '🎭',
    category: 'Library',
    tags: ['Animation', 'React', 'UI'],
    estimatedPages: 60,
    estimatedTime: '1 min',
    popularity: 'medium'
  }
]