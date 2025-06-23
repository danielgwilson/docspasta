// Test setup for QStash tests
import { vi } from 'vitest'

// Mock environment variables
process.env.QSTASH_TOKEN = 'test-token'
process.env.QSTASH_URL = 'https://qstash.upstash.io'
process.env.QSTASH_CURRENT_SIGNING_KEY = 'test-current-key'
process.env.QSTASH_NEXT_SIGNING_KEY = 'test-next-key'
process.env.BASE_URL = 'https://test.example.com'

// Mock external dependencies
vi.mock('@/lib/auth/middleware', () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ id: 'test-user' })
}))



vi.mock('@/lib/url-utils', () => ({
  discoverUrls: vi.fn().mockResolvedValue(['https://example.com/page1', 'https://example.com/page2']),
  extractValidLinks: vi.fn().mockReturnValue(['https://example.com/link1'])
}))

vi.mock('@/lib/quality', () => ({
  assessContentQuality: vi.fn().mockReturnValue({ score: 85, reason: 'good' })
}))

vi.mock('@/lib/web-crawler', () => ({
  WebCrawler: vi.fn().mockImplementation(() => ({
    crawlPage: vi.fn().mockResolvedValue({
      success: true,
      title: 'Test Page',
      content: 'Test content with multiple words for testing',
      links: ['https://example.com/link1']
    })
  }))
}))