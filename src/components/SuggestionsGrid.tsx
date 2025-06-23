'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { SuggestionCard, SuggestionCardSkeleton, SuggestionItem, suggestionData } from './SuggestionCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Code, 
  Layers, 
  Package, 
  Cloud, 
  Wrench,
  ChevronDown,
  ChevronUp,
  Filter,
  Sparkles
} from 'lucide-react'

interface SuggestionsGridProps {
  onSelect?: (url: string) => void
  onStartCrawl: (url: string, title?: string) => void | Promise<void>
  loadingItems?: string[]
  isLoading?: boolean
}

const categoryIcons = {
  API: Code,
  Framework: Layers,
  Library: Package,
  Platform: Cloud,
  Tool: Wrench
} as const

const categoryDescriptions = {
  API: 'RESTful APIs and web services',
  Framework: 'Full-featured development frameworks',
  Library: 'Focused libraries and utilities',
  Platform: 'Cloud platforms and services',
  Tool: 'Development tools and utilities'
} as const

type CategoryFilter = 'all' | 'API' | 'Framework' | 'Library' | 'Platform' | 'Tool'

export function SuggestionsGrid({ onSelect: _onSelect, onStartCrawl, loadingItems = [], isLoading: _isLoading = false }: SuggestionsGridProps) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all')
  const [isExpanded, setIsExpanded] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [isLoadingData, setIsLoadingData] = useState(false)

  // Get unique categories from data
  const categories = Array.from(new Set(suggestionData.map(item => item.category)))
  
  // Filter suggestions based on selected category
  const filteredSuggestions = selectedCategory === 'all' 
    ? suggestionData 
    : suggestionData.filter(item => item.category === selectedCategory)

  // Group by category for organized display (unused but kept for potential future use)
  // const groupedSuggestions = categories.reduce((acc, category) => {
  //   acc[category] = filteredSuggestions.filter(item => item.category === category)
  //   return acc
  // }, {} as Record<string, SuggestionItem[]>)

  // Limit display count if not expanded
  const displayLimit = isExpanded ? filteredSuggestions.length : 6
  const displaySuggestions = filteredSuggestions.slice(0, displayLimit)
  const hasMore = filteredSuggestions.length > displayLimit

  const handleCategorySelect = (category: CategoryFilter) => {
    setSelectedCategory(category)
    setIsExpanded(false) // Reset expansion when changing category
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="pt-8"
    >
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-amber-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            Popular Documentation Sites
          </h2>
        </div>
        <p className="text-sm text-gray-600 max-w-md mx-auto">
          Start with these hand-picked documentation sites to see Docspasta in action
        </p>
        
        {/* Demo Loading Button - Remove in production */}
        {process.env.NODE_ENV === 'development' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsLoadingData(true)
              setTimeout(() => setIsLoadingData(false), 2000)
            }}
            className="mt-4 text-xs text-gray-500"
          >
            {isLoadingData ? 'Loading...' : 'Demo Loading State'}
          </Button>
        )}
      </div>

      {/* Category Filters */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="text-gray-600 hover:text-gray-900"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filter by Category
            {showFilters ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
          </Button>
          
          {selectedCategory !== 'all' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCategorySelect('all')}
              className="text-gray-500 hover:text-gray-700"
            >
              Clear filter
            </Button>
          )}
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-2 p-4 bg-gray-50 rounded-lg border">
                <Button
                  variant={selectedCategory === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleCategorySelect('all')}
                  className={`
                    ${selectedCategory === 'all' 
                      ? 'bg-amber-600 hover:bg-amber-700 text-white' 
                      : 'bg-white hover:bg-gray-50'
                    }
                  `}
                >
                  All ({suggestionData.length})
                </Button>
                
                {categories.map((category) => {
                  const Icon = categoryIcons[category as keyof typeof categoryIcons]
                  const count = suggestionData.filter(item => item.category === category).length
                  
                  return (
                    <Button
                      key={category}
                      variant={selectedCategory === category ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleCategorySelect(category as CategoryFilter)}
                      className={`
                        ${selectedCategory === category 
                          ? 'bg-amber-600 hover:bg-amber-700 text-white' 
                          : 'bg-white hover:bg-gray-50'
                        }
                      `}
                    >
                      <Icon className="h-3 w-3 mr-1" />
                      {category} ({count})
                    </Button>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Results Summary */}
      {selectedCategory !== 'all' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg"
        >
          <div className="flex items-center gap-3">
            {React.createElement(categoryIcons[selectedCategory as keyof typeof categoryIcons], {
              className: 'h-5 w-5 text-amber-600'
            })}
            <div>
              <h3 className="font-medium text-amber-900">{selectedCategory} Documentation</h3>
              <p className="text-sm text-amber-700">
                {categoryDescriptions[selectedCategory as keyof typeof categoryDescriptions]} 
                • {filteredSuggestions.length} {filteredSuggestions.length === 1 ? 'site' : 'sites'}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Grid */}
      <motion.div 
        layout
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6"
      >
        <AnimatePresence mode="popLayout">
          {isLoadingData ? (
            // Show skeleton loaders
            Array.from({ length: displayLimit }).map((_, index) => (
              <motion.div
                key={`skeleton-${index}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ 
                  duration: 0.2,
                  delay: index * 0.05
                }}
              >
                <SuggestionCardSkeleton />
              </motion.div>
            ))
          ) : (
            // Show actual cards
            displaySuggestions.map((suggestion, index) => (
              <motion.div
                key={suggestion.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ 
                  duration: 0.2,
                  delay: index * 0.05
                }}
              >
                <SuggestionCard
                  suggestion={suggestion}
                  onStartCrawl={onStartCrawl}
                  isLoading={loadingItems.includes(suggestion.id)}
                />
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </motion.div>

      {/* Show More/Less Button */}
      {hasMore && (
        <div className="text-center">
          <Button
            variant="outline"
            onClick={() => setIsExpanded(!isExpanded)}
            className="bg-white hover:bg-gray-50 border-gray-300"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-2" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-2" />
                Show {filteredSuggestions.length - displayLimit} More
              </>
            )}
          </Button>
        </div>
      )}

      {/* Empty State */}
      {filteredSuggestions.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <div className="text-gray-400 mb-4">
            <Filter className="h-12 w-12 mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No sites found
          </h3>
          <p className="text-gray-600 mb-4">
            Try selecting a different category or clearing the filter
          </p>
          <Button
            variant="outline"
            onClick={() => handleCategorySelect('all')}
          >
            Show All Sites
          </Button>
        </motion.div>
      )}

      {/* Featured Badge Info */}
      <div className="mt-8 text-center">
        <p className="text-xs text-gray-500">
          <Badge className="bg-amber-500 text-white text-xs mr-2">Popular</Badge>
          Featured sites are highly recommended for testing Docspasta
        </p>
      </div>
    </motion.div>
  )
}