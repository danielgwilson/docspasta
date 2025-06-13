/**
 * Database reset script - drops all tables for clean slate
 * DANGER: This will delete ALL data in the database
 */

import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'
import { join } from 'path'

// Load environment variables manually
function loadEnvVars() {
  const envFiles = ['.env.local', '.env.test', '.env']
  
  for (const envFile of envFiles) {
    try {
      const envPath = join(process.cwd(), envFile)
      const envContent = readFileSync(envPath, 'utf8')
      
      envContent.split('\n').forEach(line => {
        const trimmedLine = line.trim()
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const [key, ...valueParts] = trimmedLine.split('=')
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').replace(/^["']|["']$/g, '')
            process.env[key] = value
          }
        }
      })
      
      console.log(`📁 Loaded environment from ${envFile}`)
      break
    } catch (error) {
      continue
    }
  }
}

async function main() {
  try {
    loadEnvVars()
    
    const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
    
    if (!connectionString) {
      throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL environment variable is required')
    }
    
    console.log('🔗 Connecting to Neon PostgreSQL for reset...')
    console.log('📍 Using connection:', connectionString.replace(/\/\/.*@/, '//***:***@'))
    
    const sql = neon(connectionString)
    const db = drizzle(sql)
    
    console.log('🗑️  Dropping existing tables...')
    
    // Drop tables in correct order (foreign keys first)
    await sql`DROP TABLE IF EXISTS sse_events CASCADE`
    await sql`DROP TABLE IF EXISTS crawl_jobs CASCADE`
    await sql`DROP TABLE IF EXISTS __drizzle_migrations CASCADE`
    
    console.log('✅ Database reset completed - all tables dropped!')
    console.log('🔄 Run "pnpm db:generate && pnpm db:migrate" to recreate with optimized schema')
    
  } catch (error) {
    console.error('❌ Error during reset:', error)
    process.exit(1)
  }
}

main()