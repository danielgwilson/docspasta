import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CrawlCard from '@/components/CrawlCard'

// Mock EventSource
class MockEventSource {
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  readyState = 1
  
  close() {
    this.readyState = 2
  }
  
  simulateMessage(type: string, data: any) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', {
        data: JSON.stringify({ type, ...data })
      }))
    }
  }
  
  simulateOpen() {
    if (this.onopen) {
      this.onopen(new Event('open'))
    }
  }
}

global.EventSource = MockEventSource as any

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined)
  }
})

describe('CrawlCard Component', () => {
  it('should render initial connecting state', () => {
    render(<CrawlCard jobId="test-123" url="https://docs.example.com/guide" />)
    
    expect(screen.getByText('Crawling documentation...')).toBeInTheDocument()
    expect(screen.getByText('docs.example.com/guide')).toBeInTheDocument()
  })
  
  it('should show progress when processing', async () => {
    const { container } = render(
      <CrawlCard jobId="test-123" url="https://docs.example.com" />
    )
    
    // Get the mock EventSource instance
    const eventSource = global.EventSource as any
    const instance = new eventSource()
    
    // Simulate connection
    instance.simulateOpen()
    instance.simulateMessage('stream_connected', { jobId: 'test-123' })
    
    // Simulate progress
    instance.simulateMessage('batch_completed', { 
      completed: 5, 
      failed: 0, 
      fromCache: 2 
    })
    
    instance.simulateMessage('urls_discovered', { 
      count: 10,
      depth: 1 
    })
    
    await waitFor(() => {
      expect(screen.getByText('5 pages')).toBeInTheDocument()
      expect(screen.getByText('⚡ 2 cached')).toBeInTheDocument()
    })
    
    // Check progress bar exists
    const progressBar = container.querySelector('[class*="bg-gradient-to-r"]')
    expect(progressBar).toBeInTheDocument()
  })
  
  it('should allow copying when completed', async () => {
    const user = userEvent.setup()
    
    // Mock fetch for combined markdown
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: '# Documentation\n\nThis is the content.',
        title: 'Example Docs',
        wordCount: 100
      })
    })
    
    const { container } = render(
      <CrawlCard jobId="test-123" url="https://docs.example.com" />
    )
    
    // Simulate job completion
    const eventSource = global.EventSource as any
    const instance = new eventSource()
    instance.simulateMessage('job_completed', { jobId: 'test-123' })
    
    await waitFor(() => {
      expect(screen.getByText('Example Docs')).toBeInTheDocument()
      expect(screen.getByText('Click to copy')).toBeInTheDocument()
    })
    
    // Click to copy
    await user.click(container.firstChild as Element)
    
    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument()
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        '# Documentation\n\nThis is the content.'
      )
    })
  })
  
  it('should show error state', async () => {
    render(<CrawlCard jobId="test-123" url="https://docs.example.com" />)
    
    const eventSource = global.EventSource as any
    const instance = new eventSource()
    instance.simulateMessage('job_failed', { error: 'Network timeout' })
    
    await waitFor(() => {
      expect(screen.getByText('Network timeout')).toBeInTheDocument()
    })
  })
  
  it('should toggle details section', async () => {
    const user = userEvent.setup()
    
    render(<CrawlCard jobId="test-123" url="https://docs.example.com" />)
    
    const eventSource = global.EventSource as any
    const instance = new eventSource()
    instance.simulateMessage('batch_completed', { completed: 5 })
    
    await waitFor(() => {
      expect(screen.getByText('Show details')).toBeInTheDocument()
    })
    
    // Click to show details
    await user.click(screen.getByText('Show details'))
    
    await waitFor(() => {
      expect(screen.getByText('Hide details')).toBeInTheDocument()
      expect(screen.getByText(/batch_completed/)).toBeInTheDocument()
    })
  })
})