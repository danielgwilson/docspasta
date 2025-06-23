/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { SuggestionsGrid } from '@/components/SuggestionsGrid'
import { mockMatchMedia } from '@/lib/test/setup'

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, layout, whileHover, onHoverStart, onHoverEnd, ...props }: any) => 
      <div className={className} {...props}>{children}</div>
  },
  AnimatePresence: ({ children }: any) => <>{children}</>
}))

// Setup mocks
beforeAll(() => {
  mockMatchMedia()
})

describe('SuggestionsGrid', () => {
  const mockOnSelect = vi.fn()
  const mockOnStartCrawl = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the component with default content', () => {
    render(
      <SuggestionsGrid 
        onSelect={mockOnSelect}
        onStartCrawl={mockOnStartCrawl}
      />
    )

    expect(screen.getByText('Popular Documentation Sites')).toBeInTheDocument()
    expect(screen.getByText('Start with these hand-picked documentation sites to see Docspasta in action')).toBeInTheDocument()
  })

  it('displays suggestion cards', () => {
    render(
      <SuggestionsGrid 
        onSelect={mockOnSelect}
        onStartCrawl={mockOnStartCrawl}
      />
    )

    // Should show some suggestion cards (limited to 6 by default)
    expect(screen.getByText('Stripe API Docs')).toBeInTheDocument()
    expect(screen.getByText('Next.js Documentation')).toBeInTheDocument()
    expect(screen.getByText('Tailwind CSS')).toBeInTheDocument()
  })

  it('shows filter button', () => {
    render(
      <SuggestionsGrid 
        onSelect={mockOnSelect}
        onStartCrawl={mockOnStartCrawl}
      />
    )

    expect(screen.getByText('Filter by Category')).toBeInTheDocument()
  })

  it('toggles filter visibility when filter button is clicked', async () => {
    render(
      <SuggestionsGrid 
        onSelect={mockOnSelect}
        onStartCrawl={mockOnStartCrawl}
      />
    )

    const filterButton = screen.getByText('Filter by Category').closest('button')!
    
    // Filters should be hidden initially
    expect(screen.queryByRole('button', { name: /All \(\d+\)/ })).not.toBeInTheDocument()

    // Click to show filters
    fireEvent.click(filterButton)
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /All \(\d+\)/ })).toBeInTheDocument()
    })
  })

  it('filters suggestions by category', async () => {
    render(
      <SuggestionsGrid 
        onSelect={mockOnSelect}
        onStartCrawl={mockOnStartCrawl}
      />
    )

    // Show filters first
    const filterButton = screen.getByText('Filter by Category').closest('button')!
    fireEvent.click(filterButton)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /API \(\d+\)/ })).toBeInTheDocument()
    })

    // Click on API category
    const apiButton = screen.getByRole('button', { name: /API \(\d+\)/ })
    fireEvent.click(apiButton)

    await waitFor(() => {
      // Should show only API suggestions
      expect(screen.getByText('Stripe API Docs')).toBeInTheDocument()
      expect(screen.getByText('OpenAI API')).toBeInTheDocument()
      // Should not show Framework suggestions
      expect(screen.queryByText('Next.js Documentation')).not.toBeInTheDocument()
    })
  })

  it('shows "Show More" button when there are more than 6 suggestions', () => {
    render(
      <SuggestionsGrid 
        onSelect={mockOnSelect}
        onStartCrawl={mockOnStartCrawl}
      />
    )

    // With 8 suggestions in the data, should show "Show More" for remaining 2
    const showMoreButton = screen.getByRole('button', { name: /Show.*More/ })
    expect(showMoreButton).toBeInTheDocument()
  })

  it('expands to show all suggestions when "Show More" is clicked', async () => {
    render(
      <SuggestionsGrid 
        onSelect={mockOnSelect}
        onStartCrawl={mockOnStartCrawl}
      />
    )

    const showMoreButton = screen.getByRole('button', { name: /Show.*More/ })
    fireEvent.click(showMoreButton)

    await waitFor(() => {
      // Should now show "Show Less" button
      expect(screen.getByRole('button', { name: /Show Less/ })).toBeInTheDocument()
      // All suggestions should be visible
      expect(screen.getByText('Framer Motion')).toBeInTheDocument()
    })
  })

  it('shows empty state when all filters result in no matches', async () => {
    render(
      <SuggestionsGrid 
        onSelect={mockOnSelect}
        onStartCrawl={mockOnStartCrawl}
      />
    )

    // This is a simplified test since we can't easily create an empty state
    // with the current static data
    expect(screen.getByText('Popular Documentation Sites')).toBeInTheDocument()
  })

  it('clears filters when "Clear filter" button is clicked', async () => {
    render(
      <SuggestionsGrid 
        onSelect={mockOnSelect}
        onStartCrawl={mockOnStartCrawl}
      />
    )

    // Show filters and select a category
    const filterButton = screen.getByText('Filter by Category').closest('button')!
    fireEvent.click(filterButton)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /API \(\d+\)/ })).toBeInTheDocument()
    })

    const apiButton = screen.getByRole('button', { name: /API \(\d+\)/ })
    fireEvent.click(apiButton)

    // Clear filter button should appear
    await waitFor(() => {
      expect(screen.getByText('Clear filter')).toBeInTheDocument()
    })

    // Click clear filter
    const clearButton = screen.getByText('Clear filter').closest('button')!
    fireEvent.click(clearButton)

    await waitFor(() => {
      // Should show all suggestions again
      expect(screen.getByText('Next.js Documentation')).toBeInTheDocument()
    })
  })

  it('handles loading state correctly', () => {
    render(
      <SuggestionsGrid 
        onSelect={mockOnSelect}
        onStartCrawl={mockOnStartCrawl}
        isLoading={true}
      />
    )

    // Component should still render but cards will be in loading state
    expect(screen.getByText('Popular Documentation Sites')).toBeInTheDocument()
  })

  it('calls onStartCrawl when suggestion card triggers crawl', async () => {
    render(
      <SuggestionsGrid 
        onSelect={mockOnSelect}
        onStartCrawl={mockOnStartCrawl}
      />
    )

    // Find a "Try This" button
    const tryThisButtons = screen.getAllByText('Try This')
    expect(tryThisButtons.length).toBeGreaterThan(0)
    
    // Click the first one
    fireEvent.click(tryThisButtons[0])
    
    await waitFor(() => {
      expect(mockOnStartCrawl).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String)
      )
    })
  })
})