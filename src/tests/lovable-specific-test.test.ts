import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { extractContent, extractTitle } from '../lib/crawler/content-extractor'

describe('Lovable Docs Specific Test', () => {
  it('should extract content from Lovable docs homepage', async () => {
    try {
      // Fetch the real page
      const response = await fetch('https://docs.lovable.dev', {
        headers: {
          'User-Agent': 'Docspasta/2.0 (Documentation Crawler)',
        }
      })
      
      if (!response.ok) {
        console.error(`Failed to fetch: ${response.status} ${response.statusText}`)
        throw new Error(`HTTP ${response.status}`)
      }
      
      const html = await response.text()
      console.log('\n=== Raw HTML Analysis ===')
      console.log(`HTML length: ${html.length}`)
      console.log(`Contains <main>: ${html.includes('<main')}`);
      console.log(`Contains <article>: ${html.includes('<article')}`);
      console.log(`Contains <body>: ${html.includes('<body')}`);
      console.log(`Contains h1: ${html.includes('<h1')}`);
      console.log(`Contains text "Welcome": ${html.includes('Welcome')}`);
      
      // Find the body content
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      if (bodyMatch) {
        console.log(`\nBody content length: ${bodyMatch[1].length}`);
        console.log(`Body preview: ${bodyMatch[1].slice(0, 500).replace(/\s+/g, ' ')}`);
      }
      
      // Parse with JSDOM
      const dom = new JSDOM(html, { url: 'https://docs.lovable.dev' })
      const document = dom.window.document
      
      // Debug what elements exist
      console.log('\n=== DOM Analysis ===')
      console.log(`Has title element: ${!!document.querySelector('title')}`)
      console.log(`Has main element: ${!!document.querySelector('main')}`)
      console.log(`Has article element: ${!!document.querySelector('article')}`)
      console.log(`Has .content-body: ${!!document.querySelector('.content-body')}`)
      console.log(`Has .documentation-content: ${!!document.querySelector('.documentation-content')}`)
      console.log(`Has body element: ${!!document.querySelector('body')}`)
      
      // Check what's in the body
      const body = document.querySelector('body')
      if (body) {
        console.log(`\nBody text content length: ${body.textContent?.length}`)
        console.log(`Body child elements: ${body.children.length}`)
        console.log(`Body innerHTML length: ${body.innerHTML.length}`)
      }
      
      // Extract content using our extractor
      const title = extractTitle(document)
      const content = extractContent(document)
      
      console.log('\n=== Extracted Results ===')
      console.log(`Title: "${title}"`)
      console.log(`Content length: ${content.length}`)
      console.log(`Content preview:`)
      console.log(content.slice(0, 500))
      
      expect(response.status).toBe(200)
      expect(html.length).toBeGreaterThan(0)
      
    } catch (error) {
      console.error('Test failed:', error)
      throw error
    }
  }, 15000)
})