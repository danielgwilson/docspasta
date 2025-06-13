import type { Config } from 'drizzle-kit'

/**
 * Drizzle Kit configuration for database migrations
 * Supports both development and production environments with Neon PostgreSQL
 */

export default {
  // Schema location
  schema: './src/lib/db/schema.ts',
  
  // Output directory for generated migrations
  out: './drizzle/migrations',
  
  // Database driver
  dialect: 'postgresql',
  
  // Database credentials
  dbCredentials: {
    url: process.env.DATABASE_URL || process.env.POSTGRES_URL!,
  },
  
  // Additional configuration
  verbose: true, // Enable verbose logging during migrations
  strict: true,  // Enable strict mode for safer migrations
  
  // Introspection configuration
  introspect: {
    casing: 'camel', // Use camelCase for TypeScript
  },
  
  // Migration configuration
  migrations: {
    prefix: 'timestamp', // Use timestamp prefix for migration files
  },
} satisfies Config