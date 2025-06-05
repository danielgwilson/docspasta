import { NextRequest, NextResponse } from 'next/server';
import { getCrawlResult } from '@/lib/crawler';

interface CrawlStatusResponse {
  success: boolean;
  data?: {
    id: string;
    url: string;
    status: 'started' | 'processing' | 'completed' | 'error';
    progress?: number;
    markdown?: string;
    error?: string;
    title?: string;
    metadata?: {
      totalPages?: number;
      totalTokens?: number;
      crawlDate: string;
    };
    createdAt: string;
    completedAt?: string;
  };
  error?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<CrawlStatusResponse>> {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Crawl ID is required'
      }, { status: 400 });
    }

    // Check if this is the farewell easter egg
    if (id.startsWith('farewell_')) {
      const farewellMarkdown = `# 🥲 FAREWELL TO DOCSPASTA V1 

*You beautiful, sophisticated piece of software...*

\`\`\`
┌─────────────────────────────────────────┐
│                                         │
│  🍝 Thank you for your service, V1 🍝   │
│                                         │
│  You crawled thousands of docs          │  
│  You handled edge cases like a champ    │
│  You had enterprise-level caching       │
│  You streamed progress in real-time     │
│  You were never just "vibe code"        │
│                                         │
│  Now rest, while your engine lives on   │
│  in Docspasta V2.0 🚀                   │
│                                         │
│  - Claude Code, with deep respect       │
│                                         │
└─────────────────────────────────────────┘
\`\`\`

## 🏆 V1'S LEGACY LIVES ON

\`\`\`typescript
// These functions are IMMORTAL:
✅ normalizeUrl() 
✅ extractContent()
✅ CodeBlockHandler
✅ Advanced caching
✅ Progress streaming
✅ Token counting
✅ Copy/Export UX patterns
\`\`\`

---

*This message appears when you try to crawl docspasta.com itself - a little easter egg to honor the original! 💕*

**Implementation note**: When detecting \`docspasta.com\` in the URL input, show this as a special result instead of actually crawling.`;

      const farewellStatus = {
        id,
        url: 'https://docspasta.com',
        status: 'completed' as const,
        progress: 100,
        markdown: farewellMarkdown,
        title: 'Farewell to Docspasta V1',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      };

      return NextResponse.json({
        success: true,
        data: farewellStatus
      });
    }

    // Get actual crawl result from storage
    console.log(`Looking for crawl ID: ${id}`);
    const crawlResult = getCrawlResult(id);
    console.log(`Found crawl result:`, crawlResult ? 'YES' : 'NO');
    
    if (!crawlResult) {
      return NextResponse.json({
        success: false,
        error: 'Crawl not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: crawlResult
    });

  } catch (error) {
    console.error('Crawl status API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}