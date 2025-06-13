import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'
import { readFileSync } from 'fs'
import path from 'path'

// Load environment variables
config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL_UNPOOLED!)

async function nuclearReset() {
  console.log('🚨 NUCLEAR DATABASE RESET - Starting...')
  console.log('⚠️  This will DROP ALL TABLES and recreate from scratch')
  console.log('')
  
  try {
    // Drop all existing tables (cascade removes dependencies)
    console.log('💥 Dropping existing tables...')
    await sql`DROP TABLE IF EXISTS job_urls_v3 CASCADE`
    await sql`DROP TABLE IF EXISTS crawl_jobs_v3 CASCADE`
    await sql`DROP TABLE IF EXISTS crawl_jobs CASCADE`
    await sql`DROP TABLE IF EXISTS sse_events CASCADE`
    await sql`DROP TABLE IF EXISTS crawl_queue CASCADE`
    await sql`DROP TABLE IF EXISTS job_queue CASCADE`
    await sql`DROP TABLE IF EXISTS url_cache CASCADE`
    await sql`DROP TABLE IF EXISTS jobs CASCADE`
    
    console.log('✅ Existing tables dropped')
    
    // Read and execute new schema
    const schemaPath = path.join(__dirname, '..', 'src', 'lib', 'db', 'schema-v4.sql')
    const schemaSQL = readFileSync(schemaPath, 'utf8')
    
    // Execute schema (split by semicolon for multiple statements)
    const statements = schemaSQL.split(';').filter(s => s.trim())
    console.log(`📝 Creating ${statements.length} new database objects...`)
    
    for (const statement of statements) {
      if (statement.trim()) {
        await sql(statement)
      }
    }
    
    console.log('✨ New schema created successfully')
    
    // Quick verification
    const tables = await sql`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `
    
    console.log('\n📊 New tables created:')
    tables.forEach(t => console.log(`   - ${t.tablename}`))
    
    console.log('\n🎯 Database reset complete - ready for new implementation')
    
  } catch (error) {
    console.error('❌ Reset failed:', error)
    process.exit(1)
  }
}

// Add confirmation prompt
const readline = require('readline')
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

rl.question('⚠️  Are you sure you want to NUCLEAR RESET the database? (yes/no): ', (answer) => {
  if (answer.toLowerCase() === 'yes') {
    rl.close()
    nuclearReset()
  } else {
    console.log('❌ Reset cancelled')
    rl.close()
    process.exit(0)
  }
})