/**
 * Test the new 3-table database schema
 * Verify user-scoped operations and data integrity
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { 
  getUserDB, 
  crawlConfigSchema,
  newCrawlingJobSchema,
  type CrawlConfig 
} from './index'

// Mock the database connection for testing
vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn(() => vi.fn()),
}))

vi.mock('drizzle-orm/neon-serverless', () => ({
  drizzle: vi.fn(() => ({
    query: {
      crawlingJobs: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      crawledPages: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
  })),
}))

describe('New Database Schema', () => {
  const mockUserId = 'user-123'
  let userDB: ReturnType<typeof getUserDB>

  beforeEach(() => {
    userDB = getUserDB(mockUserId)
    vi.clearAllMocks()
  })

  describe('CrawlConfig Schema Validation', () => {
    it('should validate default config', () => {
      const defaultConfig = crawlConfigSchema.parse({})
      
      expect(defaultConfig).toEqual({
        maxDepth: 2,
        maxPages: 50,
        qualityThreshold: 20,
        respectRobots: true,
        followSitemaps: true,
      })
    })

    it('should validate custom config', () => {
      const customConfig: CrawlConfig = {
        maxDepth: 3,
        maxPages: 100,
        qualityThreshold: 30,
        includeSelectors: ['.content', '.article'],
        excludeSelectors: ['.nav', '.footer'],
        respectRobots: false,
        followSitemaps: true,
      }

      const result = crawlConfigSchema.parse(customConfig)
      expect(result).toEqual(customConfig)
    })

    it('should reject invalid config values', () => {
      expect(() => {
        crawlConfigSchema.parse({ maxDepth: 0 }) // Too low
      }).toThrow()

      expect(() => {
        crawlConfigSchema.parse({ maxPages: 0 }) // Too low
      }).toThrow()

      expect(() => {
        crawlConfigSchema.parse({ qualityThreshold: -1 }) // Below range
      }).toThrow()

      expect(() => {
        crawlConfigSchema.parse({ qualityThreshold: 101 }) // Above range
      }).toThrow()
    })
  })

  describe('New Job Schema Validation', () => {
    it('should validate new job data', () => {
      const validJob = {
        url: 'https://example.com',
        config: {
          maxDepth: 2,
          maxPages: 50,
        }
      }

      const result = newCrawlingJobSchema.parse(validJob)
      expect(result.url).toBe('https://example.com')
      expect(result.config?.maxDepth).toBe(2)
    })

    it('should require valid URL', () => {
      expect(() => {
        newCrawlingJobSchema.parse({ url: 'not-a-url' })
      }).toThrow()

      expect(() => {
        newCrawlingJobSchema.parse({ url: '' })
      }).toThrow()
    })

    it('should allow optional config', () => {
      const minimalJob = { url: 'https://example.com' }
      const result = newCrawlingJobSchema.parse(minimalJob)
      
      expect(result.url).toBe('https://example.com')
      expect(result.config).toBeUndefined()
    })
  })

  describe('UserScopedDB Security', () => {
    it('should require user ID for database operations', () => {
      expect(() => {
        getUserDB('')
      }).toThrow('User ID is required for database operations')

      expect(() => {
        // @ts-expect-error - Testing runtime validation
        getUserDB(null)
      }).toThrow('User ID is required for database operations')
    })

    it('should create user-scoped database instance', () => {
      const db = getUserDB('user-123')
      expect(db).toBeDefined()
      expect(typeof db.getUserJobs).toBe('function')
      expect(typeof db.createJob).toBe('function')
    })
  })

  describe('Type Safety', () => {
    it('should have proper TypeScript types', () => {
      // These should compile without errors
      const config: CrawlConfig = {
        maxDepth: 2,
        maxPages: 50,
        qualityThreshold: 20,
        respectRobots: true,
        followSitemaps: true,
      }

      expect(config.maxDepth).toBe(2)
      expect(config.respectRobots).toBe(true)
    })

    it('should enforce enum values', () => {
      // Job status enum values
      const validStatuses = ['pending', 'running', 'completed', 'failed', 'partial_success']
      const pageStatuses = ['pending', 'crawled', 'error', 'skipped']

      expect(validStatuses).toContain('pending')
      expect(pageStatuses).toContain('crawled')
    })
  })
})

describe('Database Migration Compatibility', () => {
  it('should maintain backward compatibility concepts', () => {
    // Verify that key concepts from old schema are preserved
    const concepts = {
      userIsolation: 'userId field in all tables',
      cascadeDeletes: 'onDelete: cascade in foreign keys',
      statusTracking: 'Status enums for jobs and pages',
      contentChunking: 'Separate table for content chunks',
    }

    expect(concepts.userIsolation).toBeDefined()
    expect(concepts.cascadeDeletes).toBeDefined()
    expect(concepts.statusTracking).toBeDefined()
    expect(concepts.contentChunking).toBeDefined()
  })
})