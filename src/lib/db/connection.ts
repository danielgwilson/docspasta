import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'

/**
 * Production-ready Neon PostgreSQL connection with Drizzle ORM
 * Handles pooled connections, edge runtime compatibility, and environment-specific configuration
 */

// Get the appropriate database URL based on environment
function getDatabaseUrl(): string {
  // In production/Vercel, prefer pooled connection for better performance
  if (process.env.NODE_ENV === 'production') {
    return process.env.DATABASE_URL || process.env.POSTGRES_URL!
  }
  
  // In development, use the development database URL
  return process.env.DATABASE_URL || process.env.POSTGRES_URL!
}

// Create Neon HTTP client for edge runtime compatibility
const sql = neon(getDatabaseUrl())

// Create Drizzle instance with schema
export const db = drizzle(sql, { schema })

/**
 * Health check function to verify database connectivity
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    // Simple query to test connection
    await sql`SELECT 1 as health_check`
    return true
  } catch (error) {
    console.error('Database connection failed:', error)
    return false
  }
}

/**
 * Get database connection info for debugging
 */
export function getDatabaseInfo() {
  const url = getDatabaseUrl()
  const maskedUrl = url.replace(/:([^:@]+)@/, ':***@') // Mask password for logging
  
  return {
    environment: process.env.NODE_ENV,
    connectionUrl: maskedUrl,
    hasPooledUrl: !!process.env.DATABASE_URL,
    hasUnpooledUrl: !!process.env.DATABASE_URL_UNPOOLED,
  }
}

// Export types for convenience
export type Database = typeof db
export * from './schema'