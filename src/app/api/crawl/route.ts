// src/app/api/crawl/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/db';
import { sources, crawls } from '@/lib/db/schema';
import { qstash } from '@/lib/queue';
import { eq, and } from 'drizzle-orm';

const crawlRequestSchema = z.object({
  entrypointUrl: z.string().url(),
  prefixUrl: z.string().url(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { entrypointUrl, prefixUrl } = crawlRequestSchema.parse(body);

    // 1. Find or create the Source
    let sourceResult = await db.select().from(sources).where(
      and(
        eq(sources.entrypointUrl, entrypointUrl),
        eq(sources.prefixUrl, prefixUrl),
      )
    ).limit(1);

    let source;
    if (sourceResult.length === 0) {
      const newSources = await db
        .insert(sources)
        .values({ entrypointUrl, prefixUrl })
        .returning();
      source = newSources[0];
    } else {
      source = sourceResult[0];
    }

    // 2. Check for an already running crawl for this source
    const existingRunningCrawl = await db.query.crawls.findFirst({
        where: and(
            eq(crawls.sourceId, source.id),
            eq(crawls.state, 'running')
        )
    });

    if(existingRunningCrawl) {
        return NextResponse.json({
            message: "A crawl for this source is already in progress.",
            crawlId: existingRunningCrawl.id
        }, { status: 202 });
    }

    // 3. Create a new crawl record
    const [newCrawl] = await db
      .insert(crawls)
      .values({ sourceId: source.id, state: 'initial' })
      .returning();

    // 4. Enqueue the job to our QStash worker
    await qstash.publishJSON({
      // The API endpoint of our worker
      url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/crawl-worker`,
      body: {
        crawlId: newCrawl.id,
        sourceId: source.id,
      },
      // Give it a unique ID to prevent duplicate jobs on retries
      deduplicationId: newCrawl.id,
    });

    return NextResponse.json({
      message: 'Crawl initiated.',
      crawlId: newCrawl.id,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'An error occurred.' },
      { status: 500 },
    );
  }
}