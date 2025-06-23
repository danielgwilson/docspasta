import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

export async function GET(request: NextRequest) {
  try {
    const sql = neon(process.env.DATABASE_URL!)
    
    // Check all crawling jobs
    const jobs = await sql`
      SELECT id, user_id, url, status, created_at 
      FROM crawling_jobs 
      ORDER BY created_at DESC 
      LIMIT 5
    `
    
    // Check table counts
    const counts = await sql`
      SELECT 
        (SELECT COUNT(*) FROM crawling_jobs) as jobs_count,
        (SELECT COUNT(*) FROM crawled_pages) as pages_count,
        (SELECT COUNT(*) FROM page_content_chunks) as chunks_count
    `
    
    // Check database connection
    const dbInfo = await sql`SELECT current_database(), current_user, version()`
    
    return NextResponse.json({
      success: true,
      database: dbInfo[0],
      counts: counts[0],
      recentJobs: jobs.map(job => ({
        id: job.id,
        userId: job.user_id,
        url: job.url,
        status: job.status,
        createdAt: job.created_at
      })),
      message: "V5 database schema is working!"
    })
    
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}



