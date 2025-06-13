import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ServerlessProgress from '@/components/ServerlessProgress'
import * as useServerlessCrawlModule from '@/hooks/useServerlessCrawl'

// Mock the hook
vi.mock('@/hooks/useServerlessCrawl')

describe('ServerlessProgress Component - V4 Events', () => {
  const mockStartCrawl = vi.fn()
  const mockStopCrawl = vi.fn()
  const mockClearJob = vi.fn()
  
  beforeEach(() => {
    vi.clearAllMocks()
  })
  
  it('should display V4 batch_completed events correctly', () => {
    const mockUseServerlessCrawl = vi.spyOn(useServerlessCrawlModule, 'useServerlessCrawl')
    mockUseServerlessCrawl.mockReturnValue({
      jobId: 'test-job-id',
      url: 'https://example.com/docs',
      isLoading: true,
      error: null,
      events: [
        { type: 'stream_connected', jobId: 'test-job-id' },
        { type: 'batch_completed', completed: 3, failed: 1, discovered: 10, fromCache: 2 },
        { type: 'batch_completed', completed: 4, failed: 0, discovered: 5, fromCache: 1 },
        { type: 'urls_discovered', count: 15, depth: 1 }
      ],
      startCrawl: mockStartCrawl,
      stopCrawl: mockStopCrawl,
      clearJob: mockClearJob
    })
    
    render(<ServerlessProgress />)
    
    // Should show crawling in progress
    expect(screen.getByText('Crawling in Progress')).toBeDefined()
    
    // Should calculate totals correctly from batch events
    expect(screen.getByText('Progress: 8 / 15 pages')).toBeDefined() // 3+1+4+0 = 8 total, 10+5 = 15 discovered
    expect(screen.getByText('53%')).toBeDefined() // 8/15 = 53%
    
    // Should show success/failed counts
    expect(screen.getByText('✓ 7 Success')).toBeDefined() // 3+4 = 7
    expect(screen.getByText('✗ 1 Failed')).toBeDefined() // 1+0 = 1
  })
  
  it('should handle job completion', () => {
    const mockUseServerlessCrawl = vi.spyOn(useServerlessCrawlModule, 'useServerlessCrawl')
    mockUseServerlessCrawl.mockReturnValue({
      jobId: 'test-job-id',
      url: 'https://example.com/docs',
      isLoading: false,
      error: null,
      events: [
        { type: 'stream_connected', jobId: 'test-job-id' },
        { type: 'batch_completed', completed: 10, failed: 2, discovered: 12, fromCache: 5 },
        { type: 'job_completed', jobId: 'test-job-id' }
      ],
      startCrawl: mockStartCrawl,
      stopCrawl: mockStopCrawl,
      clearJob: mockClearJob
    })
    
    render(<ServerlessProgress />)
    
    // Should show completion status
    expect(screen.getByText('Crawl Complete')).toBeDefined()
    expect(screen.getByText('✅ Crawl Complete!')).toBeDefined()
    expect(screen.getByText('Successfully crawled 10 pages from https://example.com/docs')).toBeDefined()
  })
  
  it('should start crawl with correct V4 parameters', async () => {
    const mockUseServerlessCrawl = vi.spyOn(useServerlessCrawlModule, 'useServerlessCrawl')
    mockUseServerlessCrawl.mockReturnValue({
      jobId: undefined,
      url: undefined,
      isLoading: false,
      error: null,
      events: [],
      startCrawl: mockStartCrawl,
      stopCrawl: mockStopCrawl,
      clearJob: mockClearJob
    })
    
    render(<ServerlessProgress />)
    
    // Enter URL
    const input = screen.getByPlaceholderText('https://docs.example.com')
    fireEvent.change(input, { target: { value: 'https://test.com/docs' } })
    
    // Click Paste It button
    const button = screen.getByText('Paste It!')
    fireEvent.click(button)
    
    // Verify startCrawl was called with V4 parameters
    await waitFor(() => {
      expect(mockStartCrawl).toHaveBeenCalledWith({
        url: 'https://test.com/docs',
        maxPages: 50,
        maxDepth: 2,
        qualityThreshold: 20
      })
    })
  })
  
  it('should display V4 event stream correctly', () => {
    const mockUseServerlessCrawl = vi.spyOn(useServerlessCrawlModule, 'useServerlessCrawl')
    mockUseServerlessCrawl.mockReturnValue({
      jobId: 'test-job-id',
      url: 'https://example.com/docs',
      isLoading: true,
      error: null,
      events: [
        { type: 'stream_connected', jobId: 'test-job-id', timestamp: new Date().toISOString() },
        { type: 'batch_completed', completed: 3, failed: 1, timestamp: new Date().toISOString() },
        { type: 'urls_discovered', count: 10, depth: 1, timestamp: new Date().toISOString() },
        { type: 'batch_error', error: 'Timeout', timestamp: new Date().toISOString() }
      ],
      startCrawl: mockStartCrawl,
      stopCrawl: mockStopCrawl,
      clearJob: mockClearJob
    })
    
    render(<ServerlessProgress />)
    
    // Expand event stream details
    const detailsToggle = screen.getByText(/View detailed event stream/)
    fireEvent.click(detailsToggle)
    
    // Check event types are displayed with correct styling
    const streamConnected = screen.getByText('stream connected')
    expect(streamConnected).toBeDefined()
    expect(streamConnected.className).toContain('text-gray-700')
    
    const batchCompleted = screen.getByText('batch completed')
    expect(batchCompleted).toBeDefined()
    expect(batchCompleted.className).toContain('text-green-600')
    
    const urlsDiscovered = screen.getByText('urls discovered')
    expect(urlsDiscovered).toBeDefined()
    expect(urlsDiscovered.className).toContain('text-blue-600')
    
    const batchError = screen.getByText('batch error')
    expect(batchError).toBeDefined()
    expect(batchError.className).toContain('text-red-600')
    
    // Check event details
    expect(screen.getByText('Processed 3 pages, 1 failed')).toBeDefined()
    expect(screen.getByText('Found 10 new URLs')).toBeDefined()
    expect(screen.getByText('Timeout')).toBeDefined()
  })
})