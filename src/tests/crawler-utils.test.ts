import { describe, it, expect } from 'vitest'
import { normalizeUrl, isValidDocumentationUrl, generateFingerprint, discoverRootPath } from '@/lib/crawler/url-utils'
import { extractTitle, extractContent } from '@/lib/crawler/content-extractor'
import { JSDOM } from 'jsdom'

describe('URL Utils Tests', () => {
  describe('normalizeUrl', () => {
    it('should normalize basic URLs correctly', () => {
      const result = normalizeUrl('https://example.com/', 'https://example.com', true)
      expect(result).toBe('https://example.com')
    })

    it('should handle relative URLs', () => {
      const result = normalizeUrl('./docs', 'https://example.com', true)
      expect(result).toBe('https://example.com/docs')
    })

    it('should strip anchors when includeAnchors is false', () => {
      const result = normalizeUrl('https://example.com/docs#section', 'https://example.com', true, false)
      expect(result).toBe('https://example.com/docs')
    })

    it('should preserve complex anchors when includeAnchors is true', () => {
      const result = normalizeUrl('https://example.com/docs#/api/v2', 'https://example.com', true, true)
      expect(result).toBe('https://example.com/docs#/api/v2')
    })

    it('should return null for external URLs when followExternalLinks is false', () => {
      const result = normalizeUrl('https://other.com/docs', 'https://example.com', false)
      expect(result).toBeNull()
    })
  })

  describe('isValidDocumentationUrl', () => {
    it('should accept documentation URLs', () => {
      expect(isValidDocumentationUrl('https://docs.example.com')).toBe(true)
      expect(isValidDocumentationUrl('https://example.com/docs')).toBe(true)
      expect(isValidDocumentationUrl('https://example.com/api')).toBe(true)
    })

    it('should reject asset URLs', () => {
      expect(isValidDocumentationUrl('https://example.com/assets/image.png')).toBe(false)
      expect(isValidDocumentationUrl('https://example.com/css/style.css')).toBe(false)
      expect(isValidDocumentationUrl('https://example.com/js/script.js')).toBe(false)
    })

    it('should reject file extensions', () => {
      expect(isValidDocumentationUrl('https://example.com/file.pdf')).toBe(false)
      expect(isValidDocumentationUrl('https://example.com/image.jpg')).toBe(false)
      expect(isValidDocumentationUrl('https://example.com/video.mp4')).toBe(false)
    })
  })

  describe('generateFingerprint', () => {
    it('should generate consistent fingerprints for same URL', () => {
      const fp1 = generateFingerprint('https://example.com/docs', false)
      const fp2 = generateFingerprint('https://example.com/docs', false)
      expect(fp1).toBe(fp2)
    })

    it('should generate different fingerprints for different URLs', () => {
      const fp1 = generateFingerprint('https://example.com/docs', false)
      const fp2 = generateFingerprint('https://example.com/api', false)
      expect(fp1).not.toBe(fp2)
    })

    it('should handle fragments based on includeFragment parameter', () => {
      const fp1 = generateFingerprint('https://example.com/docs#section', false)
      const fp2 = generateFingerprint('https://example.com/docs#section', true)
      expect(fp1).not.toBe(fp2)
    })
  })

  describe('discoverRootPath', () => {
    it('should return origin for root URLs', () => {
      const result = discoverRootPath('https://example.com/')
      expect(result).toBe('https://example.com')
    })

    it('should climb up path segments', () => {
      const result = discoverRootPath('https://example.com/docs/api/v1')
      expect(result).toBe('https://example.com/docs/api')
    })

    it('should handle single path segment', () => {
      const result = discoverRootPath('https://example.com/docs')
      expect(result).toBe('https://example.com/docs')
    })
  })
})

describe('Content Extractor Tests', () => {
  describe('extractTitle', () => {
    it('should extract title from <title> tag', () => {
      const html = '<html><head><title>Test Page</title></head><body></body></html>'
      const dom = new JSDOM(html)
      const title = extractTitle(dom.window.document)
      expect(title).toBe('Test Page')
    })

    it('should extract title from og:title meta tag', () => {
      const html = '<html><head><meta property="og:title" content="OG Title"></head><body></body></html>'
      const dom = new JSDOM(html)
      const title = extractTitle(dom.window.document)
      expect(title).toBe('OG Title')
    })

    it('should extract title from first h1 tag', () => {
      const html = '<html><body><h1>Main Heading</h1></body></html>'
      const dom = new JSDOM(html)
      const title = extractTitle(dom.window.document)
      expect(title).toBe('Main Heading')
    })

    it('should return empty string when no title found', () => {
      const html = '<html><body><p>No title here</p></body></html>'
      const dom = new JSDOM(html)
      const title = extractTitle(dom.window.document)
      expect(title).toBe('')
    })
  })

  describe('extractContent', () => {
    it('should extract basic content from body', () => {
      const html = '<html><body><p>Test content</p></body></html>'
      const dom = new JSDOM(html)
      const content = extractContent(dom.window.document)
      expect(content).toContain('Test content')
    })

    it('should convert headings to markdown', () => {
      const html = '<html><body><h1>Main Title</h1><h2>Subtitle</h2></body></html>'
      const dom = new JSDOM(html)
      const content = extractContent(dom.window.document)
      expect(content).toContain('# Main Title')
      expect(content).toContain('## Subtitle')
    })

    it('should convert lists to markdown', () => {
      const html = '<html><body><ul><li>Item 1</li><li>Item 2</li></ul></body></html>'
      const dom = new JSDOM(html)
      const content = extractContent(dom.window.document)
      expect(content).toContain('- Item 1')
      expect(content).toContain('- Item 2')
    })

    it('should convert code blocks to fenced code', () => {
      const html = '<html><body><pre>const x = 1;</pre></body></html>'
      const dom = new JSDOM(html)
      const content = extractContent(dom.window.document)
      expect(content).toContain('```')
      expect(content).toContain('const x = 1;')
    })

    it('should remove navigation and footer elements', () => {
      const html = '<html><body><nav>Navigation</nav><main><p>Main content</p></main><footer>Footer</footer></body></html>'
      const dom = new JSDOM(html)
      const content = extractContent(dom.window.document)
      expect(content).toContain('Main content')
      expect(content).not.toContain('Navigation')
      expect(content).not.toContain('Footer')
    })

    it('should handle images with alt text', () => {
      const html = '<html><body><img src="test.jpg" alt="Test Image"></body></html>'
      const dom = new JSDOM(html)
      const content = extractContent(dom.window.document)
      expect(content).toContain('[IMAGE: Test Image]')
    })

    it('should return empty string for no content', () => {
      const html = '<html></html>'
      const dom = new JSDOM(html)
      const content = extractContent(dom.window.document)
      expect(content).toBe('')
    })
  })
})