export interface QualityAssessment {
  score: number
  reason: string
  signals: {
    hasHeadings: boolean
    hasCodeBlocks: boolean
    hasLists: boolean
    wordCount: number
    isDocumentation: boolean
  }
}

/**
 * Assess the quality of content for documentation purposes
 * Returns a score from 0-100
 */
export function assessContentQuality(content: string, url: string): QualityAssessment {
  let score = 0
  const signals = {
    hasHeadings: false,
    hasCodeBlocks: false,
    hasLists: false,
    wordCount: 0,
    isDocumentation: false
  }
  
  // Check content length
  const wordCount = content.split(/\s+/).length
  signals.wordCount = wordCount
  
  // Length scoring (25 points max)
  if (wordCount > 100) score += 10
  if (wordCount > 500) score += 10
  if (wordCount > 1000) score += 5
  
  // Structure indicators (30 points max)
  if (content.includes('# ') || content.includes('## ')) {
    signals.hasHeadings = true
    score += 15
  }
  
  if (content.includes('```')) {
    signals.hasCodeBlocks = true
    score += 15
  }
  
  // List detection (10 points)
  if (content.includes('- ') || content.includes('* ') || content.match(/^\d+\./m)) {
    signals.hasLists = true
    score += 10
  }
  
  // Documentation keywords (20 points)
  const docKeywords = [
    'installation', 'setup', 'getting started', 'api', 'reference',
    'guide', 'tutorial', 'documentation', 'configuration', 'usage',
    'example', 'introduction', 'overview', 'quickstart'
  ]
  
  const lowerContent = content.toLowerCase()
  const keywordMatches = docKeywords.filter(keyword => lowerContent.includes(keyword))
  score += Math.min(keywordMatches.length * 4, 20)
  
  // URL pattern bonus (15 points)
  const urlLower = url.toLowerCase()
  if (urlLower.includes('/docs/') || 
      urlLower.includes('/documentation/') ||
      urlLower.includes('/guide/') ||
      urlLower.includes('/api/') ||
      urlLower.includes('/reference/')) {
    signals.isDocumentation = true
    score += 15
  }
  
  // Cap at 100
  score = Math.min(score, 100)
  
  // Determine reason
  let reason = 'low_quality'
  if (score >= 70) reason = 'high_quality'
  else if (score >= 40) reason = 'medium_quality'
  
  return {
    score,
    reason,
    signals
  }
}

/**
 * Filter content to only include high-quality sections
 */
export function filterHighQualityContent(
  results: Array<{ url: string; content: string; quality: QualityAssessment }>
): Array<{ url: string; content: string; quality: QualityAssessment }> {
  return results.filter(r => r.quality.score >= 20)
}

/**
 * Combine multiple content pieces into a single markdown document
 */
export function combineToMarkdown(
  results: Array<{ 
    url: string
    title: string
    content: string
    quality: QualityAssessment
    wordCount: number 
  }>
): string {
  const sortedResults = results.sort((a, b) => 
    // Sort by quality score descending
     b.quality.score - a.quality.score
  )
  
  const sections = sortedResults.map(result => `## ${result.title}

*Source: ${result.url}*  
*Quality Score: ${result.quality.score}/100*

${result.content}

---
`)
  
  const totalWords = sortedResults.reduce((sum, r) => sum + r.wordCount, 0)
  
  return `# Documentation Compilation

*Total Pages: ${sortedResults.length}*  
*Total Words: ${totalWords.toLocaleString()}*  
*Generated: ${new Date().toISOString()}*

---

${sections.join('\n')}`
}