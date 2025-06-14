import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ServerlessProgressV2 from '@/components/ServerlessProgressV2'

// Mock the useIsClient hook
vi.mock('@/hooks/useIsClient', () => ({
  useIsClient: () => true
}))

// Mock CrawlCard to avoid SSE connection issues
vi.mock('@/components/CrawlCard', () => ({
  default: ({ jobId, url }: { jobId: string; url: string }) => (
    <div data-testid="crawl-card">
      <div>{url}</div>
      <div>{jobId}</div>
    </div>
  )
}))

// Mock fetch
global.fetch = vi.fn()

describe('Job Persistence', () => {
  beforeEach(() => {
    // Clear localStorage
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('should persist jobs to localStorage when created', async () => {
    const mockFetch = global.fetch as any
    
    // Mock empty active jobs response for initial load
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: []
      })
    })
    
    const user = userEvent.setup()
    render(<ServerlessProgressV2 />)

    // Wait for initial load
    await waitFor(() => {
      expect(screen.queryByText('Loading jobs...')).not.toBeInTheDocument()
    })

    // Mock successful job creation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          jobId: 'test-job-1',
          url: 'https://example.com',
          streamUrl: '/api/v4/jobs/test-job-1/stream'
        }
      })
    })

    // Enter URL and submit
    const input = screen.getByPlaceholderText('Enter documentation URL')
    await user.type(input, 'https://example.com')
    
    const submitButton = screen.getByRole('button', { name: /Crawl Docs/i })
    await user.click(submitButton)

    // Check localStorage
    await waitFor(() => {
      const stored = localStorage.getItem('docspasta-active-jobs')
      expect(stored).toBeTruthy()
      
      const jobs = JSON.parse(stored!)
      expect(jobs).toHaveLength(1)
      expect(jobs[0]).toMatchObject({
        jobId: 'test-job-1',
        url: 'https://example.com'
      })
    })
  })

  it('should load jobs from localStorage on mount', async () => {
    const mockFetch = global.fetch as any
    
    // Set up localStorage with existing jobs
    const existingJobs = [
      {
        jobId: 'existing-job-1',
        url: 'https://example1.com',
        timestamp: Date.now() - 1000
      },
      {
        jobId: 'existing-job-2',
        url: 'https://example2.com',
        timestamp: Date.now() - 2000
      }
    ]
    localStorage.setItem('docspasta-active-jobs', JSON.stringify(existingJobs))

    // Mock active jobs API response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: []
      })
    })

    render(<ServerlessProgressV2 />)

    // Should display jobs from localStorage
    await waitFor(() => {
      expect(screen.getByText('https://example1.com')).toBeInTheDocument()
      expect(screen.getByText('https://example2.com')).toBeInTheDocument()
    })
  })

  it('should merge database jobs with localStorage jobs', async () => {
    const mockFetch = global.fetch as any
    
    // Set up localStorage with existing job
    const localJob = {
      jobId: 'local-job-1',
      url: 'https://local.com',
      timestamp: Date.now() - 1000
    }
    localStorage.setItem('docspasta-active-jobs', JSON.stringify([localJob]))

    // Mock active jobs API response with database job
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            id: 'db-job-1',
            url: 'https://database.com',
            status: 'running',
            created_at: new Date().toISOString()
          }
        ]
      })
    })

    render(<ServerlessProgressV2 />)

    // Should display both jobs
    await waitFor(() => {
      expect(screen.getByText('https://local.com')).toBeInTheDocument()
      expect(screen.getByText('https://database.com')).toBeInTheDocument()
    })
  })

  it('should filter out jobs older than 24 hours', async () => {
    const mockFetch = global.fetch as any
    
    // Set up localStorage with old and new jobs
    const jobs = [
      {
        jobId: 'old-job',
        url: 'https://old.com',
        timestamp: Date.now() - (25 * 60 * 60 * 1000) // 25 hours ago
      },
      {
        jobId: 'new-job',
        url: 'https://new.com',
        timestamp: Date.now() - (1 * 60 * 60 * 1000) // 1 hour ago
      }
    ]
    localStorage.setItem('docspasta-active-jobs', JSON.stringify(jobs))

    // Mock empty active jobs response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: []
      })
    })

    render(<ServerlessProgressV2 />)

    // Should only display recent job
    await waitFor(() => {
      expect(screen.queryByText('https://old.com')).not.toBeInTheDocument()
      expect(screen.getByText('https://new.com')).toBeInTheDocument()
    })
  })
})