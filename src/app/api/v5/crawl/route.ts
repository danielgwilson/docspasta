import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/middleware'
import { publishStartCrawlJob } from '@/lib/queue/operations'

import { newCrawlingJobSchema } from '@/lib/db/schema'
import { db } from '@/lib/db/connection'
import { crawlingJobs } from '@/lib/db/schema'
import { z } from 'zod'

export async function POST(request: NextRequest) {
  try {
    const user = await getUserContext(request)
    const body = await request.json()
    
    // Validate request
    const { url, config } = newCrawlingJobSchema.parse(body)
    
    // Generate unique job ID
    const jobId = crypto.randomUUID()
    
    // Use config defaults if not provided
    const defaultConfig = {
      maxDepth: 2,
      maxPages: 50,
      qualityThreshold: 20,
      respectRobots: true,
      followSitemaps: true,
    }
    const finalConfig = { ...defaultConfig, ...config }
    
    // Create database record
    const [job] = await db.insert(crawlingJobs).values({
      id: jobId,
      userId: user.userId,
      url,
      config: finalConfig,
      status: 'pending',
      stateVersion: 1,
      progressSummary: {
        totalProcessed: 0,
        totalDiscovered: 0,
        totalWords: 0,
        discoveredUrls: 0,
        failedUrls: 0
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning()
    
    // Publish start-crawl job to QStash
    await publishStartCrawlJob({
      jobId,
      userId: user.userId,
      url,
      maxPages: finalConfig.maxPages,
      maxDepth: finalConfig.maxDepth,
      qualityThreshold: finalConfig.qualityThreshold,
      forceRefresh: false
    })
    
    // Return job ID immediately (202 Accepted)
    return NextResponse.json(
      {
        success: true,
        jobId,
        url,
        status: 'pending',
        message: 'Crawl job created and queued for processing'
      },
      { status: 202 }
    )
    
  } catch (error) {
    console.error('❌ [V5] Failed to create crawl job:', error)
    
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          details: error.errors
        },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create crawl job'
      },
      { status: 500 }
    )
  }
}