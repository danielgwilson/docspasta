import TurndownService from 'turndown'

interface CrawlResult {
  success: boolean
  content?: string
  title?: string
  links?: string[]
  error?: string
}

interface CrawlOptions {
  timeout?: number
  qualityThreshold?: number
}

export class WebCrawler {
  private turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  })

  async crawlPage(url: string, options: CrawlOptions = {}): Promise<CrawlResult> {
    const { timeout = 8000 } = options

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Docspasta/2.0)',
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      const html = await response.text()
      
      // Basic HTML parsing
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      const title = titleMatch ? titleMatch[1].trim() : 'Untitled'

      // Extract links
      const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi
      const links: string[] = []
      let match
      
      while ((match = linkRegex.exec(html)) !== null) {
        try {
          const link = new URL(match[1], url).href
          if (link.startsWith('http') && !link.includes('#')) {
            links.push(link)
          }
        } catch {
          // Invalid URL, skip
        }
      }

      // Convert to markdown
      const markdown = this.turndown.turndown(html)

      return {
        success: true,
        content: markdown,
        title,
        links: [...new Set(links)], // Remove duplicates
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: `Timeout after ${timeout}ms`,
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}