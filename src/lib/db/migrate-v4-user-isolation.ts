#!/usr/bin/env tsx
/**
 * Migration script to add user isolation to V4 schema
 * Run with: pnpm tsx src/lib/db/migrate-v4-user-isolation.ts
 */

import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') })

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL_UNPOOLED
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL_UNPOOLED environment variable is required')
  }
  
  console.log('🚀 Starting V4 user isolation migration...')
  
  const sql = neon(databaseUrl)
  
  try {
    // Execute each migration step separately
    console.log('📝 Executing migration...')
    
    // 1. Add user_id to jobs table
    console.log('  Adding user_id to jobs table...')
    const jobsCheck = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'jobs' AND column_name = 'user_id'
    `
    
    if (jobsCheck.length === 0) {
      await sql`ALTER TABLE jobs ADD COLUMN user_id TEXT`
      await sql`CREATE INDEX idx_jobs_user_id ON jobs(user_id)`
      console.log('  ✅ Added user_id to jobs table')
    } else {
      console.log('  ⏭️  user_id already exists in jobs table')
    }
    
    // 2. Add user_id to url_cache table  
    console.log('  Adding user_id to url_cache table...')
    const cacheCheck = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'url_cache' AND column_name = 'user_id'
    `
    
    if (cacheCheck.length === 0) {
      await sql`ALTER TABLE url_cache ADD COLUMN user_id TEXT`
      
      // Drop old unique constraint and create new one
      await sql`ALTER TABLE url_cache DROP CONSTRAINT IF EXISTS url_cache_url_hash_key`
      await sql`ALTER TABLE url_cache ADD CONSTRAINT url_cache_user_url_unique UNIQUE (user_id, url_hash)`
      await sql`CREATE INDEX idx_url_cache_user_id ON url_cache(user_id)`
      console.log('  ✅ Added user_id to url_cache table')
    } else {
      console.log('  ⏭️  user_id already exists in url_cache table')
    }
    
    // 3. Add user_id to job_queue table
    console.log('  Adding user_id to job_queue table...')  
    const queueCheck = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'job_queue' AND column_name = 'user_id'
    `
    
    if (queueCheck.length === 0) {
      await sql`ALTER TABLE job_queue ADD COLUMN user_id TEXT`
      await sql`CREATE INDEX idx_job_queue_user_id ON job_queue(user_id)`
      console.log('  ✅ Added user_id to job_queue table')
    } else {
      console.log('  ⏭️  user_id already exists in job_queue table')
    }
    
    // 4. Add user_id to sse_events table
    console.log('  Adding user_id to sse_events table...')
    const sseCheck = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'sse_events' AND column_name = 'user_id'
    `
    
    if (sseCheck.length === 0) {
      await sql`ALTER TABLE sse_events ADD COLUMN user_id TEXT`
      await sql`CREATE INDEX idx_sse_events_user_id ON sse_events(user_id)`
      console.log('  ✅ Added user_id to sse_events table')
    } else {
      console.log('  ⏭️  user_id already exists in sse_events table')
    }
    
    console.log('✅ Migration completed successfully!')
    
    // Verify the changes
    console.log('\n📊 Verifying migration...')
    
    const tables = ['jobs', 'url_cache', 'job_queue', 'sse_events']
    for (const table of tables) {
      const result = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = ${table} 
        AND column_name = 'user_id'
      `
      
      if (result.length > 0) {
        console.log(`✅ ${table} table has user_id column`)
      } else {
        console.log(`❌ ${table} table is missing user_id column`)
      }
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

// Run migration
migrate().catch(console.error)