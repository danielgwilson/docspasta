import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { extractContent } from '../lib/crawler/content-extractor'

describe('Quality Scoring Check', () => {
  it('should calculate quality score for test content', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Doc</title>
        </head>
        <body>
          <main>
            <h1>Documentation</h1>
            <p>This is documentation content.</p>
            <h2>API Reference</h2>
            <p>Here is the API documentation with some content to ensure quality score.</p>
            <pre><code>const api = require('api');</code></pre>
          </main>
        </body>
      </html>
    `
    
    const dom = new JSDOM(html)
    const document = dom.window.document
    const content = extractContent(document)
    
    console.log('Extracted content:', content)
    console.log('Content length:', content.length)
    
    // Calculate quality score the same way the crawler does
    let score = 0
    
    // Structure indicators (30 points)
    if (content.includes('# ') || content.includes('## ')) score += 15
    if (content.includes('```')) score += 15
    
    // Content depth (25 points) 
    if (content.length > 1000) score += 10
    if (content.length > 5000) score += 15
    
    // Code examples (20 points)
    const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).length
    score += Math.min(codeBlocks * 5, 20)
    
    // Documentation indicators (25 points)
    const docKeywords = ['API', 'documentation', 'guide', 'tutorial']
    docKeywords.forEach(keyword => {
      if (content.toLowerCase().includes(keyword.toLowerCase())) score += 5
    })
    
    const qualityScore = Math.min(score, 100)
    
    console.log('\nQuality breakdown:')
    console.log('- Has headings:', content.includes('# ') || content.includes('## '))
    console.log('- Has code blocks:', content.includes('```'))
    console.log('- Content > 1000 chars:', content.length > 1000)
    console.log('- Code blocks found:', codeBlocks)
    console.log('- Doc keywords found:', docKeywords.filter(k => content.toLowerCase().includes(k.toLowerCase())))
    console.log('Final quality score:', qualityScore)
    
    expect(content.length).toBeGreaterThan(0)
  })
})