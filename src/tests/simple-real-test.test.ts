import { describe, it, expect, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { extractContent, extractTitle } from '../lib/crawler/content-extractor'

describe('Simple Real Website Test', () => {
  it('should fetch and extract content from Lovable docs', async () => {
    try {
      // Fetch the real page
      const response = await fetch('https://docs.lovable.dev', {
        headers: {
          'User-Agent': 'Docspasta/2.0 (Documentation Crawler)',
        }
      })
      
      console.log('Response status:', response.status)
      console.log('Response headers:', Object.fromEntries(response.headers.entries()))
      
      const html = await response.text()
      console.log('HTML length:', html.length)
      console.log('HTML preview:', html.slice(0, 500))
      
      // Parse with JSDOM
      const dom = new JSDOM(html, { url: 'https://docs.lovable.dev' })
      const document = dom.window.document
      
      // Extract content
      const title = extractTitle(document)
      const content = extractContent(document)
      
      console.log('\nExtracted:')
      console.log('Title:', title)
      console.log('Content length:', content.length)
      console.log('Content preview:', content.slice(0, 500))
      
      // Check quality score
      let score = 0
      if (content.includes('# ') || content.includes('## ')) score += 15
      if (content.includes('```')) score += 15
      if (content.length > 1000) score += 10
      if (content.length > 5000) score += 15
      const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).length
      score += Math.min(codeBlocks * 5, 20)
      const docKeywords = ['API', 'documentation', 'guide', 'tutorial']
      docKeywords.forEach(keyword => {
        if (content.toLowerCase().includes(keyword.toLowerCase())) score += 5
      })
      const qualityScore = Math.min(score, 100)
      
      console.log('Quality score:', qualityScore)
      
      // Assertions
      expect(response.status).toBe(200)
      expect(title).toBeTruthy()
      expect(content.length).toBeGreaterThan(0)
      
    } catch (error) {
      console.error('Test failed:', error)
      throw error
    }
  }, 15000)
})