import { NextResponse } from 'next/server'
import { z } from 'zod'

// Enhanced suggestion schema with analytics data
const SuggestionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  url: z.string().url(),
  category: z.enum(['api', 'framework', 'design', 'database', 'cloud', 'mobile', 'tools']),
  icon: z.string(), // Icon name for dynamic loading
  estimatedPages: z.number(),
  estimatedTime: z.string(),
  tags: z.array(z.string()),
  gradient: z.string(),
  contentType: z.string(),
  // Dynamic analytics fields
  crawlCount30d: z.number().optional(),
  popularity: z.enum(['high', 'medium', 'low']).optional(),
  trending: z.boolean().optional(),
  lastCrawled: z.string().optional(),
})

type Suggestion = z.infer<typeof SuggestionSchema>

// This could later be replaced with database queries
const baseSuggestions: Suggestion[] = [
  {
    id: 'stripe-docs',
    title: 'Stripe API',
    description: 'Complete payment processing API documentation with examples and integration guides',
    url: 'https://docs.stripe.com',
    category: 'api',
    icon: 'Database',
    estimatedPages: 120,
    estimatedTime: '2-3 min',
    tags: ['API', 'Payments', 'REST'],
    gradient: 'from-blue-500 to-purple-600',
    contentType: 'API Reference',
    crawlCount30d: 145,
    popularity: 'high',
    trending: true
  },
  {
    id: 'tailwind-css',
    title: 'Tailwind CSS',
    description: 'Utility-first CSS framework documentation with comprehensive component examples',
    url: 'https://tailwindcss.com/docs',
    category: 'design',
    icon: 'Palette',
    estimatedPages: 85,
    estimatedTime: '1-2 min',
    tags: ['CSS', 'Design System', 'UI'],
    gradient: 'from-cyan-500 to-blue-500',
    contentType: 'Documentation',
    crawlCount30d: 128,
    popularity: 'high',
    trending: false
  },
  {
    id: 'react-dev',
    title: 'React',
    description: 'Modern React documentation with hooks, components, and best practices',
    url: 'https://react.dev',
    category: 'framework',
    icon: 'Code',
    estimatedPages: 95,
    estimatedTime: '2 min',
    tags: ['JavaScript', 'Framework', 'Components'],
    gradient: 'from-blue-400 to-cyan-400',
    contentType: 'Tutorial & Reference',
    crawlCount30d: 203,
    popularity: 'high',
    trending: true
  },
  // ... other suggestions with analytics data
]

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const limit = parseInt(searchParams.get('limit') || '8')
    const trending = searchParams.get('trending') === 'true'

    let suggestions = [...baseSuggestions]

    // Apply filters
    if (category) {
      suggestions = suggestions.filter(s => s.category === category)
    }

    if (trending) {
      suggestions = suggestions.filter(s => s.trending === true)
    }

    // Sort by popularity and crawl count
    suggestions.sort((a, b) => {
      const aScore = (a.crawlCount30d || 0) + (a.popularity === 'high' ? 100 : a.popularity === 'medium' ? 50 : 0)
      const bScore = (b.crawlCount30d || 0) + (b.popularity === 'high' ? 100 : b.popularity === 'medium' ? 50 : 0)
      return bScore - aScore
    })

    // Apply limit
    suggestions = suggestions.slice(0, limit)

    return NextResponse.json({
      success: true,
      suggestions,
      metadata: {
        total: baseSuggestions.length,
        filtered: suggestions.length,
        lastUpdated: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('Failed to fetch suggestions:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch suggestions' },
      { status: 500 }
    )
  }
}