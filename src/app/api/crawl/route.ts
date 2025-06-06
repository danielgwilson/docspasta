import { NextRequest, NextResponse } from 'next/server';
import { startCrawl } from '@/lib/crawler';

interface CrawlRequest {
  url: string;
}

interface CrawlResponse {
  success: boolean;
  data?: {
    id: string;
    url: string;
    status: 'started' | 'processing' | 'completed' | 'error';
    markdown?: string;
    error?: string;
  };
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<CrawlResponse>> {
  try {
    const body: CrawlRequest = await request.json();
    const { url } = body;

    // Validate URL
    if (!url || typeof url !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'URL is required and must be a string'
      }, { status: 400 });
    }

    // Basic URL validation
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Invalid URL format'
      }, { status: 400 });
    }

    // Easter egg: Check if user is trying to crawl docspasta.com
    if (parsedUrl.hostname.includes('docspasta.com')) {
      const crawlId = `farewell_${Date.now()}_v1`;
      
      return NextResponse.json({
        success: true,
        data: {
          id: crawlId,
          url,
          status: 'started'
        }
      });
    }

    // Start actual crawl using the sophisticated V1 engine
    try {
      const crawlId = await startCrawl(url, {
        maxPages: 200, // COMPREHENSIVE coverage - get ALL the docs for LLM context
        maxDepth: 4,   // Deep crawling for complete documentation trees
        followExternalLinks: false,
        respectRobots: true,
        delayMs: 300, // Fast but respectful
        qualityThreshold: 20 // Lower threshold to capture more content
      });
      
      console.log(`Started crawl with ID: ${crawlId}`);
      
      return NextResponse.json({
        success: true,
        data: {
          id: crawlId,
          url,
          status: 'started'
        }
      });
    } catch (startError) {
      console.error('Error starting crawl:', startError);
      return NextResponse.json({
        success: false,
        error: `Failed to start crawl: ${startError instanceof Error ? startError.message : 'Unknown error'}`
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Crawl API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}