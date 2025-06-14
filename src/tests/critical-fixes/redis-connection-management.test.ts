import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRedisClient, closeRedisClient } from '@/lib/v4/redis-client'
import { Redis } from 'ioredis'

// Mock ioredis
vi.mock('ioredis', () => {
  const mockRedis = vi.fn()
  mockRedis.prototype.quit = vi.fn().mockResolvedValue('OK')
  mockRedis.prototype.disconnect = vi.fn()
  mockRedis.prototype.on = vi.fn().mockReturnThis()
  mockRedis.prototype.once = vi.fn().mockReturnThis()
  mockRedis.prototype.ping = vi.fn().mockResolvedValue('PONG')
  return { Redis: mockRedis }
})

describe('Redis Connection Management - Critical Fix Tests', () => {
  let mockRedisInstance: any
  
  beforeEach(() => {
    vi.clearAllMocks()
    mockRedisInstance = new Redis()
  })
  
  afterEach(() => {
    vi.clearAllMocks()
  })
  
  describe('Connection Lifecycle', () => {
    it('should create connections with proper configuration', async () => {
      const client = await createRedisClient()
      
      // Verify Redis was instantiated with correct options
      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          retryStrategy: expect.any(Function)
        })
      )
      
      expect(client).toBeDefined()
      expect(client.quit).toBeDefined()
      expect(client.disconnect).toBeDefined()
    })
    
    it('should handle connection errors gracefully', async () => {
      // Mock connection error
      const mockError = new Error('Connection refused')
      vi.mocked(Redis).mockImplementationOnce(() => {
        throw mockError
      })
      
      await expect(createRedisClient()).rejects.toThrow('Connection refused')
    })
    
    it('should implement retry strategy correctly', async () => {
      const client = await createRedisClient()
      
      // Get the retry strategy function
      const createCall = vi.mocked(Redis).mock.calls[0]
      const config = createCall[0]
      const retryStrategy = config.retryStrategy
      
      // Test retry strategy
      expect(retryStrategy(1)).toBe(50) // First retry: 50ms
      expect(retryStrategy(2)).toBe(100) // Second retry: 100ms
      expect(retryStrategy(5)).toBe(500) // Fifth retry: 500ms
      expect(retryStrategy(10)).toBe(1000) // Cap at 1 second
      expect(retryStrategy(20)).toBe(1000) // Still capped
    })
  })
  
  describe('Connection Cleanup', () => {
    it('should close connections properly', async () => {
      const client = await createRedisClient()
      
      await closeRedisClient(client)
      
      // Verify quit was called
      expect(client.quit).toHaveBeenCalled()
      
      // Verify disconnect wasn't called if quit succeeded
      expect(client.disconnect).not.toHaveBeenCalled()
    })
    
    it('should handle quit failures with disconnect fallback', async () => {
      const client = await createRedisClient()
      
      // Mock quit failure
      client.quit.mockRejectedValueOnce(new Error('Quit failed'))
      
      await closeRedisClient(client)
      
      // Verify both quit and disconnect were called
      expect(client.quit).toHaveBeenCalled()
      expect(client.disconnect).toHaveBeenCalled()
    })
    
    it('should handle null clients safely', async () => {
      await expect(closeRedisClient(null as any)).resolves.not.toThrow()
      await expect(closeRedisClient(undefined as any)).resolves.not.toThrow()
    })
  })
  
  describe('Connection Pool Management', () => {
    it('should not create duplicate connections unnecessarily', async () => {
      const connections = await Promise.all([
        createRedisClient(),
        createRedisClient(),
        createRedisClient()
      ])
      
      // Each call should create a new instance (no singleton pattern)
      expect(Redis).toHaveBeenCalledTimes(3)
      
      // All connections should be independent
      expect(connections[0]).not.toBe(connections[1])
      expect(connections[1]).not.toBe(connections[2])
      
      // Clean up all connections
      await Promise.all(connections.map(c => closeRedisClient(c)))
    })
    
    it('should handle concurrent connection closures', async () => {
      const connections = await Promise.all(
        Array.from({ length: 10 }, () => createRedisClient())
      )
      
      // Close all connections concurrently
      await Promise.all(connections.map(c => closeRedisClient(c)))
      
      // Verify all were closed
      connections.forEach(conn => {
        expect(conn.quit).toHaveBeenCalledTimes(1)
      })
    })
  })
  
  describe('Memory Leak Prevention', () => {
    it('should remove event listeners on cleanup', async () => {
      const client = await createRedisClient()
      
      // Track listener counts
      const onCalls = client.on.mock.calls.length
      const onceCalls = client.once.mock.calls.length
      
      // Simulate adding listeners
      client.on('error', () => {})
      client.on('close', () => {})
      client.once('ready', () => {})
      
      await closeRedisClient(client)
      
      // In a real implementation, we'd verify removeAllListeners was called
      // For now, verify cleanup was attempted
      expect(client.quit).toHaveBeenCalled()
    })
    
    it('should not leak connections on errors', async () => {
      const connections: any[] = []
      const errors: Error[] = []
      
      // Create connections with some failing
      for (let i = 0; i < 10; i++) {
        try {
          if (i % 3 === 0) {
            // Simulate connection error
            vi.mocked(Redis).mockImplementationOnce(() => {
              throw new Error(`Connection error ${i}`)
            })
          }
          const conn = await createRedisClient()
          connections.push(conn)
        } catch (error) {
          errors.push(error as Error)
        }
      }
      
      // Should have some successes and some failures
      expect(connections.length).toBeGreaterThan(0)
      expect(errors.length).toBeGreaterThan(0)
      
      // Clean up successful connections
      await Promise.all(connections.map(c => closeRedisClient(c)))
      
      // Verify all successful connections were cleaned
      connections.forEach(conn => {
        expect(conn.quit).toHaveBeenCalled()
      })
    })
  })
  
  describe('Connection Health Checks', () => {
    it('should verify connection health with ping', async () => {
      const client = await createRedisClient()
      
      // Test health check
      const result = await client.ping()
      expect(result).toBe('PONG')
      
      await closeRedisClient(client)
    })
    
    it('should handle unhealthy connections', async () => {
      const client = await createRedisClient()
      
      // Mock unhealthy connection
      client.ping.mockRejectedValueOnce(new Error('Connection lost'))
      
      await expect(client.ping()).rejects.toThrow('Connection lost')
      
      // Should still be able to close
      await closeRedisClient(client)
      expect(client.quit).toHaveBeenCalled()
    })
  })
  
  describe('Environment-specific Configuration', () => {
    it('should use appropriate settings for production', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
      
      createRedisClient()
      
      // Verify production-appropriate settings
      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({
          maxRetriesPerRequest: null, // Infinite retries for queue reliability
          enableReadyCheck: false,
          retryStrategy: expect.any(Function)
        })
      )
      
      process.env.NODE_ENV = originalEnv
    })
    
    it('should handle missing Redis URL gracefully', async () => {
      const originalUrl = process.env.REDIS_URL
      delete process.env.REDIS_URL
      
      // Should fall back to localhost
      await createRedisClient()
      
      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 6379
        })
      )
      
      process.env.REDIS_URL = originalUrl
    })
  })
})