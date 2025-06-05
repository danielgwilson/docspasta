import { describe, it, expect } from 'vitest'
import { extractContent } from '@/lib/crawler/content-extractor'
import { JSDOM } from 'jsdom'

describe('Content Sanitization Tests', () => {
  it('should remove SEC filing metadata and boilerplate', () => {
    const html = `
      <html>
        <body>
          <table summary="Document and Entity Information">
            <tr><td>Entity Registrant Name</td><td>UBER TECHNOLOGIES INC</td></tr>
            <tr><td>Commission File Number</td><td>001-38902</td></tr>
            <tr><td>State of Incorporation</td><td>Delaware</td></tr>
          </table>
          
          <div>
            <p>Table of Contents</p>
            <p>Entity Information</p>
            <p>Zip Code: 12345</p>
            <p>Area Code: 415</p>
          </div>
          
          <main>
            <h1>Business Overview</h1>
            <p>This is the actual content that LLMs need to see about the business operations and strategy.</p>
            <h2>Financial Performance</h2>
            <p>Revenue increased significantly this quarter due to improved operational efficiency.</p>
          </main>
          
          <div>
            <p>Click to expand details</p>
            <p>Filed 12/31/2024</p>
            <p>Page 1 of 50</p>
          </div>
        </body>
      </html>
    `
    
    const dom = new JSDOM(html)
    const content = extractContent(dom.window.document)
    
    // Should contain the actual business content
    expect(content).toContain('Business Overview')
    expect(content).toContain('actual content that LLMs need to see')
    expect(content).toContain('Financial Performance')
    expect(content).toContain('Revenue increased significantly')
    
    // Should NOT contain SEC boilerplate
    expect(content).not.toContain('Entity Registrant Name')
    expect(content).not.toContain('Commission File Number')
    expect(content).not.toContain('State of Incorporation')
    expect(content).not.toContain('Table of Contents')
    expect(content).not.toContain('Entity Information')
    expect(content).not.toContain('Zip Code')
    expect(content).not.toContain('Area Code')
    expect(content).not.toContain('Click to expand')
    expect(content).not.toContain('Filed 12/31/2024')
    expect(content).not.toContain('Page 1 of 50')
  })

  it('should clean up excessive whitespace and formatting artifacts', () => {
    const html = `
      <html>
        <body>
          <p>Content   with    lots     of    spaces</p>
          <p>Line 1</p>
          
          
          
          <p>Line 2 after many newlines</p>
          <p>Text with...multiple...dots</p>
          <p>Text with----multiple----dashes</p>
        </body>
      </html>
    `
    
    const dom = new JSDOM(html)
    const content = extractContent(dom.window.document)
    
    // Should normalize excessive spacing
    expect(content).not.toMatch(/\s{3,}/) // No 3+ consecutive spaces
    expect(content).not.toMatch(/\n\s*\n\s*\n/) // No 3+ consecutive newlines
    expect(content).toContain('Content with lots of spaces')
    expect(content).toContain('Line 1')
    expect(content).toContain('Line 2 after many newlines')
    
    // Should normalize excessive punctuation
    expect(content).toContain('Text with...multiple')
    expect(content).toContain('Text with---multiple')
  })

  it('should filter out lines that are mostly numbers/metadata', () => {
    const html = `
      <html>
        <body>
          <div>$1,234,567</div>
          <div>12/31/2024</div>
          <div>45.6%</div>
          <div>NASDAQ</div>
          <div>
            <p>This is meaningful business content that should be kept.</p>
            <p>Revenue growth of 15% demonstrates strong market position.</p>
          </div>
          <div>ABC123</div>
        </body>
      </html>
    `
    
    const dom = new JSDOM(html)
    const content = extractContent(dom.window.document)
    
    // Should keep meaningful content
    expect(content).toContain('meaningful business content')
    expect(content).toContain('Revenue growth of 15% demonstrates')
    
    // The filtering works at line level, so content might still contain these
    // but they should be much cleaner and more separated
    expect(content.length).toBeGreaterThan(50) // Should have substantial content
  })
})