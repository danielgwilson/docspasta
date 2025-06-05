/**
 * Content quality assessment for crawled pages
 * Inspired by Firecrawl's quality scoring system
 */

export interface QualityFactors {
  isLongEnough: boolean;
  isGoodStatusCode: boolean;
  hasMainContent: boolean;
  hasDocumentationStructure: boolean;
  isLikelyError: boolean;
  hasCodeExamples: boolean;
  tokenCount: number;
}

export interface QualityScore {
  score: number; // 0-100
  factors: QualityFactors;
  recommendation: 'excellent' | 'good' | 'acceptable' | 'poor' | 'reject';
  reasons: string[];
}

/**
 * Assess the quality of extracted content
 */
export function assessContentQuality(
  markdown: string,
  statusCode: number,
  title?: string,
  url?: string
): QualityScore {
  const factors: QualityFactors = {
    isLongEnough: markdown.length > 100,
    isGoodStatusCode: (statusCode >= 200 && statusCode < 300) || statusCode === 304,
    hasMainContent: hasMainContent(markdown),
    hasDocumentationStructure: hasDocumentationStructure(markdown),
    isLikelyError: isLikelyErrorPage(markdown, title, statusCode),
    hasCodeExamples: hasCodeExamples(markdown),
    tokenCount: estimateTokenCount(markdown)
  };
  
  const { score, recommendation, reasons } = calculateScore(factors, url);
  
  return {
    score,
    factors,
    recommendation,
    reasons
  };
}

/**
 * Check if content has substantial main content
 */
function hasMainContent(markdown: string): boolean {
  // Remove code blocks and check remaining content
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, '');
  const meaningfulContent = withoutCode.replace(/\s+/g, ' ').trim();
  
  return meaningfulContent.length > 200;
}

/**
 * Check if content has documentation-like structure
 */
function hasDocumentationStructure(markdown: string): boolean {
  let score = 0;
  
  // Check for headers
  if (/^#{1,6}\s+.+$/m.test(markdown)) score += 2;
  
  // Check for multiple headers (indicates structure)
  const headerCount = (markdown.match(/^#{1,6}\s+.+$/gm) || []).length;
  if (headerCount >= 2) score += 2;
  if (headerCount >= 4) score += 1;
  
  // Check for lists
  if (/^[\s]*[-*+]\s+.+$/m.test(markdown)) score += 1;
  if (/^[\s]*\d+\.\s+.+$/m.test(markdown)) score += 1;
  
  // Check for links (documentation often has many links)
  const linkCount = (markdown.match(/\[.*?\]/g) || []).length;
  if (linkCount >= 3) score += 1;
  if (linkCount >= 8) score += 1;
  
  // Check for documentation keywords
  const docKeywords = [
    'documentation', 'guide', 'tutorial', 'api', 'reference',
    'install', 'setup', 'configuration', 'example', 'usage'
  ];
  const lowerContent = markdown.toLowerCase();
  const keywordCount = docKeywords.filter(keyword => 
    lowerContent.includes(keyword)
  ).length;
  
  if (keywordCount >= 2) score += 1;
  if (keywordCount >= 4) score += 1;
  
  return score >= 4;
}

/**
 * Check if page is likely an error page
 */
function isLikelyErrorPage(markdown: string, title?: string, statusCode?: number): boolean {
  if (statusCode && (statusCode >= 400 || statusCode < 200)) {
    return true;
  }
  
  const lowerContent = markdown.toLowerCase();
  const lowerTitle = title?.toLowerCase() || '';
  
  const errorIndicators = [
    'page not found', '404', 'not found', 'error',
    'access denied', 'forbidden', 'unauthorized',
    'something went wrong', 'oops', 'sorry',
    'page does not exist', 'broken link'
  ];
  
  return errorIndicators.some(indicator => 
    lowerContent.includes(indicator) || lowerTitle.includes(indicator)
  );
}

/**
 * Check if content has code examples
 */
function hasCodeExamples(markdown: string): boolean {
  // Check for code blocks
  if (/```[\s\S]*?```/.test(markdown)) return true;
  
  // Check for inline code
  const inlineCodeCount = (markdown.match(/`[^`]+`/g) || []).length;
  if (inlineCodeCount >= 3) return true;
  
  // Check for common code patterns
  const codePatterns = [
    /function\s+\w+\s*\(/,
    /const\s+\w+\s*=/,
    /import\s+.*from/,
    /\$\s+[\w-]+/, // Command line
    /<\w+.*?>/, // HTML tags
    /\{.*\}/, // JSON-like structures
  ];
  
  return codePatterns.some(pattern => pattern.test(markdown));
}

/**
 * Estimate token count for LLM context planning
 */
function estimateTokenCount(text: string): number {
  // Rough estimation: ~4 characters per token for English text
  // This is approximate but good enough for quality assessment
  return Math.ceil(text.length / 4);
}

/**
 * Calculate overall quality score and recommendation
 */
function calculateScore(factors: QualityFactors, url?: string): {
  score: number;
  recommendation: 'excellent' | 'good' | 'acceptable' | 'poor' | 'reject';
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];
  
  // Status code (0-20 points)
  if (factors.isGoodStatusCode) {
    score += 20;
  } else {
    reasons.push('Bad HTTP status code');
  }
  
  // Content length (0-20 points)
  if (factors.isLongEnough) {
    score += 20;
  } else {
    reasons.push('Content too short');
  }
  
  // Main content presence (0-25 points)
  if (factors.hasMainContent) {
    score += 25;
  } else {
    reasons.push('Lacks substantial content');
  }
  
  // Documentation structure (0-20 points)
  if (factors.hasDocumentationStructure) {
    score += 20;
    reasons.push('Well-structured documentation');
  } else {
    reasons.push('Poor documentation structure');
  }
  
  // Code examples bonus (0-10 points)
  if (factors.hasCodeExamples) {
    score += 10;
    reasons.push('Contains code examples');
  }
  
  // Error page penalty (-50 points)
  if (factors.isLikelyError) {
    score -= 50;
    reasons.push('Appears to be error page');
  }
  
  // Token count considerations (0-5 points)
  if (factors.tokenCount > 100 && factors.tokenCount < 8000) {
    score += 5; // Good size for LLM consumption
  } else if (factors.tokenCount >= 8000) {
    reasons.push('Content very long (may need chunking)');
  }
  
  // URL-based bonuses
  if (url) {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('/docs/') || urlLower.includes('/documentation/')) {
      score += 5;
      reasons.push('URL indicates documentation');
    }
    if (urlLower.includes('/api/') || urlLower.includes('/reference/')) {
      score += 5;
      reasons.push('URL indicates API reference');
    }
  }
  
  // Normalize score to 0-100
  score = Math.max(0, Math.min(100, score));
  
  // Determine recommendation
  let recommendation: 'excellent' | 'good' | 'acceptable' | 'poor' | 'reject';
  
  if (factors.isLikelyError || score < 20) {
    recommendation = 'reject';
  } else if (score < 40) {
    recommendation = 'poor';
  } else if (score < 60) {
    recommendation = 'acceptable';
  } else if (score < 80) {
    recommendation = 'good';
  } else {
    recommendation = 'excellent';
  }
  
  return { score, recommendation, reasons };
}

/**
 * Filter URLs based on quality potential before crawling
 */
export function shouldCrawlBasedOnUrl(url: string): boolean {
  const urlLower = url.toLowerCase();
  
  // Skip obvious low-quality paths
  const skipPaths = [
    '/login', '/logout', '/signin', '/signup', '/register',
    '/cart', '/checkout', '/payment', '/billing',
    '/admin', '/dashboard', '/settings', '/profile',
    '/search', '/filter', '/sort', '/compare',
    '/404', '/500', '/error'
  ];
  
  if (skipPaths.some(path => urlLower.includes(path))) {
    return false;
  }
  
  // Skip URLs with problematic parameters
  const skipParams = ['utm_', 'fbclid', 'gclid', 'ref=', 'redirect='];
  if (skipParams.some(param => urlLower.includes(param))) {
    return false;
  }
  
  // Skip very long URLs (often auto-generated)
  if (url.length > 300) {
    return false;
  }
  
  return true;
}