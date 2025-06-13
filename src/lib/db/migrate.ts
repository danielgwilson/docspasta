/**
 * Database migration script for Neon PostgreSQL
 * Following Neon's recommended approach using direct connections
 * 
 * CRITICAL: This uses DATABASE_URL_UNPOOLED for direct (non-pooled) connection
 * as recommended by Neon docs for migrations to avoid session state issues
 */

import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import { migrate } from 'drizzle-orm/neon-http/migrator'
import { readFileSync } from 'fs'
import { join } from 'path'

// Load environment variables manually (tsx doesn't use Next.js env loading)
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
      break // Use first available env file
    } catch (error) {
      // File doesn't exist, try next one
      continue
    }
  }
}

async function main() {
  try {
    // Load environment variables first
    loadEnvVars()
    
    // Use unpooled connection for migrations (Neon best practice)
    const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
    
    if (!connectionString) {
      throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL environment variable is required')
    }
    
    console.log('🔗 Connecting to Neon PostgreSQL for migration...')
    console.log('📍 Using connection:', connectionString.replace(/\/\/.*@/, '//***:***@'))
    
    const sql = neon(connectionString)
    const db = drizzle(sql)
    
    console.log('🚀 Starting database migration...')
    
    await migrate(db, { 
      migrationsFolder: './drizzle/migrations'
    })
    
    console.log('✅ Migration completed successfully!')
    
  } catch (error) {
    console.error('❌ Error during migration:', error)
    
    if (error instanceof Error) {
      console.error('Error message:', error.message)
      if (error.stack) {
        console.error('Stack trace:', error.stack)
      }
    }
    
    process.exit(1)
  }
}

// Run migration
main()