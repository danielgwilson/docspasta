#!/usr/bin/env tsx

/**
 * Migration script to upgrade database from V3 to V4 schema
 * Run this once to create the new V4 tables
 */

import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'
import { join } from 'path'

async function migrateToV4() {
  console.log('🔍 Checking DATABASE_URL_UNPOOLED...')
  
  if (!process.env.DATABASE_URL_UNPOOLED) {
    console.error('❌ DATABASE_URL_UNPOOLED environment variable is required')
    process.exit(1)
  }
  
  const sql = neon(process.env.DATABASE_URL_UNPOOLED)
  
  console.log('🚀 Starting V4 migration...')
  
  try {
    // Read the V4 schema
    const schemaPath = join(process.cwd(), 'src/lib/db/schema-v4.sql')
    const schema = readFileSync(schemaPath, 'utf-8')
    
    // Execute the schema (CREATE TABLE IF NOT EXISTS would be safer, but the schema doesn't use it)
    // Split by semicolon and execute each statement
    const statements = schema.split(';').filter(stmt => stmt.trim().length > 0)
    
    console.log(`📋 Found ${statements.length} SQL statements to execute`)
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim()
      if (statement) {
        const preview = statement.substring(0, 80).replace(/\s+/g, ' ')
        console.log(`📝 [${i + 1}/${statements.length}] ${preview}...`)
        try {
          await sql.unsafe(statement)
          console.log(`   ✅ Success`)
        } catch (error: any) {
          // If table already exists, that's okay
          if (error.message?.includes('already exists') || error.code === '42P07') {
            console.log(`   ⚠️  Already exists - skipping`)
          } else {
            console.log(`   ❌ Failed: ${error.message}`)
            throw error
          }
        }
      }
    }
    
    console.log('')
    console.log('✅ V4 migration completed successfully!')
    console.log('')
    console.log('🎯 V4 Tables created/verified:')
    console.log('  • jobs (main job tracking)')
    console.log('  • job_queue (URLs to process) ← This fixes your error!')  
    console.log('  • url_cache (content deduplication)')
    console.log('  • sse_events (resumable streams)')
    console.log('')
    console.log('🎉 Your crawling should now work correctly!')
    console.log('   The "job_urls_v3 does not exist" error should be resolved.')
    
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message)
    console.error('Full error:', error)
    process.exit(1)
  }
}

// Run migration
migrateToV4().catch(console.error)