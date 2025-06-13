import { describe, it, expect } from 'vitest'
import { 
  normalizeUrl, 
  createUrlHash, 
  isValidCrawlUrl,
  isWithinPathPrefix,
  extractValidLinks
} from '@/lib/serverless/url-utils'
import { assessContentQuality, combineToMarkdown } from '@/lib/serverless/quality'

describe('V4 URL Utilities', () => {
  describe('normalizeUrl', () => {
    it('should normalize URLs consistently', () => {
      expect(normalizeUrl('https://example.com')).toBe('https://example.com/')
      expect(normalizeUrl('https://example.com/')).toBe('https://example.com/')
      expect(normalizeUrl('https://EXAMPLE.com')).toBe('https://example.com/')
      expect(normalizeUrl('https://example.com#section')).toBe('https://example.com/')
      expect(normalizeUrl('https://example.com?utm_source=test')).toBe('https://example.com/')
    })
  })
  
  describe('createUrlHash', () => {
    it('should create consistent hashes', () => {
      const hash1 = createUrlHash('https://example.com')
      const hash2 = createUrlHash('https://example.com/')
      const hash3 = createUrlHash('https://example.com/different')
      
      expect(hash1).toBe(hash2) // Same URL after normalization
      expect(hash1).not.toBe(hash3) // Different URLs
      expect(hash1).toHaveLength(64) // SHA-256 hash length
    })
  })
  
  describe('isValidCrawlUrl', () => {
    it('should validate crawlable URLs', () => {
      expect(isValidCrawlUrl('https://example.com')).toBe(true)
      expect(isValidCrawlUrl('http://example.com')).toBe(true)
      expect(isValidCrawlUrl('ftp://example.com')).toBe(false)
      expect(isValidCrawlUrl('mailto:test@example.com')).toBe(false)
      expect(isValidCrawlUrl('https://example.com/image.jpg')).toBe(false)
      expect(isValidCrawlUrl('https://example.com/file.pdf')).toBe(false)
    })
  })
  
  describe('isWithinPathPrefix', () => {
    it('should check path prefix boundaries', () => {
      const baseUrl = 'https://docs.example.com/api/v2/'
      
      expect(isWithinPathPrefix('https://docs.example.com/api/v2/users', baseUrl)).toBe(true)
      expect(isWithinPathPrefix('https://docs.example.com/api/v2/users/create', baseUrl)).toBe(true)
      expect(isWithinPathPrefix('https://docs.example.com/api/v1/', baseUrl)).toBe(false)
      expect(isWithinPathPrefix('https://docs.example.com/guides/', baseUrl)).toBe(false)
      expect(isWithinPathPrefix('https://other.example.com/api/v2/', baseUrl)).toBe(false)
    })
    
    it('should handle React docs example', () => {
      const baseUrl = 'https://react.dev/learn/'
      
      expect(isWithinPathPrefix('https://react.dev/learn/thinking-in-react', baseUrl)).toBe(true)
      expect(isWithinPathPrefix('https://react.dev/learn/tutorial-tic-tac-toe', baseUrl)).toBe(true)
      expect(isWithinPathPrefix('https://react.dev/reference/', baseUrl)).toBe(false)
      expect(isWithinPathPrefix('https://react.dev/', baseUrl)).toBe(false)
    })
  })
  
  describe('extractValidLinks', () => {
    it('should extract and filter links correctly', () => {
      const links = [
        'https://docs.example.com/api/v2/users',
        'https://docs.example.com/api/v2/orders',
        'https://docs.example.com/api/v1/legacy',
        'https://docs.example.com/guides/quickstart',
        'https://external.com/page',
        '/api/v2/auth', // relative URL
        '#section', // fragment
        'mailto:test@example.com'
      ]
      
      const baseUrl = 'https://docs.example.com/api/v2/overview'
      const originalJobUrl = 'https://docs.example.com/api/v2/'
      
      const validLinks = extractValidLinks(links, baseUrl, originalJobUrl)
      
      expect(validLinks).toContain('https://docs.example.com/api/v2/users')
      expect(validLinks).toContain('https://docs.example.com/api/v2/orders')
      expect(validLinks).toContain('https://docs.example.com/api/v2/auth') // relative converted
      
      expect(validLinks).not.toContain('https://docs.example.com/api/v1/legacy') // wrong prefix
      expect(validLinks).not.toContain('https://docs.example.com/guides/quickstart') // wrong prefix
      expect(validLinks).not.toContain('https://external.com/page') // external
      expect(validLinks).not.toContain('mailto:test@example.com') // invalid
    })
  })
})

describe('V4 Quality Assessment', () => {
  describe('assessContentQuality', () => {
    it('should score high-quality documentation', () => {
      const content = `# Getting Started

## Installation

To install the library, run:

\`\`\`bash
npm install example-lib
\`\`\`

## Configuration

Here's how to configure the library:

\`\`\`javascript
const config = {
  apiKey: 'your-key',
  endpoint: 'https://api.example.com'
};
\`\`\`

- First, create a configuration object
- Then, initialize the client
- Finally, make API calls`
      
      const quality = assessContentQuality(content, 'https://docs.example.com/getting-started')
      
      expect(quality.score).toBeGreaterThanOrEqual(60)
      expect(quality.signals.hasHeadings).toBe(true)
      expect(quality.signals.hasCodeBlocks).toBe(true)
      expect(quality.signals.hasLists).toBe(true)
      expect(quality.reason).toBe(quality.score >= 70 ? 'high_quality' : 'medium_quality')
    })
    
    it('should score low-quality content', () => {
      const content = `This is just a short paragraph with no structure.`
      
      const quality = assessContentQuality(content, 'https://example.com/page')
      
      expect(quality.score).toBeLessThan(20)
      expect(quality.signals.hasHeadings).toBe(false)
      expect(quality.signals.hasCodeBlocks).toBe(false)
      expect(quality.reason).toBe('low_quality')
    })
  })
  
  describe('combineToMarkdown', () => {
    it('should combine multiple pages into markdown', () => {
      const results = [
        {
          url: 'https://docs.example.com/intro',
          title: 'Introduction',
          content: '# Introduction\n\nWelcome to our docs.',
          quality: { score: 80, reason: 'high_quality', signals: {} as any },
          wordCount: 10
        },
        {
          url: 'https://docs.example.com/install',
          title: 'Installation',
          content: '# Installation\n\nRun npm install.',
          quality: { score: 70, reason: 'high_quality', signals: {} as any },
          wordCount: 8
        }
      ]
      
      const markdown = combineToMarkdown(results)
      
      expect(markdown).toContain('# Documentation Compilation')
      expect(markdown).toContain('Total Pages: 2')
      expect(markdown).toContain('Total Words: 18')
      expect(markdown).toContain('## Introduction')
      expect(markdown).toContain('## Installation')
      expect(markdown).toContain('Quality Score: 80/100')
      expect(markdown).toContain('Quality Score: 70/100')
    })
  })
})