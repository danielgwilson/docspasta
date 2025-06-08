/**
 * Web Crawler Adapter for Queue System
 * Provides simple interface for queue-based crawling
 */

import { JSDOM } from 'jsdom'
import { normalizeUrl, isValidDocumentationUrl } from './url-utils'
import { extractContent, extractTitle } from './content-extractor'
import { crawlSitemaps } from './sitemap'
import type { CrawlOptions } from './types'

export interface CrawlPageResult {
  success: boolean
  content?: string
  title?: string
  links?: string[]
  error?: string
}

export class WebCrawler {
  private userAgent = 'DocspastaCrawler/2.0 (+https://github.com/user/docspasta)'

  /**
   * Discover URLs from sitemap and robots.txt
   */
  async discoverURLs(startUrl: string, options: CrawlOptions): Promise<string[]> {
    console.log(`🔍 Discovering URLs from: ${startUrl}`)
    
    try {
      const baseUrl = new URL(startUrl).origin
      const discoveredUrls: string[] = []
      
      // Add the starting URL
      discoveredUrls.push(startUrl)
      
      // Phase 1: Sitemap discovery (limited for performance)
      if (options.respectRobotsTxt !== false) {
        try {
          // Strict limit for performance - documentation sites rarely need more than 50 pages
          const maxUrls = options.maxPages || 50
          const sitemapResult = await crawlSitemaps(baseUrl, 3, maxUrls) // Pass maxUrls to sitemap crawler!
          console.log(`🗺️  Found ${sitemapResult.urls.length} URLs in sitemap`)
          
          // Filter and validate URLs BEFORE adding to prevent overflow
          let addedCount = 0
          for (const url of sitemapResult.urls) {
            if (addedCount >= maxUrls - 1) break // Leave room for startUrl
            if (this.isUrlAllowed(url, startUrl, options)) {
              discoveredUrls.push(url)
              addedCount++
            }
          }
          
          // 🚀 FIX: If no sitemap URLs found, we need link discovery later
          if (sitemapResult.urls.length === 0) {
            console.log(`🔗 No sitemap found - will rely on link discovery during crawling`)
          }
        } catch (sitemapError) {
          console.warn('⚠️  Sitemap discovery failed:', sitemapError)
        }
      }
      
      // Remove duplicates and apply strict limit
      const uniqueUrls = [...new Set(discoveredUrls)]
      const maxPages = options.maxPages || 50
      const limited = uniqueUrls.slice(0, maxPages)
      
      // 🚀 ENHANCED: Log discovery strategy for debugging
      if (limited.length === 1) {
        console.log(`🔗 Only starting URL found - link discovery will be crucial for finding more pages`)
        console.log(`📊 Current maxDepth: ${options.maxDepth || 2} - consider increasing for better coverage`)
      }
      
      console.log(`✨ Discovered ${limited.length} URLs to crawl`)
      return limited
    } catch (error) {
      console.error('❌ URL discovery failed:', error)
      return [startUrl] // Fallback to just the starting URL
    }
  }

  /**
   * Crawl a single page
   */
  async crawlPage(url: string, options: CrawlOptions): Promise<CrawlPageResult> {
    console.log(`📄 Crawling page: ${url}`)
    
    try {
      // Create AbortController for timeout
      const controller = new AbortController()
      const timeout = setTimeout(() => {
        controller.abort()
      }, options.timeout || 8000) // Use the timeout from API configuration

      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      const html = await response.text()
      const dom = new JSDOM(html, { url })
      const document = dom.window.document

      // Extract content and title
      const content = extractContent(document)
      const title = extractTitle(document) || 'Unknown'

      // Extract links for dynamic discovery (re-enabled for realistic crawling)
      const links = this.extractLinks(document, url, options)
      
      // DEBUG: Always log link extraction 
      process.stderr.write(`🔗 WEB-CRAWLER DEBUG - Links extracted from ${url}: ${links.length}\n`)

      return {
        success: true,
        content,
        title,
        links,
      }
    } catch (error) {
      console.error(`❌ Failed to crawl ${url}:`, error)
      
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timeout',
        }
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Extract links from page for dynamic discovery
   */
  private extractLinks(document: Document, currentUrl: string, options: CrawlOptions): string[] {
    const links: string[] = []
    const linkElements = document.querySelectorAll('a[href]')
    const baseUrl = new URL(currentUrl).origin

    for (const linkEl of linkElements) {
      try {
        const href = linkEl.getAttribute('href')
        if (!href) continue

        // Convert relative URLs to absolute
        let absoluteUrl: string
        if (href.startsWith('http')) {
          absoluteUrl = href
        } else if (href.startsWith('/')) {
          absoluteUrl = baseUrl + href
        } else {
          absoluteUrl = new URL(href, currentUrl).href
        }

        // Normalize and validate
        const normalizedUrl = normalizeUrl(absoluteUrl, baseUrl, false)
        
        if (normalizedUrl && this.isUrlAllowed(normalizedUrl, baseUrl, options)) {
          links.push(normalizedUrl)
        }
      } catch {
        // Skip invalid URLs
        continue
      }
    }

    // Remove duplicates and limit
    const uniqueLinks = [...new Set(links)]
    console.log(`🔗 Found ${uniqueLinks.length} valid links on ${currentUrl}`)
    
    return uniqueLinks
  }

  /**
   * Check if URL is allowed based on options
   */
  private isUrlAllowed(url: string, baseUrl: string, options: CrawlOptions): boolean {
    try {
      const urlObj = new URL(url)
      const baseUrlObj = new URL(baseUrl)

      // Check external links - default to not following external links
      if (urlObj.origin !== baseUrlObj.origin) {
        return false
      }

      // Check if it's a valid documentation URL
      if (!isValidDocumentationUrl(url)) {
        return false
      }

      // Check include patterns
      if (options.includePatterns && options.includePatterns.length > 0) {
        const matches = options.includePatterns.some(pattern => {
          try {
            return new RegExp(pattern).test(url)
          } catch {
            return url.includes(pattern) // Fallback to simple string match
          }
        })
        if (!matches) return false
      }

      // Check exclude patterns
      if (options.excludePatterns && options.excludePatterns.length > 0) {
        const excluded = options.excludePatterns.some(pattern => {
          try {
            return new RegExp(pattern).test(url)
          } catch {
            return url.includes(pattern) // Fallback to simple string match
          }
        })
        if (excluded) return false
      }

      return true
    } catch {
      return false
    }
  }
}