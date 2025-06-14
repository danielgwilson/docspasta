#!/usr/bin/env node

/**
 * Migration script to upgrade database from V3 to V4 schema
 * Run this once to create the new V4 tables
 */

import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'
import { join } from 'path'

async function migrateToV4() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED)
  
  console.log('🚀 Starting V4 migration...')
  
  try {
    // Read the V4 schema
    const schemaPath = join(process.cwd(), 'src/lib/db/schema-v4.sql')
    const schema = readFileSync(schemaPath, 'utf-8')
    
    // Execute the schema (CREATE TABLE IF NOT EXISTS would be safer, but the schema doesn't use it)
    // Split by semicolon and execute each statement
    const statements = schema.split(';').filter(stmt => stmt.trim().length > 0)
    
    for (const statement of statements) {
      const cleanStatement = statement.trim()
      if (cleanStatement) {
        console.log(`📝 Executing: ${cleanStatement.substring(0, 50)}...`)
        try {
          await sql.unsafe(cleanStatement)
        } catch (error) {
          // If table already exists, that's okay
          if (error.message?.includes('already exists')) {
            console.log(`✅ Table already exists - skipping`)
          } else {
            throw error
          }
        }
      }
    }
    
    console.log('✅ V4 migration completed successfully!')
    console.log('')
    console.log('V4 Tables created:')
    console.log('  - jobs (main job tracking)')
    console.log('  - job_queue (URLs to process)')  
    console.log('  - url_cache (content deduplication)')
    console.log('  - sse_events (resumable streams)')
    console.log('')
    console.log('🎉 Your crawling should now work correctly!')
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

// Run migration
migrateToV4()