import { describe, it, expect } from 'vitest'
import { extractValidLinks } from '@/lib/serverless/url-utils'

describe('V4 Lovable URL Discovery Debug', () => {
  it('should find valid links from lovable docs', () => {
    // Simulate what happens when crawling the introduction page
    const baseUrl = 'https://docs.lovable.dev/introduction'
    const originalJobUrl = 'https://docs.lovable.dev/introduction'
    
    // These are typical links found on a docs page
    const discoveredLinks = [
      'https://docs.lovable.dev/getting-started',
      'https://docs.lovable.dev/introduction/what-is-lovable',
      'https://docs.lovable.dev/introduction/how-it-works',
      'https://docs.lovable.dev/features',
      'https://docs.lovable.dev/features/ai-generation',
      'https://lovable.dev', // Main site
      'https://github.com/lovable-dev', // External
      '/getting-started', // Relative
      './what-is-lovable', // Relative
      '../features', // Relative up
    ]
    
    const validLinks = extractValidLinks(discoveredLinks, baseUrl, originalJobUrl)
    
    console.log('Base URL:', baseUrl)
    console.log('Original Job URL:', originalJobUrl)
    console.log('Discovered Links:', discoveredLinks.length)
    console.log('Valid Links:', validLinks.length)
    console.log('Valid:', validLinks)
    
    // Should include pages in the same section
    expect(validLinks).toContain('https://docs.lovable.dev/introduction/what-is-lovable')
    expect(validLinks).toContain('https://docs.lovable.dev/introduction/how-it-works')
    
    // Should NOT include pages outside the path prefix
    expect(validLinks).not.toContain('https://docs.lovable.dev/getting-started')
    expect(validLinks).not.toContain('https://docs.lovable.dev/features')
    expect(validLinks).not.toContain('https://lovable.dev')
  })
  
  it('should handle different path prefix scenarios', () => {
    const scenarios = [
      {
        name: 'Root docs',
        baseUrl: 'https://docs.lovable.dev/',
        originalJobUrl: 'https://docs.lovable.dev/',
        links: [
          'https://docs.lovable.dev/introduction',
          'https://docs.lovable.dev/getting-started',
          'https://docs.lovable.dev/features/ai-generation',
        ],
        expectedCount: 3, // All should be valid
      },
      {
        name: 'Specific section',
        baseUrl: 'https://docs.lovable.dev/features',
        originalJobUrl: 'https://docs.lovable.dev/features',
        links: [
          'https://docs.lovable.dev/features/ai-generation',
          'https://docs.lovable.dev/features/collaboration',
          'https://docs.lovable.dev/introduction',
          'https://docs.lovable.dev/getting-started',
        ],
        expectedCount: 2, // Only features/* should be valid
      },
    ]
    
    for (const scenario of scenarios) {
      const validLinks = extractValidLinks(scenario.links, scenario.baseUrl, scenario.originalJobUrl)
      
      console.log(`\n${scenario.name}:`)
      console.log('Original URL:', scenario.originalJobUrl)
      console.log('Valid links:', validLinks)
      
      expect(validLinks.length).toBe(scenario.expectedCount)
    }
  })
})