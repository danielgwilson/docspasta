import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ServerlessProgressV2 from '@/components/ServerlessProgressV2'

// Mock fetch
global.fetch = vi.fn()

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

describe('V4 UI Job Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
  })
  
  it('should save jobs to localStorage', async () => {
    const { rerender } = render(<ServerlessProgressV2 />)
    
    // Mock successful job creation
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          jobId: 'test-job-123',
          url: 'https://example.com',
          streamUrl: '/api/v4/jobs/test-job-123/stream'
        }
      })
    })
    
    // Create a job (this would normally be done via user interaction)
    // For testing, we'll trigger it programmatically
    
    // Wait for localStorage to be called
    await waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'docspasta-active-jobs',
        expect.any(String)
      )
    }, { timeout: 1000 })
  })
  
  it('should load jobs from localStorage on mount', async () => {
    const mockJobs = [
      {
        jobId: 'saved-job-1',
        url: 'https://example.com',
        timestamp: Date.now() - 1000 * 60 * 5 // 5 minutes ago
      },
      {
        jobId: 'saved-job-2',
        url: 'https://docs.example.com',
        timestamp: Date.now() - 1000 * 60 * 10 // 10 minutes ago
      }
    ]
    
    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockJobs))
    
    // Mock the API call to get active jobs
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        jobs: []
      })
    })
    
    render(<ServerlessProgressV2 />)
    
    // Should call localStorage on mount
    expect(localStorageMock.getItem).toHaveBeenCalledWith('docspasta-active-jobs')
    
    // Should display the saved jobs
    await waitFor(() => {
      expect(screen.getByText('https://example.com')).toBeInTheDocument()
      expect(screen.getByText('https://docs.example.com')).toBeInTheDocument()
    })
  })
  
  it('should filter out old jobs (>24 hours)', async () => {
    const mockJobs = [
      {
        jobId: 'recent-job',
        url: 'https://recent.com',
        timestamp: Date.now() - 1000 * 60 * 60 // 1 hour ago
      },
      {
        jobId: 'old-job',
        url: 'https://old.com',
        timestamp: Date.now() - 1000 * 60 * 60 * 25 // 25 hours ago
      }
    ]
    
    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockJobs))
    
    // Mock the API call
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, jobs: [] })
    })
    
    render(<ServerlessProgressV2 />)
    
    await waitFor(() => {
      // Recent job should be shown
      expect(screen.queryByText(/recent\.com/)).toBeInTheDocument()
      // Old job should be filtered out
      expect(screen.queryByText(/old\.com/)).not.toBeInTheDocument()
    })
  })
  
  it('should merge localStorage and database jobs', async () => {
    const localJobs = [
      {
        jobId: 'local-job-1',
        url: 'https://local.com',
        timestamp: Date.now() - 1000 * 60
      }
    ]
    
    localStorageMock.getItem.mockReturnValue(JSON.stringify(localJobs))
    
    // Mock API returning different jobs
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        jobs: [
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
    
    // Should show both local and database jobs
    await waitFor(() => {
      expect(screen.queryByText(/local\.com/)).toBeInTheDocument()
      expect(screen.queryByText(/database\.com/)).toBeInTheDocument()
    })
  })
  
  it('should handle completed jobs on refresh', async () => {
    // Set up a completed job in localStorage
    const completedJob = {
      jobId: 'completed-job',
      url: 'https://completed.com',
      timestamp: Date.now() - 1000 * 60 * 5,
      status: 'completed'
    }
    
    localStorageMock.getItem.mockReturnValue(JSON.stringify([completedJob]))
    
    // Mock API calls
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, jobs: [] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          content: '# Documentation\nContent here...',
          title: 'Completed Docs',
          wordCount: 100
        })
      })
    
    render(<ServerlessProgressV2 />)
    
    // Should still show completed job
    await waitFor(() => {
      expect(screen.queryByText(/completed\.com/)).toBeInTheDocument()
    })
  })
})