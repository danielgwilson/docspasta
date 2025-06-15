'use client'

import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CrawlCard } from '../CrawlCard'

// Mock fetch
global.fetch = vi.fn()

describe('CrawlCard State Restoration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    
    // Mock EventSource
    global.EventSource = vi.fn().mockImplementation(() => ({
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      readyState: 0,
      onopen: null,
      onerror: null,
      onmessage: null,
      url: '',
      withCredentials: false,
      dispatchEvent: vi.fn(),
      CONNECTING: 0,
      OPEN: 1,
      CLOSED: 2
    }))
  })

  it('should correctly restore state with totalProcessed and totalDiscovered fields', async () => {
    const mockResponse = {
      success: true,
      status: 'processing',
      totalProcessed: 25,
      totalDiscovered: 50,
      recentActivity: [],
      lastEventId: 'evt-123',
      error: null
    }
    
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as Response)
    
    render(
      <CrawlCard
        jobId="test-job-123"
        url="https://example.com"
      />
    )
    
    // Should show restoring state initially
    expect(screen.getByText('Restoring...')).toBeInTheDocument()
    
    // Wait for state to be restored
    await waitFor(() => {
      expect(screen.queryByText('Restoring...')).not.toBeInTheDocument()
    })
    
    // Check that the progress numbers are displayed correctly
    expect(screen.getByText('25 / 50 pages')).toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument() // Processed count
    expect(screen.getByText('50')).toBeInTheDocument() // Discovered count
  })
  
  it('should handle completed state restoration', async () => {
    const mockResponse = {
      success: true,
      status: 'completed',
      totalProcessed: 100,
      totalDiscovered: 100,
      recentActivity: [],
      lastEventId: 'evt-final',
      error: null
    }
    
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as Response)
    
    const onComplete = vi.fn()
    
    render(
      <CrawlCard
        jobId="test-job-123"
        url="https://example.com"
        onComplete={onComplete}
      />
    )
    
    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument()
    })
    
    // Should show correct counts
    expect(screen.getByText('100 / 100 pages')).toBeInTheDocument()
    
    // Should show download button
    expect(screen.getByText('Download Markdown')).toBeInTheDocument()
    
    // Should call onComplete
    expect(onComplete).toHaveBeenCalledWith('test-job-123')
  })
  
  it('should handle failed state restoration', async () => {
    const mockResponse = {
      success: true,
      status: 'failed',
      totalProcessed: 10,
      totalDiscovered: 50,
      recentActivity: [],
      lastEventId: null,
      error: 'Connection timeout'
    }
    
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as Response)
    
    render(
      <CrawlCard
        jobId="test-job-123"
        url="https://example.com"
      />
    )
    
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument()
    })
    
    // Should show error message
    expect(screen.getByText('Connection timeout')).toBeInTheDocument()
    
    // Should show counts
    expect(screen.getByText('10 / 50 pages')).toBeInTheDocument()
  })
  
  it('should use initial props instead of fetching when provided', async () => {
    render(
      <CrawlCard
        jobId="test-job-123"
        url="https://example.com"
        initialStatus="completed"
        initialProcessed={75}
        initialDiscovered={75}
      />
    )
    
    // Should not show restoring state
    expect(screen.queryByText('Restoring...')).not.toBeInTheDocument()
    
    // Should show completed state immediately
    expect(screen.getByText('Completed')).toBeInTheDocument()
    
    // Should show correct counts from initial props
    expect(screen.getByText('75 / 75 pages')).toBeInTheDocument()
    
    // Fetch should not have been called
    expect(fetch).not.toHaveBeenCalled()
  })
})