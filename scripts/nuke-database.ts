/**
 * Nuclear Database Reset - V5 Clean Slate
 * Drops all tables and recreates with new schema
 */

import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { sql } from 'drizzle-orm'

// Load environment variables
config({ path: '.env.local' })

// Direct connection for destructive operations
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL
if (!connectionString) {
  console.error('Available env vars:', Object.keys(process.env).filter(key => key.includes('DATABASE') || key.includes('POSTGRES')))
  throw new Error('DATABASE_URL not found - check .env.local')
}

const client = postgres(connectionString, { ssl: 'require' })
const db = drizzle(client)

async function nukeDatabase() {
  console.log('🔥 NUCLEAR DATABASE RESET - V5 CLEAN SLATE')
  
  try {
    // Drop all existing tables (ignore if they don't exist)
    const tablesToDrop = [
      'page_content_chunks',
      'crawled_pages', 
      'crawling_jobs',
      'processed_content',
      'raw_content', 
      'urls',
      'jobs',
      'sse_events' // Old event table
    ]
    
    for (const table of tablesToDrop) {
      try {
        await db.execute(sql.raw(`DROP TABLE IF EXISTS ${table} CASCADE`))
        console.log(`✅ Dropped table: ${table}`)
      } catch (error) {
        console.log(`⚠️ Could not drop ${table}:`, error.message)
      }
    }
    
    // Drop enums that might exist
    const enumsToDrop = [
      'job_status',
      'page_status'
    ]
    
    for (const enumType of enumsToDrop) {
      try {
        await db.execute(sql.raw(`DROP TYPE IF EXISTS ${enumType} CASCADE`))
        console.log(`✅ Dropped enum: ${enumType}`)
      } catch (error) {
        console.log(`⚠️ Could not drop enum ${enumType}:`, error.message)
      }
    }
    
    console.log('🎉 Database successfully nuked! Ready for V5 schema.')
    
  } catch (error) {
    console.error('❌ Nuclear reset failed:', error)
    throw error
  } finally {
    await client.end()
  }
}

// Execute if run directly
if (require.main === module) {
  nukeDatabase().catch(console.error)
}

export { nukeDatabase }